import { SOUNDS } from '../audio/catalog'
import type { OrbState, Palette, Wall } from '../store'

const BUILTIN = SOUNDS.filter((s) => s.category !== 'Imported')
const IDX = Object.fromEntries(BUILTIN.map((s, i) => [s.id, i]))
const q = (v: number) => Math.round(v * 100)

export interface MixPayload {
  orbs: Partial<OrbState>[]
  palette?: Palette
  walls?: Wall[]
  room?: string
}

/** Compact, URL-safe encoding of a mix: palette, room, walls + one tuple per orb. */
export function encodeMix(orbs: OrbState[], palette: Palette, walls: Wall[] = [], room?: string): string {
  const payload = {
    p: palette.map((c) => c.slice(1)),
    r: room,
    w: walls.map((w) => [q(w.x1), q(w.y1), q(w.x2), q(w.y2)]),
    o: orbs
      .filter((o) => o.soundId in IDX)
      .map((o) => [
        IDX[o.soundId], q(o.x), q(o.y), q(o.volume), q(o.tone), q(o.reverb), o.muted ? 1 : 0,
        q(o.z), q(o.realism), q(o.eqLow), q(o.eqMid), q(o.eqHigh), q(o.crush),
      ]),
  }
  return btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeMix(code: string): MixPayload | null {
  try {
    const json = atob(code.replace(/-/g, '+').replace(/_/g, '/'))
    const data = JSON.parse(json) as { p?: string[]; r?: string; w?: number[][]; o: number[][] }
    const orbs = data.o
      .filter((t) => BUILTIN[t[0]])
      .slice(0, 48)
      .map(([i, x, y, v, tn, rv, m, z, re, el, em, eh, cr]) => ({
        soundId: BUILTIN[i].id,
        x: clamp(x / 100, -1.2, 1.2),
        y: clamp(y / 100, -1.2, 1.2),
        volume: clamp((v ?? 70) / 100, 0, 1),
        tone: clamp((tn ?? 100) / 100, 0, 1),
        reverb: clamp((rv ?? 50) / 100, 0, 1),
        muted: m === 1,
        z: clamp((z ?? 0) / 100, -1, 1),
        realism: clamp((re ?? 0) / 100, 0, 1),
        eqLow: clamp((el ?? 0) / 100, -1, 1),
        eqMid: clamp((em ?? 0) / 100, -1, 1),
        eqHigh: clamp((eh ?? 0) / 100, -1, 1),
        crush: clamp((cr ?? 0) / 100, 0, 1),
      }))
    const valid = data.p?.length === 4 && data.p.every((c) => /^[0-9a-f]{6}$/i.test(c))
    const walls = (data.w ?? []).slice(0, 16).map(([x1, y1, x2, y2], k) => ({
      id: `w${k}${Date.now().toString(36)}`,
      x1: clamp(x1 / 100, -1.2, 1.2),
      y1: clamp(y1 / 100, -1.2, 1.2),
      x2: clamp(x2 / 100, -1.2, 1.2),
      y2: clamp(y2 / 100, -1.2, 1.2),
    }))
    return {
      orbs,
      palette: valid ? (data.p!.map((c) => `#${c}`) as Palette) : undefined,
      walls,
      room: typeof data.r === 'string' ? data.r : undefined,
    }
  } catch {
    return null
  }
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, Number.isFinite(v) ? v : 0))

const KEY = 'aether:mix:v1'
export function saveLocal(code: string) {
  try {
    localStorage.setItem(KEY, code)
  } catch {
    /* storage unavailable */
  }
}
export function loadLocal(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}
