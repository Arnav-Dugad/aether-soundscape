import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { engine, WORLD_RADIUS } from '../audio/engine'
import { SOUND_MAP } from '../audio/catalog'
import { RING_NAMES, RINGS, useStore } from '../store'
import { field, runtime } from '../runtime'
import { Orb, ringAt } from './Orb'
import { Glass, cx } from './ui'

/** Angular velocity (rad/s) of each ring in orbit mode — inner rings orbit faster, like planets. */
const ORBIT_SPEED = [0.24, 0.13, 0.075]

interface Ripple {
  x: number
  y: number
  r: number
  a: number
  color: string
}

export function Stage() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const trailRef = useRef<HTMLCanvasElement>(null)
  const fxRef = useRef<HTMLCanvasElement>(null)
  const [dims, setDims] = useState({ w: 800, h: 600, r: 260 })
  const orbs = useStore((s) => s.orbs)
  const magnet = useStore((s) => s.magnetRing)
  const [dropHover, setDropHover] = useState(false)

  // measure the stage and size the canvases for the device pixel ratio
  useEffect(() => {
    const el = wrapRef.current!
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      const h = el.clientHeight
      const r = Math.max(110, Math.min(w, h) / 2 - (w < 640 ? 46 : 64))
      setDims({ w, h, r })
      const dpr = Math.min(2, devicePixelRatio || 1)
      for (const c of [trailRef.current!, fxRef.current!]) {
        c.width = w * dpr
        c.height = h * dpr
        c.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // publish the radius in the same commit in which orbs re-lay themselves out (both are
  // layout effects), so the frame loop never sees a new radius with old pixel positions
  useLayoutEffect(() => {
    field.radius = dims.r
  }, [dims.r])

  // the single animation loop: orbit motion, audio positions, pulsing, trails, beams, ripples
  useEffect(() => {
    const trail = trailRef.current!.getContext('2d')!
    const fx = fxRef.current!.getContext('2d')!
    const ripples: Ripple[] = []
    const lastLevel = new Map<string, number>()
    let raf = 0
    let last = performance.now()
    let commitTimer = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const { w, h } = { w: wrapRef.current!.clientWidth, h: wrapRef.current!.clientHeight }
      const cx0 = w / 2
      const cy0 = h / 2
      const R = field.radius
      const st = useStore.getState()
      const playing = st.playing

      // fade trails
      trail.globalCompositeOperation = 'destination-out'
      trail.fillStyle = 'rgba(0,0,0,0.06)'
      trail.fillRect(0, 0, w, h)
      trail.globalCompositeOperation = 'lighter'
      fx.clearRect(0, 0, w, h)

      const master = engine.started ? engine.readMasterLevel() : 0
      const t = now / 1000

      for (const rt of runtime.values()) {
        // orbit mode: ring-locked orbs circle the listener
        if (st.orbit && playing && !rt.dragging && !rt.animating && rt.ring !== null) {
          const ang = Math.atan2(rt.my.get(), rt.mx.get()) + ORBIT_SPEED[rt.ring] * st.orbitSpeed * dt
          const rr = RINGS[rt.ring] * R
          rt.mx.set(Math.cos(ang) * rr)
          rt.my.set(Math.sin(ang) * rr)
        }
        const x = rt.mx.get()
        const y = rt.my.get()
        rt.nx = x / R
        rt.ny = y / R
        engine.setPosition(rt.id, rt.nx, rt.ny)

        const lvl = playing ? engine.level(rt.id) : 0
        rt.level = lvl
        rt.el?.style.setProperty('--lvl', lvl.toFixed(3))

        const sx = cx0 + x
        const sy = cy0 + y
        // refraction trail: chromatic split strokes along the path travelled
        if (!Number.isNaN(rt.px)) {
          const dist = Math.hypot(sx - rt.px, sy - rt.py)
          if (dist > 0.4 && dist < 200) {
            const nxv = -(sy - rt.py) / dist
            const nyv = (sx - rt.px) / dist
            trail.lineCap = 'round'
            const passes: [string, number][] = [['rgba(255,70,130,0.9)', 3], ['rgba(70,230,255,0.9)', -3], [rt.color, 0]]
            for (const [col, off] of passes) {
              trail.strokeStyle = col
              trail.globalAlpha = off === 0 ? 0.85 : 0.55
              trail.lineWidth = off === 0 ? 10 : 3.5
              trail.beginPath()
              trail.moveTo(rt.px + nxv * off, rt.py + nyv * off)
              trail.lineTo(sx + nxv * off, sy + nyv * off)
              trail.stroke()
            }
            trail.globalAlpha = 1
          }
        }
        rt.px = sx
        rt.py = sy

        // sound beam towards the listener with travelling wave packets
        const d = Math.hypot(x, y)
        if (d > 30 && playing) {
          const g = fx.createLinearGradient(sx, sy, cx0, cy0)
          g.addColorStop(0, hexA(rt.color, 0.05 + lvl * 0.4))
          g.addColorStop(1, hexA(rt.color, 0))
          fx.strokeStyle = g
          fx.lineWidth = 1 + lvl * 2.5
          fx.beginPath()
          fx.moveTo(sx, sy)
          fx.lineTo(cx0, cy0)
          fx.stroke()
          const seed = hashId(rt.id)
          for (let k = 0; k < 3; k++) {
            const p = (t * (0.35 + seed * 0.2) + k / 3 + seed) % 1
            const px = sx + (cx0 - sx) * p
            const py = sy + (cy0 - sy) * p
            fx.fillStyle = hexA(rt.color, (1 - p) * (0.15 + lvl * 0.8))
            fx.beginPath()
            fx.arc(px, py, 1.2 + lvl * 2, 0, Math.PI * 2)
            fx.fill()
          }
        }

        // transient detection → emit a ripple
        const prev = lastLevel.get(rt.id) ?? 0
        if (lvl - prev > 0.07 && ripples.length < 40) ripples.push({ x: sx, y: sy, r: 30, a: Math.min(0.6, (lvl - prev) * 3), color: rt.color })
        lastLevel.set(rt.id, lvl)
      }

      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i]
        rp.r += dt * 90
        rp.a -= dt * 0.9
        if (rp.a <= 0) {
          ripples.splice(i, 1)
          continue
        }
        fx.strokeStyle = hexA(rp.color, rp.a)
        fx.lineWidth = 1.2
        fx.beginPath()
        fx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2)
        fx.stroke()
      }

      // listener aura reacts to the whole mix
      const aura = fx.createRadialGradient(cx0, cy0, 0, cx0, cy0, 70 + master * 140)
      aura.addColorStop(0, `rgba(255,255,255,${0.1 + master * 0.35})`)
      aura.addColorStop(1, 'rgba(255,255,255,0)')
      fx.fillStyle = aura
      fx.beginPath()
      fx.arc(cx0, cy0, 70 + master * 140, 0, Math.PI * 2)
      fx.fill()

      // keep the store roughly in sync with orbiting positions (for persistence/sharing)
      commitTimer += dt
      if (st.orbit && commitTimer > 2) {
        commitTimer = 0
        useStore.setState((s) => ({
          orbs: s.orbs.map((o) => {
            const rt = runtime.get(o.id)
            return rt && !rt.dragging ? { ...o, x: rt.nx, y: rt.ny } : o
          }),
        }))
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [])

  const orbSize = Math.round(Math.max(46, Math.min(70, dims.r * 0.2)))

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDropHover(false)
    const soundId = e.dataTransfer.getData('application/x-aether-sound')
    if (!SOUND_MAP[soundId]) return
    const rect = wrapRef.current!.getBoundingClientRect()
    let x = (e.clientX - rect.left - rect.width / 2) / dims.r
    let y = (e.clientY - rect.top - rect.height / 2) / dims.r
    const n = Math.hypot(x, y)
    if (n > 1) {
      x /= n
      y /= n
    }
    const ring = ringAt(Math.min(n, 1))
    if (ring !== null && n > 0) {
      const k = RINGS[ring] / n
      x *= k
      y *= k
    }
    useStore.getState().addOrb(soundId, { x, y })
  }

  return (
    <Glass
      className="stage relative h-full w-full overflow-hidden rounded-[44px]"
      initial={{ opacity: 0, scale: 0.94, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 120, damping: 20, delay: 0.1 }}
    >
      <div
        ref={wrapRef}
        className="absolute inset-0"
        onPointerDown={() => useStore.getState().select(null)}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/x-aether-sound')) {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
            setDropHover(true)
          }
        }}
        onDragLeave={() => setDropHover(false)}
        onDrop={onDrop}
      >
        <FieldGrid r={dims.r} magnet={magnet} dropHover={dropHover} />
        <canvas ref={trailRef} className="pointer-events-none absolute inset-0 h-full w-full opacity-90 mix-blend-screen [filter:blur(2.5px)]" />
        <canvas ref={fxRef} className="pointer-events-none absolute inset-0 h-full w-full mix-blend-screen" />
        <Listener r={dims.r} />
        <AnimatePresence>
          {orbs.map((o) => (
            <Orb key={o.id} orb={o} radius={dims.r} size={orbSize} />
          ))}
        </AnimatePresence>
        <AnimatePresence>
          {orbs.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="pointer-events-none absolute inset-x-0 top-[calc(50%+64px)] text-center text-sm text-white/55"
            >
              Add a sound from the library — or drop one anywhere in the field
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="pointer-events-none absolute left-6 top-5 hidden text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35 sm:block">
        Spatial Field · {WORLD_RADIUS * 2}m
      </div>
    </Glass>
  )
}

function FieldGrid({ r, magnet, dropHover }: { r: number; magnet: number | null; dropHover: boolean }) {
  const size = r * 2 + 40
  const c = size / 2
  return (
    <svg
      className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-visible"
      width={size}
      height={size}
      aria-hidden
    >
      <defs>
        <radialGradient id="fieldFill">
          <stop offset="0" stopColor="rgba(255,255,255,0.07)" />
          <stop offset="0.7" stopColor="rgba(255,255,255,0.02)" />
          <stop offset="1" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>
      <circle cx={c} cy={c} r={r * 1.02} fill="url(#fieldFill)" />
      {/* crosshair */}
      <line x1={c - r} y1={c} x2={c + r} y2={c} stroke="rgba(255,255,255,.05)" />
      <line x1={c} y1={c - r} x2={c} y2={c + r} stroke="rgba(255,255,255,.05)" />
      {/* compass ticks */}
      {Array.from({ length: 72 }, (_, i) => {
        const a = (i / 72) * Math.PI * 2
        const major = i % 18 === 0
        const r0 = r * 1.02 + 6
        const r1 = r0 + (major ? 9 : 4)
        return (
          <line
            key={i}
            x1={c + Math.sin(a) * r0}
            y1={c - Math.cos(a) * r0}
            x2={c + Math.sin(a) * r1}
            y2={c - Math.cos(a) * r1}
            stroke={major ? 'rgba(255,255,255,.45)' : 'rgba(255,255,255,.14)'}
            strokeWidth={major ? 1.5 : 1}
            strokeLinecap="round"
          />
        )
      })}
      {RINGS.map((rr, i) => {
        const active = magnet === i
        return (
          <g key={i}>
            <motion.circle
              cx={c}
              cy={c}
              r={rr * r}
              fill="none"
              strokeDasharray={i === 2 ? '2 7' : '1 5'}
              strokeLinecap="round"
              className={cx('ring-flow', `ring-flow-${i}`)}
              animate={{
                stroke: active ? 'rgba(255,255,255,0.95)' : dropHover ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.3)',
                strokeWidth: active ? 2.5 : 1.4,
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            />
            <motion.circle
              cx={c}
              cy={c}
              r={rr * r}
              fill="none"
              stroke="white"
              animate={{ opacity: active ? 0.35 : 0, strokeWidth: active ? 14 : 4 }}
              style={{ filter: 'blur(8px)' }}
            />
            <text
              x={c}
              y={c - rr * r - 7}
              textAnchor="middle"
              className="fill-white/35 text-[9px] font-semibold uppercase tracking-[0.2em]"
            >
              {RING_NAMES[i]} · {(rr * WORLD_RADIUS).toFixed(1)}m
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** The listener: you. Drag around it to turn your head; double-click to face forward. */
function Listener({ r }: { r: number }) {
  const heading = useStore((s) => s.heading)
  const rot = useMotionValue(heading)
  const deg = useTransform(rot, (v) => (v * 180) / Math.PI)
  const dragging = useRef(false)
  const size = Math.max(64, Math.min(88, r * 0.26))

  useEffect(() => {
    const unsub = rot.on('change', (v) => engine.setHeading(v))
    return unsub
  }, [rot])
  useEffect(() => {
    if (!dragging.current) animate(rot, heading, { type: 'spring', stiffness: 200, damping: 22 })
  }, [heading, rot])

  const angleFrom = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const dx = e.clientX - (rect.left + rect.width / 2)
    const dy = e.clientY - (rect.top + rect.height / 2)
    return Math.atan2(dx, -dy)
  }
  const startRef = useRef({ a: 0, h: 0 })

  return (
    <div className="absolute left-1/2 top-1/2 z-10" style={{ width: 0, height: 0 }}>
      {/* hearing cone */}
      <motion.div
        className="pointer-events-none absolute"
        style={{
          width: r * 1.3,
          height: r * 1.3,
          left: -r * 0.65,
          top: -r * 0.65,
          rotate: deg,
          background:
            'conic-gradient(from -50deg, rgba(255,255,255,0.10), rgba(255,255,255,0) 100deg, rgba(255,255,255,0) 360deg)',
          WebkitMaskImage: 'radial-gradient(circle, black 0%, transparent 70%)',
          maskImage: 'radial-gradient(circle, black 0%, transparent 70%)',
          borderRadius: '50%',
        }}
      />
      <motion.div
        role="slider"
        aria-label="Listener heading"
        aria-valuenow={Math.round((heading * 180) / Math.PI)}
        tabIndex={0}
        className="listener group absolute grid cursor-grab touch-none place-items-center rounded-full active:cursor-grabbing"
        style={{ width: size, height: size, left: -size / 2, top: -size / 2 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.97 }}
        onPointerDown={(e) => {
          e.stopPropagation()
          e.currentTarget.setPointerCapture(e.pointerId)
          dragging.current = true
          startRef.current = { a: angleFrom(e), h: rot.get() }
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return
          rot.set(startRef.current.h + (angleFrom(e) - startRef.current.a))
        }}
        onPointerUp={() => {
          dragging.current = false
          const h = Math.atan2(Math.sin(rot.get()), Math.cos(rot.get()))
          rot.set(h)
          useStore.getState().set('heading', h)
        }}
        onDoubleClick={() => useStore.getState().set('heading', 0)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault()
            e.stopPropagation()
            useStore.getState().set('heading', heading + (e.key === 'ArrowLeft' ? -0.2 : 0.2))
          }
        }}
      >
        <div className="listener-pulse" />
        <motion.svg viewBox="0 0 48 48" width={size * 0.56} height={size * 0.56} style={{ rotate: deg }} aria-hidden>
          {/* top-down head: ears, face and a nose pointing where you're facing */}
          <ellipse cx="9" cy="25" rx="3.2" ry="5.5" fill="rgba(255,255,255,.75)" />
          <ellipse cx="39" cy="25" rx="3.2" ry="5.5" fill="rgba(255,255,255,.75)" />
          <circle cx="24" cy="25" r="14" fill="url(#headGrad)" />
          <path d="M24 5 L28.5 13 L19.5 13 Z" fill="white" />
          <defs>
            <radialGradient id="headGrad" cx="40%" cy="35%">
              <stop offset="0" stopColor="#fff" />
              <stop offset="1" stopColor="#c7d2fe" />
            </radialGradient>
          </defs>
        </motion.svg>
        <span className="tooltip !top-[calc(100%+12px)] !bottom-auto">Drag to turn your head</span>
      </motion.div>
    </div>
  )
}

const hashId = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return (Math.abs(h) % 1000) / 1000
}

const hexCache = new Map<string, [number, number, number]>()
function hexA(hex: string, a: number) {
  let c = hexCache.get(hex)
  if (!c) {
    const n = parseInt(hex.slice(1), 16)
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    hexCache.set(hex, c)
  }
  return `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`
}
