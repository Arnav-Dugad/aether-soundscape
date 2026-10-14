import {
  VoiceBuilder, burst, chain, chance, filter, gain, midi, pick, rand, randInt, saturator, tone,
  type VoiceFactory,
} from '../kit'

// All tonal generators share the key of D so any combination stays consonant.
const D_PENTA = [62, 64, 66, 69, 71] // D E F# A B

/** Deep space drone: detuned saw stack through a slowly breathing filter, chords drifting. */
export const drone: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 0.5)
  const { ctx } = v
  const lp = filter(ctx, 'lowpass', 500, 2)
  const g = gain(ctx, 0.12)
  lp.connect(g).connect(v.out)
  v.lfo(lp.frequency, 0.025, 300)
  const voicings = [
    [38, 45, 50, 57, 61],
    [38, 45, 52, 57, 59],
    [35, 42, 50, 54, 59],
    [36, 43, 50, 55, 59],
  ]
  const voices = voicings[0].map((n) => {
    const oscs = [-7, 7].map((det) => {
      const o = v.osc('sawtooth', midi(n), det + rand(-2, 2))
      o.connect(lp)
      return o
    })
    return oscs
  })
  // shimmering high partials
  const shimmer = gain(ctx, 0.012)
  shimmer.connect(v.out)
  const sh = [74, 81, 86].map((n) => {
    const o = v.osc('sine', midi(n))
    const tg = gain(ctx, 0.5)
    o.connect(tg).connect(shimmer)
    v.lfo(tg.gain, rand(0.08, 0.2), 0.5)
    return o
  })
  let idx = 0
  v.every(18, (t) => {
    idx = (idx + 1) % voicings.length
    voicings[idx].forEach((n, i) => {
      for (const o of voices[i]) o.frequency.setTargetAtTime(midi(n), t, 2.5)
    })
    const top = voicings[idx][4] + 24
    sh.forEach((o, i) => o.frequency.setTargetAtTime(midi(top + [0, 7, 12][i]), t, 3))
    return rand(16, 24)
  })
  return v.build()
}

/** Tibetan singing bowl: inharmonic partials with beating pairs and a soft mallet strike. */
export const singingBowl: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 0.6)
  const { ctx } = v
  const partials = [
    [1, 1],
    [2.71, 0.5],
    [5.15, 0.25],
    [8.43, 0.1],
    [12.1, 0.04],
  ]
  v.every(0.6, (t) => {
    const f0 = pick([midi(50), midi(57), midi(45)]) * rand(0.995, 1.005)
    const amp = rand(0.08, 0.14)
    const decay = rand(9, 14)
    for (const [ratio, a] of partials) {
      // each mode is a slightly detuned pair → the bowl's signature wobble
      for (const det of [-1, 1]) {
        tone(ctx, v.out, t, {
          freq: f0 * ratio + det * rand(0.6, 1.8),
          amp: amp * a * 0.5,
          attack: 0.01,
          decay: decay / Math.sqrt(ratio),
        })
      }
    }
    burst(kit, v.out, t, { dur: 0.03, amp: 0.1, type: 'lowpass', freq: 1500, Q: 1 })
    return rand(11, 17)
  })
  return v.build()
}

/** Wind chimes: aluminium tubes (Euler-Bernoulli partials) excited by gusts. */
export const chimes: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 0.5)
  const { ctx } = v
  const air = filter(ctx, 'bandpass', 800, 0.5)
  const ag = gain(ctx, 0.02)
  chain(v.noise('pink'), air, ag, v.out)
  v.lfo(ag.gain, 0.1, 0.015)
  const tubes = D_PENTA.map((n) => midi(n + 12))
  const strike = (t: number, amp: number) => {
    const f = pick(tubes)
    for (const [r, a, d] of [
      [1, 1, 4.5],
      [2.756, 0.45, 2.5],
      [5.404, 0.2, 1.4],
      [8.933, 0.08, 0.8],
    ] as const) {
      tone(ctx, v.out, t, { freq: f * r, amp: amp * a, attack: 0.001, decay: d * rand(0.85, 1.15) })
    }
  }
  v.every(0.5, (t) => {
    // a gust sets off a cluster of strikes
    const n = randInt(2, 7)
    let tt = t
    for (let i = 0; i < n; i++) {
      strike(tt, rand(0.03, 0.08))
      tt += rand(0.08, 0.45)
    }
    return tt - t + rand(1.5, 7)
  })
  return v.build()
}

/** Lo-fi electric piano: FM Rhodes voices, swung strums, tape wow and gentle saturation. */
export const lofiKeys: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 0.75)
  const { ctx } = v
  const lp = filter(ctx, 'lowpass', 2400, 0.6)
  const sat = saturator(ctx, 1.6)
  const wowBus = gain(ctx, 1)
  chain(wowBus, sat, lp, v.out)
  // tape hiss
  chain(v.noise('white'), filter(ctx, 'bandpass', 5000, 0.5), gain(ctx, 0.006), v.out)
  // a global wow LFO detunes every note we create
  const wow = ctx.createConstantSource()
  wow.offset.value = 0
  wow.start()
  v.keep(wow)
  v.lfo(wow.offset, 0.4, 9)

  const chords = [
    [43, 55, 59, 62, 66], // Gmaj7
    [42, 54, 57, 61, 64], // F#m7
    [40, 52, 55, 59, 62], // Em7
    [38, 50, 54, 57, 61], // Dmaj7
  ]
  const rhodes = (t: number, n: number, vel: number, dur: number) => {
    const f = midi(n)
    const car = ctx.createOscillator()
    const mod = ctx.createOscillator()
    car.frequency.value = f
    mod.frequency.value = f
    wow.connect(car.detune)
    car.onended = () => wow.disconnect(car.detune)
    const idx = gain(ctx, 0)
    idx.gain.setValueAtTime(f * 1.8 * vel, t)
    idx.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.5)
    mod.connect(idx).connect(car.frequency)
    const g = gain(ctx, 0)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.06 * vel, t + 0.005)
    g.gain.setTargetAtTime(0.025 * vel, t + 0.01, 0.4)
    g.gain.setTargetAtTime(0, t + dur, 0.25)
    car.connect(g).connect(wowBus)
    car.start(t)
    mod.start(t)
    car.stop(t + dur + 1.5)
    mod.stop(t + dur + 1.5)
  }
  const beat = 60 / 72
  let bar = 0
  v.every(0.4, (t) => {
    const chord = chords[bar % chords.length]
    const len = beat * 4
    // bass + strummed chord on beat 1
    rhodes(t, chord[0], 0.9, len * 0.9)
    chord.slice(1).forEach((n, i) => rhodes(t + i * 0.025 + rand(0, 0.01), n, rand(0.5, 0.75), beat * 2.4))
    // swung re-strike on the "and" of 3
    if (chance(0.7)) {
      chord.slice(2).forEach((n, i) => rhodes(t + beat * 2.62 + i * 0.02, n, rand(0.3, 0.45), beat * 1.2))
    }
    // a little melodic answer
    if (chance(0.55)) {
      const notes = D_PENTA.map((p) => p + 12)
      let tt = t + beat * rand(1, 3)
      for (let i = 0; i < randInt(2, 4); i++) {
        rhodes(tt, pick(notes), rand(0.35, 0.55), beat * 0.7)
        tt += beat * pick([0.5, 0.66, 1])
      }
    }
    // soft vinyl-style kick on 1 and 3
    for (const b of [0, 2]) {
      const k = tone(ctx, v.out, t + b * beat, { freq: 110, amp: 0.12, decay: 0.25 })
      k.frequency.exponentialRampToValueAtTime(45, t + b * beat + 0.12)
    }
    bar++
    return len
  })
  return v.build()
}

/** Ethereal choir pad: sawtooth vowels through formant banks, slowly morphing "ah → oo". */
export const choir: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 0.45)
  const { ctx } = v
  const vowels = {
    a: [800, 1150, 2900],
    o: [450, 800, 2830],
    u: [325, 700, 2530],
    e: [400, 1600, 2700],
  }
  const formants = vowels.a.map((f, i) => {
    const bp = filter(ctx, 'bandpass', f, [8, 10, 12][i])
    const g = gain(ctx, [1, 0.5, 0.25][i])
    bp.connect(g).connect(v.out)
    return bp
  })
  const notes = [50, 57, 62, 66, 69]
  const src = gain(ctx, 0.2)
  for (const bp of formants) src.connect(bp)
  const oscs = notes.flatMap((n) =>
    [-9, 0, 9].map((det) => {
      const o = v.osc('sawtooth', midi(n), det + rand(-3, 3))
      // natural vibrato per singer
      v.lfo(o.detune, rand(4.5, 5.8), rand(6, 12))
      o.connect(src)
      return { o, n }
    }),
  )
  const prog = [
    [50, 57, 62, 66, 69],
    [47, 54, 62, 66, 71],
    [43, 55, 62, 67, 71],
    [45, 57, 61, 64, 69],
  ]
  let i = 0
  v.every(0.1, (t) => {
    const vw = Object.values(vowels)[i % 4]
    formants.forEach((bp, k) => bp.frequency.setTargetAtTime(vw[k], t, 2))
    const chord = prog[i % prog.length]
    oscs.forEach(({ o }, k) => o.frequency.setTargetAtTime(midi(chord[Math.floor(k / 3)]), t, 1.2))
    i++
    return rand(9, 13)
  })
  return v.build()
}

/** Underwater: muffled pressure, sonar-like pings and rising bubble streams. */
export const underwater: VoiceFactory = (kit) => {
  const v = new VoiceBuilder(kit, 0.85)
  const { ctx } = v
  const lp = filter(ctx, 'lowpass', 280, 3)
  chain(v.noise('brown'), lp, gain(ctx, 0.5), v.out)
  v.lfo(lp.frequency, 0.08, 120)
  v.every(1, (t) => {
    // bubble stream
    const n = randInt(5, 18)
    let tt = t
    for (let k = 0; k < n; k++) {
      const f = rand(250, 700)
      const o = tone(ctx, v.out, tt, { freq: f, amp: rand(0.03, 0.08), decay: rand(0.04, 0.09) })
      o.frequency.exponentialRampToValueAtTime(f * 2, tt + 0.06)
      tt += rand(0.03, 0.12)
    }
    return rand(1.5, 5)
  })
  v.every(4, (t) => {
    // distant sonar ping with long tail
    const f = pick([midi(74), midi(81)])
    tone(ctx, v.out, t, { freq: f, amp: 0.05, attack: 0.01, decay: 3.5 })
    tone(ctx, v.out, t + 0.6, { freq: f, amp: 0.015, attack: 0.01, decay: 2.5 })
    return rand(12, 20)
  })
  return v.build()
}
