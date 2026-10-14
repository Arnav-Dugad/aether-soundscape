import type { ParticleKind } from '../audio/catalog'

interface Particle {
  kind: ParticleKind
  x: number
  y: number
  vx: number
  vy: number
  life: number
  age: number
  size: number
  seed: number
  color: string
}

/** Base spawn rate (per second) at full audio level for each particle style. */
const RATE: Record<ParticleKind, number> = {
  rain: 38, embers: 14, bubbles: 9, snow: 14, sparkles: 10, dust: 6, leaves: 3, notes: 2.5, steam: 4,
}

const MAX = 600

/** Lightweight canvas particle system: rain sheds droplets, fire sheds embers, and so on. */
export class Particles {
  private list: Particle[] = []

  spawn(kind: ParticleKind, x: number, y: number, radius: number, color: string, count: number) {
    for (let i = 0; i < count && this.list.length < MAX; i++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * radius
      const p: Particle = {
        kind, color, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r,
        vx: 0, vy: 0, age: 0, life: 1, size: 1, seed: Math.random() * 100,
      }
      switch (kind) {
        case 'rain':
          p.vx = 4; p.vy = 70 + Math.random() * 50; p.life = 0.5 + Math.random() * 0.4; p.size = 5 + Math.random() * 5
          break
        case 'embers':
          p.vx = (Math.random() - 0.5) * 14; p.vy = -(25 + Math.random() * 40); p.life = 1.2 + Math.random(); p.size = 1 + Math.random() * 1.4
          break
        case 'bubbles':
          p.vy = -(16 + Math.random() * 22); p.life = 1.6 + Math.random(); p.size = 1.5 + Math.random() * 2.5
          break
        case 'snow':
          p.vx = (Math.random() - 0.5) * 10; p.vy = 12 + Math.random() * 16; p.life = 2 + Math.random() * 1.5; p.size = 0.8 + Math.random() * 1.6
          break
        case 'sparkles':
          p.vx = Math.cos(a) * 18; p.vy = Math.sin(a) * 18; p.life = 0.6 + Math.random() * 0.6; p.size = 2 + Math.random() * 2.5
          break
        case 'dust':
          p.vx = (Math.random() - 0.5) * 8; p.vy = (Math.random() - 0.5) * 8; p.life = 2 + Math.random() * 2; p.size = 0.6 + Math.random()
          break
        case 'leaves':
          p.vx = (Math.random() - 0.5) * 10; p.vy = 14 + Math.random() * 10; p.life = 2.4 + Math.random(); p.size = 2.5 + Math.random() * 1.5
          break
        case 'notes':
          p.vx = (Math.random() - 0.5) * 6; p.vy = -(14 + Math.random() * 10); p.life = 1.8 + Math.random(); p.size = 9 + Math.random() * 4
          break
        case 'steam':
          p.vx = (Math.random() - 0.5) * 6; p.vy = -(10 + Math.random() * 12); p.life = 1.6 + Math.random() * 0.8; p.size = 4 + Math.random() * 4
          break
      }
      this.list.push(p)
    }
  }

  /** Accumulates fractional spawns so low rates still emit. Returns the new accumulator. */
  emit(kind: ParticleKind, x: number, y: number, radius: number, color: string, level: number, dt: number, acc: number) {
    acc += RATE[kind] * (0.15 + level * 1.8) * dt
    const n = Math.floor(acc)
    if (n > 0) this.spawn(kind, x, y, radius, color, n)
    return acc - n
  }

  draw(g: CanvasRenderingContext2D, dt: number, t: number) {
    const list = this.list
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i]
      p.age += dt
      if (p.age >= p.life) {
        list[i] = list[list.length - 1]
        list.pop()
        continue
      }
      const k = p.age / p.life
      const fade = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85
      let wob = 0
      if (p.kind === 'embers' || p.kind === 'bubbles' || p.kind === 'leaves' || p.kind === 'notes' || p.kind === 'snow')
        wob = Math.sin(t * 3 + p.seed) * 14
      p.x += (p.vx + wob) * dt
      p.y += p.vy * dt
      g.globalAlpha = Math.max(0, fade)
      switch (p.kind) {
        case 'rain':
          g.strokeStyle = 'rgba(190,225,255,0.7)'
          g.lineWidth = 1
          g.beginPath()
          g.moveTo(p.x, p.y)
          g.lineTo(p.x - p.vx * 0.04, p.y - p.size)
          g.stroke()
          break
        case 'embers': {
          const flick = 0.6 + 0.4 * Math.sin(t * 20 + p.seed * 7)
          g.fillStyle = `rgba(255,${Math.round(140 + 80 * (1 - k))},60,${flick})`
          g.beginPath()
          g.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, Math.PI * 2)
          g.fill()
          break
        }
        case 'bubbles':
          g.strokeStyle = 'rgba(200,240,255,0.8)'
          g.lineWidth = 0.8
          g.beginPath()
          g.arc(p.x, p.y, p.size * (1 + k * 0.4), 0, Math.PI * 2)
          g.stroke()
          break
        case 'snow':
        case 'dust':
          g.fillStyle = p.kind === 'snow' ? 'rgba(255,255,255,0.9)' : 'rgba(255,240,220,0.5)'
          g.beginPath()
          g.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          g.fill()
          break
        case 'sparkles': {
          const s = p.size * (1 - k) * (0.6 + 0.4 * Math.sin(t * 25 + p.seed))
          g.strokeStyle = p.color
          g.lineWidth = 1
          g.beginPath()
          g.moveTo(p.x - s, p.y)
          g.lineTo(p.x + s, p.y)
          g.moveTo(p.x, p.y - s)
          g.lineTo(p.x, p.y + s)
          g.stroke()
          break
        }
        case 'leaves':
          g.save()
          g.translate(p.x, p.y)
          g.rotate(t * 2 + p.seed)
          g.fillStyle = 'rgba(150,210,120,0.8)'
          g.beginPath()
          g.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, Math.PI * 2)
          g.fill()
          g.restore()
          break
        case 'notes':
          g.fillStyle = p.color
          g.font = `${p.size}px Inter Variable, sans-serif`
          g.fillText(p.seed > 50 ? '♪' : '♫', p.x, p.y)
          break
        case 'steam': {
          const r = p.size * (1 + k * 2.5)
          const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r)
          grad.addColorStop(0, 'rgba(255,255,255,0.18)')
          grad.addColorStop(1, 'rgba(255,255,255,0)')
          g.fillStyle = grad
          g.beginPath()
          g.arc(p.x, p.y, r, 0, Math.PI * 2)
          g.fill()
          break
        }
      }
    }
    g.globalAlpha = 1
  }
}
