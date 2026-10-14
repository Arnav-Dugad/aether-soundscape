/**
 * Global musical mood, read live by generative voices (e.g. the ambient piano).
 * Scenes set the key/mode; the time of day shapes tempo, density and brightness.
 * Mutated in place by the store sync — voices should read it on every event, never cache it.
 */
export interface Mood {
  /** MIDI note of the tonic, e.g. 62 = D. */
  root: number
  /** Scale degrees (semitones above the root) available to melodies and chords. */
  scale: number[]
  /** 0 = very sparse, 1 = busy. */
  density: number
  /** 0 = dark & muffled, 1 = bright & open. */
  brightness: number
  /** Beats per minute for any pulse-based generator. */
  tempo: number
}

export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
} as const

export type ModeName = keyof typeof MODES

export const mood: Mood = {
  root: 62,
  scale: [...MODES.lydian],
  density: 0.5,
  brightness: 0.6,
  tempo: 66,
}

/** Shape density/brightness/tempo from the local hour: dawn bright, night sparse and dark. */
export function applyTimeOfDay(base: { density: number; brightness: number; tempo: number }, date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60
  // 1 at 14:00, 0 at 02:00
  const day = 0.5 + 0.5 * Math.cos(((h - 14) / 24) * Math.PI * 2)
  mood.density = clamp01(base.density * (0.6 + 0.6 * day))
  mood.brightness = clamp01(base.brightness * (0.55 + 0.6 * day))
  mood.tempo = base.tempo * (0.85 + 0.25 * day)
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
