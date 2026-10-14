/** Acoustic spaces. Each impulse response is synthesised from a handful of physical traits. */
export interface RoomDef {
  id: string
  name: string
  blurb: string
  /** Impulse length in seconds. */
  seconds: number
  /** Exponential decay time constant (s) — roughly RT60 / 6.9. */
  tau: number
  /** Tail brightness: one-pole coefficient at the start and end of the tail (1 = open, 0.05 = very dark). */
  brightStart: number
  brightEnd: number
  /** Number of discrete early reflections and the window they fall in. */
  early: number
  earlyWindow: number
  /** 1 = dense smooth tail; lower values give sparse, grainy scattering (foliage). */
  density: number
  /** Highpass on the IR (Hz) — thins out boomy spaces. */
  lowCut: number
  /** Repeating discrete echo (s) for caves / canyons, 0 = none. */
  echo: number
  /** Modal resonances (Hz) for small hard rooms. */
  modes: number[]
  preDelay: number
  /** Wet return level so rooms feel comparable in loudness. */
  level: number
}

export const ROOMS: RoomDef[] = [
  { id: 'hall', name: 'Concert Hall', blurb: 'Warm, lush, 3.6 s', seconds: 3.6, tau: 0.62, brightStart: 0.85, brightEnd: 0.1, early: 14, earlyWindow: 0.08, density: 1, lowCut: 60, echo: 0, modes: [], preDelay: 0.025, level: 0.55 },
  { id: 'cathedral', name: 'Cathedral', blurb: 'Stone nave, 7 s bloom', seconds: 7.5, tau: 1.3, brightStart: 0.7, brightEnd: 0.12, early: 22, earlyWindow: 0.18, density: 1, lowCut: 80, echo: 0, modes: [], preDelay: 0.06, level: 0.42 },
  { id: 'forest', name: 'Forest', blurb: 'Scattered by trunks & leaves', seconds: 2.2, tau: 0.35, brightStart: 0.9, brightEnd: 0.35, early: 30, earlyWindow: 0.25, density: 0.06, lowCut: 300, echo: 0, modes: [], preDelay: 0.01, level: 0.9 },
  { id: 'bath', name: 'Tiled Bathroom', blurb: 'Bright, ringing, intimate', seconds: 1.5, tau: 0.22, brightStart: 0.98, brightEnd: 0.7, early: 18, earlyWindow: 0.02, density: 1, lowCut: 120, echo: 0, modes: [210, 340, 470, 690, 980], preDelay: 0.003, level: 0.5 },
  { id: 'car', name: 'Car Interior', blurb: 'Tight, padded, muffled', seconds: 0.35, tau: 0.05, brightStart: 0.35, brightEnd: 0.1, early: 8, earlyWindow: 0.008, density: 1, lowCut: 90, echo: 0, modes: [95, 160], preDelay: 0.001, level: 0.9 },
  { id: 'cave', name: 'Cave', blurb: 'Dark grotto with echoes', seconds: 5, tau: 0.9, brightStart: 0.45, brightEnd: 0.06, early: 12, earlyWindow: 0.12, density: 1, lowCut: 50, echo: 0.29, modes: [], preDelay: 0.04, level: 0.5 },
  { id: 'plate', name: 'Studio Plate', blurb: 'Silky, dense, 2.4 s', seconds: 2.4, tau: 0.45, brightStart: 0.95, brightEnd: 0.45, early: 0, earlyWindow: 0, density: 1, lowCut: 150, echo: 0, modes: [], preDelay: 0.012, level: 0.5 },
  { id: 'field', name: 'Open Field', blurb: 'Almost dry, faint ground bounce', seconds: 0.9, tau: 0.12, brightStart: 0.6, brightEnd: 0.2, early: 3, earlyWindow: 0.03, density: 0.25, lowCut: 200, echo: 0, modes: [], preDelay: 0.005, level: 0.6 },
]

export const ROOM_MAP: Record<string, RoomDef> = Object.fromEntries(ROOMS.map((r) => [r.id, r]))

export function makeImpulse(ctx: BaseAudioContext, room: RoomDef): AudioBuffer {
  const rate = ctx.sampleRate
  const len = Math.max(1, Math.floor(rate * room.seconds))
  const ir = ctx.createBuffer(2, len, rate)
  const hpK = Math.exp((-2 * Math.PI * room.lowCut) / rate)
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch)
    let lp = 0
    for (let i = 0; i < len; i++) {
      const t = i / rate
      const x = i / len
      const env = Math.exp(-t / room.tau) * Math.pow(1 - x, 1.5)
      // the tail darkens as high frequencies are absorbed faster than lows
      const k = room.brightStart + (room.brightEnd - room.brightStart) * x
      let n = Math.random() * 2 - 1
      if (room.density < 1) n = Math.random() < room.density ? n / Math.sqrt(room.density) : 0
      lp += k * (n - lp)
      d[i] = lp * env * (t < 0.006 ? t / 0.006 : 1)
    }
    for (let r = 0; r < room.early; r++) {
      const at = Math.floor(rate * (0.002 + Math.random() * room.earlyWindow))
      if (at < len) d[at] += (Math.random() * 2 - 1) * 0.7 * (1 - r / Math.max(1, room.early))
    }
    if (room.echo > 0) {
      // discrete slap-back repeats off distant rock walls, alternating sides
      for (let e = 1; e * room.echo < room.seconds; e++) {
        const at = Math.floor(rate * (e * room.echo + (ch ? 0.013 : 0)))
        const amp = 0.55 * Math.pow(0.55, e)
        for (let j = 0; j < 300 && at + j < len; j++) d[at + j] += (Math.random() * 2 - 1) * amp * (1 - j / 300)
      }
    }
    for (const f of room.modes) {
      const ph = Math.random() * Math.PI * 2
      for (let i = 0; i < len; i++) d[i] += Math.sin((2 * Math.PI * f * i) / rate + ph) * 0.05 * Math.exp(-i / rate / (room.tau * 1.4))
    }
    // gentle DC-blocking highpass so small rooms don't boom
    let px = 0
    let py = 0
    for (let i = 0; i < len; i++) {
      const y = hpK * (py + d[i] - px)
      px = d[i]
      py = y
      d[i] = y
    }
  }
  return ir
}
