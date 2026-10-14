// Shared DSP toolkit for the procedural sound generators.
// Every sound in Aether is synthesized live — no samples are downloaded.

export type NoiseColor = 'white' | 'pink' | 'brown'

export interface Kit {
  ctx: AudioContext
  noise: Record<NoiseColor, AudioBuffer>
  /** 50ms burst of white noise used for clicks, drops, crackles. */
  click: AudioBuffer
}

export interface Voice {
  /** Mono/stereo output of the generator, pre-spatialisation. */
  output: GainNode
  /** Called by the scheduler with a look-ahead window [t0, t1) in ctx time. */
  tick?: (t0: number, t1: number) => void
  dispose: () => void
}

export type VoiceFactory = (kit: Kit) => Voice

export const rand = (a: number, b: number) => a + Math.random() * (b - a)
export const randInt = (a: number, b: number) => Math.floor(rand(a, b + 1))
export const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]
/** Exponentially-distributed interval with the given mean — natural Poisson spacing. */
export const poisson = (mean: number) => -Math.log(1 - Math.random()) * mean
export const chance = (p: number) => Math.random() < p
export const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12)

function makeNoise(ctx: BaseAudioContext, color: NoiseColor, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds)
  const buf = ctx.createBuffer(2, len, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      if (color === 'white') d[i] = w * 0.5
      else if (color === 'pink') {
        // Paul Kellet's refined pink filter
        b0 = 0.99886 * b0 + w * 0.0555179
        b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.969 * b2 + w * 0.153852
        b3 = 0.8665 * b3 + w * 0.3104856
        b4 = 0.55 * b4 + w * 0.5329522
        b5 = -0.7616 * b5 - w * 0.016898
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
        b6 = w * 0.115926
      } else {
        last = (last + 0.02 * w) / 1.02
        d[i] = last * 3.5
      }
    }
    // Crossfade the loop seam so it never clicks.
    const fade = Math.floor(ctx.sampleRate * 0.05)
    for (let i = 0; i < fade; i++) {
      const g = i / fade
      d[len - fade + i] = d[len - fade + i] * (1 - g) + d[i] * g
    }
  }
  return buf
}

export function createKit(ctx: AudioContext): Kit {
  const click = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate)
  const cd = click.getChannelData(0)
  for (let i = 0; i < cd.length; i++) cd[i] = Math.random() * 2 - 1
  return {
    ctx,
    noise: {
      white: makeNoise(ctx, 'white', 6),
      pink: makeNoise(ctx, 'pink', 9),
      brown: makeNoise(ctx, 'brown', 11),
    },
    click,
  }
}

/** Looping noise source started at a random offset so stacked layers decorrelate. */
export function noise(kit: Kit, color: NoiseColor, rate = 1): AudioBufferSourceNode {
  const src = kit.ctx.createBufferSource()
  src.buffer = kit.noise[color]
  src.loop = true
  src.playbackRate.value = rate
  src.start(kit.ctx.currentTime, Math.random() * src.buffer.duration)
  return src
}

export function filter(
  ctx: BaseAudioContext,
  type: BiquadFilterType,
  frequency: number,
  Q = 0.707,
  gain = 0,
): BiquadFilterNode {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = frequency
  f.Q.value = Q
  f.gain.value = gain
  return f
}

export function gain(ctx: BaseAudioContext, value = 1): GainNode {
  const g = ctx.createGain()
  g.gain.value = value
  return g
}

/** Connect a chain of nodes in series and return the last one. */
export function chain<T extends AudioNode>(...nodes: [...AudioNode[], T]): T {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1])
  return nodes[nodes.length - 1] as T
}

/** Continuous LFO modulating an AudioParam around its current value. */
export function lfo(
  ctx: AudioContext,
  target: AudioParam,
  freq: number,
  depth: number,
  type: OscillatorType = 'sine',
): OscillatorNode {
  const o = ctx.createOscillator()
  o.type = type
  o.frequency.value = freq
  const g = gain(ctx, depth)
  o.connect(g).connect(target)
  o.start(ctx.currentTime + Math.random() * 0.1)
  return o
}

/** One-shot of the shared click buffer — the atom for drops, crackles, clicks. */
export function burst(
  kit: Kit,
  dest: AudioNode,
  t: number,
  opts: { dur: number; amp: number; rate?: number; type?: BiquadFilterType; freq?: number; Q?: number; attack?: number },
) {
  const { ctx } = kit
  const src = ctx.createBufferSource()
  src.buffer = kit.click
  src.playbackRate.value = opts.rate ?? 1
  const g = ctx.createGain()
  const a = opts.attack ?? 0.0005
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(opts.amp, t + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + opts.dur)
  if (opts.type) {
    const f = filter(ctx, opts.type, opts.freq ?? 1000, opts.Q ?? 1)
    src.connect(f).connect(g)
  } else src.connect(g)
  g.connect(dest)
  src.start(t, Math.random() * 0.02)
  src.stop(t + a + opts.dur + 0.05)
}

/** Enveloped oscillator one-shot. Returns the oscillator so callers can automate pitch. */
export function tone(
  ctx: AudioContext,
  dest: AudioNode,
  t: number,
  opts: { freq: number; amp: number; attack?: number; decay: number; type?: OscillatorType; detune?: number },
): OscillatorNode {
  const o = ctx.createOscillator()
  o.type = opts.type ?? 'sine'
  o.frequency.setValueAtTime(opts.freq, t)
  if (opts.detune) o.detune.value = opts.detune
  const g = ctx.createGain()
  const a = opts.attack ?? 0.003
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(opts.amp, t + a)
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + opts.decay)
  o.connect(g).connect(dest)
  o.start(t)
  o.stop(t + a + opts.decay + 0.05)
  return o
}

/** Glide a param smoothly to a new random target — organic drift. */
export function drift(param: AudioParam, t: number, value: number, timeConstant: number) {
  param.setTargetAtTime(value, t, timeConstant)
}

/** Soft-clip waveshaper curve for analog warmth. */
export function saturator(ctx: BaseAudioContext, amount = 2): WaveShaperNode {
  const ws = ctx.createWaveShaper()
  const n = 2048
  const curve = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount)
  }
  ws.curve = curve
  ws.oversample = '2x'
  return ws
}

/**
 * Helper for building voices: tracks long-running sources for disposal and
 * provides a per-voice event clock so generators only implement "what happens next".
 */
export class VoiceBuilder {
  readonly out: GainNode
  private stoppables: (AudioScheduledSourceNode)[] = []
  private events: { next: number; fn: (t: number) => number }[] = []

  constructor(readonly kit: Kit, level = 1) {
    this.out = gain(kit.ctx, level)
  }

  get ctx() {
    return this.kit.ctx
  }

  keep<T extends AudioScheduledSourceNode>(node: T): T {
    this.stoppables.push(node)
    return node
  }

  noise(color: NoiseColor, rate = 1) {
    return this.keep(noise(this.kit, color, rate))
  }

  osc(type: OscillatorType, freq: number, detune = 0) {
    const o = this.ctx.createOscillator()
    o.type = type
    o.frequency.value = freq
    o.detune.value = detune
    o.start()
    return this.keep(o)
  }

  lfo(target: AudioParam, freq: number, depth: number, type: OscillatorType = 'sine') {
    return this.keep(lfo(this.ctx, target, freq, depth, type))
  }

  /**
   * Register a recurring event. `fn` receives the scheduled time and returns
   * seconds until the next occurrence.
   */
  every(firstDelay: number, fn: (t: number) => number) {
    this.events.push({ next: this.ctx.currentTime + firstDelay, fn })
  }

  build(): Voice {
    return {
      output: this.out,
      tick: (t0, t1) => {
        for (const e of this.events) {
          if (e.next < t0) e.next = t0 // recover after a stalled/background tab
          while (e.next < t1) e.next += Math.max(0.005, e.fn(e.next))
        }
      },
      dispose: () => {
        const t = this.ctx.currentTime
        for (const s of this.stoppables) {
          try {
            s.stop(t + 0.05)
          } catch {
            /* already stopped */
          }
        }
        this.events = []
        setTimeout(() => this.out.disconnect(), 200)
      },
    }
  }
}
