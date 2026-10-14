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

export type Category = 'Weather' | 'Nature' | 'Urban' | 'Interior' | 'Texture' | 'Tonal'
export const CATEGORIES: Category[] = ['Weather', 'Nature', 'Urban', 'Interior', 'Texture', 'Tonal']

export interface SoundDef {
  id: string
  name: string
  blurb: string
  category: Category
  icon: LucideIcon
  /** [highlight, core] colours for the orb gradient. */
  colors: [string, string]
  factory: VoiceFactory
}

export const SOUNDS: SoundDef[] = [
  { id: 'rain', name: 'Rain on Skylight', blurb: 'Droplets tapping a glass roof', category: 'Weather', icon: CloudRain, colors: ['#9ad8ff', '#4f46e5'], factory: rainSkylight },
  { id: 'thunder', name: 'Distant Thunder', blurb: 'Rolling storm over the hills', category: 'Weather', icon: CloudLightning, colors: ['#c4b5fd', '#312e81'], factory: thunder },
  { id: 'wind', name: 'Wind in Pines', blurb: 'Gusts whistling through needles', category: 'Weather', icon: Wind, colors: ['#a7f3d0', '#0f766e'], factory: wind },
  { id: 'ocean', name: 'Ocean Waves', blurb: 'Swell, crest and foamy backwash', category: 'Nature', icon: WavesHorizontal, colors: ['#67e8f9', '#0369a1'], factory: ocean },
  { id: 'stream', name: 'Mountain Stream', blurb: 'Bubbling brook over stones', category: 'Nature', icon: Droplets, colors: ['#99f6e4', '#059669'], factory: stream },
  { id: 'birds', name: 'Forest Dawn', blurb: 'A four-species dawn chorus', category: 'Nature', icon: Bird, colors: ['#d9f99d', '#15803d'], factory: birds },
  { id: 'crickets', name: 'Summer Crickets', blurb: 'Pulsing field chorus & katydids', category: 'Nature', icon: Bug, colors: ['#fef08a', '#4d7c0f'], factory: crickets },
  { id: 'drips', name: 'Cave Drips', blurb: 'Resonant drops in a grotto', category: 'Nature', icon: Droplet, colors: ['#bfdbfe', '#334155'], factory: drips },
  { id: 'underwater', name: 'Abyss', blurb: 'Pressure, bubbles & sonar', category: 'Nature', icon: Fish, colors: ['#7dd3fc', '#1e3a8a'], factory: underwater },
  { id: 'shinjuku', name: 'Midnight Shinjuku', blurb: 'Wet streets, neon & crossings', category: 'Urban', icon: Building, colors: ['#f9a8d4', '#7e22ce'], factory: shinjuku },
  { id: 'train', name: 'Night Train', blurb: 'Clickety-clack through the dark', category: 'Urban', icon: TrainFront, colors: ['#fdba74', '#9a3412'], factory: nightTrain },
  { id: 'cafe', name: 'Café Murmur', blurb: 'Conversations & clinking cups', category: 'Urban', icon: Users, colors: ['#fde68a', '#b45309'], factory: cafe },
  { id: 'espresso', name: 'Espresso Machine', blurb: 'Grind, tamp, pour, steam', category: 'Interior', icon: Coffee, colors: ['#e7c6a0', '#7c2d12'], factory: espresso },
  { id: 'fireplace', name: 'Fireplace', blurb: 'Crackling logs & sap pops', category: 'Interior', icon: Flame, colors: ['#fdba74', '#dc2626'], factory: fireplace },
  { id: 'typing', name: 'Mechanical Keys', blurb: 'Thocky switches, late-night prose', category: 'Interior', icon: Keyboard, colors: ['#e2e8f0', '#475569'], factory: typing },
  { id: 'clock', name: 'Grandfather Clock', blurb: 'Tick, tock and a far chime', category: 'Interior', icon: Clock, colors: ['#fde047', '#a16207'], factory: clock },
  { id: 'vinyl', name: 'Vinyl Crackle', blurb: 'Dusty grooves at 33⅓ rpm', category: 'Texture', icon: Disc3, colors: ['#fbcfe8', '#be185d'], factory: vinyl },
  { id: 'brown', name: 'Brown Noise', blurb: 'Deep, breathing focus bed', category: 'Texture', icon: AudioLines, colors: ['#e0b48a', '#57301c'], factory: brownNoise },
  { id: 'pink', name: 'Pink Air', blurb: 'Soft, bright masking hiss', category: 'Texture', icon: Sparkle, colors: ['#fecdd3', '#db2777'], factory: pinkAir },
  { id: 'drone', name: 'Deep Space', blurb: 'Drifting detuned nebula drone', category: 'Tonal', icon: Orbit, colors: ['#ddd6fe', '#4c1d95'], factory: drone },
  { id: 'bowl', name: 'Singing Bowl', blurb: 'Beating bronze overtones', category: 'Tonal', icon: Bell, colors: ['#fcd34d', '#c2410c'], factory: singingBowl },
  { id: 'chimes', name: 'Wind Chimes', blurb: 'Pentatonic aluminium tubes', category: 'Tonal', icon: Sparkles, colors: ['#a5f3fc', '#6d28d9'], factory: chimes },
  { id: 'keys', name: 'Lo-fi Keys', blurb: 'Warm FM Rhodes at 72 bpm', category: 'Tonal', icon: Piano, colors: ['#fda4af', '#7e22ce'], factory: lofiKeys },
  { id: 'choir', name: 'Ethereal Choir', blurb: 'Morphing formant voices', category: 'Tonal', icon: AudioWaveform, colors: ['#f5d0fe', '#6d28d9'], factory: choir },
]

export const SOUND_MAP: Record<string, SoundDef> = Object.fromEntries(SOUNDS.map((s) => [s.id, s]))
