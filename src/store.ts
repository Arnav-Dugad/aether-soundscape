import { create } from 'zustand'
import { SCENES, DEFAULT_PALETTE, type Scene, type SceneMusic } from './audio/scenes'
import { SOUND_MAP, SOUNDS } from './audio/catalog'

export const RINGS = [0.34, 0.64, 0.9] as const
export const RING_NAMES = ['Intimate', 'Near', 'Horizon'] as const

export interface OrbPath {
  /** Normalised points of the closed loop the orb travels. */
  pts: [number, number][]
  /** Laps per minute. */
  speed: number
}

export interface OrbState {
  id: string
  soundId: string
  /** Normalised field position; the listener sits at (0,0), field radius = 1. */
  x: number
  y: number
  /** Elevation: -1 below the listener … +1 above. */
  z: number
  volume: number
  tone: number
  reverb: number
  /** -1 … +1 shelf / peak gains. */
  eqLow: number
  eqMid: number
  eqHigh: number
  /** 0 = pure synthesis … 1 = pure field recording (when available). */
  realism: number
  crush: number
  freeze: boolean
  muted: boolean
  solo: boolean
  path: OrbPath | null
  groupId: string | null
  /** Bumped whenever the position is set from outside the drag gesture (keys, undo, morph…). */
  rev: number
}

export interface Wall {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface Group {
  orbit: boolean
}

export interface Snapshot {
  id: string
  name: string
  createdAt: number
  orbs: OrbState[]
  palette: Palette
}

export interface Toast {
  id: number
  text: string
  tone?: 'default' | 'success' | 'record' | 'error'
}

export type Palette = [string, string, string, string]
export type Provider = 'claude' | 'openai' | 'gemini'
export type HeadTracking = 'off' | 'motion' | 'camera'
type Panel = 'library' | 'inspector' | null

export interface AiSettings {
  provider: Provider
  keys: Record<Provider, string>
  models: Record<Provider, string>
}

export const DEFAULT_MODELS: Record<Provider, string> = {
  claude: 'claude-opus-5-5',
  openai: 'gpt-5.5',
  gemini: 'gemini-flash-latest',
}

interface Store {
  started: boolean
  playing: boolean
  orbs: OrbState[]
  walls: Wall[]
  groups: Record<string, Group>
  selectedId: string | null
  /** Every selected orb (includes selectedId). */
  multi: string[]
  selectedWallId: string | null
  masterVolume: number
  space: number
  warmth: number
  room: string
  doppler: boolean
  evolve: boolean
  orbit: boolean
  orbitSpeed: number
  heading: number
  headTracking: HeadTracking
  zoom: number
  breathe: boolean
  tilt: boolean
  haptics: boolean
  uiSounds: boolean
  palette: Palette
  music: SceneMusic
  sceneId: string | null
  sleepAt: number | null
  recordingSince: number | null
  helpOpen: boolean
  settingsOpen: boolean
  composerOpen: boolean
  tourStep: number | null
  drawPathFor: string | null
  mobilePanel: Panel
  toasts: Toast[]
  magnetRing: number | null
  snapshots: Snapshot[]
  morphing: { name: string; progress: number } | null
  customSounds: string[]
  ai: AiSettings

  setStarted: () => void
  setPlaying: (p: boolean) => void
  addOrb: (soundId: string, at?: { x: number; y: number }) => string
  removeOrb: (id: string) => void
  removeSelected: () => void
  updateOrb: (id: string, patch: Partial<OrbState>) => void
  commitPosition: (id: string, x: number, y: number) => void
  duplicateOrb: (id: string) => void
  select: (id: string | null, additive?: boolean) => void
  setSelection: (ids: string[]) => void
  groupSelected: () => void
  ungroup: (groupId: string) => void
  setGroupOrbit: (groupId: string, orbit: boolean) => void
  addWall: () => void
  updateWall: (id: string, patch: Partial<Wall>) => void
  removeWall: (id: string) => void
  loadScene: (scene: Scene) => void
  loadMix: (orbs: Partial<OrbState>[], extra?: { palette?: Palette; walls?: Wall[]; room?: string }) => void
  scatter: () => void
  clear: () => void
  set: <K extends keyof Store>(key: K, value: Store[K]) => void
  setAi: (patch: Partial<AiSettings>) => void
  toast: (text: string, tone?: Toast['tone']) => void
}

let uid = 0
export const newId = (p = 'o') => `${p}${Date.now().toString(36)}${(uid++).toString(36)}`

export const polar = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180
  return { x: Math.sin(a) * r, y: -Math.cos(a) * r }
}

/** Find an open slot on a ring, as far as possible from every existing orb. */
export function findFreeSlot(orbs: { x: number; y: number }[]): { x: number; y: number } {
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

export const ORB_DEFAULTS: Omit<OrbState, 'id' | 'soundId' | 'x' | 'y'> = {
  z: 0, volume: 0.7, tone: 1, reverb: 0.5, eqLow: 0, eqMid: 0, eqHigh: 0, realism: 0, crush: 0,
  freeze: false, muted: false, solo: false, path: null, groupId: null, rev: 0,
}

export const makeOrb = (soundId: string, x: number, y: number, extra: Partial<OrbState> = {}): OrbState => ({
  ...ORB_DEFAULTS, id: newId(), soundId, x, y, ...extra,
})

/** Keep orbs inside the field. */
const clampOrb = <T extends { x: number; y: number }>(o: T): T => {
  const n = Math.hypot(o.x, o.y)
  return n > 1 ? { ...o, x: o.x / n, y: o.y / n } : o
}

let toastId = 0

function loadAi(): AiSettings {
  const base: AiSettings = { provider: 'claude', keys: { claude: '', openai: '', gemini: '' }, models: { ...DEFAULT_MODELS } }
  try {
    const raw = localStorage.getItem('aether:ai:v1')
    if (!raw) return base
    const v = JSON.parse(raw) as Partial<AiSettings>
    return { ...base, ...v, keys: { ...base.keys, ...v.keys }, models: { ...base.models, ...v.models } }
  } catch {
    return base
  }
}

export const useStore = create<Store>((set, get) => ({
  started: false,
  playing: false,
  orbs: [],
  walls: [],
  groups: {},
  selectedId: null,
  multi: [],
  selectedWallId: null,
  masterVolume: 0.8,
  space: 0.5,
  warmth: 0,
  room: 'hall',
  doppler: true,
  evolve: false,
  orbit: false,
  orbitSpeed: 1,
  heading: 0,
  headTracking: 'off',
  zoom: 1,
  breathe: false,
  tilt: false,
  haptics: true,
  uiSounds: true,
  palette: DEFAULT_PALETTE,
  music: SCENES[0].music,
  sceneId: null,
  sleepAt: null,
  recordingSince: null,
  helpOpen: false,
  settingsOpen: false,
  composerOpen: false,
  tourStep: null,
  drawPathFor: null,
  mobilePanel: null,
  toasts: [],
  magnetRing: null,
  snapshots: [],
  morphing: null,
  customSounds: [],
  ai: loadAi(),

  setStarted: () => set({ started: true }),
  setPlaying: (playing) => set({ playing }),
  addOrb: (soundId, at) => {
    const pos = at ?? findFreeSlot(get().orbs)
    const orb = makeOrb(soundId, pos.x, pos.y)
    set((s) => ({ orbs: [...s.orbs, orb], selectedId: orb.id, multi: [orb.id], sceneId: null }))
    return orb.id
  },
  removeOrb: (id) =>
    set((s) => ({
      orbs: s.orbs.filter((o) => o.id !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
      multi: s.multi.filter((m) => m !== id),
      sceneId: null,
    })),
  removeSelected: () =>
    set((s) => {
      const gone = new Set(s.multi.length ? s.multi : s.selectedId ? [s.selectedId] : [])
      return { orbs: s.orbs.filter((o) => !gone.has(o.id)), selectedId: null, multi: [], sceneId: null }
    }),
  updateOrb: (id, patch) => set((s) => ({ orbs: s.orbs.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),
  commitPosition: (id, x, y) => set((s) => ({ orbs: s.orbs.map((o) => (o.id === id ? { ...o, x, y } : o)) })),
  duplicateOrb: (id) => {
    const src = get().orbs.find((o) => o.id === id)
    if (!src) return
    const pos = findFreeSlot(get().orbs)
    const copy: OrbState = { ...src, id: newId(), x: pos.x, y: pos.y, solo: false, rev: 0, path: null, groupId: null }
    set((s) => ({ orbs: [...s.orbs, copy], selectedId: copy.id, multi: [copy.id] }))
  },
  select: (id, additive) =>
    set((s) => {
      if (id === null) return { selectedId: null, multi: [], selectedWallId: null }
      const orb = s.orbs.find((o) => o.id === id)
      // clicking a grouped orb selects its whole group
      const members = orb?.groupId ? s.orbs.filter((o) => o.groupId === orb.groupId).map((o) => o.id) : [id]
      if (additive) {
        const has = s.multi.includes(id)
        const multi = has ? s.multi.filter((m) => !members.includes(m)) : [...new Set([...s.multi, ...members])]
        return { selectedId: has ? (multi.at(-1) ?? null) : id, multi, selectedWallId: null }
      }
      return { selectedId: id, multi: members, selectedWallId: null }
    }),
  setSelection: (ids) => set({ multi: ids, selectedId: ids.at(-1) ?? null, selectedWallId: null }),
  groupSelected: () => {
    const { multi } = get()
    if (multi.length < 2) return
    const gid = newId('g')
    set((s) => ({
      orbs: s.orbs.map((o) => (multi.includes(o.id) ? { ...o, groupId: gid } : o)),
      groups: { ...s.groups, [gid]: { orbit: false } },
    }))
  },
  ungroup: (gid) =>
    set((s) => {
      const groups = { ...s.groups }
      delete groups[gid]
      return { orbs: s.orbs.map((o) => (o.groupId === gid ? { ...o, groupId: null } : o)), groups }
    }),
  setGroupOrbit: (gid, orbit) => set((s) => ({ groups: { ...s.groups, [gid]: { ...s.groups[gid], orbit } } })),
  addWall: () => {
    // drop a wall somewhere between the listener and the first ring, angled randomly
    const a = Math.random() * Math.PI * 2
    const cx = Math.sin(a) * 0.48
    const cy = -Math.cos(a) * 0.48
    const len = 0.22
    const wall: Wall = { id: newId('w'), x1: cx - Math.cos(a) * len, y1: cy - Math.sin(a) * len, x2: cx + Math.cos(a) * len, y2: cy + Math.sin(a) * len }
    set((s) => ({ walls: [...s.walls, wall], selectedWallId: wall.id, selectedId: null, multi: [] }))
  },
  updateWall: (id, patch) => set((s) => ({ walls: s.walls.map((w) => (w.id === id ? { ...w, ...patch } : w)) })),
  removeWall: (id) =>
    set((s) => ({ walls: s.walls.filter((w) => w.id !== id), selectedWallId: s.selectedWallId === id ? null : s.selectedWallId })),
  loadScene: (scene) => {
    const orbs = scene.orbs.map((p) => {
      const { x, y } = polar(p.r, p.a)
      return makeOrb(p.s, x, y, { volume: p.v ?? 0.7 })
    })
    set({
      orbs, selectedId: null, multi: [], groups: {}, palette: scene.palette, sceneId: scene.id,
      music: scene.music, room: scene.room ?? get().room,
    })
  },
  loadMix: (list, extra = {}) =>
    set((s) => ({
      orbs: list
        .filter((o) => o.soundId && SOUND_MAP[o.soundId])
        .map((o) => clampOrb({ ...ORB_DEFAULTS, ...o, path: o.path ?? null, groupId: null, id: newId(), rev: 0 } as OrbState)),
      selectedId: null,
      multi: [],
      groups: {},
      sceneId: null,
      palette: extra.palette ?? s.palette,
      walls: extra.walls ?? s.walls,
      room: extra.room ?? s.room,
    })),
  scatter: () => {
    // "Surprise me": a random 3–5 sound constellation with a random scene palette
    const pool = [...SOUNDS].filter((s) => s.category !== 'Imported').sort(() => Math.random() - 0.5).slice(0, 3 + Math.floor(Math.random() * 3))
    const orbs: OrbState[] = []
    for (const s of pool) {
      const p = findFreeSlot(orbs)
      orbs.push(makeOrb(s.id, p.x, p.y, { volume: 0.5 + Math.random() * 0.3 }))
    }
    const scene = SCENES[Math.floor(Math.random() * SCENES.length)]
    set({ orbs, selectedId: null, multi: [], groups: {}, sceneId: null, palette: scene.palette, music: scene.music })
  },
  clear: () => set({ orbs: [], selectedId: null, multi: [], groups: {}, sceneId: null }),
  set: (key, value) => set({ [key]: value } as Partial<Store>),
  setAi: (patch) => {
    const ai = { ...get().ai, ...patch }
    set({ ai })
    try {
      localStorage.setItem('aether:ai:v1', JSON.stringify(ai))
    } catch {
      /* storage unavailable */
    }
  },
  toast: (text, tone = 'default') => {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, tone }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), tone === 'error' ? 5000 : 2600)
  },
}))
