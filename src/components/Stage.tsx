import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { engine, WORLD_RADIUS } from '../audio/engine'
import { SOUND_MAP } from '../audio/catalog'
import { RINGS, useStore, type OrbState } from '../store'
import { field, runtime } from '../runtime'
import { morph } from '../morph'
import { silently } from '../history'
import { inPolygon, resampleLoop, sampleLoop, segmentsIntersect, type Pt } from '../lib/geometry'
import { Particles } from '../lib/particles'
import { haptic } from '../lib/haptics'
import { Orb, ringAt } from './Orb'
import { FieldGrid, Listener, PathsOverlay, Walls } from './Field'
import { Glass } from './ui'

/** Angular velocity (rad/s) of each ring in orbit mode — inner rings orbit faster, like planets. */
const ORBIT_SPEED = [0.24, 0.13, 0.075]
const GROUP_ORBIT_SPEED = 0.12
const BREATH_PERIOD = 10 // 6 breaths per minute

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
  const breathTextRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 800, h: 600, base: 260 })
  const orbs = useStore((s) => s.orbs)
  const magnet = useStore((s) => s.magnetRing)
  const zoom = useStore((s) => s.zoom)
  const tilt = useStore((s) => s.tilt)
  const breathe = useStore((s) => s.breathe)
  const drawPathFor = useStore((s) => s.drawPathFor)
  const [dropHover, setDropHover] = useState(false)
  const [drawing, setDrawing] = useState<Pt[] | null>(null)
  const [lasso, setLasso] = useState<Pt[] | null>(null)
  const r = Math.round(dims.base * zoom)

  // breathing scale + 3D tilt live on the field layer
  const breathMV = useMotionValue(1)
  const rotX = useSpring(0, { stiffness: 120, damping: 20 })
  const rotY = useSpring(0, { stiffness: 120, damping: 20 })
  useEffect(() => {
    rotX.set(tilt ? 24 : 0)
    rotY.set(0)
  }, [tilt, rotX, rotY])

  useEffect(() => {
    const el = wrapRef.current!
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      const h = el.clientHeight
      const base = Math.max(110, Math.min(w, h) / 2 - (w < 640 ? 46 : 64))
      setDims({ w, h, base })
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
    field.radius = r
  }, [r])

  /** Client coordinates → normalised field coordinates (accounts for the breathing scale). */
  const toNorm = useCallback(
    (clientX: number, clientY: number): Pt => {
      const rect = wrapRef.current!.getBoundingClientRect()
      const s = field.radius * field.breath
      return [(clientX - rect.left - rect.width / 2) / s, (clientY - rect.top - rect.height / 2) / s]
    },
    [],
  )

  // ─── the single animation loop ──────────────────────────────────────────────
  useEffect(() => {
    const trail = trailRef.current!.getContext('2d')!
    const fx = fxRef.current!.getContext('2d')!
    const ripples: Ripple[] = []
    const particles = new Particles()
    const lastLevel = new Map<string, number>()
    let raf = 0
    let last = performance.now()
    let commitTimer = 0
    let lastBreathWord = ''
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const wrap = wrapRef.current
      if (!wrap) return
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      const cx0 = w / 2
      const cy0 = h / 2
      const R = field.radius
      morph.step(now)
      const st = useStore.getState()
      const playing = st.playing
      const t = now / 1000

      // breathing: the whole field swells on the inhale and settles on the exhale
      let b = 0
      if (st.breathe) {
        b = Math.sin((2 * Math.PI * t) / BREATH_PERIOD)
        field.breath = 1 + 0.07 * b
        const word = Math.cos((2 * Math.PI * t) / BREATH_PERIOD) > 0 ? 'Breathe in' : 'Breathe out'
        if (word !== lastBreathWord && breathTextRef.current) {
          lastBreathWord = word
          breathTextRef.current.textContent = word
        }
      } else field.breath += (1 - field.breath) * 0.08
      breathMV.set(field.breath)
      const audioBreath = 1 + (field.breath - 1) * 3

      trail.globalCompositeOperation = 'destination-out'
      trail.fillStyle = 'rgba(0,0,0,0.06)'
      trail.fillRect(0, 0, w, h)
      trail.globalCompositeOperation = 'lighter'
      fx.clearRect(0, 0, w, h)

      const master = engine.started ? engine.readMasterLevel() : 0
      const byId = new Map<string, OrbState>(st.orbs.map((o) => [o.id, o]))
      const ringEnergy = [0, 0, 0]
      let moved = false

      for (const rt of runtime.values()) {
        const orb = byId.get(rt.id)
        if (!orb) continue
        const owned = morph.owns(rt.id)
        if (!rt.dragging && !rt.animating && !owned && playing) {
          if (orb.path && orb.path.pts.length > 3) {
            // follow the drawn loop at constant speed
            rt.pathT += (dt * orb.path.speed) / 60
            const [px, py] = sampleLoop(orb.path.pts, rt.pathT)
            rt.mx.set(px * R)
            rt.my.set(py * R)
            moved = true
          } else if (orb.groupId && st.groups[orb.groupId]?.orbit) {
            const a = GROUP_ORBIT_SPEED * st.orbitSpeed * dt
            const x = rt.mx.get()
            const y = rt.my.get()
            rt.mx.set(x * Math.cos(a) - y * Math.sin(a))
            rt.my.set(x * Math.sin(a) + y * Math.cos(a))
            moved = true
          } else if (st.orbit && rt.ring !== null && !orb.groupId) {
            const ang = Math.atan2(rt.my.get(), rt.mx.get()) + ORBIT_SPEED[rt.ring] * st.orbitSpeed * dt
            const rr = RINGS[rt.ring] * R
            rt.mx.set(Math.cos(ang) * rr)
            rt.my.set(Math.sin(ang) * rr)
            moved = true
          }
        }
        const x = rt.mx.get()
        const y = rt.my.get()
        rt.nx = x / R
        rt.ny = y / R
        if (!owned) rt.nz = orb.z
        engine.setPosition(rt.id, rt.nx * audioBreath, rt.ny * audioBreath, rt.nz)

        // occlusion: does any wall cut the line between this orb and the listener?
        let occ = false
        for (const wl of st.walls) {
          if (segmentsIntersect(0, 0, rt.nx, rt.ny, wl.x1, wl.y1, wl.x2, wl.y2)) {
            occ = true
            break
          }
        }
        if (occ !== rt.occluded) {
          rt.occluded = occ
          engine.setOcclusion(rt.id, occ ? 1 : 0)
          if (rt.el) rt.el.dataset.occluded = occ ? '1' : '0'
        }

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
          const a0 = (0.05 + lvl * 0.4) * (occ ? 0.35 : 1)
          g.addColorStop(0, hexA(rt.color, a0))
          g.addColorStop(1, hexA(rt.color, 0))
          fx.strokeStyle = g
          fx.lineWidth = 1 + lvl * 2.5
          fx.setLineDash(occ ? [3, 5] : [])
          fx.beginPath()
          fx.moveTo(sx, sy)
          fx.lineTo(cx0, cy0)
          fx.stroke()
          fx.setLineDash([])
          if (!occ) {
            const seed = hashId(rt.id)
            for (let k = 0; k < 3; k++) {
              const p = (t * (0.35 + seed * 0.2) + k / 3 + seed) % 1
              fx.fillStyle = hexA(rt.color, (1 - p) * (0.15 + lvl * 0.8))
              fx.beginPath()
              fx.arc(sx + (cx0 - sx) * p, sy + (cy0 - sy) * p, 1.2 + lvl * 2, 0, Math.PI * 2)
              fx.fill()
            }
          }
        }

        // ring feedback: the orb's ring glows locally around it, in time with its sound
        const n = d / R
        const ringIdx = ringAt(n)
        if (ringIdx !== null && playing) {
          ringEnergy[ringIdx] += lvl
          const ang = Math.atan2(y, x)
          const span = 0.18 + lvl * 0.55
          fx.save()
          fx.shadowColor = rt.color
          fx.shadowBlur = 10 + lvl * 20
          fx.strokeStyle = hexA(rt.color, 0.2 + lvl * 0.7)
          fx.lineWidth = 1.5 + lvl * 3
          fx.lineCap = 'round'
          fx.beginPath()
          fx.arc(cx0, cy0, RINGS[ringIdx] * R, ang - span, ang + span)
          fx.stroke()
          fx.restore()
        }

        // particles shed by the orb (droplets, embers, bubbles…)
        const kind = SOUND_MAP[rt.soundId]?.particles
        if (kind && playing && !orb.muted) rt.spawn = particles.emit(kind, sx, sy, 16, rt.color, lvl, dt, rt.spawn)

        // transient detection → emit a ripple
        const prev = lastLevel.get(rt.id) ?? 0
        if (lvl - prev > 0.07 && ripples.length < 40) ripples.push({ x: sx, y: sy, r: 30, a: Math.min(0.6, (lvl - prev) * 3), color: rt.color })
        lastLevel.set(rt.id, lvl)
      }

      // whole rings breathe with the energy of the orbs riding them
      for (let i = 0; i < 3; i++) {
        const e = Math.min(1, ringEnergy[i])
        if (e < 0.02) continue
        fx.strokeStyle = `rgba(255,255,255,${(e * 0.12).toFixed(3)})`
        fx.lineWidth = 1 + e * 3
        fx.beginPath()
        fx.arc(cx0, cy0, RINGS[i] * R, 0, Math.PI * 2)
        fx.stroke()
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
      particles.draw(fx, dt, t)

      // listener aura reacts to the whole mix
      const auraR = 70 + master * 140
      const aura = fx.createRadialGradient(cx0, cy0, 0, cx0, cy0, auraR)
      aura.addColorStop(0, `rgba(255,255,255,${0.1 + master * 0.35})`)
      aura.addColorStop(1, 'rgba(255,255,255,0)')
      fx.fillStyle = aura
      fx.beginPath()
      fx.arc(cx0, cy0, auraR, 0, Math.PI * 2)
      fx.fill()

      if (st.breathe) {
        // breathing guide ring
        const br = R * (0.18 + 0.08 * (b + 1))
        fx.strokeStyle = 'rgba(199,210,254,0.55)'
        fx.lineWidth = 2
        fx.shadowColor = 'rgba(199,210,254,0.9)'
        fx.shadowBlur = 18
        fx.beginPath()
        fx.arc(cx0, cy0, br, 0, Math.PI * 2)
        fx.stroke()
        fx.shadowBlur = 0
      }

      // keep the store roughly in sync with self-moving orbs (for persistence/sharing),
      // without polluting undo history
      commitTimer += dt
      if (moved && commitTimer > 2) {
        commitTimer = 0
        silently(() =>
          useStore.setState((s) => ({
            orbs: s.orbs.map((o) => {
              const rt = runtime.get(o.id)
              return rt && !rt.dragging && !rt.animating ? { ...o, x: rt.nx, y: rt.ny } : o
            }),
          })),
        )
      }
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [breathMV])

  // ctrl/⌘ + wheel (and trackpad pinch) zooms the field — needs a non-passive listener
  useEffect(() => {
    const el = wrapRef.current!
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const st = useStore.getState()
      st.set('zoom', clampZoom(st.zoom * Math.exp(-e.deltaY * 0.004)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ─── pointer gestures on empty space: lasso, path drawing, pinch / rotate ────
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<
    | { kind: 'press'; x: number; y: number; additive: boolean }
    | { kind: 'lasso'; pts: Pt[]; additive: boolean }
    | { kind: 'draw'; pts: Pt[] }
    | { kind: 'pinch'; d0: number; a0: number; zoom0: number; heading0: number }
    | null
  >(null)

  const pinchInfo = () => {
    const [p, q] = [...pointers.current.values()]
    return { d: Math.hypot(q.x - p.x, q.y - p.y), a: Math.atan2(q.y - p.y, q.x - p.x) }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    e.currentTarget.setPointerCapture(e.pointerId)
    const st = useStore.getState()
    if (pointers.current.size === 2) {
      const { d, a } = pinchInfo()
      gesture.current = { kind: 'pinch', d0: d, a0: a, zoom0: st.zoom, heading0: st.heading }
      setLasso(null)
      setDrawing(null)
      return
    }
    if (st.drawPathFor) {
      const pts: Pt[] = [toNorm(e.clientX, e.clientY)]
      gesture.current = { kind: 'draw', pts }
      setDrawing(pts)
      return
    }
    gesture.current = { kind: 'press', x: e.clientX, y: e.clientY, additive: e.shiftKey || e.metaKey }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (tilt && e.pointerType === 'mouse') {
      const rect = e.currentTarget.getBoundingClientRect()
      rotX.set(24 - ((e.clientY - rect.top) / rect.height - 0.5) * 12)
      rotY.set(((e.clientX - rect.left) / rect.width - 0.5) * 14)
    }
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (!g) return
    if (g.kind === 'pinch' && pointers.current.size === 2) {
      const { d, a } = pinchInfo()
      const st = useStore.getState()
      st.set('zoom', clampZoom(g.zoom0 * (d / g.d0)))
      st.set('heading', g.heading0 + (a - g.a0))
    } else if (g.kind === 'press' && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 6) {
      const pts: Pt[] = [toNorm(g.x, g.y), toNorm(e.clientX, e.clientY)]
      gesture.current = { kind: 'lasso', pts, additive: g.additive }
      setLasso(pts)
    } else if (g.kind === 'lasso' || g.kind === 'draw') {
      const p = toNorm(e.clientX, e.clientY)
      const lastP = g.pts[g.pts.length - 1]
      if (Math.hypot(p[0] - lastP[0], p[1] - lastP[1]) > 0.008) {
        g.pts = [...g.pts, p]
        if (g.kind === 'lasso') setLasso(g.pts)
        else setDrawing(g.pts)
      }
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    const st = useStore.getState()
    if (g?.kind === 'pinch') {
      if (pointers.current.size === 0) gesture.current = null
      return
    }
    gesture.current = null
    if (!g) return
    if (g.kind === 'press') {
      st.select(null)
    } else if (g.kind === 'lasso') {
      setLasso(null)
      const hits = [...runtime.values()].filter((rt) => inPolygon(rt.nx, rt.ny, g.pts)).map((rt) => rt.id)
      const ids = g.additive ? [...new Set([...st.multi, ...hits])] : hits
      st.setSelection(ids)
      if (hits.length) haptic('soft')
    } else if (g.kind === 'draw') {
      setDrawing(null)
      const id = st.drawPathFor
      if (id && g.pts.length > 8) {
        const pts = resampleLoop(g.pts.map(([x, y]) => clampToField(x, y)))
        st.updateOrb(id, { path: { pts, speed: 2 } })
        const rt = runtime.get(id)
        if (rt) rt.pathT = 0
        st.toast('Path set — the orb will travel this loop')
        haptic('snap')
      }
      st.set('drawPathFor', null)
    }
  }

  const orbSize = Math.round(Math.max(46, Math.min(70, dims.base * 0.2)))

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDropHover(false)
    const soundId = e.dataTransfer.getData('application/x-aether-sound')
    if (!SOUND_MAP[soundId]) return
    let [x, y] = toNorm(e.clientX, e.clientY)
    const n = Math.hypot(x, y)
    if (n > 1) {
      x /= n
      y /= n
    }
    const ring = ringAt(Math.min(n, 1))
    if (ring !== null && n > 0) {
      const k = RINGS[ring] / Math.min(n, 1)
      x *= k
      y *= k
      haptic('snap')
    }
    useStore.getState().addOrb(soundId, { x, y })
  }

  const drawName = drawPathFor ? SOUND_MAP[orbs.find((o) => o.id === drawPathFor)?.soundId ?? '']?.name : null

  return (
    <Glass
      className="stage relative h-full w-full overflow-hidden rounded-[44px]"
      initial={{ opacity: 0, scale: 0.94, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 120, damping: 20, delay: 0.1 }}
      data-tour="stage"
    >
      <div
        ref={wrapRef}
        className="absolute inset-0 touch-none"
        style={{ perspective: 1400, cursor: drawPathFor ? 'crosshair' : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => {
          if (tilt) {
            rotX.set(24)
            rotY.set(0)
          }
        }}
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
        <motion.div
          className="absolute inset-0"
          style={{ scale: breathMV, rotateX: rotX, rotateY: rotY, transformStyle: 'preserve-3d' }}
        >
          <FieldGrid r={r} magnet={magnet} dropHover={dropHover} />
          <canvas ref={trailRef} className="pointer-events-none absolute inset-0 h-full w-full opacity-90 mix-blend-screen [filter:blur(2.5px)]" />
          <canvas ref={fxRef} className="pointer-events-none absolute inset-0 h-full w-full mix-blend-screen" />
          <PathsOverlay r={r} w={dims.w} h={dims.h} drawing={drawing} lasso={lasso} />
          <Walls r={r} toNorm={toNorm} />
          <Listener r={r} />
          <AnimatePresence>
            {orbs.map((o) => (
              <Orb key={o.id} orb={o} radius={r} size={orbSize} />
            ))}
          </AnimatePresence>
        </motion.div>
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

      <AnimatePresence>
        {breathe && (
          <motion.div
            ref={breathTextRef}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="breath-word pointer-events-none absolute inset-x-0 top-6 text-center text-[13px] font-medium uppercase tracking-[0.3em] text-indigo-100/80"
          >
            Breathe in
          </motion.div>
        )}
        {drawName && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="glass-chip absolute left-1/2 top-5 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full py-1.5 pl-4 pr-1.5 text-[12.5px] font-medium text-white"
          >
            Draw a loop for {drawName}
            <button
              className="rounded-full bg-white/15 px-3 py-1 text-[12px] hover:bg-white/25"
              onClick={() => useStore.getState().set('drawPathFor', null)}
            >
              Cancel
            </button>
          </motion.div>
        )}
        {zoom !== 1 && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={() => useStore.getState().set('zoom', 1)}
            className="glass-chip absolute bottom-5 right-6 z-30 rounded-full px-3 py-1.5 text-[11.5px] font-medium tabular-nums text-white/85 hover:text-white"
          >
            {Math.round(zoom * 100)}% · reset
          </motion.button>
        )}
      </AnimatePresence>
    </Glass>
  )
}

const clampZoom = (z: number) => Math.min(1.6, Math.max(0.6, z))
const clampToField = (x: number, y: number): Pt => {
  const n = Math.hypot(x, y)
  return n > 1 ? [x / n, y / n] : [x, y]
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
