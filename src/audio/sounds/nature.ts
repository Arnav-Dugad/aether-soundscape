import {
  VoiceBuilder, burst, chain, chance, drift, filter, gain, pick, poisson, rand, randInt, tone,
  type VoiceFactory,
} from '../kit'

/** Rain hammering a glass skylight: hiss bed + glassy droplet ticks + heavy plinks. */
export const rainSkylight: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 0.9)
  const { ctx } = v
  const bedHp = filter(ctx, 'highpass', 500)
  const bedLp = filter(ctx, 'lowpass', 5200)
  const bedG = gain(ctx, 0.22)
  chain(v.noise('pink'), bedHp, bedLp, bedG, v.out)
  const rumbleLp = filter(ctx, 'lowpass', 180)
  chain(v.noise('brown'), rumbleLp, gain(ctx, 0.25), v.out)

  const glass = filter(ctx, 'peaking', 3800, 2, 6)
  glass.connect(v.out)
  let intensity = 1
  v.every(2, (t) => {
    intensity = rand(0.7, 1.25)
    drift(bedG.gain, t, 0.18 * intensity, 1.5)
    drift(bedLp.frequency, t, rand(4200, 6500), 2)
    return rand(3, 7)
  })
  // fine droplets on glass
  v.every(0, (t) => {
    const amp = Math.pow(Math.random(), 3) * 0.5 + 0.02
    burst(kit, glass, t, { dur: rand(0.004, 0.02), amp, type: 'bandpass', freq: rand(2500, 7000), Q: rand(3, 9) })
    return poisson(0.022 / intensity)
  })
  // the occasional fat drop that "plinks" with a pitched ring
  v.every(0.5, (t) => {
    tone(ctx, glass, t, { freq: rand(1400, 3200), amp: rand(0.02, 0.06), decay: rand(0.03, 0.08), type: 'sine' })
    burst(kit, v.out, t, { dur: 0.012, amp: rand(0.08, 0.2), type: 'bandpass', freq: rand(900, 1800), Q: 2 })
    return poisson(0.35)
  })
  return v.build()
}

/** Slow rolling ocean waves with foam fizz on the backwash. */
export const ocean: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 1)
  const { ctx } = v
  const base = filter(ctx, 'lowpass', 300)
  chain(v.noise('brown'), base, gain(ctx, 0.18), v.out)

  v.every(0.2, (t) => {
    const dur = rand(6, 11)
    const rise = dur * rand(0.3, 0.42)
    const peak = rand(0.35, 0.65)
    // body of the wave
    const src = kit.ctx.createBufferSource()
    src.buffer = kit.noise.pink
    src.loop = true
    const lp = filter(ctx, 'lowpass', 250, 0.5)
    const g = gain(ctx, 0)
    const pan = ctx.createStereoPanner()
    pan.pan.setValueAtTime(rand(-0.6, 0.6), t)
    pan.pan.linearRampToValueAtTime(rand(-0.6, 0.6), t + dur)
    chain(src, lp, g, pan, v.out)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(peak * 0.6, t + rise * 0.7)
    g.gain.linearRampToValueAtTime(peak, t + rise)
    g.gain.setTargetAtTime(0, t + rise, dur * 0.22)
    lp.frequency.setValueAtTime(250, t)
    lp.frequency.exponentialRampToValueAtTime(rand(1800, 3200), t + rise)
    lp.frequency.setTargetAtTime(300, t + rise, dur * 0.25)
    src.start(t, Math.random() * 6)
    src.stop(t + dur + 4)
    // foam fizz trailing the crest
    const fz = kit.ctx.createBufferSource()
    fz.buffer = kit.noise.white
    fz.loop = true
    const hp = filter(ctx, 'highpass', 3500)
    const fg = gain(ctx, 0)
    chain(fz, hp, fg, pan)
    fg.gain.setValueAtTime(0, t + rise * 0.9)
    fg.gain.linearRampToValueAtTime(peak * 0.14, t + rise * 1.1)
    fg.gain.setTargetAtTime(0, t + rise * 1.2, dur * 0.18)
    fz.start(t + rise * 0.9, Math.random() * 4)
    fz.stop(t + dur + 4)
    return dur * rand(0.45, 0.7)
  })
  return v.build()
}

/** Distant thunder rolling across hills, with a faint wind bed. */
export const thunder: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 1.1)
  const { ctx } = v
  const wind = filter(ctx, 'bandpass', 500, 0.6)
  const wg = gain(ctx, 0.05)
  chain(v.noise('pink'), wind, wg, v.out)
  v.lfo(wind.frequency, 0.07, 200)
  v.lfo(wg.gain, 0.05, 0.03)
  // steady drizzle
  chain(v.noise('pink'), filter(ctx, 'highpass', 1200), filter(ctx, 'lowpass', 7000), gain(ctx, 0.04), v.out)

  v.every(1.5, (t) => {
    const near = Math.random()
    const len = rand(4, 9)
    const src = ctx.createBufferSource()
    src.buffer = kit.noise.brown
    src.loop = true
    const lp = filter(ctx, 'lowpass', 120 + near * 260, 0.9)
    const g = gain(ctx, 0)
    chain(src, lp, g, v.out)
    g.gain.setValueAtTime(0, t)
    // multi-peaked roll — several sub-strikes reverberating off terrain
    let tt = t
    const hits = randInt(3, 7)
    for (let i = 0; i < hits; i++) {
      const amp = (1 - i / hits) * rand(0.7, 1.4) * (0.8 + near)
      g.gain.linearRampToValueAtTime(amp, tt + rand(0.08, 0.35))
      tt += rand(0.35, 1.1)
      g.gain.linearRampToValueAtTime(amp * 0.35, tt)
    }
    g.gain.setTargetAtTime(0, tt, len * 0.25)
    lp.frequency.setTargetAtTime(90, t + 0.5, len * 0.3)
    src.start(t, Math.random() * 8)
    src.stop(t + len + tt - t + 3)
    if (near > 0.75) {
      // close crack
      burst(kit, v.out, t, { dur: 0.35, amp: 0.25, type: 'lowpass', freq: 2200, Q: 0.5, attack: 0.01 })
    }
    return rand(9, 22)
  })
  return v.build()
}

type Song = (t: number, out: AudioNode) => number
/** Dawn chorus: a handful of synthetic bird "species" with distinct phrase grammars. */
export const birds: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 0.7)
  const { ctx } = v
  const leaves = filter(ctx, 'bandpass', 2400, 0.5)
  const lg = gain(ctx, 0.025)
  chain(v.noise('pink'), leaves, lg, v.out)
  v.lfo(lg.gain, 0.13, 0.018)

  const chirp = (t: number, out: AudioNode, f0: number, f1: number, d: number, amp: number) => {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.frequency.setValueAtTime(f0, t)
    o.frequency.exponentialRampToValueAtTime(f1, t + d)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(amp, t + d * 0.25)
    g.gain.linearRampToValueAtTime(0, t + d)
    o.connect(g).connect(out)
    o.start(t)
    o.stop(t + d + 0.02)
  }
  const species: Song[] = [
    // trill: fast repeated up-sweeps
    (t, out) => {
      const base = rand(3200, 4600)
      const n = randInt(6, 14)
      const step = rand(0.045, 0.07)
      for (let i = 0; i < n; i++) chirp(t + i * step, out, base * 0.8, base * 1.15, step * 0.8, 0.09)
      return n * step
    },
    // whistle: two long sliding notes (like a chickadee "fee-bee")
    (t, out) => {
      const f = rand(2800, 3600)
      chirp(t, out, f, f * 0.98, 0.32, 0.1)
      chirp(t + 0.42, out, f * 0.84, f * 0.8, 0.38, 0.09)
      return 0.85
    },
    // warble: FM-wobbled melodic phrase
    (t, out) => {
      const n = randInt(4, 8)
      let tt = t
      for (let i = 0; i < n; i++) {
        const d = rand(0.06, 0.16)
        const f = rand(2200, 5200)
        const o = tone(ctx, out, tt, { freq: f, amp: 0.07, decay: d, attack: 0.01 })
        const m = ctx.createOscillator()
        const mg = gain(ctx, f * 0.08)
        m.frequency.value = rand(25, 60)
        m.connect(mg).connect(o.frequency)
        m.start(tt)
        m.stop(tt + d + 0.05)
        tt += d + rand(0.01, 0.05)
      }
      return tt - t
    },
    // descending cascade
    (t, out) => {
      const n = randInt(5, 9)
      let f = rand(5000, 6500)
      for (let i = 0; i < n; i++) {
        chirp(t + i * 0.09, out, f, f * 0.85, 0.07, 0.07)
        f *= 0.93
      }
      return n * 0.09
    },
  ]
  // each "bird" has its own position in the stereo field and its own song
  for (let b = 0; b < 4; b++) {
    const song = species[b % species.length]
    const pan = ctx.createStereoPanner()
    pan.pan.value = rand(-0.8, 0.8)
    const hp = filter(ctx, 'highpass', 1500)
    const g = gain(ctx, rand(0.5, 1))
    chain(hp, g, pan, v.out)
    v.every(rand(0.2, 4), (t) => {
      const reps = chance(0.4) ? 2 : 1
      let d = 0
      for (let r = 0; r < reps; r++) d += song(t + d, hp) + rand(0.2, 0.5)
      return d + rand(1.2, 6)
    })
  }
  return v.build()
}

/** Babbling brook: resonant water bed + hundreds of tiny rising-pitch bubbles. */
export const stream: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 0.8)
  const { ctx } = v
  const b1 = filter(ctx, 'bandpass', 900, 0.6)
  const b2 = filter(ctx, 'bandpass', 2600, 0.8)
  const g1 = gain(ctx, 0.25)
  const g2 = gain(ctx, 0.12)
  chain(v.noise('pink'), b1, g1, v.out)
  chain(v.noise('white'), b2, g2, v.out)
  v.lfo(b1.frequency, 0.31, 180)
  v.lfo(b2.frequency, 0.47, 500)
  v.lfo(g1.gain, 0.7, 0.06)

  v.every(0, (t) => {
    // Minnaert bubble: sine with rising exponential pitch and fast decay
    const f = Math.pow(Math.random(), 2) * 1600 + 380
    const d = rand(0.02, 0.07)
    const o = tone(ctx, v.out, t, { freq: f, amp: rand(0.015, 0.07), decay: d, attack: 0.001 })
    o.frequency.exponentialRampToValueAtTime(f * rand(1.6, 2.6), t + d)
    return poisson(0.035)
  })
  return v.build()
}

/** Wind through pines: gusting broadband air with whistling resonances. */
export const wind: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 0.9)
  const { ctx } = v
  const body = filter(ctx, 'lowpass', 700, 0.5)
  const bg = gain(ctx, 0.35)
  chain(v.noise('brown'), body, bg, v.out)
  const air = filter(ctx, 'bandpass', 1200, 0.7)
  const ag = gain(ctx, 0.1)
  chain(v.noise('pink'), air, ag, v.out)
  const whistles = [0, 1].map(() => {
    const f = filter(ctx, 'bandpass', rand(600, 1600), 28)
    const g = gain(ctx, 0.25)
    chain(v.noise('white'), f, g, v.out)
    return { f, g }
  })
  v.every(0, (t) => {
    const gust = Math.pow(Math.random(), 1.6)
    const tc = rand(0.8, 2.5)
    drift(bg.gain, t, 0.15 + gust * 0.5, tc)
    drift(body.frequency, t, 300 + gust * 900, tc)
    drift(ag.gain, t, 0.03 + gust * 0.14, tc)
    drift(air.frequency, t, 700 + gust * 1800, tc)
    for (const w of whistles) {
      drift(w.f.frequency, t, rand(500, 900) + gust * rand(500, 1200), tc * 1.3)
      drift(w.g.gain, t, gust > 0.5 ? gust * 0.4 : 0.02, tc)
    }
    return rand(1.5, 4.5)
  })
  return v.build()
}

/** Summer field crickets with distinct pulse rhythms, plus a lower katydid rasp. */
export const crickets: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 1.1)
  const { ctx } = v
  for (let c = 0; c < 5; c++) {
    const f = rand(4100, 5200)
    const pan = ctx.createStereoPanner()
    pan.pan.value = rand(-0.9, 0.9)
    const g = gain(ctx, rand(0.4, 1))
    g.connect(pan).connect(v.out)
    const pulses = randInt(2, 4)
    const pulseRate = rand(26, 34)
    const period = rand(0.45, 0.9)
    v.every(rand(0, 2), (t) => {
      for (let p = 0; p < pulses; p++) {
        const tt = t + p / pulseRate
        tone(ctx, g, tt, { freq: f, amp: 0.05, attack: 0.004, decay: 0.018 })
        tone(ctx, g, tt, { freq: f * 2.01, amp: 0.008, attack: 0.004, decay: 0.012 })
      }
      // crickets pause now and then
      return chance(0.04) ? rand(2, 6) : period * rand(0.97, 1.03)
    })
  }
  // katydid: rasping buzz bursts
  const kd = filter(ctx, 'bandpass', 7800, 6)
  const kg = gain(ctx, 0)
  chain(v.noise('white'), kd, kg, v.out)
  v.every(1, (t) => {
    const n = randInt(2, 3)
    for (let i = 0; i < n; i++) {
      const tt = t + i * 0.32
      kg.gain.setValueAtTime(0, tt)
      kg.gain.linearRampToValueAtTime(0.18, tt + 0.03)
      kg.gain.linearRampToValueAtTime(0, tt + 0.2)
    }
    return rand(2.2, 4)
  })
  return v.build()
}

/** Cave drips: sparse, resonant, pitched drops in a stone grotto. */
export const drips: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 0.8)
  const { ctx } = v
  chain(v.noise('brown'), filter(ctx, 'lowpass', 400), gain(ctx, 0.06), v.out)
  const cave = filter(ctx, 'peaking', 1200, 1.5, 4)
  cave.connect(v.out)
  v.every(0, (t) => {
    const f = pick([520, 660, 780, 880, 1040, 1320]) * rand(0.98, 1.02)
    const o = tone(ctx, cave, t, { freq: f, amp: rand(0.06, 0.16), decay: rand(0.12, 0.3) })
    o.frequency.exponentialRampToValueAtTime(f * 1.4, t + 0.05)
    return poisson(0.7)
  })
  return v.build()
}
