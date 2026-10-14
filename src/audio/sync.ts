import { useStore, type OrbState } from '../store'
import { engine, type ChannelParams } from './engine'
import { encodeMix, saveLocal } from '../lib/share'
import { MODES, mood, applyTimeOfDay } from './mood'
import { morph } from '../morph'

const PARAM_KEYS = ['volume', 'tone', 'reverb', 'eqLow', 'eqMid', 'eqHigh', 'realism', 'crush', 'freeze'] as const

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

  const applyMood = () => {
    const m = useStore.getState().music
    mood.root = m.root
    mood.scale = [...MODES[m.mode]]
    applyTimeOfDay(m)
  }

  const sync = (s: ReturnType<typeof useStore.getState>, old?: ReturnType<typeof useStore.getState>) => {
    if (!engine.started) return
    const next = new Map(s.orbs.map((o) => [o.id, o]))
    for (const [id] of prev) if (!next.has(id)) engine.removeChannel(id)
    for (const o of s.orbs) {
      const p = prev.get(o.id)
      if (!p) {
        engine.addChannel(o.id, o.soundId)
        engine.setPosition(o.id, o.x, o.y, o.z)
        const all = Object.fromEntries(PARAM_KEYS.map((k) => [k, o[k]])) as unknown as ChannelParams
        // a morphing orb fades in under the morph's control
        if (morph.owns(o.id)) all.volume = 0
        engine.setParams(o.id, all)
        engine.setMuteSolo(o.id, o.muted, o.solo)
        continue
      }
      const patch: Partial<ChannelParams> = {}
      for (const k of PARAM_KEYS) if (p[k] !== o[k]) (patch as Record<string, unknown>)[k] = o[k]
      if (morph.owns(o.id)) delete patch.volume
      if (Object.keys(patch).length) engine.setParams(o.id, patch)
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
    if (!old || old.room !== s.room) engine.setRoom(s.room)
    if (!old || old.doppler !== s.doppler) engine.setDoppler(s.doppler)
    if (!old || old.evolve !== s.evolve) engine.setEvolve(s.evolve)
    if (!old || old.music !== s.music) applyMood()

    if (!old || old.orbs !== s.orbs || old.palette !== s.palette || old.walls !== s.walls || old.room !== s.room) {
      clearTimeout(saveTimer)
      saveTimer = window.setTimeout(() => saveLocal(encodeMix(s.orbs, s.palette, s.walls, s.room)), 800)
    }
  }

  const unsub = useStore.subscribe((s, old) => sync(s, old))
  sync(useStore.getState())

  // time of day keeps nudging the generative music
  const moodTick = window.setInterval(applyMood, 60_000)

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
    clearInterval(moodTick)
  }
}
