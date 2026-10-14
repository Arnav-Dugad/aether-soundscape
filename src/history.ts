import { create } from 'zustand'
import { SOUND_MAP } from './audio/catalog'
import { useStore, type Group, type OrbState, type Wall } from './store'

/** One undoable state of the field. */
export interface HistoryEntry {
  orbs: OrbState[]
  walls: Wall[]
  groups: Record<string, Group>
  label: string
  at: number
}

interface HistoryStore {
  entries: HistoryEntry[]
  /** Index of the entry currently shown. */
  index: number
}

const MAX = 120
export const useHistory = create<HistoryStore>(() => ({ entries: [], index: -1 }))

let restoring = false
let pending: number | undefined

const name = (o: OrbState) => SOUND_MAP[o.soundId]?.name ?? 'sound'

/** Describe what changed between two states, Figma-style. */
function describe(a: HistoryEntry | undefined, b: Omit<HistoryEntry, 'label' | 'at'>): string {
  if (!a) return 'Start'
  const before = new Map(a.orbs.map((o) => [o.id, o]))
  const after = new Map(b.orbs.map((o) => [o.id, o]))
  const added = b.orbs.filter((o) => !before.has(o.id))
  const removed = a.orbs.filter((o) => !after.has(o.id))
  if (added.length > 2 && removed.length > 2) return 'New arrangement'
  if (added.length) return added.length === 1 ? `Added ${name(added[0])}` : `Added ${added.length} sounds`
  if (removed.length) return removed.length === 1 ? `Removed ${name(removed[0])}` : `Removed ${removed.length} sounds`
  if (a.walls.length !== b.walls.length) return b.walls.length > a.walls.length ? 'Added wall' : 'Removed wall'
  if (a.walls !== b.walls) return 'Moved wall'
  for (const o of b.orbs) {
    const p = before.get(o.id)
    if (!p) continue
    if (Math.hypot(p.x - o.x, p.y - o.y) > 0.01) return `Moved ${name(o)}`
    if (p.volume !== o.volume) return `${name(o)} volume`
    if (p.z !== o.z) return `${name(o)} height`
    if (p.muted !== o.muted) return `${o.muted ? 'Muted' : 'Unmuted'} ${name(o)}`
    if (p.solo !== o.solo) return `Solo ${name(o)}`
    if (p.groupId !== o.groupId) return o.groupId ? 'Grouped sounds' : 'Ungrouped'
    if (p.path !== o.path) return o.path ? `Path for ${name(o)}` : `Cleared path`
    if (p.tone !== o.tone || p.reverb !== o.reverb || p.eqLow !== o.eqLow || p.eqMid !== o.eqMid || p.eqHigh !== o.eqHigh)
      return `Shaped ${name(o)}`
    if (p.realism !== o.realism || p.crush !== o.crush || p.freeze !== o.freeze) return `${name(o)} effects`
  }
  return 'Edit'
}

function snapshotNow(): Omit<HistoryEntry, 'label' | 'at'> {
  const s = useStore.getState()
  return { orbs: s.orbs, walls: s.walls, groups: s.groups }
}

function commit() {
  const snap = snapshotNow()
  const { entries, index } = useHistory.getState()
  const head = entries[index]
  if (head && head.orbs === snap.orbs && head.walls === snap.walls && head.groups === snap.groups) return
  const entry: HistoryEntry = { ...snap, label: describe(head, snap), at: Date.now() }
  // committing after an undo discards the redo branch
  const next = [...entries.slice(0, index + 1), entry].slice(-MAX)
  useHistory.setState({ entries: next, index: next.length - 1 })
}

/** Record history automatically, coalescing bursts (slider drags, orbit commits) into one step. */
export function startHistory() {
  commit()
  return useStore.subscribe((s, old) => {
    if (restoring) return
    if (s.orbs === old.orbs && s.walls === old.walls && s.groups === old.groups) return
    if (s.morphing) return
    clearTimeout(pending)
    pending = window.setTimeout(commit, 450)
  })
}

/** Run a store update that should not create an undo step (orbit / path position commits). */
export function silently(fn: () => void) {
  const was = restoring
  restoring = true
  try {
    fn()
  } finally {
    restoring = was
  }
}

/** Jump to any point in history (used by undo/redo and the scrubber). */
export function goTo(index: number) {
  const { entries } = useHistory.getState()
  const e = entries[index]
  if (!e) return
  clearTimeout(pending)
  restoring = true
  const cur = useStore.getState().orbs
  const byId = new Map(cur.map((o) => [o.id, o]))
  useStore.setState({
    // bump rev on orbs whose position changed so they glide back on a spring
    orbs: e.orbs.map((o) => {
      const c = byId.get(o.id)
      return c && (c.x !== o.x || c.y !== o.y) ? { ...o, rev: c.rev + 1 } : c ? { ...o, rev: c.rev } : o
    }),
    walls: e.walls,
    groups: e.groups,
    selectedId: null,
    multi: [],
  })
  restoring = false
  useHistory.setState({ index })
}

export const undo = () => {
  const { index } = useHistory.getState()
  if (index > 0) goTo(index - 1)
}
export const redo = () => {
  const { index, entries } = useHistory.getState()
  if (index < entries.length - 1) goTo(index + 1)
}
