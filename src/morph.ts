import { engine } from './audio/engine'
import { field, runtime } from './runtime'
import { newId, useStore, type OrbState, type Snapshot } from './store'

interface Track {
  id: string
  r0: number
  a0: number
  z0: number
  r1: number
  a1: number
  z1: number
  v0: number
  v1: number
  tone0: number
  tone1: number
  rev0: number
  rev1: number
  /** Orb exists only in the source and is removed when the morph ends. */
  leaving: boolean
  target: OrbState | null
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** Angle lerp along the shortest arc. */
const alerp = (a: number, b: number, t: number) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

/**
 * Morphs the live mix into a saved snapshot over N seconds: matched orbs glide
 * around the listener in polar space while volumes/tone/reverb crossfade; orbs
 * unique to either side fade in or out.
 */
class Morph {
  private tracks = new Map<string, Track>()
  private t0 = 0
  private dur = 1
  private name = ''
  private lastUi = 0
  active = false

  owns(id: string) {
    return this.active && this.tracks.has(id)
  }

  start(snap: Snapshot, seconds: number) {
    if (this.active) this.finish()
    const st = useStore.getState()
    const current = st.orbs
    const used = new Set<string>()
    const pairs: [OrbState | null, OrbState][] = []
    for (const t of snap.orbs) {
      let src = current.find((c) => c.id === t.id && !used.has(c.id))
      src ??= current.find((c) => c.soundId === t.soundId && !used.has(c.id))
      if (src) used.add(src.id)
      pairs.push([src ?? null, t])
    }
    this.tracks.clear()
    const added: OrbState[] = []
    for (const [src, tgt] of pairs) {
      const id = src?.id ?? newId()
      const from = src ?? { ...tgt, volume: 0 }
      const rt = runtime.get(id)
      const fx = rt ? rt.nx : from.x
      const fy = rt ? rt.ny : from.y
      this.tracks.set(id, {
        id,
        r0: Math.hypot(fx, fy), a0: Math.atan2(fy, fx), z0: from.z,
        r1: Math.hypot(tgt.x, tgt.y), a1: Math.atan2(tgt.y, tgt.x), z1: tgt.z,
        v0: src ? from.volume : 0, v1: tgt.volume,
        tone0: from.tone, tone1: tgt.tone, rev0: from.reverb, rev1: tgt.reverb,
        leaving: false,
        target: { ...tgt, id },
      })
      if (!src) added.push({ ...tgt, id, path: null, groupId: null })
    }
    for (const c of current) {
      if (used.has(c.id)) continue
      const rt = runtime.get(c.id)
      const r = Math.hypot(rt?.nx ?? c.x, rt?.ny ?? c.y)
      const a = Math.atan2(rt?.ny ?? c.y, rt?.nx ?? c.x)
      this.tracks.set(c.id, {
        id: c.id, r0: r, a0: a, z0: c.z, r1: Math.min(1, r + 0.15), a1: a, z1: c.z,
        v0: c.volume, v1: 0, tone0: c.tone, tone1: c.tone, rev0: c.reverb, rev1: c.reverb,
        leaving: true, target: null,
      })
    }
    this.active = true
    this.t0 = performance.now()
    this.dur = Math.max(0.5, seconds) * 1000
    this.name = snap.name
    // drop paths on morphing orbs so the morph owns their motion
    useStore.setState((s) => ({
      orbs: [...s.orbs.map((o) => (this.tracks.has(o.id) ? { ...o, path: null } : o)), ...added],
      palette: snap.palette,
      sceneId: null,
      morphing: { name: snap.name, progress: 0 },
    }))
  }

  /** Advance the morph — called every animation frame by the stage loop. */
  step(now: number) {
    if (!this.active) return
    const p = Math.min(1, (now - this.t0) / this.dur)
    const e = ease(p)
    const R = field.radius
    for (const tr of this.tracks.values()) {
      const rt = runtime.get(tr.id)
      if (rt) {
        rt.animating = true
        const r = lerp(tr.r0, tr.r1, e)
        const a = alerp(tr.a0, tr.a1, e)
        rt.mx.set(Math.cos(a) * r * R)
        rt.my.set(Math.sin(a) * r * R)
        rt.nz = lerp(tr.z0, tr.z1, e)
      }
      engine.setParams(tr.id, {
        volume: lerp(tr.v0, tr.v1, e),
        tone: lerp(tr.tone0, tr.tone1, e),
        reverb: lerp(tr.rev0, tr.rev1, e),
      })
    }
    if (now - this.lastUi > 100) {
      this.lastUi = now
      useStore.setState({ morphing: { name: this.name, progress: p } })
    }
    if (p >= 1) this.finish()
  }

  private finish() {
    this.active = false
    const tracks = this.tracks
    for (const tr of tracks.values()) {
      const rt = runtime.get(tr.id)
      if (rt) rt.animating = false
    }
    useStore.setState((s) => ({
      orbs: s.orbs
        .filter((o) => !tracks.get(o.id)?.leaving)
        .map((o) => {
          const tr = tracks.get(o.id)
          return tr?.target ? { ...tr.target, rev: o.rev, path: tr.target.path ?? null, groupId: null } : o
        }),
      morphing: null,
    }))
    this.tracks = new Map()
  }

  cancel() {
    if (this.active) this.finish()
  }
}

export const morph = new Morph()
