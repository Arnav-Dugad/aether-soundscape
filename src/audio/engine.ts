import { createKit, type Kit, type Voice } from './kit'
import { SOUND_MAP } from './catalog'

/** Radius of the mixing field in virtual metres. */
export const WORLD_RADIUS = 8

interface Channel {
  voice: Voice
  tone: BiquadFilterNode
  vol: GainNode
  mute: GainNode
  air: BiquadFilterNode
  panner: PannerNode
  send: GainNode
  analyser: AnalyserNode
  buf: Float32Array<ArrayBuffer>
  level: number
  reverbAmt: number
  lastX: number
  lastY: number
}

/** Synthesise a lush stereo hall impulse response (early reflections + darkening tail). */
function makeImpulse(ctx: BaseAudioContext, seconds = 3.6): AudioBuffer {
  const rate = ctx.sampleRate
  const len = Math.floor(rate * seconds)
  const ir = ctx.createBuffer(2, len, rate)
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch)
    let lp = 0
    for (let i = 0; i < len; i++) {
      const t = i / rate
      const env = Math.pow(1 - i / len, 2.2) * Math.exp(-t * 1.6)
      // progressively darker tail: one-pole lowpass whose coefficient closes over time
      const k = 0.85 - 0.75 * (i / len)
      lp = lp + k * (Math.random() * 2 - 1 - lp)
      d[i] = lp * env * (t < 0.012 ? t / 0.012 : 1)
    }
    // sparse early reflections, decorrelated per channel
    for (let r = 0; r < 14; r++) {
      const at = Math.floor(rate * (0.008 + Math.random() * 0.08))
      d[at] += (Math.random() * 2 - 1) * 0.6 * (1 - r / 14)
    }
  }
  return ir
}

class AudioEngine {
  ctx: AudioContext | null = null
  private kit!: Kit
  private dry!: GainNode
  private wet!: GainNode
  private warmth!: BiquadFilterNode
  private master!: GainNode
  private analyser!: AnalyserNode
  private recordDest!: MediaStreamAudioDestinationNode
  private channels = new Map<string, Channel>()
  private timer: number | undefined
  private masterBuf!: Float32Array<ArrayBuffer>
  masterLevel = 0
  private soloActive = false
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []

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
    const reverb = ctx.createConvolver()
    reverb.buffer = makeImpulse(ctx)
    this.wet = ctx.createGain()
    this.wet.gain.value = 0.9
    // pre-delay before the hall
    const pre = ctx.createDelay(0.2)
    pre.delayTime.value = 0.025
    this.wet.connect(pre).connect(reverb)

    const sum = ctx.createGain()
    this.dry.connect(sum)
    const ret = ctx.createGain()
    ret.gain.value = 0.55
    reverb.connect(ret).connect(sum)

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
    this.recordDest = ctx.createMediaStreamDestination()

    sum.connect(this.warmth).connect(glue).connect(limiter).connect(this.master)
    this.master.connect(this.analyser)
    this.master.connect(ctx.destination)
    this.master.connect(this.recordDest)

    const L = ctx.listener
    if (L.positionX) {
      L.positionX.value = 0
      L.positionY.value = 0
      L.positionZ.value = 0
    }
    this.setHeading(0)

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
  }

  addChannel(id: string, soundId: string) {
    const ctx = this.ctx
    const def = SOUND_MAP[soundId]
    if (!ctx || !def || this.channels.has(id)) return
    const voice = def.factory(this.kit)
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 20000
    tone.Q.value = 0.5
    const vol = ctx.createGain()
    vol.gain.value = 0
    const mute = ctx.createGain()
    const air = ctx.createBiquadFilter()
    air.type = 'lowpass'
    air.frequency.value = 18000
    const panner = new PannerNode(ctx, {
      panningModel: 'HRTF',
      distanceModel: 'inverse',
      refDistance: 1.4,
      maxDistance: 40,
      rolloffFactor: 1.1,
    })
    const send = ctx.createGain()
    send.gain.value = 0.2
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.7

    voice.output.connect(tone).connect(vol).connect(mute).connect(air).connect(panner).connect(this.dry)
    panner.connect(send).connect(this.wet)
    vol.connect(analyser)

    this.channels.set(id, {
      voice, tone, vol, mute, air, panner, send, analyser,
      buf: new Float32Array(analyser.fftSize),
      level: 0, reverbAmt: 0.5, lastX: NaN, lastY: NaN,
    })
    this.applyMutes()
  }

  removeChannel(id: string) {
    const ch = this.channels.get(id)
    const ctx = this.ctx
    if (!ch || !ctx) return
    this.channels.delete(id)
    ch.vol.gain.cancelScheduledValues(ctx.currentTime)
    ch.vol.gain.setTargetAtTime(0, ctx.currentTime, 0.12)
    setTimeout(() => {
      ch.voice.dispose()
      ch.panner.disconnect()
      ch.vol.disconnect()
    }, 900)
  }

  hasChannel(id: string) {
    return this.channels.has(id)
  }

  /** Position in normalised field space: x right, y down (towards the listener's back). */
  setPosition(id: string, nx: number, ny: number) {
    const ch = this.channels.get(id)
    const ctx = this.ctx
    if (!ch || !ctx) return
    if (Math.abs(ch.lastX - nx) < 0.0005 && Math.abs(ch.lastY - ny) < 0.0005) return
    ch.lastX = nx
    ch.lastY = ny
    let x = nx * WORLD_RADIUS
    let z = ny * WORLD_RADIUS
    const d = Math.hypot(x, z)
    // keep sources just outside the head so HRTF stays stable
    if (d < 0.35) {
      const k = d === 0 ? 0 : 0.35 / d
      x = d === 0 ? 0 : x * k
      z = d === 0 ? -0.35 : z * k
    }
    const t = ctx.currentTime
    const p = ch.panner
    if (p.positionX) {
      p.positionX.setTargetAtTime(x, t, 0.04)
      p.positionY.setTargetAtTime(0, t, 0.04)
      p.positionZ.setTargetAtTime(z, t, 0.04)
    } else p.setPosition(x, 0, z)
    // air absorption: distant sources lose their top end
    const dist = Math.max(d, 0.35)
    ch.air.frequency.setTargetAtTime(600 + 19000 * Math.exp(-dist / 4.2), t, 0.06)
    // distance drives the reverb send — far things sound roomier
    const norm = Math.min(dist / WORLD_RADIUS, 1.3)
    ch.send.gain.setTargetAtTime((0.06 + 0.75 * Math.pow(norm, 1.3)) * ch.reverbAmt * 2, t, 0.08)
  }

  setVolume(id: string, v: number) {
    const ch = this.channels.get(id)
    if (!ch || !this.ctx) return
    ch.vol.gain.setTargetAtTime(v * v * 1.4, this.ctx.currentTime, 0.08)
  }

  /** 0 = muffled, 1 = fully open. */
  setTone(id: string, v: number) {
    const ch = this.channels.get(id)
    if (!ch || !this.ctx) return
    ch.tone.frequency.setTargetAtTime(180 * Math.pow(20000 / 180, v), this.ctx.currentTime, 0.08)
  }

  setReverb(id: string, v: number) {
    const ch = this.channels.get(id)
    if (!ch) return
    ch.reverbAmt = v
    ch.lastX = NaN // force send recompute
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

  readMasterLevel(): number {
    if (!this.analyser) return 0
    this.analyser.getFloatTimeDomainData(this.masterBuf)
    let s = 0
    for (let i = 0; i < this.masterBuf.length; i += 4) s += this.masterBuf[i] ** 2
    const rms = Math.sqrt(s / (this.masterBuf.length / 4))
    this.masterLevel += (Math.min(1, rms * 3) - this.masterLevel) * 0.1
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
