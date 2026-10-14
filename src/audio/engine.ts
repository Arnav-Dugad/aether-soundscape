import { createKit, type Kit, type Voice } from './kit'
import { SOUND_MAP } from './catalog'
import { makeImpulse, ROOM_MAP } from './rooms'
import { workletUrl } from './worklet'
import { loadBuffer } from './samples'

/** Radius of the mixing field in virtual metres. */
export const WORLD_RADIUS = 8
/** Vertical range of the elevation control in metres (±). */
export const ELEVATION_RANGE = 4
/** Doppler exaggeration: seconds of delay per metre (real air is ~0.0029). */
const DOPPLER_S_PER_M = 0.0065
const TAPE_BASE = 0.005

export interface ChannelParams {
  volume: number
  tone: number
  reverb: number
  eqLow: number
  eqMid: number
  eqHigh: number
  realism: number
  crush: number
  freeze: boolean
}

interface Channel {
  soundId: string
  voice: Voice
  spatial: boolean
  category: string
  synthGain: GainNode
  recGain: GainNode
  recSource: AudioBufferSourceNode | null
  fxIn: GainNode
  fx: AudioWorkletNode | null
  eqLow: BiquadFilterNode
  eqMid: BiquadFilterNode
  eqHigh: BiquadFilterNode
  tone: BiquadFilterNode
  evolve: GainNode
  vol: GainNode
  doppler: DelayNode
  tape: DelayNode
  tapeGain: GainNode
  tapeStopped: boolean
  mute: GainNode
  occ: BiquadFilterNode
  occGain: GainNode
  air: BiquadFilterNode
  panner: PannerNode | null
  flatGain: GainNode | null
  send: GainNode
  analyser: AnalyserNode
  buf: Float32Array<ArrayBuffer>
  level: number
  reverbAmt: number
  lastX: number
  lastY: number
  lastZ: number
  realism: number
  seeds: [number, number, number, number]
  occlusion: number
  disposed: boolean
}

const WEATHER = new Set(['Weather'])

class AudioEngine {
  ctx: AudioContext | null = null
  private kit!: Kit
  private dry!: GainNode
  private wet!: GainNode
  private pre!: DelayNode
  private reverbs: { conv: ConvolverNode; out: GainNode }[] = []
  private activeReverb = 0
  private warmth!: BiquadFilterNode
  private master!: GainNode
  private analyser!: AnalyserNode
  private analyserL!: AnalyserNode
  private analyserR!: AnalyserNode
  private uiOut!: GainNode
  private recordDest!: MediaStreamAudioDestinationNode
  private channels = new Map<string, Channel>()
  private timer: number | undefined
  private masterBuf!: Float32Array<ArrayBuffer>
  private freqBuf!: Uint8Array<ArrayBuffer>
  private workletReady = false
  masterLevel = 0
  bands = { low: 0, mid: 0, high: 0 }
  private soloActive = false
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  doppler = true
  evolve = false
  private evolveClock = 0
  private evolveStart = 0
  roomId = 'hall'

  get started() {
    return this.ctx !== null
  }

  /** Must be called from a user gesture. */
  async start() {
    if (this.ctx) {
      await this.ctx.resume()
      return
    }
    const ctx = new AudioContext({ latencyHint: 'playback' })
    this.ctx = ctx
    this.kit = createKit(ctx)

    this.dry = ctx.createGain()
    this.wet = ctx.createGain()
    this.wet.gain.value = 0.9
    this.pre = ctx.createDelay(0.2)
    this.wet.connect(this.pre)

    const sum = ctx.createGain()
    this.dry.connect(sum)
    // two convolvers so room changes crossfade instead of clicking
    for (let i = 0; i < 2; i++) {
      const conv = ctx.createConvolver()
      const out = ctx.createGain()
      out.gain.value = 0
      this.pre.connect(conv).connect(out).connect(sum)
      this.reverbs.push({ conv, out })
    }
    this.setRoom(this.roomId)

    this.warmth = ctx.createBiquadFilter()
    this.warmth.type = 'highshelf'
    this.warmth.frequency.value = 3200
    this.warmth.gain.value = -2

    this.master = ctx.createGain()
    this.master.gain.value = 0

    const glue = ctx.createDynamicsCompressor()
    glue.threshold.value = -20
    glue.knee.value = 12
    glue.ratio.value = 3
    glue.attack.value = 0.02
    glue.release.value = 0.3
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -3
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.002
    limiter.release.value = 0.1

    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 2048
    this.analyser.smoothingTimeConstant = 0.82
    this.masterBuf = new Float32Array(this.analyser.fftSize)
    this.freqBuf = new Uint8Array(this.analyser.frequencyBinCount)
    const split = ctx.createChannelSplitter(2)
    this.analyserL = ctx.createAnalyser()
    this.analyserR = ctx.createAnalyser()
    this.analyserL.fftSize = this.analyserR.fftSize = 1024
    this.recordDest = ctx.createMediaStreamDestination()

    sum.connect(this.warmth).connect(glue).connect(limiter).connect(this.master)
    this.master.connect(this.analyser)
    this.master.connect(split)
    split.connect(this.analyserL, 0)
    split.connect(this.analyserR, 1)
    this.master.connect(ctx.destination)
    this.master.connect(this.recordDest)

    // interface sounds go straight out — never into the mix or the recorder
    this.uiOut = ctx.createGain()
    this.uiOut.gain.value = 0.25
    this.uiOut.connect(ctx.destination)

    const L = ctx.listener
    if (L.positionX) {
      L.positionX.value = 0
      L.positionY.value = 0
      L.positionZ.value = 0
    }
    this.setHeading(0)

    try {
      await ctx.audioWorklet.addModule(workletUrl())
      this.workletReady = true
    } catch {
      this.workletReady = false
    }

    this.evolveStart = ctx.currentTime
    this.timer = window.setInterval(() => this.tick(), 25)
    await ctx.resume()
  }

  /** Look-ahead scheduler: generators queue events slightly into the future. */
  private tick() {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    // background tabs throttle timers to ~1 Hz, so widen the horizon when hidden
    const horizon = document.hidden ? 1.6 : 0.18
    const t0 = ctx.currentTime
    for (const ch of this.channels.values()) ch.voice.tick?.(t0, t0 + horizon)
    if (t0 - this.evolveClock > 0.4) {
      this.evolveClock = t0
      this.applyEvolve(t0)
    }
  }

  // ─── evolving weather ─────────────────────────────────────────────────────

  /** 0 → 1 → 0 over a 20-minute storm cycle. */
  weatherArc(): number {
    if (!this.ctx) return 0
    const t = this.ctx.currentTime - this.evolveStart
    return 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / 1200)
  }

  weatherPhase(): 'calm' | 'building' | 'peak' | 'passing' {
    if (!this.ctx) return 'calm'
    const t = ((this.ctx.currentTime - this.evolveStart) % 1200) / 1200
    const arc = this.weatherArc()
    if (arc < 0.2) return 'calm'
    if (arc > 0.8) return 'peak'
    return t < 0.5 ? 'building' : 'passing'
  }

  private applyEvolve(t: number) {
    const arc = this.weatherArc()
    for (const ch of this.channels.values()) {
      let g = 1
      if (this.evolve) {
        const [a, b, p, q] = ch.seeds
        const n = 0.5 + 0.28 * Math.sin(t * a + p) + 0.22 * Math.sin(t * b + q)
        g = WEATHER.has(ch.category) ? 0.3 + 1.1 * arc * (0.55 + 0.45 * n) : 0.72 + 0.4 * n
      }
      ch.evolve.gain.setTargetAtTime(g, t, 1.5)
    }
  }

  // ─── rooms ────────────────────────────────────────────────────────────────

  setRoom(id: string) {
    const room = ROOM_MAP[id] ?? ROOM_MAP.hall
    this.roomId = room.id
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    const next = (this.activeReverb + 1) % 2
    const cur = this.reverbs[this.activeReverb]
    const nxt = this.reverbs[next]
    nxt.conv.buffer = makeImpulse(ctx, room)
    this.pre.delayTime.setTargetAtTime(room.preDelay, t, 0.05)
    cur.out.gain.setTargetAtTime(0, t, 0.25)
    nxt.out.gain.setTargetAtTime(room.level, t, 0.25)
    this.activeReverb = next
  }

  // ─── channels ─────────────────────────────────────────────────────────────

  addChannel(id: string, soundId: string) {
    const ctx = this.ctx
    const def = SOUND_MAP[soundId]
    if (!ctx || !def || this.channels.has(id)) return
    const spatial = def.spatial !== false
    const voice = def.factory(this.kit)
    const g = (v = 1) => {
      const n = ctx.createGain()
      n.gain.value = v
      return n
    }
    const bq = (type: BiquadFilterType, f: number, q = 0.707) => {
      const n = ctx.createBiquadFilter()
      n.type = type
      n.frequency.value = f
      n.Q.value = q
      return n
    }
    const synthGain = g(1)
    const recGain = g(0)
    const fxIn = g(1)
    const eqLow = bq('lowshelf', 220)
    const eqMid = bq('peaking', 1100, 0.8)
    const eqHigh = bq('highshelf', 4500)
    const tone = bq('lowpass', 20000, 0.5)
    const evolve = g(1)
    const vol = g(0)
    const doppler = ctx.createDelay(0.25)
    doppler.delayTime.value = 0.01
    const tape = ctx.createDelay(5)
    tape.delayTime.value = TAPE_BASE
    const tapeGain = g(1)
    const mute = g(1)
    const occ = bq('lowpass', 20000, 0.6)
    const occGain = g(1)
    const air = bq('lowpass', 18000)
    const send = g(0.2)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.7

    voice.output.connect(synthGain).connect(fxIn)
    recGain.connect(fxIn)
    fxIn.connect(eqLow).connect(eqMid).connect(eqHigh).connect(tone).connect(evolve).connect(vol)
    vol.connect(analyser)
    vol.connect(doppler).connect(tape).connect(tapeGain).connect(mute).connect(occ).connect(occGain)

    let panner: PannerNode | null = null
    let flatGain: GainNode | null = null
    if (spatial) {
      panner = new PannerNode(ctx, {
        panningModel: 'HRTF',
        distanceModel: 'inverse',
        refDistance: 1.4,
        maxDistance: 40,
        rolloffFactor: 1.1,
      })
      occGain.connect(air).connect(panner).connect(this.dry)
      panner.connect(send).connect(this.wet)
    } else {
      // non-spatial sources (binaural beats) keep their L/R channels untouched;
      // distance only scales their level
      flatGain = g(1)
      occGain.connect(flatGain).connect(this.dry)
      flatGain.connect(send).connect(this.wet)
    }

    const r = () => 0.004 + Math.random() * 0.02
    this.channels.set(id, {
      soundId, voice, spatial, category: def.category,
      synthGain, recGain, recSource: null, fxIn, fx: null,
      eqLow, eqMid, eqHigh, tone, evolve, vol, doppler, tape, tapeGain, tapeStopped: false,
      mute, occ, occGain, air, panner, flatGain, send, analyser,
      buf: new Float32Array(analyser.fftSize),
      level: 0, reverbAmt: 0.5, lastX: NaN, lastY: NaN, lastZ: NaN, realism: 0,
      seeds: [r(), r(), Math.random() * 6.28, Math.random() * 6.28],
      occlusion: 0,
      disposed: false,
    })
    this.applyMutes()
    this.applyEvolve(ctx.currentTime)
  }

  removeChannel(id: string) {
    const ch = this.channels.get(id)
    const ctx = this.ctx
    if (!ch || !ctx) return
    this.channels.delete(id)
    ch.disposed = true
    ch.vol.gain.cancelScheduledValues(ctx.currentTime)
    ch.vol.gain.setTargetAtTime(0, ctx.currentTime, 0.12)
    setTimeout(() => {
      ch.voice.dispose()
      ch.recSource?.stop()
      ch.panner?.disconnect()
      ch.flatGain?.disconnect()
      ch.vol.disconnect()
      ch.fx?.disconnect()
    }, 900)
  }

  hasChannel(id: string) {
    return this.channels.has(id)
  }

  /**
   * Position in normalised field space: x right, y down (towards the listener's back),
   * z = elevation (-1 below … +1 above).
   */
  setPosition(id: string, nx: number, ny: number, nz = 0) {
    const ch = this.channels.get(id)
    const ctx = this.ctx
    if (!ch || !ctx) return
    if (Math.abs(ch.lastX - nx) < 0.0005 && Math.abs(ch.lastY - ny) < 0.0005 && Math.abs(ch.lastZ - nz) < 0.002) return
    ch.lastX = nx
    ch.lastY = ny
    ch.lastZ = nz
    let x = nx * WORLD_RADIUS
    let z = ny * WORLD_RADIUS
    const y = nz * ELEVATION_RANGE
    const flat = Math.hypot(x, z)
    // keep sources just outside the head so HRTF stays stable
    if (flat < 0.35 && Math.abs(y) < 0.35) {
      const k = flat === 0 ? 0 : 0.35 / flat
      x = flat === 0 ? 0 : x * k
      z = flat === 0 ? -0.35 : z * k
    }
    const d = Math.max(0.35, Math.hypot(x, y, z))
    const t = ctx.currentTime
    const p = ch.panner
    if (p) {
      if (p.positionX) {
        p.positionX.setTargetAtTime(x, t, 0.04)
        p.positionY.setTargetAtTime(y, t, 0.04)
        p.positionZ.setTargetAtTime(z, t, 0.04)
      } else p.setPosition(x, y, z)
      // air absorption: distant sources lose their top end
      ch.air.frequency.setTargetAtTime(600 + 19000 * Math.exp(-d / 4.2), t, 0.06)
    } else if (ch.flatGain) {
      ch.flatGain.gain.setTargetAtTime(1 / (1 + Math.max(0, d - 1.4) * 0.18), t, 0.06)
    }
    // Doppler: a delay line whose length follows distance bends pitch as the orb moves
    ch.doppler.delayTime.setTargetAtTime(this.doppler ? 0.01 + d * DOPPLER_S_PER_M : 0.01, t, 0.06)
    // distance drives the reverb send — far things sound roomier
    const norm = Math.min(d / WORLD_RADIUS, 1.3)
    ch.send.gain.setTargetAtTime((0.06 + 0.75 * Math.pow(norm, 1.3)) * ch.reverbAmt * 2, t, 0.08)
  }

  /** 0 = clear line of sight, 1 = fully behind a wall. */
  setOcclusion(id: string, amount: number) {
    const ch = this.channels.get(id)
    if (!ch || !this.ctx || Math.abs(ch.occlusion - amount) < 0.01) return
    ch.occlusion = amount
    const t = this.ctx.currentTime
    ch.occ.frequency.setTargetAtTime(20000 * Math.pow(650 / 20000, amount), t, 0.12)
    ch.occGain.gain.setTargetAtTime(1 - 0.5 * amount, t, 0.12)
  }

  setParams(id: string, p: Partial<ChannelParams>) {
    const ch = this.channels.get(id)
    const ctx = this.ctx
    if (!ch || !ctx) return
    const t = ctx.currentTime
    if (p.volume !== undefined) ch.vol.gain.setTargetAtTime(p.volume * p.volume * 1.4, t, 0.08)
    if (p.tone !== undefined) ch.tone.frequency.setTargetAtTime(180 * Math.pow(20000 / 180, p.tone), t, 0.08)
    if (p.reverb !== undefined) {
      ch.reverbAmt = p.reverb
      ch.lastX = NaN // force send recompute
    }
    if (p.eqLow !== undefined) ch.eqLow.gain.setTargetAtTime(p.eqLow * 12, t, 0.05)
    if (p.eqMid !== undefined) ch.eqMid.gain.setTargetAtTime(p.eqMid * 12, t, 0.05)
    if (p.eqHigh !== undefined) ch.eqHigh.gain.setTargetAtTime(p.eqHigh * 12, t, 0.05)
    if (p.realism !== undefined) this.setRealism(ch, p.realism)
    if (p.crush !== undefined || p.freeze !== undefined) {
      const fx = this.ensureFx(ch)
      if (fx) {
        if (p.crush !== undefined) {
          // 0 → off, 1 → 3-bit at 1/24 rate
          fx.parameters.get('bits')!.setValueAtTime(p.crush < 0.02 ? 0 : 12 - p.crush * 9, t)
          fx.parameters.get('downsample')!.setValueAtTime(1 + Math.round(p.crush * p.crush * 23), t)
        }
        if (p.freeze !== undefined) fx.parameters.get('freeze')!.setValueAtTime(p.freeze ? 1 : 0, t)
      }
    }
  }

  /** Lazily splice the effects worklet into a channel the first time it's needed. */
  private ensureFx(ch: Channel): AudioWorkletNode | null {
    if (ch.fx) return ch.fx
    if (!this.workletReady || !this.ctx) return null
    const fx = new AudioWorkletNode(this.ctx, 'orb-fx', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] })
    ch.fxIn.disconnect()
    ch.fxIn.connect(fx).connect(ch.eqLow)
    ch.fx = fx
    return fx
  }

  private setRealism(ch: Channel, r: number) {
    const ctx = this.ctx!
    ch.realism = r
    const t = ctx.currentTime
    // equal-power crossfade between synthesis and the field recording
    ch.synthGain.gain.setTargetAtTime(Math.cos((r * Math.PI) / 2), t, 0.15)
    ch.recGain.gain.setTargetAtTime(Math.sin((r * Math.PI) / 2) * 1.1, t, 0.15)
    const url = SOUND_MAP[ch.soundId]?.recording
    if (r > 0.001 && url && !ch.recSource) {
      loadBuffer(ctx, url).then((buf) => {
        if (!buf || ch.recSource || ch.disposed) return
        const src = ctx.createBufferSource()
        src.buffer = buf
        src.loop = true
        src.connect(ch.recGain)
        src.start(ctx.currentTime, Math.random() * buf.duration)
        ch.recSource = src
      })
    }
  }

  hasRecording(id: string) {
    const ch = this.channels.get(id)
    return !!(ch && SOUND_MAP[ch.soundId]?.recording)
  }

  /** Tape stop: pitch slides to zero over `dur` seconds. Call again to spin back up. */
  toggleTape(id: string, dur = 1.4): boolean {
    const ch = this.channels.get(id)
    const ctx = this.ctx
    if (!ch || !ctx) return false
    const t = ctx.currentTime
    const steps = 64
    const curve = new Float32Array(steps)
    const d = ch.tape.delayTime
    d.cancelScheduledValues(t)
    ch.tapeGain.gain.cancelScheduledValues(t)
    if (!ch.tapeStopped) {
      // delay growing as t²/2T makes playback speed fall linearly from 1 to 0
      for (let i = 0; i < steps; i++) {
        const tt = (i / (steps - 1)) * dur
        curve[i] = TAPE_BASE + (tt * tt) / (2 * dur)
      }
      d.setValueAtTime(TAPE_BASE, t)
      d.setValueCurveAtTime(curve, t, dur)
      ch.tapeGain.gain.setValueAtTime(1, t)
      ch.tapeGain.gain.setTargetAtTime(0, t + dur * 0.75, dur * 0.08)
      ch.tapeStopped = true
    } else {
      // spin-up: speed rises from 0 to 1 (delay grows as t − t²/2T)
      for (let i = 0; i < steps; i++) {
        const tt = (i / (steps - 1)) * dur
        curve[i] = TAPE_BASE + tt - (tt * tt) / (2 * dur)
      }
      d.setValueAtTime(TAPE_BASE, t)
      d.setValueCurveAtTime(curve, t + 0.001, dur)
      ch.tapeGain.gain.setValueAtTime(0, t)
      ch.tapeGain.gain.setTargetAtTime(1, t + 0.02, dur * 0.12)
      ch.tapeStopped = false
    }
    return ch.tapeStopped
  }

  private mutes = new Map<string, { muted: boolean; solo: boolean }>()
  setMuteSolo(id: string, muted: boolean, solo: boolean) {
    this.mutes.set(id, { muted, solo })
    this.applyMutes()
  }
  private applyMutes() {
    if (!this.ctx) return
    for (const id of this.mutes.keys()) if (!this.channels.has(id)) this.mutes.delete(id)
    this.soloActive = [...this.mutes.values()].some((m) => m.solo)
    for (const [id, ch] of this.channels) {
      const m = this.mutes.get(id)
      const audible = m ? !m.muted && (!this.soloActive || m.solo) : !this.soloActive
      ch.mute.gain.setTargetAtTime(audible ? 1 : 0, this.ctx.currentTime, 0.05)
    }
  }

  setMasterVolume(v: number) {
    if (!this.ctx) return
    this.master.gain.setTargetAtTime(v * v, this.ctx.currentTime, 0.12)
  }

  /** Global reverb amount (0..1). */
  setSpace(v: number) {
    if (!this.ctx) return
    this.wet.gain.setTargetAtTime(v * 1.8, this.ctx.currentTime, 0.2)
  }

  /** -1 dark … +1 bright. */
  setWarmth(v: number) {
    if (!this.ctx) return
    this.warmth.gain.setTargetAtTime(v * 9, this.ctx.currentTime, 0.2)
  }

  setDoppler(on: boolean) {
    this.doppler = on
    for (const ch of this.channels.values()) ch.lastX = NaN
  }

  setEvolve(on: boolean) {
    this.evolve = on
    if (on && this.ctx) this.evolveStart = this.ctx.currentTime - 60 // start just past calm
    if (this.ctx) this.applyEvolve(this.ctx.currentTime)
  }

  /** Listener heading in radians, 0 = facing up the screen, clockwise positive. */
  setHeading(rad: number) {
    const ctx = this.ctx
    if (!ctx) return
    const L = ctx.listener
    const fx = Math.sin(rad)
    const fz = -Math.cos(rad)
    if (L.forwardX) {
      const t = ctx.currentTime
      L.forwardX.setTargetAtTime(fx, t, 0.03)
      L.forwardY.setTargetAtTime(0, t, 0.03)
      L.forwardZ.setTargetAtTime(fz, t, 0.03)
      L.upX.value = 0
      L.upY.value = 1
      L.upZ.value = 0
    } else L.setOrientation(fx, 0, fz, 0, 1, 0)
  }

  /** Soft interface click — used as a haptic stand-in on devices without vibration. */
  uiTick(kind: 'snap' | 'cross' | 'soft' = 'soft') {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    const f = kind === 'snap' ? 1650 : kind === 'cross' ? 2400 : 1200
    o.frequency.setValueAtTime(f, t)
    o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.04)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(kind === 'snap' ? 0.5 : 0.25, t + 0.002)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)
    o.connect(g).connect(this.uiOut)
    o.start(t)
    o.stop(t + 0.08)
  }

  async suspend() {
    await this.ctx?.suspend()
  }
  async resume() {
    await this.ctx?.resume()
  }

  /** RMS level of a channel, lightly smoothed with fast attack / slow release. */
  level(id: string): number {
    const ch = this.channels.get(id)
    if (!ch) return 0
    ch.analyser.getFloatTimeDomainData(ch.buf)
    let s = 0
    for (let i = 0; i < ch.buf.length; i += 2) s += ch.buf[i] * ch.buf[i]
    const rms = Math.sqrt(s / (ch.buf.length / 2))
    const target = Math.min(1, rms * 4.5)
    ch.level += (target - ch.level) * (target > ch.level ? 0.5 : 0.08)
    return ch.level
  }

  spectrum(id: string | null, out: Uint8Array<ArrayBuffer>) {
    const a = id ? this.channels.get(id)?.analyser : this.analyser
    if (a) a.getByteFrequencyData(out)
    else out.fill(0)
  }

  /** Stereo time-domain snapshot of the master for the phase scope. */
  stereo(l: Float32Array<ArrayBuffer>, r: Float32Array<ArrayBuffer>) {
    if (!this.analyserL) return
    this.analyserL.getFloatTimeDomainData(l)
    this.analyserR.getFloatTimeDomainData(r)
  }

  /** Master RMS plus low / mid / high band energies (smoothed), for the background shader. */
  readMasterLevel(): number {
    if (!this.analyser) return 0
    this.analyser.getFloatTimeDomainData(this.masterBuf)
    let s = 0
    for (let i = 0; i < this.masterBuf.length; i += 4) s += this.masterBuf[i] ** 2
    const rms = Math.sqrt(s / (this.masterBuf.length / 4))
    this.masterLevel += (Math.min(1, rms * 3) - this.masterLevel) * 0.1
    this.analyser.getByteFrequencyData(this.freqBuf)
    const hz = this.ctx!.sampleRate / this.analyser.fftSize
    const band = (lo: number, hi: number) => {
      let m = 0
      const a = Math.max(1, Math.floor(lo / hz))
      const b = Math.min(this.freqBuf.length - 1, Math.floor(hi / hz))
      for (let i = a; i <= b; i++) m += this.freqBuf[i]
      return m / ((b - a + 1) * 255)
    }
    const k = 0.12
    this.bands.low += (Math.min(1, band(20, 220) * 1.6) - this.bands.low) * k
    this.bands.mid += (Math.min(1, band(220, 2200) * 2) - this.bands.mid) * k
    this.bands.high += (Math.min(1, band(2200, 12000) * 3) - this.bands.high) * k
    return this.masterLevel
  }

  get recording() {
    return this.recorder?.state === 'recording'
  }

  startRecording(): boolean {
    if (!this.ctx || typeof MediaRecorder === 'undefined') return false
    const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm']
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported(t))
    this.chunks = []
    this.recorder = new MediaRecorder(this.recordDest.stream, mimeType ? { mimeType, audioBitsPerSecond: 256000 } : undefined)
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data)
    this.recorder.start(1000)
    return true
  }

  stopRecording(): Promise<Blob | null> {
    const rec = this.recorder
    if (!rec || rec.state !== 'recording') return Promise.resolve(null)
    return new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(this.chunks, { type: rec.mimeType || 'audio/webm' }))
      rec.stop()
      this.recorder = null
    })
  }

  dispose() {
    clearInterval(this.timer)
    this.ctx?.close()
  }
}

export const engine = new AudioEngine()
