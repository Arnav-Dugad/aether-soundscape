/**
 * Per-orb effects processor, loaded as an AudioWorklet from a Blob URL.
 *  - bits / downsample: bit-crusher with sample-and-hold rate reduction (bits = 0 → off)
 *  - freeze: granular freeze — stops recording the input and sprays overlapping
 *    Hann-windowed grains from the last ~1.5 s, crossfading smoothly in and out.
 */
const SOURCE = /* js */ `
class OrbFx extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bits', defaultValue: 0, minValue: 0, maxValue: 16, automationRate: 'k-rate' },
      { name: 'downsample', defaultValue: 1, minValue: 1, maxValue: 64, automationRate: 'k-rate' },
      { name: 'freeze', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ]
  }
  constructor() {
    super()
    this.size = Math.floor(sampleRate * 2)
    this.buf = [new Float32Array(this.size), new Float32Array(this.size)]
    this.w = 0
    this.fx = 0
    this.grains = []
    this.untilGrain = 0
    this.hold = [0, 0]
    this.phase = 0
  }
  spawnGrain() {
    const len = Math.floor(sampleRate * (0.09 + Math.random() * 0.16))
    const back = Math.floor(sampleRate * (0.15 + Math.random() * 1.3)) + len
    this.grains.push({
      start: (this.w - back + this.size) % this.size,
      len,
      age: 0,
      rate: 1 + (Math.random() - 0.5) * 0.008,
      pan: Math.random() * 0.6 - 0.3,
    })
  }
  process(inputs, outputs, params) {
    const inp = inputs[0]
    const out = outputs[0]
    const n = out[0].length
    const bits = params.bits[0]
    const ds = Math.max(1, Math.floor(params.downsample[0]))
    const freeze = params.freeze[0] > 0.5
    const q = bits > 0 ? Math.pow(2, bits - 1) : 0
    for (let i = 0; i < n; i++) {
      const l = inp.length ? inp[0][i] : 0
      const r = inp.length > 1 ? inp[1][i] : l
      if (!freeze) {
        this.buf[0][this.w] = l
        this.buf[1][this.w] = r
        this.w = (this.w + 1) % this.size
      }
      this.fx += ((freeze ? 1 : 0) - this.fx) * 0.0006
      let gl = 0
      let gr = 0
      if (this.fx > 0.0005) {
        if (--this.untilGrain <= 0 && this.grains.length < 10) {
          this.spawnGrain()
          this.untilGrain = Math.floor(sampleRate * (0.025 + Math.random() * 0.03))
        }
        for (let g = this.grains.length - 1; g >= 0; g--) {
          const gr0 = this.grains[g]
          const pos = gr0.age * gr0.rate
          if (pos >= gr0.len) { this.grains.splice(g, 1); continue }
          const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * pos) / gr0.len)
          const idx = (gr0.start + Math.floor(pos)) % this.size
          gl += this.buf[0][idx] * win * (1 - gr0.pan)
          gr += this.buf[1][idx] * win * (1 + gr0.pan)
          gr0.age++
        }
        gl *= 0.42
        gr *= 0.42
      }
      let ml = l * (1 - this.fx) + gl * this.fx
      let mr = r * (1 - this.fx) + gr * this.fx
      if (ds > 1) {
        if (this.phase++ % ds === 0) { this.hold[0] = ml; this.hold[1] = mr }
        ml = this.hold[0]
        mr = this.hold[1]
      }
      if (q) {
        ml = Math.round(ml * q) / q
        mr = Math.round(mr * q) / q
      }
      out[0][i] = ml
      if (out.length > 1) out[1][i] = mr
    }
    return true
  }
}
registerProcessor('orb-fx', OrbFx)
`

let url: string | null = null
export function workletUrl() {
  url ??= URL.createObjectURL(new Blob([SOURCE], { type: 'application/javascript' }))
  return url
}
