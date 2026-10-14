import type { LucideIcon } from 'lucide-react'
import {
  AudioLines, AudioWaveform, Bell, Bird, Bug, Building, Clock, CloudLightning, CloudRain, Coffee,
  Disc3, Droplet, Droplets, Fish, Flame, Keyboard, Orbit, Piano, Sparkle, Sparkles, TrainFront, Users,
  WavesHorizontal, Wind,
} from 'lucide-react'
import type { VoiceFactory } from './kit'
import { birds, crickets, drips, ocean, rainSkylight, stream, thunder, wind } from './sounds/nature'
import { cafe, espresso, nightTrain, shinjuku } from './sounds/urban'
import { brownNoise, clock, fireplace, pinkAir, typing, vinyl } from './sounds/texture'
import { chimes, choir, drone, lofiKeys, singingBowl, underwater } from './sounds/tonal'
import { EXTRA_SOUNDS } from './catalogExtra'

export type Category = 'Weather' | 'Nature' | 'Urban' | 'Interior' | 'Texture' | 'Tonal' | 'Focus' | 'Imported'
export const CATEGORIES: Category[] = ['Weather', 'Nature', 'Urban', 'Interior', 'Texture', 'Tonal', 'Focus', 'Imported']

/** CSS animation applied to the orb's icon so it feels alive (amplitude follows the audio level). */
export type AnimKind =
  | 'fall' | 'flicker' | 'sway' | 'bob' | 'flap' | 'swing' | 'tick' | 'spin'
  | 'bounce' | 'drip' | 'shake' | 'pulse' | 'tap' | 'breathe'

/** Particle style the orb sheds on the stage. */
export type ParticleKind = 'rain' | 'embers' | 'bubbles' | 'snow' | 'sparkles' | 'dust' | 'leaves' | 'notes' | 'steam'

export interface SoundDef {
  id: string
  name: string
  blurb: string
  category: Category
  icon: LucideIcon
  /** [highlight, core] colours for the orb gradient. */
  colors: [string, string]
  factory: VoiceFactory
  /** false = bypass the 3D panner (e.g. binaural beats, which need untouched L/R channels). */
  spatial?: boolean
  anim?: AnimKind
  particles?: ParticleKind
  /** URL of a real field recording blended under the synthesis by the orb's "Realism" control. */
  recording?: string
}

export const SOUNDS: SoundDef[] = [
  { id: 'rain', name: 'Rain on Skylight', blurb: 'Droplets tapping a glass roof', category: 'Weather', icon: CloudRain, colors: ['#9ad8ff', '#4f46e5'], anim: 'fall', particles: 'rain', factory: rainSkylight },
  { id: 'thunder', name: 'Distant Thunder', blurb: 'Rolling storm over the hills', category: 'Weather', icon: CloudLightning, colors: ['#c4b5fd', '#312e81'], anim: 'shake', particles: 'rain', factory: thunder },
  { id: 'wind', name: 'Wind in Pines', blurb: 'Gusts whistling through needles', category: 'Weather', icon: Wind, colors: ['#a7f3d0', '#0f766e'], anim: 'sway', particles: 'leaves', factory: wind },
  { id: 'ocean', name: 'Ocean Waves', blurb: 'Swell, crest and foamy backwash', category: 'Nature', icon: WavesHorizontal, colors: ['#67e8f9', '#0369a1'], anim: 'bob', particles: 'bubbles', factory: ocean },
  { id: 'stream', name: 'Mountain Stream', blurb: 'Bubbling brook over stones', category: 'Nature', icon: Droplets, colors: ['#99f6e4', '#059669'], anim: 'drip', particles: 'bubbles', factory: stream },
  { id: 'birds', name: 'Forest Dawn', blurb: 'A four-species dawn chorus', category: 'Nature', icon: Bird, colors: ['#d9f99d', '#15803d'], anim: 'flap', particles: 'leaves', factory: birds },
  { id: 'crickets', name: 'Summer Crickets', blurb: 'Pulsing field chorus & katydids', category: 'Nature', icon: Bug, colors: ['#fef08a', '#4d7c0f'], anim: 'tap', particles: 'sparkles', factory: crickets },
  { id: 'drips', name: 'Cave Drips', blurb: 'Resonant drops in a grotto', category: 'Nature', icon: Droplet, colors: ['#bfdbfe', '#334155'], anim: 'drip', particles: 'bubbles', factory: drips },
  { id: 'underwater', name: 'Abyss', blurb: 'Pressure, bubbles & sonar', category: 'Nature', icon: Fish, colors: ['#7dd3fc', '#1e3a8a'], anim: 'bob', particles: 'bubbles', factory: underwater },
  { id: 'shinjuku', name: 'Midnight Shinjuku', blurb: 'Wet streets, neon & crossings', category: 'Urban', icon: Building, colors: ['#f9a8d4', '#7e22ce'], anim: 'pulse', particles: 'rain', factory: shinjuku },
  { id: 'train', name: 'Night Train', blurb: 'Clickety-clack through the dark', category: 'Urban', icon: TrainFront, colors: ['#fdba74', '#9a3412'], anim: 'shake', particles: 'dust', factory: nightTrain },
  { id: 'cafe', name: 'Café Murmur', blurb: 'Conversations & clinking cups', category: 'Urban', icon: Users, colors: ['#fde68a', '#b45309'], anim: 'bob', particles: 'steam', factory: cafe },
  { id: 'espresso', name: 'Espresso Machine', blurb: 'Grind, tamp, pour, steam', category: 'Interior', icon: Coffee, colors: ['#e7c6a0', '#7c2d12'], anim: 'shake', particles: 'steam', factory: espresso },
  { id: 'fireplace', name: 'Fireplace', blurb: 'Crackling logs & sap pops', category: 'Interior', icon: Flame, colors: ['#fdba74', '#dc2626'], anim: 'flicker', particles: 'embers', factory: fireplace },
  { id: 'typing', name: 'Mechanical Keys', blurb: 'Thocky switches, late-night prose', category: 'Interior', icon: Keyboard, colors: ['#e2e8f0', '#475569'], anim: 'tap', factory: typing },
  { id: 'clock', name: 'Grandfather Clock', blurb: 'Tick, tock and a far chime', category: 'Interior', icon: Clock, colors: ['#fde047', '#a16207'], anim: 'tick', factory: clock },
  { id: 'vinyl', name: 'Vinyl Crackle', blurb: 'Dusty grooves at 33⅓ rpm', category: 'Texture', icon: Disc3, colors: ['#fbcfe8', '#be185d'], anim: 'spin', particles: 'dust', factory: vinyl },
  { id: 'brown', name: 'Brown Noise', blurb: 'Deep, breathing focus bed', category: 'Texture', icon: AudioLines, colors: ['#e0b48a', '#57301c'], anim: 'breathe', factory: brownNoise },
  { id: 'pink', name: 'Pink Air', blurb: 'Soft, bright masking hiss', category: 'Texture', icon: Sparkle, colors: ['#fecdd3', '#db2777'], anim: 'breathe', particles: 'sparkles', factory: pinkAir },
  { id: 'drone', name: 'Deep Space', blurb: 'Drifting detuned nebula drone', category: 'Tonal', icon: Orbit, colors: ['#ddd6fe', '#4c1d95'], anim: 'spin', particles: 'sparkles', factory: drone },
  { id: 'bowl', name: 'Singing Bowl', blurb: 'Beating bronze overtones', category: 'Tonal', icon: Bell, colors: ['#fcd34d', '#c2410c'], anim: 'swing', particles: 'sparkles', factory: singingBowl },
  { id: 'chimes', name: 'Wind Chimes', blurb: 'Pentatonic aluminium tubes', category: 'Tonal', icon: Sparkles, colors: ['#a5f3fc', '#6d28d9'], anim: 'swing', particles: 'sparkles', factory: chimes },
  { id: 'keys', name: 'Lo-fi Keys', blurb: 'Warm FM Rhodes at 72 bpm', category: 'Tonal', icon: Piano, colors: ['#fda4af', '#7e22ce'], anim: 'bounce', particles: 'notes', factory: lofiKeys },
  { id: 'choir', name: 'Ethereal Choir', blurb: 'Morphing formant voices', category: 'Tonal', icon: AudioWaveform, colors: ['#f5d0fe', '#6d28d9'], anim: 'breathe', particles: 'notes', factory: choir },
  ...EXTRA_SOUNDS,
]

export const SOUND_MAP: Record<string, SoundDef> = Object.fromEntries(SOUNDS.map((s) => [s.id, s]))

/** Add a sound at runtime (user-imported recordings). */
export function registerSound(def: SoundDef) {
  if (SOUND_MAP[def.id]) return
  SOUNDS.push(def)
  SOUND_MAP[def.id] = def
}
