import {
  BellRing, Brain, CarFront, Cat, KeyboardMusic, LibraryBig, MoonStar, Sailboat, Server, Snowflake, Tent,
  TrainFrontTunnel, TreePalm, UtensilsCrossed,
} from 'lucide-react'
import type { SoundDef } from './catalog'
import {
  ambientPiano, arcticWind, binauralFocus, binauralSleep, catPurr, diner, jungleNight, library, rainCarRoof,
  rainTent, sailboat, serverRoom, subwayPlatform, templeBells,
} from './sounds/extra'

export const EXTRA_SOUNDS: SoundDef[] = [
  { id: 'tent', name: 'Rain on a Tent', blurb: 'Nylon patter, gusts & tree drips', category: 'Weather', icon: Tent, colors: ['#bbf7d0', '#166534'], factory: rainTent, anim: 'tap', particles: 'rain' },
  { id: 'carroof', name: 'Rain on the Car', blurb: 'Drumming roof, swishing wipers', category: 'Weather', icon: CarFront, colors: ['#c7d2fe', '#334155'], factory: rainCarRoof, anim: 'drip', particles: 'rain' },
  { id: 'arctic', name: 'Arctic Wind', blurb: 'Howling ice, blowing snow', category: 'Weather', icon: Snowflake, colors: ['#e0f2fe', '#0c4a6e'], factory: arcticWind, anim: 'spin', particles: 'snow' },
  { id: 'jungle', name: 'Jungle Night', blurb: 'Frog chorus under the canopy', category: 'Nature', icon: TreePalm, colors: ['#bef264', '#14532d'], factory: jungleNight, anim: 'sway', particles: 'leaves' },
  { id: 'sailboat', name: 'Moored Sailboat', blurb: 'Lapping hull, creaks & halyards', category: 'Nature', icon: Sailboat, colors: ['#bae6fd', '#1e40af'], factory: sailboat, anim: 'bob', particles: 'bubbles' },
  { id: 'subway', name: 'Subway Platform', blurb: 'Tiled echoes & arriving trains', category: 'Urban', icon: TrainFrontTunnel, colors: ['#fcd34d', '#1e3a8a'], factory: subwayPlatform, anim: 'shake', particles: 'dust' },
  { id: 'diner', name: '1950s Diner', blurb: 'Doo-wop jukebox & griddle sizzle', category: 'Urban', icon: UtensilsCrossed, colors: ['#fca5a5', '#0e7490'], factory: diner, anim: 'bounce', particles: 'notes' },
  { id: 'library', name: 'Reading Room', blurb: 'Page turns in a hushed hall', category: 'Interior', icon: LibraryBig, colors: ['#fef3c7', '#78350f'], factory: library, anim: 'breathe', particles: 'dust' },
  { id: 'server', name: 'Server Room', blurb: 'Fan whine, hum & drive chatter', category: 'Interior', icon: Server, colors: ['#86efac', '#065f46'], factory: serverRoom, anim: 'pulse', particles: 'sparkles' },
  { id: 'purr', name: 'Purring Cat', blurb: 'A warm, rumbling lap companion', category: 'Interior', icon: Cat, colors: ['#fed7aa', '#9a3412'], factory: catPurr, anim: 'breathe' },
  { id: 'temple', name: 'Kyoto Temple', blurb: 'Bonshō bronze & garden bells', category: 'Tonal', icon: BellRing, colors: ['#fde68a', '#9f1239'], factory: templeBells, anim: 'swing', particles: 'leaves' },
  { id: 'piano', name: 'Ambient Piano', blurb: 'Felt piano that follows the mood', category: 'Tonal', icon: KeyboardMusic, colors: ['#fbcfe8', '#4338ca'], factory: ambientPiano, anim: 'bob', particles: 'notes' },
  { id: 'focus-beats', name: 'Focus Beats', blurb: '14 Hz beta binaural · headphones', category: 'Focus', icon: Brain, colors: ['#a5b4fc', '#3730a3'], factory: binauralFocus, spatial: false, anim: 'pulse', particles: 'sparkles' },
  { id: 'sleep-beats', name: 'Sleep Beats', blurb: '3 Hz delta binaural · headphones', category: 'Focus', icon: MoonStar, colors: ['#c4b5fd', '#1e1b4b'], factory: binauralSleep, spatial: false, anim: 'breathe', particles: 'snow' },
]
