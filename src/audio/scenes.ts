import type { ModeName } from './mood'

export interface ScenePlacement {
  s: string
  /** Normalised radius (0 = listener, 1 = edge of the field). */
  r: number
  /** Angle in degrees, 0 = straight ahead, clockwise. */
  a: number
  v?: number
}

export interface SceneMusic {
  root: number
  mode: ModeName
  density: number
  brightness: number
  tempo: number
}

export interface Scene {
  id: string
  name: string
  mood: string
  /** Four colours for the background mesh gradient. */
  palette: [string, string, string, string]
  /** Key and feel for generative music (ambient piano). */
  music: SceneMusic
  orbs: ScenePlacement[]
  /** Optional acoustic space for the scene. */
  room?: string
}

export const SCENES: Scene[] = [
  {
    id: 'tokyo',
    name: 'Tokyo Rain',
    mood: 'Neon reflections, 2 a.m.',
    palette: ['#1b1140', '#7e22ce', '#db2777', '#0e7490'],
    music: { root: 62, mode: 'dorian', density: 0.45, brightness: 0.5, tempo: 68 },
    room: 'hall',
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
    music: { root: 65, mode: 'mixolydian', density: 0.55, brightness: 0.65, tempo: 76 },
    room: 'plate',
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
    music: { root: 57, mode: 'aeolian', density: 0.35, brightness: 0.45, tempo: 60 },
    room: 'hall',
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
    music: { root: 62, mode: 'pentatonic', density: 0.3, brightness: 0.5, tempo: 64 },
    room: 'plate',
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
    music: { root: 62, mode: 'pentatonic', density: 0.25, brightness: 0.7, tempo: 56 },
    room: 'forest',
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
    music: { root: 64, mode: 'lydian', density: 0.35, brightness: 0.55, tempo: 58 },
    room: 'field',
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
    music: { root: 55, mode: 'aeolian', density: 0.2, brightness: 0.3, tempo: 50 },
    room: 'cave',
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
    music: { root: 60, mode: 'dorian', density: 0.4, brightness: 0.45, tempo: 70 },
    room: 'car',
    orbs: [
      { s: 'train', r: 0.34, a: 180, v: 0.75 },
      { s: 'rain', r: 0.64, a: 70, v: 0.6 },
      { s: 'vinyl', r: 0.34, a: -20, v: 0.45 },
      { s: 'keys', r: 0.9, a: -100, v: 0.4 },
    ],
  },
  {
    id: 'kyoto',
    name: 'Kyoto Morning',
    mood: 'Temple bell, moss, first light',
    palette: ['#08100c', '#166534', '#b45309', '#9f1239'],
    music: { root: 62, mode: 'pentatonic', density: 0.3, brightness: 0.65, tempo: 58 },
    room: 'forest',
    orbs: [
      { s: 'temple', r: 0.9, a: 30, v: 0.6 },
      { s: 'stream', r: 0.64, a: -70, v: 0.55 },
      { s: 'birds', r: 0.64, a: 140, v: 0.5 },
      { s: 'piano', r: 0.34, a: -150, v: 0.5 },
    ],
  },
  {
    id: 'study',
    name: 'Late-Night Study',
    mood: 'Lamp on, cat asleep, rain outside',
    palette: ['#0b0a12', '#3730a3', '#92400e', '#334155'],
    music: { root: 60, mode: 'lydian', density: 0.3, brightness: 0.45, tempo: 62 },
    room: 'plate',
    orbs: [
      { s: 'library', r: 0.64, a: 0, v: 0.6 },
      { s: 'purr', r: 0.34, a: 120, v: 0.55 },
      { s: 'tent', r: 0.9, a: -110, v: 0.5 },
      { s: 'piano', r: 0.64, a: -30, v: 0.45 },
      { s: 'focus-beats', r: 0.34, a: -120, v: 0.3 },
    ],
  },
]

export const DEFAULT_PALETTE = SCENES[0].palette
