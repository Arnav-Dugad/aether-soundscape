import { SOUNDS } from '../audio/catalog'
import type { OrbState } from '../store'

type MixOrb = Omit<OrbState, 'id' | 'rev'>
type Palette = [string, string, string, string]

const IDX = Object.fromEntries(SOUNDS.map((s, i) => [s.id, i]))
const q = (v: number) => Math.round(v * 100)

/** Compact, URL-safe encoding of a mix: palette + one tuple per orb. */
export function encodeMix(orbs: OrbState[], palette: Palette): string {
  const payload = {
    p: palette.map((c) => c.slice(1)),
    o: orbs.map((o) => [IDX[o.soundId], q(o.x), q(o.y), q(o.volume), q(o.tone), q(o.reverb), o.muted ? 1 : 0]),
  }
  return btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeMix(code: string): { orbs: MixOrb[]; palette?: Palette } | null {
  try {
    const json = atob(code.replace(/-/g, '+').replace(/_/g, '/'))
    const data = JSON.parse(json) as { p?: string[]; o: number[][] }
    const orbs = data.o
      .filter((t) => SOUNDS[t[0]])
      .slice(0, 32)
      .map(([i, x, y, v, tn, rv, m]) => ({
        soundId: SOUNDS[i].id,
        x: clamp(x / 100, -1.2, 1.2),
        y: clamp(y / 100, -1.2, 1.2),
        volume: clamp((v ?? 70) / 100, 0, 1),
        tone: clamp((tn ?? 100) / 100, 0, 1),
        reverb: clamp((rv ?? 50) / 100, 0, 1),
        muted: m === 1,
        solo: false,
      }))
    const valid = data.p?.length === 4 && data.p.every((c) => /^[0-9a-f]{6}$/i.test(c))
    return { orbs, palette: valid ? (data.p!.map((c) => `#${c}`) as Palette) : undefined }
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
