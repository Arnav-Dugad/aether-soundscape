import { useStore, type OrbState } from '../store'
import { engine } from './engine'
import { encodeMix, saveLocal } from '../lib/share'

/**
 * Bridges declarative store state to the imperative audio graph. React renders
 * never touch audio nodes directly — this subscriber diffs and applies changes.
 */
export function startAudioSync() {
  let prev = new Map<string, OrbState>()
  let pauseTimer: number | undefined
  let saveTimer: number | undefined
  let sleepFactor = 1

  const applyMaster = () => {
    const s = useStore.getState()
    engine.setMasterVolume(s.playing ? s.masterVolume * sleepFactor : 0)
  }

  const sync = (s: ReturnType<typeof useStore.getState>, old?: ReturnType<typeof useStore.getState>) => {
    if (!engine.started) return
    const next = new Map(s.orbs.map((o) => [o.id, o]))
    for (const [id] of prev) if (!next.has(id)) engine.removeChannel(id)
    for (const o of s.orbs) {
      const p = prev.get(o.id)
      if (!p) {
        engine.addChannel(o.id, o.soundId)
        engine.setPosition(o.id, o.x, o.y)
        engine.setReverb(o.id, o.reverb)
        engine.setTone(o.id, o.tone)
        engine.setMuteSolo(o.id, o.muted, o.solo)
        engine.setVolume(o.id, o.volume)
        continue
      }
      if (p.volume !== o.volume) engine.setVolume(o.id, o.volume)
      if (p.tone !== o.tone) engine.setTone(o.id, o.tone)
      if (p.reverb !== o.reverb) engine.setReverb(o.id, o.reverb)
      if (p.muted !== o.muted || p.solo !== o.solo) engine.setMuteSolo(o.id, o.muted, o.solo)
    }
    prev = next

    if (!old || old.playing !== s.playing) {
      clearTimeout(pauseTimer)
      if (s.playing) engine.resume().then(applyMaster)
      else {
        applyMaster()
        // let the fade finish before freezing the audio clock
        pauseTimer = window.setTimeout(() => !useStore.getState().playing && engine.suspend(), 450)
      }
    }
    if (!old || old.masterVolume !== s.masterVolume) applyMaster()
    if (!old || old.space !== s.space) engine.setSpace(s.space)
    if (!old || old.warmth !== s.warmth) engine.setWarmth(s.warmth)

    if (!old || old.orbs !== s.orbs || old.palette !== s.palette) {
      clearTimeout(saveTimer)
      saveTimer = window.setTimeout(() => saveLocal(encodeMix(s.orbs, s.palette)), 800)
    }
  }

  const unsub = useStore.subscribe((s, old) => sync(s, old))
  sync(useStore.getState())

  // sleep timer: fade out over the final minute, then pause
  const sleepTick = window.setInterval(() => {
    const s = useStore.getState()
    if (!s.sleepAt) {
      if (sleepFactor !== 1) {
        sleepFactor = 1
        applyMaster()
      }
      return
    }
    const left = (s.sleepAt - Date.now()) / 1000
    if (left <= 0) {
      sleepFactor = 1
      s.set('sleepAt', null)
      s.setPlaying(false)
      s.toast('Sleep timer ended — sweet dreams')
    } else if (left < 60) {
      sleepFactor = left / 60
      applyMaster()
    }
  }, 500)

  return () => {
    unsub()
    clearInterval(sleepTick)
  }
}
