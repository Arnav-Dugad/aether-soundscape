import {
  VoiceBuilder, chain, chance, drift, filter, gain, midi, pick, poisson, rand, randInt, saturator, tone,
  type Kit, type NoiseColor, type VoiceFactory,
} from '../kit'
import { mood } from '../mood'

// ───────────────────────── shared helpers ─────────────────────────

/** [frequency ratio, relative amplitude, decay seconds] of one mode of a struck object. */
type Partial = readonly [ratio: number, amp: number, decay: number]

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))

/**
 * Click-buffer one-shot, as kit's `burst`, but with the envelope gain created at 0: with sub-sample
 * accurate starts the source can emit one sample before `t`, which a default-1 gain lets through as a spike.
 */
function burst(
  kit: Kit,
  dest: AudioNode,
  t: number,
  opts: { dur: number; amp: number; rate?: number; type?: BiquadFilterType; freq?: number; Q?: number; attack?: number },
) {
  const { ctx } = kit
  const src = ctx.createBufferSource()
  src.buffer = kit.click
  src.playbackRate.value = opts.rate ?? 1
  const g = gain(ctx, 0)
  const a = opts.attack ?? 0.0005
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(opts.amp, t + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + opts.dur)
  if (opts.type) src.connect(filter(ctx, opts.type, opts.freq ?? 1000, opts.Q ?? 1)).connect(g)
  else src.connect(g)
  g.connect(dest)
  src.start(t, Math.random() * 0.02)
  src.stop(t + a + opts.dur + 0.05)
}

/** Looping noise source that plays only over [t, t + dur). */
function noiseAt(kit: Kit, color: NoiseColor, t: number, dur: number, rate = 1): AudioBufferSourceNode {
  const src = kit.ctx.createBufferSource()
  src.buffer = kit.noise[color]
  src.loop = true
  src.playbackRate.value = rate
  src.start(t, Math.random() * 4)
  src.stop(t + dur)
  return src
}

/** Filtered noise one-shot with a linear attack → hold → release envelope. */
function noiseShot(
  kit: Kit,
  dest: AudioNode,
  t: number,
  o: {
    color: NoiseColor; dur: number; amp: number; type: BiquadFilterType; freq: number
    Q?: number; attack?: number; release?: number; rate?: number
  },
) {
  const { ctx } = kit
  const src = noiseAt(kit, o.color, t, o.dur + 0.05, o.rate)
  const f = filter(ctx, o.type, o.freq, o.Q ?? 1)
  f.frequency.setValueAtTime(o.freq, t)
  const g = gain(ctx, 0)
  chain(src, f, g, dest)
  const a = Math.min(o.attack ?? 0.01, o.dur * 0.9)
  const r = clamp(o.release ?? o.dur * 0.5, 0.001, o.dur - a)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(o.amp, t + a)
  g.gain.setValueAtTime(o.amp, t + o.dur - r)
  g.gain.linearRampToValueAtTime(0, t + o.dur)
  return { src, f, g }
}

/** Sine (or other) note with a held body: linear attack, sustain, smooth release — whistles, beeps, calls. */
function whistle(
  ctx: AudioContext,
  dest: AudioNode,
  t: number,
  o: { freq: number; amp: number; dur: number; attack?: number; release?: number; type?: OscillatorType },
): OscillatorNode {
  const osc = ctx.createOscillator()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(o.freq, t)
  const g = gain(ctx, 0)
  const a = Math.min(o.attack ?? 0.02, o.dur * 0.5)
  const r = clamp(o.release ?? o.dur * 0.3, 0.005, o.dur - a)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(o.amp, t + a)
  g.gain.setValueAtTime(o.amp, t + o.dur - r)
  g.gain.linearRampToValueAtTime(0, t + o.dur)
  osc.connect(g).connect(dest)
  osc.start(t)
  osc.stop(t + o.dur + 0.05)
  return osc
}

/** Struck metal: a stack of sine modes; `beat` > 0 splits each into a slowly-beating detuned pair. */
function ring(
  ctx: AudioContext, dest: AudioNode, t: number, f: number, amp: number,
  partials: readonly Partial[], beat = 0, attack = 0.002,
) {
  for (const [r, a, d] of partials) {
    if (beat > 0) {
      for (const s of [-0.5, 0.5]) {
        tone(ctx, dest, t, { freq: f * r + s * beat * rand(0.6, 1.4), amp: amp * a * 0.5, attack, decay: d })
      }
    } else tone(ctx, dest, t, { freq: f * r, amp: amp * a, attack, decay: d })
  }
}

function panTo(ctx: AudioContext, dest: AudioNode, p: number): StereoPannerNode {
  const s = ctx.createStereoPanner()
  s.pan.value = clamp(p, -1, 1)
  s.connect(dest)
  return s
}

/** Stick-slip friction (wood, rope, chair joints): a jittery low click-train ringing two resonances. */
function creak(
  ctx: AudioContext,
  dest: AudioNode,
  t: number,
  o: { dur: number; rate: number; freq: number; Q: number; amp: number; bend?: number },
) {
  const s = ctx.createOscillator()
  s.type = 'sawtooth'
  s.frequency.setValueAtTime(o.rate, t)
  // the joint catches and releases irregularly
  for (let tt = t + rand(0.02, 0.06); tt < t + o.dur; tt += rand(0.02, 0.07)) {
    s.frequency.linearRampToValueAtTime(o.rate * rand(0.55, 1.6), tt)
  }
  const b1 = filter(ctx, 'bandpass', o.freq, o.Q)
  const b2 = filter(ctx, 'bandpass', o.freq * rand(1.9, 2.7), o.Q * 1.3)
  b1.frequency.setValueAtTime(o.freq, t)
  b1.frequency.linearRampToValueAtTime(o.freq * (o.bend ?? 1), t + o.dur)
  const g = gain(ctx, 0)
  s.connect(b1).connect(g)
  s.connect(b2).connect(g)
  g.connect(dest)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(o.amp, t + o.dur * 0.2)
  g.gain.linearRampToValueAtTime(o.amp * rand(0.5, 1), t + o.dur * 0.7)
  g.gain.linearRampToValueAtTime(0, t + o.dur)
  s.start(t)
  s.stop(t + o.dur + 0.05)
}

/** Synthetic room impulse: sparse early reflections + an exponentially decaying, darkening tail. */
function roomIR(ctx: BaseAudioContext, seconds: number, rt60: number, dark: number): AudioBuffer {
  const rate = ctx.sampleRate
  const len = Math.floor(rate * seconds)
  const ir = ctx.createBuffer(2, len, rate)
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch)
    let lp = 0
    for (let i = 0; i < len; i++) {
      const k = 0.9 - dark * (i / len)
      lp += k * (Math.random() * 2 - 1 - lp)
      d[i] = lp * Math.exp((-6.9 * i) / (rate * rt60)) * Math.min(1, i / (rate * 0.004))
    }
    for (let r = 0; r < 24; r++) {
      d[Math.floor(rate * rand(0.006, 0.09))] += (Math.random() * 2 - 1) * 0.7 * (1 - r / 24)
    }
  }
  return ir
}

/** Formant-filtered noise "talkers" (talk/pause structure) feeding `dest` — a crowd murmur. */
function murmur(v: VoiceBuilder, dest: AudioNode, voices: number, loudness: [number, number]) {
  const { ctx } = v
  const formants = [[700, 1220], [400, 2000], [550, 900], [300, 2300], [640, 1190]]
  for (let i = 0; i < voices; i++) {
    const src = v.noise('pink', rand(0.95, 1.05))
    const [f1, f2] = pick(formants)
    const a = filter(ctx, 'bandpass', f1, 4)
    const b = filter(ctx, 'bandpass', f2, 5)
    const mix = gain(ctx, 0)
    src.connect(a).connect(mix)
    src.connect(b).connect(mix)
    mix.connect(panTo(ctx, dest, rand(-0.85, 0.85)))
    const loud = rand(loudness[0], loudness[1])
    let talking = chance(0.6)
    v.every(rand(0, 1), (t) => {
      if (!talking) {
        drift(mix.gain, t, 0, 0.1)
        talking = chance(0.55)
        return rand(0.8, 3)
      }
      drift(mix.gain, t, loud * Math.pow(Math.random(), 0.6), 0.025)
      const [nf1, nf2] = pick(formants)
      drift(a.frequency, t, nf1 * rand(0.9, 1.2), 0.04)
      drift(b.frequency, t, nf2 * rand(0.9, 1.2), 0.04)
      if (chance(0.03)) talking = false
      return rand(0.08, 0.2)
    })
  }
}

// ───────────────────────── generators ─────────────────────────

/** Kyoto temple garden: a deep bonshō swung at by a wooden beam, small rin bells, leaves and a far uguisu. */
export const templeBells: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 1)
  const { ctx } = v
  // garden air: leaves stirring, a soft low breeze
  const leaves = filter(ctx, 'bandpass', 2200, 0.5)
  const lg = gain(ctx, 0.02)
  chain(v.noise('pink'), leaves, lg, v.out)
  v.lfo(lg.gain, 0.09, 0.012)
  v.lfo(leaves.frequency, 0.05, 600)
  chain(v.noise('brown'), filter(ctx, 'bandpass', 320, 0.5), gain(ctx, 0.06), v.out)

  // bonshō: low inharmonic bronze modes, each a beating pair — the bell's slow "naminari" undulation
  const BONSHO: Partial[] = [
    [1, 0.7, 24], [1.58, 0.45, 20], [2.24, 0.6, 17], [2.92, 0.35, 14], [3.67, 0.25, 10],
    [4.52, 0.16, 7], [5.6, 0.1, 5], [6.95, 0.06, 3.5], [8.4, 0.035, 2.2],
  ]
  const bell = filter(ctx, 'lowpass', 2400, 0.5)
  bell.connect(v.out)
  v.every(1.5, (t) => {
    const f0 = rand(86, 98)
    const amp = rand(0.12, 0.16)
    const len = rand(0.8, 1.05)
    for (const [r, a, d] of BONSHO) {
      for (const s of [-1, 1]) {
        tone(ctx, bell, t, {
          freq: f0 * r + s * rand(0.12, 0.45) * Math.sqrt(r),
          amp: amp * a * 0.5,
          attack: 0.004 + 0.02 / r,
          decay: d * len,
        })
      }
    }
    // shumoku: the suspended log meets the bronze — a soft, woody thud
    burst(kit, v.out, t, { dur: 0.09, amp: 0.4, type: 'lowpass', freq: 380, Q: 0.8, attack: 0.004 })
    const th = tone(ctx, v.out, t, { freq: 150, amp: 0.1, decay: 0.14 })
    th.frequency.exponentialRampToValueAtTime(75, t + 0.12)
    return rand(25, 40)
  })

  // hand bells: a single rin strike, or a shaken cluster of tiny suzu
  const RIN: Partial[] = [[1, 1, 5], [2.71, 0.4, 2.6], [4.95, 0.18, 1.2], [7.6, 0.06, 0.6]]
  v.every(rand(6, 14), (t) => {
    const p = panTo(ctx, v.out, rand(-0.7, 0.7))
    if (chance(0.55)) {
      ring(ctx, p, t, rand(780, 1250), rand(0.035, 0.055), RIN, 1.6)
    } else {
      const f = rand(2300, 3000)
      let tt = t
      for (let i = 0, n = randInt(4, 10); i < n; i++) {
        ring(ctx, p, tt, f * rand(0.97, 1.03), rand(0.008, 0.02), [[1, 1, 0.5], [1.52, 0.35, 0.3]])
        tt += rand(0.03, 0.12)
      }
    }
    return poisson(16) + 5
  })

  // shishi-odoshi: the bamboo water-scare tipping and knocking on its stone
  v.every(rand(15, 40), (t) => {
    burst(kit, v.out, t, { dur: 0.03, amp: 0.25, type: 'bandpass', freq: 700, Q: 3 })
    tone(ctx, v.out, t, { freq: rand(480, 540), amp: 0.06, decay: 0.09 })
    tone(ctx, v.out, t, { freq: rand(1150, 1250), amp: 0.025, decay: 0.05 })
    // the water it dumps
    noiseShot(kit, v.out, t + 0.05, { color: 'pink', dur: 0.6, amp: 0.05, type: 'bandpass', freq: 1300, Q: 1.2, attack: 0.03, release: 0.45 })
    return rand(45, 80)
  })

  // a distant uguisu (bush warbler): long held whistle, then "ho-ke-kyo"
  const birdPan = panTo(ctx, v.out, rand(-0.8, 0.8))
  const bird = filter(ctx, 'highpass', 900)
  bird.connect(birdPan)
  v.every(rand(8, 20), (t) => {
    const f = rand(1300, 1550)
    const hoo = whistle(ctx, bird, t, { freq: f * 0.92, amp: 0.022, dur: 1.1, attack: 0.3, release: 0.35 })
    hoo.frequency.linearRampToValueAtTime(f, t + 0.9)
    const t2 = t + 1.4
    whistle(ctx, bird, t2, { freq: f * 1.25, amp: 0.018, dur: 0.12, attack: 0.02, release: 0.05 })
    const ke = whistle(ctx, bird, t2 + 0.17, { freq: f * 1.95, amp: 0.018, dur: 0.1, attack: 0.01, release: 0.04 })
    ke.frequency.exponentialRampToValueAtTime(f * 1.6, t2 + 0.27)
    const kyo = whistle(ctx, bird, t2 + 0.32, { freq: f * 2.15, amp: 0.022, dur: 0.38, attack: 0.01, release: 0.2 })
    kyo.frequency.exponentialRampToValueAtTime(f * 1.5, t2 + 0.62)
    return poisson(30) + 14
  })
  return v.build()
}

/** 1950s diner: a doo-wop jukebox across the room, griddle sizzle, chatter, coffee pours, the register's ding. */
export const diner: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 0.85)
  const { ctx } = v
  chain(v.noise('brown'), filter(ctx, 'lowpass', 260), gain(ctx, 0.07), v.out)

  // ── jukebox: a small, overdriven speaker heard from across the room
  const juke = gain(ctx, 0.45)
  const jukeOut = gain(ctx, 0.5)
  chain(
    juke, filter(ctx, 'highpass', 150), filter(ctx, 'lowpass', 1500, 1.4), saturator(ctx, 1.8),
    filter(ctx, 'lowpass', 2200), jukeOut, panTo(ctx, v.out, -0.35),
  )
  // a reflected copy off the far wall
  const slap = ctx.createDelay(0.1)
  slap.delayTime.value = 0.031
  chain(jukeOut, slap, filter(ctx, 'lowpass', 900), gain(ctx, 0.35), panTo(ctx, v.out, 0.25))

  // backing vocal "oohs": saws through two moving formants
  const vowel = [filter(ctx, 'bandpass', 330, 5), filter(ctx, 'bandpass', 750, 6)]
  const padEnv = gain(ctx, 0)
  vowel[0].connect(padEnv)
  vowel[1].connect(gain(ctx, 0.6)).connect(padEnv)
  padEnv.connect(juke)
  const pad = [0, 1, 2].map(() =>
    [-8, 8].map((det) => {
      const o = v.osc('sawtooth', 220, det)
      v.lfo(o.detune, rand(4.8, 5.6), 10)
      for (const f of vowel) o.connect(f)
      return o
    }),
  )
  const PROG = [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]] // I – vi – IV – V
  const WALK = [[0, 4, 7, 9], [0, 3, 7, 3], [0, 4, 7, 9], [0, 4, 7, 4]]
  let key = 58
  let bpm = 70
  let bar = 0
  let songBars = 0
  v.every(1, (t) => {
    if (bar >= songBars) {
      // record change: the changer arm clunks, the needle drops onto a new 45
      drift(padEnv.gain, t, 0, 0.3)
      const c = t + rand(1, 2)
      for (const [dt, a] of [[0, 0.3], [0.35, 0.2], [0.9, 0.25]] as const) {
        burst(kit, juke, c + dt, { dur: 0.05, amp: a, type: 'lowpass', freq: 700 })
      }
      for (let i = 0; i < 14; i++) {
        burst(kit, juke, c + 1.4 + rand(0, 1.2), { dur: 0.003, amp: rand(0.05, 0.2), type: 'bandpass', freq: 1200, Q: 1 })
      }
      key = pick([53, 55, 56, 58, 60])
      bpm = rand(64, 78)
      bar = 0
      songBars = 4 * randInt(5, 9)
      return rand(3.5, 6)
    }
    const beat = 60 / bpm
    const trip = beat / 3
    const ci = bar % 4
    const chord = PROG[ci]
    pad.forEach((pair, i) => pair.forEach((o) => o.frequency.setTargetAtTime(midi(key + chord[i]), t, 0.04)))
    padEnv.gain.setTargetAtTime(0.09, t, 0.12)
    // "doo … wah"
    vowel[0].frequency.setTargetAtTime(330, t, 0.08)
    vowel[1].frequency.setTargetAtTime(750, t, 0.08)
    vowel[0].frequency.setTargetAtTime(700, t + beat * 2, 0.15)
    vowel[1].frequency.setTargetAtTime(1150, t + beat * 2, 0.15)
    padEnv.gain.setTargetAtTime(0.05, t + beat * 3.6, 0.08)
    // walking bass with a swung pickup
    WALK[ci].forEach((n, i) => {
      const tt = t + i * beat
      const f = midi(key - 24 + PROG[ci][0] + n)
      tone(ctx, juke, tt, { freq: f, amp: 0.3, decay: beat * 0.8, type: 'triangle' })
      tone(ctx, juke, tt, { freq: f * 2, amp: 0.08, decay: beat * 0.5 })
      if (i === 3 && chance(0.5)) tone(ctx, juke, tt + 2 * trip, { freq: f, amp: 0.15, decay: trip, type: 'triangle' })
    })
    // triplet piano comping
    for (let k = 0; k < 12; k++) {
      const acc = k % 3 === 0 ? 1 : 0.55
      for (const n of chord) {
        tone(ctx, juke, t + k * trip + rand(0, 0.006), { freq: midi(key + 12 + n), amp: 0.022 * acc, decay: trip * 0.9, type: 'triangle' })
      }
    }
    // brushed backbeat on 2 and 4
    for (const b of [1, 3]) {
      burst(kit, juke, t + b * beat, { dur: 0.14, amp: 0.3, type: 'bandpass', freq: 2200, Q: 0.6, attack: 0.008 })
    }
    bar++
    return beat * 4
  })

  // ── the room
  const talk = filter(ctx, 'lowpass', 2400)
  talk.connect(v.out)
  murmur(v, talk, 6, [0.18, 0.5])

  // griddle behind the counter: hiss that breathes, spitting fat
  const grill = panTo(ctx, v.out, 0.45)
  const sg = gain(ctx, 0.03)
  chain(v.noise('white'), filter(ctx, 'highpass', 2600), filter(ctx, 'lowpass', 7000), sg, grill)
  v.every(0, (t) => {
    drift(sg.gain, t, 0.015 + Math.random() * 0.03, 0.03)
    return rand(0.04, 0.15)
  })
  v.every(0, (t) => {
    burst(kit, grill, t, { dur: rand(0.001, 0.004), amp: Math.pow(Math.random(), 3) * 0.12 + 0.01, type: 'highpass', freq: rand(2500, 5000) })
    return poisson(0.022)
  })
  v.every(rand(4, 12), (t) => {
    // a fresh patty hits the griddle, then a spatula scrape and tap
    const d = rand(3, 6)
    noiseShot(kit, grill, t, { color: 'white', dur: d, amp: 0.07, type: 'highpass', freq: 2200, attack: 0.04, release: d * 0.85 })
    noiseShot(kit, grill, t, { color: 'pink', dur: d * 0.6, amp: 0.05, type: 'bandpass', freq: 900, Q: 0.8, attack: 0.02, release: d * 0.5 })
    const s = t + d * rand(0.4, 0.7)
    const sc = noiseShot(kit, grill, s, { color: 'white', dur: 0.3, amp: 0.05, type: 'bandpass', freq: 1800, Q: 6, attack: 0.03, release: 0.12 })
    sc.f.frequency.linearRampToValueAtTime(2300, s + 0.3)
    ring(ctx, grill, s + 0.45, rand(900, 1100), 0.025, [[1, 1, 0.25], [2.4, 0.5, 0.12]])
    ring(ctx, grill, s + 0.6, rand(900, 1100), 0.018, [[1, 1, 0.25], [2.4, 0.5, 0.12]])
    return poisson(22) + 8
  })

  // coffee pour: resonance climbs as the cup fills, then the cup is set down
  v.every(rand(5, 15), (t) => {
    const p = panTo(ctx, v.out, rand(-0.5, 0.5))
    const d = rand(1.8, 3)
    const pour = noiseShot(kit, p, t, { color: 'pink', dur: d, amp: 0.1, type: 'bandpass', freq: 450, Q: 5, attack: 0.08, release: 0.25 })
    pour.f.frequency.exponentialRampToValueAtTime(rand(1200, 1500), t + d)
    for (let tt = t + 0.1; tt < t + d - 0.1; tt += rand(0.04, 0.09)) pour.g.gain.setValueAtTime(rand(0.06, 0.12), tt)
    ring(ctx, p, t + d + 0.4, rand(2000, 2400), 0.035, [[1, 1, 0.4], [1.68, 0.45, 0.3], [2.9, 0.2, 0.15]])
    burst(kit, p, t + d + 0.4, { dur: 0.015, amp: 0.12, type: 'bandpass', freq: 1500, Q: 1 })
    return poisson(30) + 12
  })

  // crockery: cup and spoon clinks, the odd stack of plates
  v.every(1, (t) => {
    const p = panTo(ctx, v.out, rand(-0.8, 0.8))
    if (chance(0.8)) {
      const f = rand(2600, 4000)
      const n = chance(0.35) ? randInt(2, 3) : 1
      for (let i = 0; i < n; i++) ring(ctx, p, t + i * rand(0.07, 0.14), f * rand(0.98, 1.02), 0.03, [[1, 1, 0.3], [2.43, 0.4, 0.15]])
    } else {
      let tt = t
      for (let i = 0, n = randInt(3, 6); i < n; i++) {
        ring(ctx, p, tt, rand(1300, 2400), 0.025, [[1, 1, 0.35], [2.1, 0.5, 0.2], [3.3, 0.25, 0.1]])
        burst(kit, p, tt, { dur: 0.02, amp: 0.1, type: 'bandpass', freq: 1800, Q: 1 })
        tt += rand(0.04, 0.12)
      }
    }
    return poisson(3) + 0.3
  })

  // cash register: key clacks, the bell, the drawer rolling out
  v.every(rand(15, 40), (t) => {
    const p = panTo(ctx, v.out, rand(0.2, 0.7))
    let tt = t
    for (let i = 0, n = randInt(3, 5); i < n; i++) {
      burst(kit, p, tt, { dur: 0.025, amp: 0.18, type: 'bandpass', freq: rand(1200, 1800), Q: 1.5 })
      burst(kit, p, tt + 0.012, { dur: 0.03, amp: 0.12, type: 'lowpass', freq: 500 })
      tt += rand(0.12, 0.22)
    }
    tt += 0.25
    ring(ctx, p, tt, rand(2300, 2550), 0.07, [[1, 1, 1.6], [2.76, 0.3, 0.8], [5.4, 0.08, 0.35]], 2)
    const drawer = noiseShot(kit, p, tt + 0.05, { color: 'pink', dur: 0.35, amp: 0.08, type: 'bandpass', freq: 500, Q: 1.5, attack: 0.03, release: 0.1 })
    drawer.f.frequency.linearRampToValueAtTime(800, tt + 0.4)
    burst(kit, p, tt + 0.42, { dur: 0.06, amp: 0.3, type: 'lowpass', freq: 400, Q: 1 })
    tone(ctx, p, tt + 0.42, { freq: 110, amp: 0.08, decay: 0.08 })
    return poisson(45) + 20
  })
  return v.build()
}

/** Rain on a nylon tent: taut-membrane patter that swells, heavy drips from the trees, fabric flapping in gusts. */
export const rainTent: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 1.15)
  const { ctx } = v
  // rain on the forest outside
  const og = gain(ctx, 0.1)
  chain(v.noise('pink'), filter(ctx, 'highpass', 300), filter(ctx, 'lowpass', 2800, 0.5), og, v.out)
  // the fly sheet's own dull drum-skin wash
  const sk = gain(ctx, 0.08)
  chain(v.noise('pink'), filter(ctx, 'bandpass', 1100, 0.7), sk, v.out)
  // every impact excites the taut membrane: a low, damped body resonance
  const membrane = filter(ctx, 'peaking', 160, 2.5, 9)
  chain(membrane, filter(ctx, 'lowpass', 2200), v.out)

  let intensity = 1
  v.every(1, (t) => {
    intensity = clamp(intensity * rand(0.75, 1.3), 0.35, 1.8)
    drift(og.gain, t, 0.05 + 0.05 * intensity, 3)
    drift(sk.gain, t, 0.04 + 0.045 * intensity, 3)
    return rand(4, 9)
  })
  // patter: a soft tick on the nylon, some with a little thump of the fabric
  v.every(0, (t) => {
    const a = Math.pow(Math.random(), 2.5) * 0.3 + 0.02
    burst(kit, membrane, t, { dur: rand(0.006, 0.02), amp: a, type: 'bandpass', freq: rand(500, 1600), Q: 1.2 })
    if (chance(0.25)) {
      const o = tone(ctx, membrane, t, { freq: rand(130, 200), amp: a * 0.3, decay: rand(0.03, 0.06) })
      o.frequency.exponentialRampToValueAtTime(rand(80, 110), t + 0.05)
    }
    return poisson(0.03 / intensity)
  })

  const heavyDrip = (t: number, amp: number) => {
    burst(kit, membrane, t, { dur: 0.05, amp, type: 'lowpass', freq: 650, Q: 1 })
    const o = tone(ctx, membrane, t, { freq: rand(105, 135), amp: amp * 0.3, decay: 0.12 })
    o.frequency.exponentialRampToValueAtTime(rand(60, 75), t + 0.1)
    burst(kit, v.out, t + 0.004, { dur: 0.02, amp: amp * 0.15, type: 'highpass', freq: 2200 })
  }
  // big drops gathering on the branches overhead
  v.every(2, (t) => {
    const n = chance(0.2) ? randInt(2, 4) : 1
    for (let i = 0; i < n; i++) heavyDrip(t + i * rand(0.08, 0.3), rand(0.2, 0.45))
    return poisson(2.4 / intensity)
  })
  // gusts: the fly sheet bellows and flaps, and the trees shed a shower
  v.every(rand(6, 14), (t) => {
    const d = rand(2.5, 5)
    noiseShot(kit, v.out, t, { color: 'pink', dur: d, amp: 0.12, type: 'bandpass', freq: 600, Q: 0.6, attack: d * 0.4, release: d * 0.5 })
    for (let tt = t + d * rand(0.2, 0.35); tt < t + d * 0.9; tt += rand(0.09, 0.32)) {
      const a = rand(0.12, 0.3)
      burst(kit, membrane, tt, { dur: rand(0.03, 0.07), amp: a, type: 'lowpass', freq: rand(500, 900), Q: 0.9, attack: 0.004 })
      tone(ctx, membrane, tt, { freq: rand(85, 120), amp: a * 0.25, decay: 0.06 })
    }
    for (let i = 0, n = randInt(4, 12); i < n; i++) heavyDrip(t + d * rand(0.3, 1.1), rand(0.15, 0.4))
    return poisson(14) + 5
  })
  return v.build()
}

/** Moored sailboat: the hull rolling on a slow swell, lapping water, creaking wood and rope, halyards on the mast. */
export const sailboat: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 1.15)
  const { ctx } = v
  const period = rand(4.5, 6.5)
  const t0 = ctx.currentTime
  // one slow sine is the swell; everything else is phase-locked to it
  const rock = v.osc('sine', 1 / period)
  const swell = (t: number) => (2 * Math.PI * (t - t0)) / period
  const water = filter(ctx, 'lowpass', 450, 0.6)
  const wg = gain(ctx, 0.14)
  chain(v.noise('brown'), filter(ctx, 'highpass', 45), water, wg, v.out)
  rock.connect(gain(ctx, 0.05)).connect(wg.gain)
  rock.connect(gain(ctx, 160)).connect(water.frequency)
  chain(v.noise('pink'), filter(ctx, 'bandpass', 1400, 0.5), gain(ctx, 0.022), v.out)

  // water lapping the hull: hollow "chlop"s, busiest as the hull dips into the swell
  const hull = filter(ctx, 'peaking', 380, 2, 6)
  hull.connect(v.out)
  v.every(0.3, (t) => {
    const dip = Math.max(0, -Math.cos(swell(t)))
    const amp = rand(0.06, 0.16) * (0.45 + 0.6 * dip)
    const p = panTo(ctx, hull, rand(-0.6, 0.6))
    const f = rand(260, 600)
    const d = rand(0.25, 0.5)
    const lap = noiseShot(kit, p, t, { color: 'pink', dur: d, amp, type: 'bandpass', freq: f, Q: 1.3, attack: 0.03, release: d * 0.7 })
    lap.f.frequency.exponentialRampToValueAtTime(f * 0.55, t + d)
    tone(ctx, p, t + 0.02, { freq: rand(170, 280), amp: amp * 0.3, decay: 0.08 })
    noiseShot(kit, p, t + 0.05, { color: 'white', dur: 0.3, amp: amp * 0.12, type: 'highpass', freq: 1800, attack: 0.02, release: 0.25 })
    return poisson(0.75 - 0.35 * dip) + 0.12
  })

  // creaks cluster at the ends of each roll, when hull and lines strain hardest
  const timbers = panTo(ctx, v.out, rand(-0.4, 0.4))
  v.every(period / 4 - 0.1, (t) => {
    if (chance(0.7)) {
      creak(ctx, timbers, t + rand(0, 0.35), {
        dur: rand(0.5, 1.4), rate: rand(25, 50), freq: rand(420, 850), Q: rand(6, 11), amp: rand(0.25, 0.6), bend: rand(0.85, 1.2),
      })
    }
    if (chance(0.35)) {
      const rope = panTo(ctx, v.out, rand(-0.8, 0.8))
      creak(ctx, rope, t + rand(0, 0.4), { dur: rand(0.3, 0.7), rate: rand(80, 150), freq: rand(1400, 2200), Q: 14, amp: rand(0.25, 0.5), bend: rand(0.9, 1.15) })
    }
    return period / 2
  })

  // halyards slapping the aluminium mast, with the hollow tube answering lower
  const mast = panTo(ctx, v.out, rand(-0.3, 0.3))
  v.every(1, (t) => {
    let tt = t
    for (let i = 0, n = chance(0.4) ? randInt(2, 4) : 1; i < n; i++) {
      ring(ctx, mast, tt, rand(1700, 2500), rand(0.015, 0.035), [[1, 1, 0.9], [2.32, 0.5, 0.5], [3.86, 0.25, 0.3], [5.4, 0.1, 0.18]])
      burst(kit, mast, tt, { dur: 0.008, amp: 0.08, type: 'bandpass', freq: 3000, Q: 1.5 })
      tone(ctx, mast, tt, { freq: rand(480, 560), amp: 0.012, decay: 0.6 })
      tt += rand(0.15, 0.6)
    }
    return poisson(4) + 0.8
  })
  return v.build()
}

/** Data-centre aisle: rack fans whining in close detune, cooling air, mains hum, drive chatter and status beeps. */
export const serverRoom: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 0.85)
  const { ctx } = v
  // broadband cooling air and the CRAC units' rumble
  const ag = gain(ctx, 0.3)
  chain(v.noise('pink'), filter(ctx, 'highpass', 120), filter(ctx, 'lowpass', 3800, 0.5), ag, v.out)
  v.lfo(ag.gain, 0.03, 0.02)
  chain(v.noise('brown'), filter(ctx, 'highpass', 40), filter(ctx, 'lowpass', 220), gain(ctx, 0.15), v.out)
  const crac = v.osc('triangle', rand(140, 160))
  chain(crac, filter(ctx, 'lowpass', 500), gain(ctx, 0.008), v.out)

  // fan whine: blade-pass tones from several racks, each a near-unison pair → slow beating
  const fans: OscillatorNode[] = []
  for (const [f, a] of [[620, 0.006], [1240, 0.004], [1630, 0.003], [2480, 0.0025], [3260, 0.0015]] as const) {
    for (const det of [-1, 1]) {
      const o = v.osc('sine', f * rand(0.99, 1.01) + det * rand(0.3, 1.5))
      v.lfo(o.frequency, rand(0.02, 0.07), f * 0.002)
      const g = gain(ctx, a)
      v.lfo(g.gain, rand(0.05, 0.2), a * 0.3)
      chain(o, g, panTo(ctx, v.out, rand(-0.6, 0.6)))
      fans.push(o)
    }
  }
  // mains hum with its harmonics (transformers sing mostly at twice mains)
  const mains = pick([50, 60])
  for (const [h, a] of [[1, 0.008], [2, 0.014], [3, 0.005], [4, 0.004], [6, 0.002]] as const) {
    chain(v.osc('sine', mains * h), gain(ctx, a), v.out)
  }
  // thermal control ramps a group of fans up and back down
  v.every(rand(15, 30), (t) => {
    const cents = rand(40, 120)
    const d = rand(5, 12)
    for (const o of fans) {
      if (chance(0.5)) continue
      o.detune.setTargetAtTime(cents, t, 1.5)
      o.detune.setTargetAtTime(0, t + d, 2.5)
    }
    return d + rand(20, 50)
  })
  // hard-drive seek chatter in irregular bursts
  v.every(1, (t) => {
    const p = panTo(ctx, v.out, rand(-0.8, 0.8))
    let tt = t
    for (let i = 0, n = randInt(4, 30); i < n; i++) {
      burst(kit, p, tt, { dur: rand(0.002, 0.006), amp: rand(0.03, 0.09), type: 'bandpass', freq: rand(2200, 4200), Q: 2.5 })
      tt += chance(0.2) ? rand(0.06, 0.15) : rand(0.008, 0.035)
    }
    return poisson(2.2) + 0.2
  })
  // the rare status beep
  v.every(rand(20, 40), (t) => {
    const p = panTo(ctx, v.out, rand(-0.7, 0.7))
    const f = pick([1000, 1500, 2000, 2400])
    for (let i = 0, n = pick([1, 1, 2, 3]); i < n; i++) {
      whistle(ctx, p, t + i * 0.18, { freq: f, amp: 0.016, dur: 0.1, attack: 0.004, release: 0.02, type: 'triangle' })
    }
    return poisson(45) + 15
  })
  return v.build()
}

/** Arctic wind: howling gusts with resonant whistles, fine blowing snow and the rare boom of shifting ice. */
export const arcticWind: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 0.8)
  const { ctx } = v
  const body = filter(ctx, 'lowpass', 600, 0.6)
  const bg = gain(ctx, 0.3)
  chain(v.noise('brown'), filter(ctx, 'highpass', 40), body, bg, v.out)
  const air = filter(ctx, 'bandpass', 1000, 0.8)
  const ag = gain(ctx, 0.08)
  chain(v.noise('pink'), air, ag, v.out)
  // howl: narrow resonances (a guy wire, an eave, a crevasse) sweeping with the gust
  const howls = [0, 1, 2].map(() => {
    const f = filter(ctx, 'bandpass', rand(400, 900), rand(30, 45))
    const g = gain(ctx, 0)
    chain(v.noise('white'), f, g, panTo(ctx, v.out, rand(-0.7, 0.7)))
    return { f, g }
  })
  // fine snow hiss
  const sg = gain(ctx, 0.01)
  chain(v.noise('white'), filter(ctx, 'highpass', 3500), filter(ctx, 'lowpass', 8000), sg, v.out)
  let gust = 0.5
  v.every(0, (t) => {
    gust = Math.pow(Math.random(), 1.3)
    const tc = rand(0.9, 2.6)
    drift(bg.gain, t, 0.15 + gust * 0.45, tc)
    drift(body.frequency, t, 250 + gust * 800, tc)
    drift(ag.gain, t, 0.03 + gust * 0.12, tc)
    drift(air.frequency, t, 600 + gust * 1600, tc)
    drift(sg.gain, t, 0.004 + gust * 0.018, tc * 0.7)
    howls.forEach((h, i) => {
      drift(h.f.frequency, t, (380 + gust * 650) * (1 + i * 0.47) * rand(0.94, 1.06), tc * 1.2)
      drift(h.g.gain, t, gust > 0.3 ? (gust * gust * 3.2) / (1 + i * 0.6) : 0.05, tc)
    })
    return rand(1.5, 4.5)
  })
  // snow grains ticking on a hood
  v.every(0, (t) => {
    burst(kit, v.out, t, { dur: rand(0.0008, 0.002), amp: (0.008 + Math.random() * 0.03) * (0.3 + gust), type: 'highpass', freq: 4000 })
    return poisson(0.035 / (0.3 + gust))
  })
  // ice: a sharp crack, dispersive "pew" chirps racing along the sheet, a deep boom underneath
  v.every(rand(15, 40), (t) => {
    const p = panTo(ctx, v.out, rand(-0.7, 0.7))
    burst(kit, p, t, { dur: 0.05, amp: 0.3, type: 'bandpass', freq: rand(1500, 2800), Q: 0.8 })
    for (let i = 0, n = randInt(1, 3); i < n; i++) {
      const tt = t + 0.04 + i * rand(0.15, 0.4)
      const o = tone(ctx, p, tt, { freq: rand(2500, 3600), amp: 0.022, attack: 0.003, decay: rand(0.35, 0.6) })
      o.frequency.exponentialRampToValueAtTime(rand(180, 300), tt + 0.4)
    }
    const boom = noiseShot(kit, p, t + 0.05, { color: 'brown', dur: rand(2.5, 3.5), amp: 0.7, type: 'lowpass', freq: 170, Q: 0.9, attack: 0.08, release: 2.2 })
    boom.f.frequency.exponentialRampToValueAtTime(90, t + 2.5)
    const b = tone(ctx, p, t + 0.05, { freq: 78, amp: 0.09, attack: 0.03, decay: 1.6 })
    b.frequency.exponentialRampToValueAtTime(52, t + 1.5)
    return poisson(45) + 20
  })
  return v.build()
}

/** Quiet reading room: soft room tone, page turns, pencil on paper, far footsteps, a chair creak, a muffled cough. */
export const library: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 1.4)
  const { ctx } = v
  chain(v.noise('brown'), filter(ctx, 'highpass', 40), filter(ctx, 'lowpass', 220), gain(ctx, 0.07), v.out)
  chain(v.noise('pink'), filter(ctx, 'bandpass', 500, 0.5), gain(ctx, 0.012), v.out)

  // page turn: a papery swish with crinkle, then the leaf settling
  v.every(2, (t) => {
    const p = panTo(ctx, v.out, rand(-0.4, 0.4))
    const d = rand(0.35, 0.7)
    const f = rand(1800, 3000)
    const s = noiseShot(kit, p, t, { color: 'pink', dur: d, amp: rand(0.07, 0.13), type: 'bandpass', freq: f, Q: 0.7, attack: d * 0.35, release: d * 0.5 })
    s.f.frequency.linearRampToValueAtTime(f * 1.5, t + d * 0.5)
    s.f.frequency.linearRampToValueAtTime(f * 0.8, t + d)
    for (let tt = t + 0.02; tt < t + d; tt += rand(0.01, 0.05)) {
      burst(kit, p, tt, { dur: rand(0.002, 0.006), amp: rand(0.01, 0.04), type: 'bandpass', freq: rand(2500, 5000), Q: 1.5 })
    }
    burst(kit, p, t + d, { dur: 0.04, amp: 0.06, type: 'lowpass', freq: 900, Q: 0.7, attack: 0.006 })
    return poisson(16) + 4
  })

  // pencil writing: short graphite strokes with thinking pauses
  v.every(6, (t) => {
    const p = panTo(ctx, v.out, rand(-0.5, 0.5))
    const bp = filter(ctx, 'bandpass', rand(2600, 3800), 1.6)
    const g = gain(ctx, 0)
    const f = bp.frequency.value
    g.gain.setValueAtTime(0, t)
    bp.frequency.setValueAtTime(f, t)
    const end = t + rand(2, 6)
    let tt = t
    while (tt < end) {
      const s = rand(0.06, 0.25)
      const a = rand(0.025, 0.05)
      g.gain.setValueAtTime(0, tt)
      g.gain.linearRampToValueAtTime(a, tt + 0.015)
      g.gain.linearRampToValueAtTime(a * rand(0.5, 1), tt + s * 0.6)
      g.gain.linearRampToValueAtTime(0, tt + s)
      bp.frequency.setValueAtTime(f * rand(0.85, 1.2), tt)
      tt += s + (chance(0.15) ? rand(0.3, 0.9) : rand(0.02, 0.08))
    }
    chain(noiseAt(kit, 'white', t, tt - t + 0.05), bp, g, p)
    return tt - t + poisson(25) + 6
  })

  // footsteps crossing the far end of the hall: approach, pass, recede
  v.every(rand(10, 25), (t) => {
    const n = randInt(6, 14)
    const step = rand(0.5, 0.62)
    const dir = chance(0.5) ? 1 : -1
    const p = ctx.createStereoPanner()
    p.pan.setValueAtTime(-0.8 * dir, t)
    p.pan.linearRampToValueAtTime(0.8 * dir, t + n * step)
    p.connect(v.out)
    const far = filter(ctx, 'lowpass', 1400)
    far.connect(p)
    for (let i = 0; i < n; i++) {
      const near = Math.sin((Math.PI * (i + 0.5)) / n)
      const a = (0.25 + 0.75 * near) * 0.12
      const tt = t + i * step + rand(0, 0.03)
      burst(kit, far, tt, { dur: 0.03, amp: a, type: 'bandpass', freq: rand(1200, 1800), Q: 1.2 })
      burst(kit, far, tt + 0.07, { dur: 0.04, amp: a * 0.7, type: 'lowpass', freq: 500 })
      tone(ctx, far, tt, { freq: rand(85, 110), amp: a * 0.4, decay: 0.05 })
    }
    return n * step + poisson(40) + 15
  })

  // a chair creaks as someone shifts, now and then a book set down
  v.every(rand(8, 25), (t) => {
    const p = panTo(ctx, v.out, rand(-0.8, 0.8))
    creak(ctx, p, t, { dur: rand(0.3, 0.8), rate: rand(30, 60), freq: rand(600, 1000), Q: rand(5, 9), amp: rand(0.2, 0.4), bend: rand(0.9, 1.15) })
    if (chance(0.3)) {
      const tt = t + rand(1, 3)
      burst(kit, p, tt, { dur: 0.06, amp: 0.2, type: 'lowpass', freq: 600, Q: 1 })
      tone(ctx, p, tt, { freq: 120, amp: 0.06, decay: 0.08 })
    }
    return poisson(35) + 10
  })

  // a soft, muffled cough somewhere in the stacks
  const muffle = filter(ctx, 'lowpass', 1800)
  muffle.connect(v.out)
  v.every(rand(30, 90), (t) => {
    const p = panTo(ctx, muffle, rand(-0.8, 0.8))
    const n = chance(0.6) ? 2 : 1
    for (let i = 0; i < n; i++) {
      const tt = t + i * rand(0.28, 0.4)
      const d = rand(0.18, 0.28)
      const a = i ? 0.6 : 1
      noiseShot(kit, p, tt, { color: 'pink', dur: d, amp: 0.14 * a, type: 'bandpass', freq: rand(450, 650), Q: 1.4, attack: 0.012, release: d * 0.85 })
      noiseShot(kit, p, tt, { color: 'pink', dur: d * 0.8, amp: 0.06 * a, type: 'bandpass', freq: rand(1100, 1400), Q: 2, attack: 0.012, release: d * 0.7 })
    }
    return rand(60, 150)
  })
  return v.build()
}

/** Tropical night: a chorus of frog species, buzzing insects, canopy drips, a far howler troop and a potoo. */
export const jungleNight: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 1.05)
  const { ctx } = v
  // warm humid air
  chain(v.noise('brown'), filter(ctx, 'highpass', 40), filter(ctx, 'lowpass', 350), gain(ctx, 0.08), v.out)
  chain(v.noise('pink'), filter(ctx, 'bandpass', 1500, 0.5), gain(ctx, 0.012), v.out)

  // cicada-like rasp, amplitude-modulated at its wingbeat rate, swelling and fading
  const cAm = gain(ctx, 0.5)
  const cg = gain(ctx, 0)
  chain(v.noise('white'), filter(ctx, 'bandpass', rand(4300, 5200), 7), cAm, cg, panTo(ctx, v.out, rand(-0.6, 0.6)))
  v.lfo(cAm.gain, rand(38, 52), 0.5)
  v.every(0, (t) => {
    drift(cg.gain, t, chance(0.25) ? 0.02 : rand(0.15, 0.45), rand(2, 5))
    return rand(5, 12)
  })
  // tree-cricket trills: pure tones pulsed in long runs with pauses
  for (let i = 0; i < 2; i++) {
    const o = v.osc('sine', rand(3300, 4100))
    const am = gain(ctx, 0.5)
    const env = gain(ctx, 0)
    chain(o, am, env, panTo(ctx, v.out, rand(-0.9, 0.9)))
    v.lfo(am.gain, rand(18, 30), 0.5, 'square')
    v.every(rand(0, 4), (t) => {
      const on = rand(2, 7)
      env.gain.setTargetAtTime(rand(0.008, 0.016), t, 0.05)
      env.gain.setTargetAtTime(0, t + on, 0.08)
      return on + rand(1, 6)
    })
  }

  // frogs — each species has its own call grammar
  type Call = (t: number, out: AudioNode) => number
  const coqui: Call = (t, out) => {
    const f = rand(1050, 1250)
    whistle(ctx, out, t, { freq: f, amp: 0.04, dur: 0.09, attack: 0.008, release: 0.04 })
    const q = whistle(ctx, out, t + 0.16, { freq: f * 1.6, amp: 0.045, dur: 0.17, attack: 0.01, release: 0.07 })
    q.frequency.exponentialRampToValueAtTime(f * 1.95, t + 0.29)
    return 0.35
  }
  const croak: Call = (t, out) => {
    const f = rand(500, 800)
    const rate = rand(40, 65)
    const n = randInt(6, 14)
    for (let i = 0; i < n; i++) tone(ctx, out, t + i / rate, { freq: f * rand(0.98, 1.02), amp: 0.05, attack: 0.002, decay: 0.012, type: 'triangle' })
    return n / rate
  }
  const brum: Call = (t, out) => {
    // a deep, pulsing bullfrog-like "rrrum"
    const d = rand(0.5, 0.9)
    const f = rand(95, 125)
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(f, t)
    o.frequency.linearRampToValueAtTime(f * 0.9, t + d)
    const am = gain(ctx, 0.5)
    const m = ctx.createOscillator()
    m.frequency.value = rand(12, 18)
    m.connect(gain(ctx, 0.5)).connect(am.gain)
    const env = gain(ctx, 0)
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(0.35, t + 0.06)
    env.gain.setValueAtTime(0.35, t + d - 0.15)
    env.gain.linearRampToValueAtTime(0, t + d)
    chain(o, filter(ctx, 'bandpass', rand(250, 380), 3), am, env, out)
    o.start(t)
    m.start(t)
    o.stop(t + d + 0.05)
    m.stop(t + d + 0.05)
    return d
  }
  const tik: Call = (t, out) => {
    const n = randInt(3, 7)
    const f = rand(3600, 4300)
    const gap = rand(0.08, 0.14)
    for (let i = 0; i < n; i++) tone(ctx, out, t + i * gap, { freq: f, amp: 0.025, attack: 0.001, decay: 0.015 })
    return n * gap
  }
  // a predator passes: the whole chorus falls silent for a moment
  let hushUntil = 0
  v.every(rand(40, 90), (t) => {
    hushUntil = t + rand(3, 7)
    return rand(60, 140)
  })
  const frogs: [Call, () => number, number][] = [
    [coqui, () => rand(1.2, 2.6), 3],
    [croak, () => (chance(0.6) ? rand(0.25, 0.6) : rand(3, 10)), 2],
    [brum, () => rand(5, 14), 1],
    [tik, () => rand(3, 9), 2],
  ]
  for (const [call, gap, count] of frogs) {
    for (let k = 0; k < count; k++) {
      const out = gain(ctx, rand(0.5, 1))
      out.connect(panTo(ctx, v.out, rand(-0.9, 0.9)))
      v.every(rand(0, 5), (t) => {
        if (t < hushUntil) return hushUntil - t + rand(0.5, 3)
        return call(t, out) + gap()
      })
    }
  }

  // canopy drips tapping broad leaves
  v.every(0, (t) => {
    const p = panTo(ctx, v.out, rand(-0.9, 0.9))
    burst(kit, p, t, { dur: 0.006, amp: rand(0.04, 0.12), type: 'bandpass', freq: rand(1000, 2500), Q: 3 })
    tone(ctx, p, t, { freq: rand(600, 1100), amp: rand(0.008, 0.02), decay: 0.03 })
    return chance(0.15) ? rand(0.05, 0.2) : poisson(1.2)
  })

  // a howler troop far off across the valley: swelling roars with breaths between
  v.every(rand(25, 70), (t) => {
    const far = filter(ctx, 'lowpass', 700, 0.7)
    far.connect(panTo(ctx, v.out, rand(-0.9, 0.9)))
    let tt = t
    const n = randInt(4, 9)
    for (let i = 0; i < n; i++) {
      const d = rand(0.6, 1.4)
      const sw = 0.35 + 0.65 * Math.sin((Math.PI * (i + 0.5)) / n)
      const f = rand(70, 95)
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.setValueAtTime(f, tt)
      o.frequency.linearRampToValueAtTime(f * 1.25, tt + d * 0.4)
      o.frequency.linearRampToValueAtTime(f * 0.9, tt + d)
      const fm = filter(ctx, 'bandpass', 380, 2.5)
      fm.frequency.setValueAtTime(380, tt)
      fm.frequency.linearRampToValueAtTime(650, tt + d * 0.5)
      fm.frequency.linearRampToValueAtTime(420, tt + d)
      const g = gain(ctx, 0)
      g.gain.setValueAtTime(0, tt)
      g.gain.linearRampToValueAtTime(0.28 * sw, tt + d * 0.3)
      g.gain.linearRampToValueAtTime(0.2 * sw, tt + d * 0.75)
      g.gain.linearRampToValueAtTime(0, tt + d)
      chain(o, fm, g, far)
      o.start(tt)
      o.stop(tt + d + 0.05)
      noiseShot(kit, far, tt, { color: 'pink', dur: d, amp: 0.12 * sw, type: 'bandpass', freq: 550, Q: 1.5, attack: d * 0.3, release: d * 0.5 })
      tt += d + rand(0.25, 0.6)
    }
    return tt - t + poisson(70) + 30
  })

  // a potoo's mournful descending whistles
  v.every(rand(10, 30), (t) => {
    const p = panTo(ctx, v.out, rand(-0.8, 0.8))
    let f = rand(850, 1050)
    let tt = t
    for (let i = 0, n = randInt(4, 7); i < n; i++) {
      const d = rand(0.45, 0.8)
      const o = whistle(ctx, p, tt, { freq: f, amp: 0.025, dur: d, attack: 0.08, release: d * 0.5 })
      o.frequency.linearRampToValueAtTime(f * 0.94, tt + d)
      f *= rand(0.86, 0.92)
      tt += d + rand(0.25, 0.5)
    }
    return tt - t + poisson(45) + 15
  })
  return v.build()
}

/** Sitting in a parked car in the rain: drumming metal roof, bright plinks, muffled wash, wipers swishing and thunking. */
export const rainCarRoof: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 1.5)
  const { ctx } = v
  // the cabin muffles everything outside
  const cabin = filter(ctx, 'lowpass', 3200, 0.6)
  cabin.connect(v.out)
  const bedG = gain(ctx, 0.16)
  chain(v.noise('pink'), filter(ctx, 'bandpass', 700, 0.5), filter(ctx, 'peaking', 300, 1.5, 5), bedG, cabin)
  chain(v.noise('brown'), filter(ctx, 'highpass', 40), filter(ctx, 'lowpass', 160), gain(ctx, 0.1), v.out)
  // roof-panel modes: resonant bandpasses rung by every drop
  const roof = gain(ctx, 1)
  for (const [f, q, a] of [[185, 14, 1], [292, 16, 0.8], [447, 12, 0.6], [690, 10, 0.45], [1130, 9, 0.3]] as const) {
    chain(roof, filter(ctx, 'bandpass', f * rand(0.97, 1.03), q), gain(ctx, a * 5), cabin)
  }
  const plinks = filter(ctx, 'lowpass', 5000)
  plinks.connect(v.out)

  let intensity = 1
  v.every(1, (t) => {
    intensity = clamp(intensity * rand(0.75, 1.3), 0.4, 1.7)
    drift(bedG.gain, t, 0.08 + 0.07 * intensity, 3)
    return rand(5, 10)
  })
  // the dense drumming: each drop a click into the panel modes
  v.every(0, (t) => {
    burst(kit, roof, t, { dur: rand(0.002, 0.006), amp: Math.pow(Math.random(), 2.5) * 0.4 + 0.03 })
    return poisson(0.016 / intensity)
  })
  // brighter metallic plinks on top
  v.every(0.2, (t) => {
    const p = panTo(ctx, plinks, rand(-0.7, 0.7))
    const f = rand(1200, 3000)
    ring(ctx, p, t, f, rand(0.006, 0.02), [[1, 1, rand(0.04, 0.12)], [2.37, 0.4, 0.04]])
    burst(kit, p, t, { dur: 0.004, amp: rand(0.03, 0.08), type: 'bandpass', freq: f, Q: 2 })
    return poisson(0.14 / intensity)
  })
  // the odd fat drop off a tree: a deeper "tonk"
  v.every(2, (t) => {
    burst(kit, roof, t, { dur: 0.012, amp: rand(0.5, 0.9), type: 'lowpass', freq: 1200 })
    return poisson(2.5)
  })

  // wipers: swish up, thunk, swish back, park thunk — intermittent, sometimes a few in a row
  const wiper = gain(ctx, 1)
  wiper.connect(v.out)
  const motorLp = filter(ctx, 'lowpass', 350)
  motorLp.connect(wiper)
  const sweep = (t: number, d: number, up: boolean) => {
    const f0 = up ? 900 : 1400
    const s = noiseShot(kit, wiper, t, { color: 'pink', dur: d, amp: 0.08, type: 'bandpass', freq: f0, Q: 1.6, attack: d * 0.2, release: d * 0.4 })
    s.f.frequency.linearRampToValueAtTime(up ? 1500 : 800, t + d)
    if (chance(0.25)) {
      // wet rubber chattering on the glass
      const o = whistle(ctx, wiper, t + d * 0.3, { freq: rand(900, 1400), amp: 0.006, dur: d * 0.5, attack: d * 0.15, release: d * 0.2, type: 'triangle' })
      o.frequency.linearRampToValueAtTime(o.frequency.value * rand(0.9, 1.1), t + d * 0.8)
    }
  }
  const thunk = (t: number, a: number) => {
    burst(kit, wiper, t, { dur: 0.05, amp: 0.3 * a, type: 'lowpass', freq: 380, Q: 1.2, attack: 0.003 })
    tone(ctx, wiper, t, { freq: 95, amp: 0.1 * a, decay: 0.07 })
    burst(kit, wiper, t, { dur: 0.01, amp: 0.05 * a, type: 'bandpass', freq: 1800, Q: 1.5 })
  }
  v.every(3, (t) => {
    const d = rand(0.48, 0.56)
    whistle(ctx, motorLp, t, { freq: rand(65, 75), amp: 0.03, dur: 2 * d + 0.1, attack: 0.05, release: 0.1, type: 'sawtooth' })
    sweep(t, d, true)
    thunk(t + d, 0.5)
    sweep(t + d + 0.06, d, false)
    thunk(t + 2 * d + 0.06, 1)
    return chance(0.7) ? rand(4, 9) : 2 * d + rand(0.3, 0.8)
  })
  return v.build()
}

/** Underground platform: tiled-hall air, crowd murmur, PA chimes, and a train arriving, dwelling and departing. */
export const subwayPlatform: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 0.85)
  const { ctx } = v
  // everything on the platform feeds a long, bright tiled-hall reverb
  const space = gain(ctx, 1)
  space.connect(v.out)
  const hall = ctx.createConvolver()
  hall.buffer = roomIR(ctx, 2.6, 2.2, 0.55)
  const hallOut = gain(ctx, 0.5)
  chain(space, hall, hallOut, v.out)
  // room tone: ventilation and the distant tunnel
  chain(v.noise('pink'), filter(ctx, 'bandpass', 450, 0.6), gain(ctx, 0.035), space)
  const tunnel = gain(ctx, 0.12)
  chain(v.noise('brown'), filter(ctx, 'highpass', 40), filter(ctx, 'lowpass', 140), tunnel, v.out)
  v.lfo(tunnel.gain, 0.04, 0.05)
  // the crowd
  const crowd = gain(ctx, 0.5)
  chain(crowd, filter(ctx, 'lowpass', 1800), space)
  murmur(v, crowd, 7, [0.2, 0.5])
  // heels on tile
  v.every(1, (t) => {
    const p = panTo(ctx, space, rand(-0.9, 0.9))
    const n = randInt(3, 9)
    const step = rand(0.45, 0.6)
    for (let i = 0; i < n; i++) burst(kit, p, t + i * step + rand(0, 0.03), { dur: 0.015, amp: rand(0.04, 0.09), type: 'bandpass', freq: rand(1800, 2800), Q: 1.5 })
    return n * step + poisson(6)
  })

  const chime = (t: number, notes: number[], gap: number, amp: number) => {
    const p = panTo(ctx, space, rand(-0.3, 0.3))
    notes.forEach((n, i) => {
      const f = midi(n)
      tone(ctx, p, t + i * gap, { freq: f, amp, attack: 0.004, decay: 1.6 })
      tone(ctx, p, t + i * gap, { freq: f * 2, amp: amp * 0.25, attack: 0.004, decay: 0.7 })
      tone(ctx, p, t + i * gap, { freq: f * 3.01, amp: amp * 0.08, attack: 0.004, decay: 0.35 })
    })
  }
  const doors = (t: number, closing: boolean) => {
    const s = noiseShot(kit, space, t, { color: 'pink', dur: 0.8, amp: 0.06, type: 'bandpass', freq: 700, Q: 1.2, attack: 0.1, release: 0.3 })
    s.f.frequency.linearRampToValueAtTime(closing ? 500 : 900, t + 0.8)
    burst(kit, space, t + 0.8, { dur: 0.06, amp: closing ? 0.35 : 0.15, type: 'lowpass', freq: 500, Q: 1 })
  }

  // a train: approach, roar in with wheel clatter, brake squeal, dwell with chimes, inverter whine out
  v.every(rand(8, 20), (t) => {
    const A = rand(8, 11)
    const arrive = t + A
    const stop = arrive + rand(5, 7)
    const dep = stop + rand(14, 20)
    const end = dep + 14
    const rum = noiseAt(kit, 'brown', t, end - t + 0.1)
    const rlp = filter(ctx, 'lowpass', 120, 0.8)
    const rg = gain(ctx, 0)
    chain(rum, filter(ctx, 'highpass', 35), rlp, rg, space)
    rg.gain.setValueAtTime(0, t)
    rg.gain.linearRampToValueAtTime(0.18, t + A * 0.6)
    rg.gain.linearRampToValueAtTime(0.85, arrive)
    rg.gain.linearRampToValueAtTime(0.5, stop - 1)
    rg.gain.linearRampToValueAtTime(0.08, stop + 0.5)
    rg.gain.setValueAtTime(0.08, dep)
    rg.gain.linearRampToValueAtTime(0.75, dep + 5)
    rg.gain.linearRampToValueAtTime(0, end)
    rlp.frequency.setValueAtTime(110, t)
    rlp.frequency.exponentialRampToValueAtTime(550, arrive)
    rlp.frequency.exponentialRampToValueAtTime(180, stop + 0.5)
    rlp.frequency.setValueAtTime(180, dep)
    rlp.frequency.exponentialRampToValueAtTime(480, dep + 5)
    rlp.frequency.exponentialRampToValueAtTime(100, end)
    // air shoved ahead of the train
    noiseShot(kit, space, arrive - 3, { color: 'pink', dur: 6, amp: 0.15, type: 'bandpass', freq: 380, Q: 0.6, attack: 2.5, release: 3 })
    // wheel clatter over rail joints, slowing as it brakes
    const wheels = filter(ctx, 'lowpass', 900)
    wheels.connect(space)
    for (let tt = arrive - 0.5, speed = 1; tt < stop - 0.3; ) {
      const a = 0.3 * Math.min(1, speed + 0.3)
      burst(kit, wheels, tt, { dur: 0.05, amp: a })
      burst(kit, wheels, tt + 0.1 / Math.max(0.3, speed), { dur: 0.05, amp: a * 0.8 })
      speed = Math.max(0.05, 1 - (tt - arrive) / (stop - arrive))
      tt += (0.32 * pick([1, 1, 1, 2.6])) / Math.max(0.12, speed)
    }
    // brake squeal with a nervous vibrato
    const sq = stop - rand(2.5, 3.5)
    const sqd = stop - sq + 0.3
    const fs = rand(2300, 3000)
    for (const [mult, a] of [[1, 0.02], [1.5, 0.006]] as const) {
      const o = whistle(ctx, space, sq, { freq: fs * mult, amp: a, dur: sqd, attack: sqd * 0.4, release: 0.25 })
      o.frequency.linearRampToValueAtTime(fs * mult * 0.96, sq + sqd)
      const vib = ctx.createOscillator()
      vib.frequency.value = rand(5, 8)
      vib.connect(gain(ctx, fs * mult * 0.006)).connect(o.frequency)
      vib.start(sq)
      vib.stop(sq + sqd + 0.05)
    }
    // air brakes sigh, doors open with a ding-dong
    noiseShot(kit, space, stop + 0.2, { color: 'white', dur: 1.2, amp: 0.05, type: 'highpass', freq: 2500, attack: 0.02, release: 1 })
    chime(stop + 1.2, [76, 72], 0.55, 0.05)
    doors(stop + 1.8, false)
    // idling compressor while the doors are open
    whistle(ctx, space, stop + 1, { freq: 120, amp: 0.012, dur: dep - stop, attack: 1, release: 1.5, type: 'triangle' })
    // doors close
    chime(dep - 5, [76, 72, 76, 72], 0.4, 0.04)
    doors(dep - 2.5, true)
    // departure: the inverter whine climbing in steps
    const w = ctx.createOscillator()
    w.type = 'sawtooth'
    const wbp = filter(ctx, 'bandpass', 600, 3)
    const wg = gain(ctx, 0)
    chain(w, wbp, wg, space)
    let f = rand(180, 230)
    w.frequency.setValueAtTime(f, dep)
    wbp.frequency.setValueAtTime(f * 3, dep)
    for (let k = 1; k <= 3; k++) {
      const tk = dep + k * 2.2
      f *= rand(1.45, 1.6)
      w.frequency.linearRampToValueAtTime(f, tk)
      w.frequency.setValueAtTime(f * 0.7, tk + 0.01)
      wbp.frequency.linearRampToValueAtTime(Math.min(f * 3, 3000), tk)
    }
    w.frequency.linearRampToValueAtTime(f * 1.3, dep + 10)
    wg.gain.setValueAtTime(0, dep)
    wg.gain.linearRampToValueAtTime(0.03, dep + 1)
    wg.gain.setValueAtTime(0.03, dep + 7)
    wg.gain.linearRampToValueAtTime(0, dep + 11)
    w.start(dep)
    w.stop(dep + 11.1)
    return end - t + rand(12, 35)
  })

  // station announcement: an ascending chime, then a garbled PA voice
  v.every(rand(20, 40), (t) => {
    chime(t, [67, 71, 74, 79], 0.42, 0.035)
    const pa = filter(ctx, 'bandpass', 1300, 0.9)
    const pg = gain(ctx, 0)
    chain(pa, pg, space)
    const f1 = filter(ctx, 'bandpass', 600, 5)
    const f2 = filter(ctx, 'bandpass', 1500, 6)
    const t1 = t + 2.2
    const d = rand(3, 5)
    const s = noiseAt(kit, 'pink', t1, d + 0.1)
    s.connect(f1).connect(pa)
    s.connect(f2).connect(pa)
    pg.gain.setValueAtTime(0, t1)
    for (let tt = t1; tt < t1 + d; ) {
      const syl = rand(0.1, 0.22)
      pg.gain.setValueAtTime(0, tt)
      pg.gain.linearRampToValueAtTime(rand(0.4, 0.8), tt + 0.03)
      pg.gain.linearRampToValueAtTime(0, tt + syl)
      f1.frequency.setValueAtTime(rand(400, 800), tt)
      f2.frequency.setValueAtTime(rand(1100, 2200), tt)
      tt += syl + (chance(0.12) ? rand(0.2, 0.5) : rand(0.01, 0.05))
    }
    return poisson(60) + 30
  })
  return v.build()
}

/** A cat purring on your lap: ~25 Hz pulsed rumble breathing in and out, with the odd little trill. */
export const catPurr: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 4.5)
  const { ctx } = v
  const warm = filter(ctx, 'lowpass', 1600, 0.6)
  warm.connect(v.out)
  const breath = gain(ctx, 0)
  breath.connect(warm)
  // laryngeal pulse train: a sawtooth shaped into sharp-attack, decaying pulses (0..1)
  const rate = v.osc('sawtooth', 25)
  v.lfo(rate.frequency, 0.7, 0.6)
  const shaper = ctx.createWaveShaper()
  const curve = new Float32Array(1024)
  for (let i = 0; i < curve.length; i++) curve[i] = Math.pow(1 - i / (curve.length - 1), 3)
  shaper.curve = curve
  rate.connect(shaper)
  // the pulses gate a chesty noise source
  const amp = gain(ctx, 0)
  shaper.connect(amp.gain)
  const body = filter(ctx, 'bandpass', 260, 0.8)
  chain(v.noise('pink'), filter(ctx, 'highpass', 90), body, amp, breath)
  chain(v.noise('brown'), filter(ctx, 'highpass', 90), filter(ctx, 'lowpass', 500), gain(ctx, 0.9), amp)
  // and a little of the pulse train itself, with its sub-bass removed, for the rumble
  chain(shaper, filter(ctx, 'highpass', 70), filter(ctx, 'highpass', 70), filter(ctx, 'lowpass', 400), gain(ctx, 0.05), breath)

  // breathing: exhale (lower, stronger) / inhale (faster, quieter), with a catch between
  v.every(0.1, (t) => {
    const ex = rand(1.2, 1.6)
    const inh = rand(0.9, 1.3)
    const lvl = rand(0.85, 1.1)
    breath.gain.setTargetAtTime(0.12 * lvl, t, 0.04)
    body.frequency.setTargetAtTime(rand(220, 280), t, 0.1)
    rate.frequency.setTargetAtTime(rand(23, 25), t, 0.05)
    warm.frequency.setTargetAtTime(1400, t, 0.2)
    breath.gain.setTargetAtTime(0.02, t + ex - 0.06, 0.03)
    breath.gain.setTargetAtTime(0.08 * lvl, t + ex + 0.08, 0.05)
    body.frequency.setTargetAtTime(rand(300, 360), t + ex, 0.1)
    rate.frequency.setTargetAtTime(rand(26, 28.5), t + ex, 0.05)
    warm.frequency.setTargetAtTime(1900, t + ex, 0.2)
    breath.gain.setTargetAtTime(0.02, t + ex + inh - 0.06, 0.03)
    return ex + inh
  })

  // a tiny "mrrp" trill — a rolled, rising chirp
  v.every(rand(10, 30), (t) => {
    const d = rand(0.25, 0.4)
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(rand(380, 450), t)
    o.frequency.linearRampToValueAtTime(rand(620, 760), t + d * 0.6)
    o.frequency.linearRampToValueAtTime(rand(520, 600), t + d)
    const roll = gain(ctx, 0.5)
    const m = ctx.createOscillator()
    m.frequency.value = rand(26, 32)
    m.connect(gain(ctx, 0.5)).connect(roll.gain)
    const env = gain(ctx, 0)
    env.gain.setValueAtTime(0, t)
    env.gain.linearRampToValueAtTime(0.1, t + 0.04)
    env.gain.setValueAtTime(0.1, t + d * 0.7)
    env.gain.linearRampToValueAtTime(0, t + d)
    const mix = gain(ctx, 1)
    o.connect(filter(ctx, 'bandpass', 900, 3)).connect(mix)
    o.connect(filter(ctx, 'bandpass', 2300, 4)).connect(gain(ctx, 0.5)).connect(mix)
    chain(mix, roll, env, warm)
    o.start(t)
    m.start(t)
    o.stop(t + d + 0.05)
    m.stop(t + d + 0.05)
    return poisson(45) + 20
  })
  return v.build()
}

/** Binaural beats: true L/R sine pairs offset by `beat` Hz, a fifth above for warmth, over a soft noise bed. */
function binaural(carrier: number, beat: number, bed: NoiseColor, bedLevel: number, bedCut: number): VoiceFactory {
  return (kit) => {
    const v = new VoiceBuilder(kit, 0.5)
    const { ctx } = v
    v.out.channelCount = 2
    v.out.channelCountMode = 'explicit'
    v.out.channelInterpretation = 'speakers'
    const fade = gain(ctx, 0)
    fade.channelCount = 2
    fade.channelCountMode = 'explicit'
    fade.gain.setValueAtTime(0, ctx.currentTime)
    fade.gain.linearRampToValueAtTime(1, ctx.currentTime + 4)
    fade.connect(v.out)
    const merger = ctx.createChannelMerger(2)
    merger.connect(fade)
    // one shared slow drift for every oscillator, so the beat frequency stays exact
    const wander = v.osc('sine', rand(0.008, 0.014))
    const wd = gain(ctx, carrier * 0.02)
    wander.connect(wd)
    for (const [ch, sign] of [[0, -1], [1, 1]] as const) {
      for (const [mult, a] of [[1, 0.12], [1.5, 0.025], [2, 0.01]] as const) {
        const o = v.osc('sine', carrier * mult + (sign * beat) / 2)
        wd.connect(o.frequency)
        o.connect(gain(ctx, a)).connect(merger, 0, ch)
      }
    }
    // soft stereo noise bed, breathing very slowly
    const bg = gain(ctx, bedLevel)
    chain(v.noise(bed), filter(ctx, 'highpass', 40), filter(ctx, 'lowpass', bedCut, 0.5), bg, fade)
    v.lfo(bg.gain, 0.05, bedLevel * 0.25)
    return v.build()
  }
}

/** Focus binaural beats: 200 Hz carrier, 14 Hz beta beat, over soft pink noise. Needs headphones. */
export const binauralFocus: VoiceFactory = binaural(200, 14, 'pink', 0.12, 2400)

/** Sleep binaural beats: 120 Hz carrier, 3 Hz delta beat, over deep brown noise. Needs headphones. */
export const binauralSleep: VoiceFactory = binaural(120, 3, 'brown', 0.22, 500)

/** Generative felt piano following the global mood: key and mode, density, tempo and brightness — read live. */
export const ambientPiano: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 0.75)
  const { ctx } = v
  const lp = filter(ctx, 'lowpass', 2500, 0.6)
  lp.connect(v.out)
  // faint mechanism and room
  chain(v.noise('brown'), filter(ctx, 'highpass', 40), filter(ctx, 'lowpass', 200), gain(ctx, 0.012), v.out)

  const note = (t: number, n: number, vel: number) => {
    const f = midi(n)
    // stiff strings: partials stretch sharp, more so up the keyboard
    const B = 0.00025 * Math.pow(2, (n - 60) / 24)
    const len = clamp(9 - (n - 48) * 0.09, 2, 10)
    const p = panTo(ctx, lp, clamp((n - 64) / 40, -0.6, 0.6))
    const parts = 3 + Math.round(mood.brightness * 3)
    for (let k = 1; k <= parts; k++) {
      const fk = f * k * Math.sqrt(1 + B * k * k)
      if (fk > 9000) break
      // harder strikes excite more overtones
      const a = (0.17 * vel * Math.pow(vel, (k - 1) * 0.6)) / Math.pow(k, 1.3)
      if (a < 0.001) break
      const d = len / Math.pow(k, 0.7)
      if (k <= 2) {
        // a unison pair of strings a hair apart
        tone(ctx, p, t, { freq: fk, amp: a * 0.5, attack: 0.006, decay: d })
        tone(ctx, p, t, { freq: fk, amp: a * 0.5, attack: 0.006, decay: d * 1.15, detune: rand(1.5, 3) })
      } else tone(ctx, p, t, { freq: fk, amp: a, attack: 0.005, decay: d })
    }
    // felt hammer
    burst(kit, p, t, { dur: 0.025, amp: 0.12 * vel, type: 'lowpass', freq: 500 + f, Q: 0.7, attack: 0.002 })
  }

  const pitch = (d: number) => {
    const sc = mood.scale.length ? mood.scale : [0, 2, 4, 7, 9]
    const L = sc.length
    return mood.root + sc[((d % L) + L) % L] + 12 * Math.floor(d / L)
  }
  let deg = 2
  let chordDeg = 0
  let sinceChord = 99
  let phraseLeft = randInt(3, 6)
  v.every(1.2, (t) => {
    const beat = 60 / clamp(mood.tempo, 30, 160)
    const dens = clamp(mood.density, 0, 1)
    const L = mood.scale.length || 5
    lp.frequency.setTargetAtTime(600 + Math.pow(mood.brightness, 1.5) * 5000, t, 2)
    const hum = () => t + rand(0, 0.03)

    // occasional chord: low, soft and rolled
    if (sinceChord >= 6 && chance(0.25 + 0.3 * dens)) {
      chordDeg = pick([0, 0, 3, 4, 5, 5, 1])
      const tones = [chordDeg, chordDeg + 2, chordDeg + 4].concat(chance(0.4) ? [chordDeg + 6] : [])
      note(hum(), pitch(chordDeg) - 24, rand(0.3, 0.45))
      tones.forEach((d, i) => note(hum() + 0.05 + i * rand(0.04, 0.09), pitch(d) - 12, rand(0.22, 0.38)))
      sinceChord = 0
      // pull the melody toward a chord tone
      deg = chordDeg + pick([L, L + 2, L + 4])
    }
    sinceChord++

    // melody: stepwise wandering in phrases, with breaths between
    if (phraseLeft <= 0) {
      phraseLeft = randInt(3, 4 + Math.round(dens * 4))
      return beat * rand(2, 4) * (1.6 - dens * 0.6)
    }
    if (chance(0.45 + 0.45 * dens)) {
      deg += pick([-2, -1, -1, 0, 1, 1, 2, 3, -3])
      if (deg < 0) deg = -deg
      if (deg > L * 2 + 2) deg = L * 4 + 4 - deg
      const vel = rand(0.35, 0.7)
      note(hum(), pitch(deg), vel)
      if (chance(0.15)) note(hum() + rand(0.01, 0.04), pitch(deg - 2), vel * 0.6)
      phraseLeft--
    }
    return beat * pick([0.5, 1, 1, 1, 1.5, 2]) * (1.8 - dens)
  })
  return v.build()
}
