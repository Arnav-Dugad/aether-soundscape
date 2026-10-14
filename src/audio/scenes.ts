export interface ScenePlacement {
  s: string
  /** Normalised radius (0 = listener, 1 = edge of the field). */
  r: number
  /** Angle in degrees, 0 = straight ahead, clockwise. */
  a: number
  v?: number
}

export interface Scene {
  id: string
  name: string
  mood: string
  /** Four colours for the background mesh gradient. */
  palette: [string, string, string, string]
  orbs: ScenePlacement[]
}

export const SCENES: Scene[] = [
  {
    id: 'tokyo',
    name: 'Tokyo Rain',
    mood: 'Neon reflections, 2 a.m.',
    palette: ['#1b1140', '#7e22ce', '#db2777', '#0e7490'],
    orbs: [
      { s: 'rain', r: 0.34, a: -40, v: 0.85 },
      { s: 'shinjuku', r: 0.64, a: 60, v: 0.75 },
      { s: 'vinyl', r: 0.34, a: 150, v: 0.5 },
      { s: 'keys', r: 0.64, a: -130, v: 0.55 },
    ],
  },
  {
    id: 'cafe',
    name: 'Paris Café',
    mood: 'Corner table, rain outside',
    palette: ['#1c1008', '#b45309', '#7c2d12', '#be185d'],
    orbs: [
      { s: 'cafe', r: 0.64, a: 20, v: 0.7 },
      { s: 'espresso', r: 0.64, a: -70, v: 0.7 },
      { s: 'rain', r: 0.9, a: 140, v: 0.6 },
      { s: 'keys', r: 0.34, a: 110, v: 0.45 },
    ],
  },
  {
    id: 'cabin',
    name: 'Cabin Storm',
    mood: 'Warm hearth, wild weather',
    palette: ['#120a06', '#c2410c', '#312e81', '#7f1d1d'],
    orbs: [
      { s: 'fireplace', r: 0.34, a: 0, v: 0.8 },
      { s: 'thunder', r: 0.9, a: -100, v: 0.8 },
      { s: 'rain', r: 0.64, a: 120, v: 0.7 },
      { s: 'wind', r: 0.9, a: 70, v: 0.5 },
      { s: 'clock', r: 0.64, a: -160, v: 0.4 },
    ],
  },
  {
    id: 'focus',
    name: 'Deep Focus',
    mood: 'Flow state, notifications off',
    palette: ['#05070f', '#1e3a8a', '#334155', '#4c1d95'],
    orbs: [
      { s: 'brown', r: 0.64, a: 180, v: 0.55 },
      { s: 'typing', r: 0.34, a: 30, v: 0.55 },
      { s: 'rain', r: 0.64, a: -60, v: 0.6 },
      { s: 'drone', r: 0.9, a: 110, v: 0.5 },
    ],
  },
  {
    id: 'zen',
    name: 'Zen Garden',
    mood: 'Stone, water, breath',
    palette: ['#04110d', '#047857', '#a16207', '#0e7490'],
    orbs: [
      { s: 'bowl', r: 0.34, a: 0, v: 0.6 },
      { s: 'stream', r: 0.64, a: -80, v: 0.7 },
      { s: 'chimes', r: 0.64, a: 90, v: 0.55 },
      { s: 'birds', r: 0.9, a: -150, v: 0.55 },
      { s: 'wind', r: 0.9, a: 160, v: 0.35 },
    ],
  },
  {
    id: 'coast',
    name: 'Night Coast',
    mood: 'Warm sand, cold stars',
    palette: ['#020617', '#0369a1', '#4c1d95', '#155e75'],
    orbs: [
      { s: 'ocean', r: 0.64, a: 0, v: 0.85 },
      { s: 'crickets', r: 0.64, a: 170, v: 0.5 },
      { s: 'wind', r: 0.9, a: -90, v: 0.4 },
      { s: 'drone', r: 0.9, a: 90, v: 0.35 },
    ],
  },
  {
    id: 'abyss',
    name: 'Abyssal',
    mood: 'Ten thousand leagues down',
    palette: ['#020412', '#1e3a8a', '#0f766e', '#581c87'],
    orbs: [
      { s: 'underwater', r: 0.34, a: 0, v: 0.8 },
      { s: 'drone', r: 0.64, a: -110, v: 0.55 },
      { s: 'choir', r: 0.9, a: 120, v: 0.4 },
      { s: 'drips', r: 0.64, a: 60, v: 0.5 },
    ],
  },
  {
    id: 'express',
    name: 'Night Express',
    mood: 'Sleeper car to nowhere',
    palette: ['#0c0a09', '#9a3412', '#1e1b4b', '#be185d'],
    orbs: [
      { s: 'train', r: 0.34, a: 180, v: 0.75 },
      { s: 'rain', r: 0.64, a: 70, v: 0.6 },
      { s: 'vinyl', r: 0.34, a: -20, v: 0.45 },
      { s: 'keys', r: 0.9, a: -100, v: 0.4 },
    ],
  },
]

export const DEFAULT_PALETTE = SCENES[0].palette
