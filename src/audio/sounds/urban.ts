import {
  VoiceBuilder, burst, chain, chance, drift, filter, gain, pick, poisson, rand, randInt, saturator, tone,
  type VoiceFactory,
} from '../kit'

/**
 * Midnight Shinjuku: sodium-lit city hum, wet tyres hissing past, the JR line
 * rumbling overhead and the "piyo-piyo" bird call of a pedestrian crossing.
 */
export const shinjuku: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 0.85)
  const { ctx } = v
  // city bed: low hum + mid-range wash
  const hum = filter(ctx, 'lowpass', 260)
  const hg = gain(ctx, 0.3)
  chain(v.noise('brown'), hum, hg, v.out)
  const wash = filter(ctx, 'bandpass', 900, 0.4)
  const wg = gain(ctx, 0.05)
  chain(v.noise('pink'), wash, wg, v.out)
  v.lfo(hg.gain, 0.04, 0.08)
  // neon transformer buzz
  const buzz = v.osc('sawtooth', 100)
  chain(buzz, filter(ctx, 'bandpass', 400, 4), gain(ctx, 0.004), v.out)

  // wet-road car pass-bys with doppler-ish sweep
  v.every(1, (t) => {
    const d = rand(2.5, 5)
    const src = ctx.createBufferSource()
    src.buffer = kit.noise.pink
    src.loop = true
    const bp = filter(ctx, 'bandpass', 1400, 0.8)
    const g = gain(ctx, 0)
    const pan = ctx.createStereoPanner()
    const dir = chance(0.5) ? 1 : -1
    pan.pan.setValueAtTime(-0.9 * dir, t)
    pan.pan.linearRampToValueAtTime(0.9 * dir, t + d)
    chain(src, bp, g, pan, v.out)
    const peak = rand(0.08, 0.22)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(peak, t + d * 0.5)
    g.gain.linearRampToValueAtTime(0, t + d)
    bp.frequency.setValueAtTime(rand(1600, 2400), t)
    bp.frequency.exponentialRampToValueAtTime(rand(500, 800), t + d)
    src.start(t, Math.random() * 5)
    src.stop(t + d + 0.1)
    // engine tone under the tyre hiss
    const eng = tone(ctx, pan, t, { freq: rand(70, 110), amp: peak * 0.25, attack: d * 0.5, decay: d * 0.5, type: 'sawtooth' })
    eng.frequency.linearRampToValueAtTime(eng.frequency.value * 0.85, t + d)
    return poisson(4) + 0.8
  })

  // pedestrian crossing "piyo piyo" (Japanese accessible signal)
  const sig = filter(ctx, 'bandpass', 2400, 1.2)
  const sg = gain(ctx, 0.35)
  chain(sig, sg, v.out)
  v.every(6, (t) => {
    const reps = randInt(8, 14)
    for (let i = 0; i < reps; i++) {
      const tt = t + i * 0.55
      for (const [off, f0, f1] of [[0, 2900, 2100], [0.16, 2600, 1900]] as const) {
        const o = tone(ctx, sig, tt + off, { freq: f0, amp: 0.05, attack: 0.005, decay: 0.12 })
        o.frequency.exponentialRampToValueAtTime(f1, tt + off + 0.12)
      }
    }
    return reps * 0.55 + rand(18, 32)
  })

  // JR Yamanote line passing on the elevated track
  v.every(rand(10, 20), (t) => {
    const d = rand(8, 12)
    const src = ctx.createBufferSource()
    src.buffer = kit.noise.brown
    src.loop = true
    const lp = filter(ctx, 'lowpass', 220)
    const g = gain(ctx, 0)
    chain(src, lp, g, v.out)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.9, t + d * 0.4)
    g.gain.linearRampToValueAtTime(0, t + d)
    src.start(t, Math.random() * 8)
    src.stop(t + d + 0.1)
    const clacks = filter(ctx, 'lowpass', 900)
    const cg = gain(ctx, 0)
    clacks.connect(cg).connect(v.out)
    cg.gain.setValueAtTime(0, t)
    cg.gain.linearRampToValueAtTime(1, t + d * 0.45)
    cg.gain.linearRampToValueAtTime(0, t + d)
    for (let tt = t + 0.5; tt < t + d; tt += 0.62) {
      burst(kit, clacks, tt, { dur: 0.05, amp: 0.25 })
      burst(kit, clacks, tt + 0.11, { dur: 0.05, amp: 0.2 })
    }
    return rand(28, 50)
  })
  return v.build()
}

/** Night train interior: rail rumble, rhythmic wheel-joint clatter, and soft rail squeal. */
export const nightTrain: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 0.9)
  const { ctx } = v
  const rum = filter(ctx, 'lowpass', 140)
  chain(v.noise('brown'), rum, gain(ctx, 0.6), v.out)
  const cabin = filter(ctx, 'bandpass', 500, 0.6)
  chain(v.noise('pink'), cabin, gain(ctx, 0.06), v.out)
  v.lfo(rum.frequency, 0.11, 40)
  // electrical motor whine
  const whine = v.osc('triangle', 310)
  const wg = gain(ctx, 0.006)
  chain(whine, wg, v.out)
  v.lfo(whine.frequency, 0.03, 8)

  const thump = filter(ctx, 'lowpass', 600, 1)
  thump.connect(v.out)
  let speed = 1
  v.every(0.5, (t) => {
    const gap = 0.13 / speed
    for (const [dt, a] of [[0, 0.35], [gap, 0.28]] as const) {
      burst(kit, thump, t + dt, { dur: 0.06, amp: a })
      tone(ctx, v.out, t + dt, { freq: 70, amp: a * 0.4, decay: 0.08 })
    }
    return (pick([1.05, 1.05, 1.05, 1.6]) / speed) * rand(0.98, 1.02)
  })
  v.every(4, (t) => {
    speed = rand(0.9, 1.1)
    if (chance(0.3)) {
      // rail squeal on a curve
      const d = rand(1.5, 3.5)
      const o = tone(ctx, v.out, t, { freq: rand(2200, 3200), amp: 0.012, attack: d * 0.4, decay: d * 0.6 })
      o.frequency.linearRampToValueAtTime(o.frequency.value * rand(0.95, 1.05), t + d)
    }
    return rand(6, 12)
  })
  return v.build()
}

/** Café murmur: formant-filtered "voices", cup clinks and the odd chair scrape. */
export const cafe: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 1)
  const { ctx } = v
  chain(v.noise('brown'), filter(ctx, 'lowpass', 300), gain(ctx, 0.08), v.out)
  const formants = [
    [700, 1220],
    [400, 2000],
    [550, 900],
    [300, 2300],
    [640, 1190],
  ]
  for (let i = 0; i < 7; i++) {
    const src = v.noise('pink', rand(0.95, 1.05))
    const [f1, f2] = pick(formants)
    const a = filter(ctx, 'bandpass', f1, 4)
    const b = filter(ctx, 'bandpass', f2, 5)
    const mix = gain(ctx, 0)
    const pan = ctx.createStereoPanner()
    pan.pan.value = rand(-0.85, 0.85)
    src.connect(a).connect(mix)
    src.connect(b).connect(mix)
    mix.connect(pan).connect(v.out)
    const loud = rand(0.25, 0.7)
    // syllabic envelope with talk/pause structure
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
  // ceramic & spoon clinks
  v.every(1, (t) => {
    const f = rand(2600, 4200)
    const n = chance(0.3) ? 2 : 1
    for (let i = 0; i < n; i++) {
      const tt = t + i * rand(0.08, 0.15)
      tone(ctx, v.out, tt, { freq: f, amp: 0.03, decay: rand(0.2, 0.4) })
      tone(ctx, v.out, tt, { freq: f * 2.43, amp: 0.012, decay: 0.15 })
    }
    return poisson(2.5)
  })
  // chair scrape
  v.every(8, (t) => {
    const d = rand(0.3, 0.6)
    const src = ctx.createBufferSource()
    src.buffer = kit.noise.white
    const bp = filter(ctx, 'bandpass', rand(700, 1200), 8)
    const g = gain(ctx, 0)
    chain(src, bp, g, v.out)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.12, t + 0.05)
    g.gain.linearRampToValueAtTime(0, t + d)
    bp.frequency.linearRampToValueAtTime(bp.frequency.value * 1.3, t + d)
    src.start(t, Math.random() * 3)
    src.stop(t + d)
    return rand(12, 30)
  })
  return v.build()
}

/** Espresso machine ritual: grind → tamp → pump & pour → steam wand → cup. */
export const espresso: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 0.9)
  const { ctx } = v
  chain(v.noise('brown'), filter(ctx, 'lowpass', 200), gain(ctx, 0.05), v.out)
  const sat = saturator(ctx, 2.5)
  const satOut = gain(ctx, 0.6)
  sat.connect(satOut).connect(v.out)

  const envNoise = (
    t: number, d: number, color: 'white' | 'pink' | 'brown', type: BiquadFilterType,
    f: number, Q: number, amp: number, attack = 0.05, release = 0.2,
  ) => {
    const src = ctx.createBufferSource()
    src.buffer = kit.noise[color]
    src.loop = true
    const bp = filter(ctx, type, f, Q)
    const g = gain(ctx, 0)
    chain(src, bp, g, v.out)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(amp, t + attack)
    g.gain.setValueAtTime(amp, t + d - release)
    g.gain.linearRampToValueAtTime(0, t + d)
    src.start(t, Math.random() * 4)
    src.stop(t + d + 0.05)
    return { g, bp }
  }

  v.every(1, (t0) => {
    let t = t0
    // 1. grinder: motor whine + beans shattering
    const gd = rand(2.2, 3.2)
    const motor = ctx.createOscillator()
    motor.type = 'sawtooth'
    motor.frequency.setValueAtTime(90, t)
    motor.frequency.linearRampToValueAtTime(150, t + 0.3)
    const mg = gain(ctx, 0)
    chain(motor, filter(ctx, 'lowpass', 1200), mg, sat)
    mg.gain.setValueAtTime(0, t)
    mg.gain.linearRampToValueAtTime(0.12, t + 0.2)
    mg.gain.setValueAtTime(0.12, t + gd - 0.3)
    mg.gain.linearRampToValueAtTime(0, t + gd)
    motor.frequency.setValueAtTime(150, t + gd - 0.3)
    motor.frequency.linearRampToValueAtTime(80, t + gd)
    motor.start(t)
    motor.stop(t + gd + 0.05)
    for (let tt = t + 0.2; tt < t + gd - 0.3; tt += poisson(0.012)) {
      burst(kit, v.out, tt, { dur: 0.006, amp: rand(0.02, 0.07), type: 'highpass', freq: 2500 })
    }
    t += gd + rand(1.2, 2)
    // 2. knock-box & tamp
    burst(kit, v.out, t, { dur: 0.08, amp: 0.4, type: 'lowpass', freq: 500 })
    tone(ctx, v.out, t, { freq: 90, amp: 0.2, decay: 0.12 })
    burst(kit, v.out, t + 0.9, { dur: 0.04, amp: 0.25, type: 'lowpass', freq: 900 })
    t += rand(2, 3)
    // 3. pump (vibratory 50Hz buzz) + pour dribble
    const pd = rand(5, 7)
    const pump = ctx.createOscillator()
    pump.type = 'square'
    pump.frequency.value = 50
    const pg = gain(ctx, 0)
    chain(pump, filter(ctx, 'lowpass', 500), pg, sat)
    pg.gain.setValueAtTime(0, t)
    pg.gain.linearRampToValueAtTime(0.07, t + 0.4)
    pg.gain.setValueAtTime(0.07, t + pd - 0.3)
    pg.gain.linearRampToValueAtTime(0, t + pd)
    pump.start(t)
    pump.stop(t + pd + 0.05)
    const pour = envNoise(t + 1.2, pd - 1.2, 'pink', 'bandpass', 1100, 1.5, 0.12, 0.6, 0.6)
    for (let tt = t + 1.4; tt < t + pd - 0.5; tt += 0.07) {
      pour.bp.frequency.setValueAtTime(rand(800, 1600), tt)
    }
    t += pd + rand(1.5, 3)
    // 4. steam wand: hiss + milk gurgle swirling into a stretch
    const sd = rand(5, 8)
    const hiss = envNoise(t, sd, 'white', 'highpass', 3000, 0.7, 0.18, 0.15, 0.4)
    hiss.bp.frequency.linearRampToValueAtTime(5200, t + sd)
    const gurgle = envNoise(t, sd * 0.6, 'brown', 'bandpass', 400, 3, 0.4, 0.3, 0.6)
    for (let tt = t; tt < t + sd * 0.6; tt += rand(0.03, 0.08)) {
      gurgle.g.gain.setValueAtTime(rand(0.1, 0.6), tt)
      gurgle.bp.frequency.setValueAtTime(rand(250, 700), tt)
    }
    t += sd + rand(1, 2)
    // 5. ceramic cup set down on the saucer
    tone(ctx, v.out, t, { freq: 2100, amp: 0.06, decay: 0.5 })
    tone(ctx, v.out, t, { freq: 3470, amp: 0.035, decay: 0.35 })
    tone(ctx, v.out, t + 0.07, { freq: 2140, amp: 0.025, decay: 0.3 })
    burst(kit, v.out, t, { dur: 0.02, amp: 0.15, type: 'bandpass', freq: 1500, Q: 1 })
    return t - t0 + rand(6, 12)
  })
  return v.build()
}
