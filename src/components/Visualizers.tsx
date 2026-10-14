import { useEffect, useRef } from 'react'
import { engine } from '../audio/engine'

export function useFrame(cb: (t: number) => void) {
  const ref = useRef(cb)
  ref.current = cb
  useEffect(() => {
    let raf = 0
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop)
      ref.current(t)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
}

function fitCanvas(c: HTMLCanvasElement, height: number) {
  const dpr = Math.min(2, devicePixelRatio)
  const w = c.clientWidth
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(height * dpr)) {
    c.width = Math.round(w * dpr)
    c.height = Math.round(height * dpr)
  }
  const g = c.getContext('2d')!
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { g, w, dpr }
}

/** Mirrored, glowing frequency spectrum for one channel (or the master when id is null). */
export function Spectrum({ id, colors, height = 88 }: { id: string | null; colors: [string, string]; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const data = useRef(new Uint8Array(256))
  const smooth = useRef(new Float32Array(48))
  useFrame(() => {
    const c = ref.current
    if (!c) return
    const { g, w } = fitCanvas(c, height)
    g.clearRect(0, 0, w, height)
    if (!engine.started) return
    if (data.current.length !== 256) data.current = new Uint8Array(256)
    engine.spectrum(id, data.current)
    const bars = smooth.current.length
    const grad = g.createLinearGradient(0, 0, w, 0)
    grad.addColorStop(0, colors[0])
    grad.addColorStop(1, colors[1])
    g.fillStyle = grad
    g.shadowColor = colors[0]
    g.shadowBlur = 12
    const bw = w / bars
    const mid = height / 2
    const n = data.current.length
    for (let i = 0; i < bars; i++) {
      // logarithmic bin mapping so lows aren't squashed
      const lo = Math.floor(Math.pow(n, i / bars))
      const hi = Math.max(lo + 1, Math.floor(Math.pow(n, (i + 1) / bars)))
      let m = 0
      for (let k = lo; k < hi && k < n; k++) m = Math.max(m, data.current[k])
      const v = m / 255
      smooth.current[i] += (v - smooth.current[i]) * (v > smooth.current[i] ? 0.6 : 0.12)
      const hgt = Math.max(1.5, smooth.current[i] * (mid - 2))
      g.beginPath()
      g.roundRect(i * bw + bw * 0.18, mid - hgt, bw * 0.64, hgt * 2, bw * 0.32)
      g.fill()
    }
  })
  return <canvas ref={ref} className="block w-full" style={{ height }} />
}

/** Scrolling waterfall spectrogram: time flows downward, frequency (log) left → right. */
export function Waterfall({ id, colors, height = 88 }: { id: string | null; colors: [string, string]; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  // channel analysers expose 256 bins, the master 1024
  const data = useRef(new Uint8Array(id ? 256 : 1024))
  const lut = useRef<string[] | null>(null)
  useFrame(() => {
    const c = ref.current
    if (!c || !engine.started) return
    const { g, w, dpr } = fitCanvas(c, height)
    if (!lut.current) lut.current = buildLut(colors)
    // shift existing pixels down by 2px
    g.save()
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.globalCompositeOperation = 'copy'
    g.drawImage(c, 0, 2 * dpr)
    g.restore()
    engine.spectrum(id, data.current)
    const n = data.current.length
    const cols = Math.floor(w / 2)
    for (let i = 0; i < cols; i++) {
      // log mapping starting at bin 2 so the low end isn't a few smeared blocks
      const bin = Math.min(n - 1, Math.floor(2 * Math.pow(n / 2, i / cols)))
      g.fillStyle = lut.current[data.current[bin]]
      g.fillRect(i * 2, 0, 2, 2)
    }
  })
  return <canvas ref={ref} className="block w-full rounded-xl" style={{ height }} />
}

function buildLut([a, b]: [string, string]) {
  const pa = hex(a)
  const pb = hex(b)
  return Array.from({ length: 256 }, (_, i) => {
    const v = i / 255
    const k = Math.pow(v, 1.6)
    // black → core colour → highlight → white-hot
    const mix = (x: number, y: number, t: number) => Math.round(x + (y - x) * t)
    let r: number, gg: number, bb: number
    if (k < 0.5) {
      const t = k / 0.5
      r = mix(4, pb[0], t); gg = mix(4, pb[1], t); bb = mix(12, pb[2], t)
    } else if (k < 0.85) {
      const t = (k - 0.5) / 0.35
      r = mix(pb[0], pa[0], t); gg = mix(pb[1], pa[1], t); bb = mix(pb[2], pa[2], t)
    } else {
      const t = (k - 0.85) / 0.15
      r = mix(pa[0], 255, t); gg = mix(pa[1], 255, t); bb = mix(pa[2], 255, t)
    }
    return `rgb(${r},${gg},${bb})`
  })
}

const hex = (h: string): [number, number, number] => {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * 3D phase scope (goniometer): the stereo image as a Lissajous figure, with past
 * frames receding into depth so the stereo field reads as a living sculpture.
 */
export function PhaseScope({ height = 150, color = '#c7d2fe' }: { height?: number; color?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const l = useRef(new Float32Array(1024))
  const r = useRef(new Float32Array(1024))
  const history = useRef<Float32Array[]>([])
  const autoGain = useRef(1)
  useFrame((t) => {
    const c = ref.current
    if (!c) return
    const { g, w } = fitCanvas(c, height)
    g.clearRect(0, 0, w, height)
    if (!engine.started) return
    engine.stereo(l.current, r.current)
    // mid/side projection rotated 45°: mono = vertical line, wide = horizontal spread
    const pts = new Float32Array(256)
    for (let i = 0; i < 128; i++) {
      const a = l.current[i * 8]
      const b = r.current[i * 8]
      pts[i * 2] = (b - a) * 0.7071
      pts[i * 2 + 1] = (a + b) * 0.7071
    }
    // auto-gain so quiet mixes still draw a readable figure
    let peak = 0.001
    for (let i = 0; i < 256; i++) peak = Math.max(peak, Math.abs(pts[i]))
    autoGain.current += (Math.min(6, 0.42 / peak) - autoGain.current) * 0.05
    for (let i = 0; i < 256; i++) pts[i] *= autoGain.current
    const hist = history.current
    hist.unshift(pts)
    if (hist.length > 18) hist.pop()
    const cx = w / 2
    const cy = height / 2
    const yaw = Math.sin(t / 4000) * 0.6
    const scale = Math.min(w, height) * 0.9
    // axes
    g.strokeStyle = 'rgba(255,255,255,0.08)'
    g.beginPath()
    g.moveTo(cx, 6)
    g.lineTo(cx, height - 6)
    g.moveTo(cx - height / 2, cy)
    g.lineTo(cx + height / 2, cy)
    g.stroke()
    for (let k = hist.length - 1; k >= 0; k--) {
      const depth = k * 0.09
      const persp = 1 / (1 + depth)
      const p = hist[k]
      g.strokeStyle = color
      g.globalAlpha = (1 - k / hist.length) * 0.8
      g.lineWidth = k === 0 ? 1.4 : 0.8
      g.beginPath()
      for (let i = 0; i < 128; i++) {
        const x = p[i * 2] * Math.cos(yaw) + depth * Math.sin(yaw) * 0.6
        const y = p[i * 2 + 1]
        const sx = cx + x * scale * persp
        const sy = cy - y * scale * persp - depth * 18
        if (i) g.lineTo(sx, sy)
        else g.moveTo(sx, sy)
      }
      g.stroke()
    }
    g.globalAlpha = 1
    g.fillStyle = 'rgba(255,255,255,0.35)'
    g.font = '9px Inter Variable, sans-serif'
    g.fillText('L', 8, cy + 3)
    g.fillText('R', w - 14, cy + 3)
    g.fillText('M', cx + 4, 12)
  })
  return <canvas ref={ref} className="block w-full" style={{ height }} />
}
