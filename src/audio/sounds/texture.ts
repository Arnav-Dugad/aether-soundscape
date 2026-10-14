import {
  VoiceBuilder, burst, chain, chance, drift, filter, gain, poisson, rand, randInt, tone,
  type VoiceFactory,
} from '../kit'

/** Vinyl crackle: surface hiss, dust ticks, pops and the once-per-revolution thump. */
export const vinyl: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 0.9)
  const { ctx } = v
  const hiss = filter(ctx, 'bandpass', 4200, 0.4)
  chain(v.noise('white'), hiss, gain(ctx, 0.035), v.out)
  const rumble = filter(ctx, 'lowpass', 55)
  chain(v.noise('brown'), rumble, gain(ctx, 0.35), v.out)
  // 33⅓ rpm warp: slow wow modulating the rumble
  v.lfo(rumble.frequency, 0.555, 15)

  const dust = filter(ctx, 'highpass', 1800)
  dust.connect(v.out)
  v.every(0, (t) => {
    const a = Math.pow(Math.random(), 4) * 0.5 + 0.01
    burst(kit, dust, t, { dur: rand(0.0008, 0.003), amp: a, rate: rand(0.5, 2) })
    return poisson(0.045)
  })
  v.every(0.5, (t) => {
    // a proper pop — lower, rounder, louder
    burst(kit, v.out, t, { dur: rand(0.006, 0.015), amp: rand(0.2, 0.45), type: 'lowpass', freq: rand(600, 1400), Q: 1.5 })
    return poisson(1.6)
  })
  v.every(0.2, (t) => {
    // revolution tick from a scratch
    burst(kit, v.out, t, { dur: 0.01, amp: 0.08, type: 'bandpass', freq: 900, Q: 2 })
    return 1.8
  })
  return v.build()
}

/** Crackling fireplace: roaring draft, flickering hiss, sap-pocket pops and log settles. */
export const fireplace: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 1)
  const { ctx } = v
  const roar = filter(ctx, 'lowpass', 350, 0.6)
  const rg = gain(ctx, 0.5)
  chain(v.noise('brown'), roar, rg, v.out)
  const flick = filter(ctx, 'bandpass', 2500, 0.5)
  const fg = gain(ctx, 0.02)
  chain(v.noise('white'), flick, fg, v.out)
  v.every(0, (t) => {
    drift(rg.gain, t, rand(0.3, 0.7), 0.3)
    drift(roar.frequency, t, rand(250, 550), 0.4)
    drift(fg.gain, t, rand(0.005, 0.035), 0.1)
    return rand(0.15, 0.6)
  })
  // crackles come in clusters
  v.every(0, (t) => {
    const n = chance(0.25) ? randInt(3, 8) : 1
    let tt = t
    for (let i = 0; i < n; i++) {
      burst(kit, v.out, tt, {
        dur: rand(0.002, 0.012), amp: Math.pow(Math.random(), 2) * 0.5 + 0.03,
        type: 'bandpass', freq: rand(1200, 5500), Q: rand(0.8, 3),
      })
      tt += rand(0.005, 0.04)
    }
    return poisson(0.18)
  })
  v.every(2, (t) => {
    // a loud sap pop
    burst(kit, v.out, t, { dur: 0.03, amp: 0.6, type: 'bandpass', freq: rand(700, 1500), Q: 1 })
    return poisson(5)
  })
  v.every(15, (t) => {
    // log shifting / settling
    for (let i = 0; i < randInt(3, 6); i++) {
      burst(kit, v.out, t + i * rand(0.04, 0.12), { dur: 0.05, amp: 0.2, type: 'lowpass', freq: 500 })
    }
    tone(ctx, v.out, t, { freq: 60, amp: 0.15, decay: 0.3 })
    return rand(20, 45)
  })
  return v.build()
}

/** Deep brown noise focus bed with a breathing tilt. */
export const brownNoise: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 0.9)
  const { ctx } = v
  const lp = filter(ctx, 'lowpass', 900, 0.5)
  const g = gain(ctx, 0.55)
  chain(v.noise('brown'), lp, g, v.out)
  const sub = filter(ctx, 'lowpass', 120)
  chain(v.noise('brown', 0.7), sub, gain(ctx, 0.3), v.out)
  v.lfo(lp.frequency, 0.06, 250)
  v.lfo(g.gain, 0.09, 0.06)
  return v.build()
}

/** Pink noise "air" — a bright, soft shower of hiss for masking. */
export const pinkAir: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 0.7)
  const { ctx } = v
  const shelf = filter(ctx, 'highshelf', 6000, 0.7, -6)
  const g = gain(ctx, 0.3)
  chain(v.noise('pink'), shelf, g, v.out)
  v.lfo(g.gain, 0.05, 0.05)
  return v.build()
}

/** Mechanical keyboard: words of switch clacks, space-bar thocks and thinking pauses. */
export const typing: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 0.8)
  const { ctx } = v
  const desk = filter(ctx, 'peaking', 250, 1.2, 6)
  desk.connect(v.out)
  const key = (t: number, amp: number, big = false) => {
    // switch click (top-out) + bottom-out thock through the desk
    burst(kit, desk, t, { dur: 0.008, amp: amp * 0.6, type: 'bandpass', freq: rand(3000, 5000), Q: 2 })
    burst(kit, desk, t + 0.004, { dur: big ? 0.05 : 0.025, amp, type: 'lowpass', freq: big ? 700 : rand(1200, 1800), Q: 1.5 })
    tone(ctx, desk, t + 0.004, { freq: big ? 140 : rand(220, 300), amp: amp * 0.25, decay: big ? 0.07 : 0.035 })
    // key return a few ms later
    burst(kit, desk, t + rand(0.07, 0.11), { dur: 0.006, amp: amp * 0.25, type: 'bandpass', freq: 2500, Q: 2 })
  }
  v.every(0.5, (t0) => {
    let t = t0
    const words = randInt(3, 12)
    for (let w = 0; w < words; w++) {
      const letters = randInt(2, 9)
      for (let l = 0; l < letters; l++) {
        key(t, rand(0.12, 0.3))
        t += rand(0.06, 0.16)
      }
      key(t, 0.3, true) // space bar
      t += rand(0.12, 0.3)
    }
    if (chance(0.3)) {
      key(t + 0.2, 0.32, true) // enter
      t += 0.3
    }
    return t - t0 + (chance(0.4) ? rand(3, 8) : rand(0.6, 1.8))
  })
  return v.build()
}

/** Antique wall clock: tick-tock with wooden case resonance and an hourly-ish chime. */
export const clock: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 1.4)
  const { ctx } = v
  const body = filter(ctx, 'peaking', 1600, 4, 10)
  body.connect(v.out)
  let tock = false
  v.every(0.3, (t) => {
    const f = tock ? 1350 : 1700
    burst(kit, body, t, { dur: 0.012, amp: 0.3, type: 'bandpass', freq: f, Q: 6 })
    tone(ctx, body, t, { freq: f * 1.5, amp: 0.02, decay: 0.04 })
    tock = !tock
    return 1
  })
  v.every(45, (t) => {
    // Westminster-like bell fragment
    const notes = [659.25, 830.61, 739.99, 493.88]
    notes.forEach((f, i) => {
      const tt = t + i * 0.9
      tone(ctx, v.out, tt, { freq: f, amp: 0.06, decay: 3 })
      tone(ctx, v.out, tt, { freq: f * 2.76, amp: 0.015, decay: 1.2 })
      tone(ctx, v.out, tt, { freq: f * 0.5, amp: 0.02, decay: 4 })
    })
    return rand(90, 150)
  })
  return v.build()
}
