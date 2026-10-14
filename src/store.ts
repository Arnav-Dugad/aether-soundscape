import { create } from 'zustand'
import { SCENES, DEFAULT_PALETTE, type Scene } from './audio/scenes'
import { SOUND_MAP, SOUNDS } from './audio/catalog'

export const RINGS = [0.34, 0.64, 0.9] as const
export const RING_NAMES = ['Intimate', 'Near', 'Horizon'] as const

export interface OrbState {
  id: string
  soundId: string
  /** Normalised field position; the listener sits at (0,0), field radius = 1. */
  x: number
  y: number
  volume: number
  tone: number
  reverb: number
  muted: boolean
  solo: boolean
  /** Bumped whenever the position is set from outside the drag gesture (scenes, shuffle…). */
  rev: number
}

export interface Toast {
  id: number
  text: string
  tone?: 'default' | 'success' | 'record'
}

type Panel = 'library' | 'inspector' | null

interface Store {
  started: boolean
  playing: boolean
  orbs: OrbState[]
  selectedId: string | null
  masterVolume: number
  space: number
  warmth: number
  orbit: boolean
  orbitSpeed: number
  heading: number
  palette: [string, string, string, string]
  sceneId: string | null
  sleepAt: number | null
  recordingSince: number | null
  helpOpen: boolean
  mobilePanel: Panel
  toasts: Toast[]
  magnetRing: number | null

  setStarted: () => void
  setPlaying: (p: boolean) => void
  addOrb: (soundId: string, at?: { x: number; y: number }) => string
  removeOrb: (id: string) => void
  updateOrb: (id: string, patch: Partial<OrbState>) => void
  commitPosition: (id: string, x: number, y: number) => void
  duplicateOrb: (id: string) => void
  select: (id: string | null) => void
  loadScene: (scene: Scene) => void
  loadMix: (orbs: Omit<OrbState, 'id' | 'rev'>[], palette?: Store['palette']) => void
  scatter: () => void
  clear: () => void
  set: <K extends keyof Store>(key: K, value: Store[K]) => void
  toast: (text: string, tone?: Toast['tone']) => void
}

let uid = 0
export const newId = () => `o${Date.now().toString(36)}${(uid++).toString(36)}`

const polar = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180
  return { x: Math.sin(a) * r, y: -Math.cos(a) * r }
}

/** Find an open slot on a ring, as far as possible from every existing orb. */
export function findFreeSlot(orbs: OrbState[]): { x: number; y: number } {
  let best = polar(RINGS[1], Math.random() * 360)
  let bestScore = -1
  for (const r of RINGS) {
    for (let deg = 0; deg < 360; deg += 15) {
      const p = polar(r, deg + Math.random() * 6)
      const minD = orbs.reduce((m, o) => Math.min(m, Math.hypot(o.x - p.x, o.y - p.y)), 9)
      // gently prefer the middle ring
      const score = minD + (r === RINGS[1] ? 0.06 : 0)
      if (score > bestScore) {
        bestScore = score
        best = p
      }
    }
  }
  return best
}

const makeOrb = (soundId: string, x: number, y: number, volume = 0.7): OrbState => ({
  id: newId(), soundId, x, y, volume, tone: 1, reverb: 0.5, muted: false, solo: false, rev: 0,
})

let toastId = 0

export const useStore = create<Store>((set, get) => ({
  started: false,
  playing: false,
  orbs: [],
  selectedId: null,
  masterVolume: 0.8,
  space: 0.5,
  warmth: 0,
  orbit: false,
  orbitSpeed: 1,
  heading: 0,
  palette: DEFAULT_PALETTE,
  sceneId: null,
  sleepAt: null,
  recordingSince: null,
  helpOpen: false,
  mobilePanel: null,
  toasts: [],
  magnetRing: null,

  setStarted: () => set({ started: true }),
  setPlaying: (playing) => set({ playing }),
  addOrb: (soundId, at) => {
    const pos = at ?? findFreeSlot(get().orbs)
    const orb = makeOrb(soundId, pos.x, pos.y)
    set((s) => ({ orbs: [...s.orbs, orb], selectedId: orb.id, sceneId: null }))
    return orb.id
  },
  removeOrb: (id) =>
    set((s) => ({
      orbs: s.orbs.filter((o) => o.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      sceneId: null,
    })),
  updateOrb: (id, patch) => set((s) => ({ orbs: s.orbs.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),
  commitPosition: (id, x, y) =>
    set((s) => ({ orbs: s.orbs.map((o) => (o.id === id ? { ...o, x, y } : o)) })),
  duplicateOrb: (id) => {
    const src = get().orbs.find((o) => o.id === id)
    if (!src) return
    const pos = findFreeSlot(get().orbs)
    const copy = { ...src, id: newId(), x: pos.x, y: pos.y, solo: false, rev: 0 }
    set((s) => ({ orbs: [...s.orbs, copy], selectedId: copy.id }))
  },
  select: (selectedId) => set({ selectedId }),
  loadScene: (scene) => {
    const orbs = scene.orbs.map((p) => {
      const { x, y } = polar(p.r, p.a)
      return makeOrb(p.s, x, y, p.v ?? 0.7)
    })
    set({ orbs, selectedId: null, palette: scene.palette, sceneId: scene.id })
  },
  loadMix: (list, palette) =>
    set((s) => ({
      orbs: list
        .filter((o) => SOUND_MAP[o.soundId])
        .map((o) => {
          // keep restored orbs inside the field
          const n = Math.hypot(o.x, o.y)
          const k = n > 1 ? 1 / n : 1
          return { ...o, x: o.x * k, y: o.y * k, id: newId(), rev: 0 }
        }),
      selectedId: null,
      sceneId: null,
      palette: palette ?? s.palette,
    })),
  scatter: () => {
    // "Surprise me": a random 3–5 sound constellation with a random scene palette
    const pool = [...SOUNDS].sort(() => Math.random() - 0.5).slice(0, 3 + Math.floor(Math.random() * 3))
    const orbs: OrbState[] = []
    for (const s of pool) {
      const p = findFreeSlot(orbs)
      orbs.push(makeOrb(s.id, p.x, p.y, 0.5 + Math.random() * 0.3))
    }
    const palette = SCENES[Math.floor(Math.random() * SCENES.length)].palette
    set({ orbs, selectedId: null, sceneId: null, palette })
  },
  clear: () => set({ orbs: [], selectedId: null, sceneId: null }),
  set: (key, value) => set({ [key]: value } as Partial<Store>),
  toast: (text, tone = 'default') => {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, tone }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 2600)
  },
}))
