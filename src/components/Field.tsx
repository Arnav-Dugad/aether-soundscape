import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { engine, WORLD_RADIUS } from '../audio/engine'
import { SOUND_MAP } from '../audio/catalog'
import { RING_NAMES, RINGS, useStore, type Wall } from '../store'
import { cx } from './ui'

export function FieldGrid({ r, magnet, dropHover }: { r: number; magnet: number | null; dropHover: boolean }) {
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
      <line x1={c - r} y1={c} x2={c + r} y2={c} stroke="rgba(255,255,255,.05)" />
      <line x1={c} y1={c - r} x2={c} y2={c + r} stroke="rgba(255,255,255,.05)" />
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
            <text x={c} y={c - rr * r - 7} textAnchor="middle" className="fill-white/35 text-[9px] font-semibold uppercase tracking-[0.2em]">
              {RING_NAMES[i]} · {(rr * WORLD_RADIUS).toFixed(1)}m
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** The listener: you. Drag around it to turn your head; double-click to face forward. */
export function Listener({ r }: { r: number }) {
  const heading = useStore((s) => s.heading)
  const tracking = useStore((s) => s.headTracking !== 'off')
  const rot = useMotionValue(heading)
  const deg = useTransform(rot, (v) => (v * 180) / Math.PI)
  const dragging = useRef(false)
  const size = Math.max(64, Math.min(88, r * 0.26))

  useEffect(() => rot.on('change', (v) => engine.setHeading(v)), [rot])
  useEffect(() => {
    if (dragging.current) return
    // head tracking streams small updates — follow them tightly instead of springing
    if (tracking) rot.set(heading)
    else animate(rot, heading, { type: 'spring', stiffness: 200, damping: 22 })
  }, [heading, rot, tracking])

  const angleFrom = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return Math.atan2(e.clientX - (rect.left + rect.width / 2), -(e.clientY - (rect.top + rect.height / 2)))
  }
  const startRef = useRef({ a: 0, h: 0 })

  return (
    <div className="absolute left-1/2 top-1/2 z-10" style={{ width: 0, height: 0 }} data-tour="listener">
      <motion.div
        className="pointer-events-none absolute"
        style={{
          width: r * 1.3,
          height: r * 1.3,
          left: -r * 0.65,
          top: -r * 0.65,
          rotate: deg,
          background: 'conic-gradient(from -50deg, rgba(255,255,255,0.10), rgba(255,255,255,0) 100deg, rgba(255,255,255,0) 360deg)',
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
          if (!dragging.current) return
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
        <span className="tooltip !bottom-auto !top-[calc(100%+12px)]">{tracking ? 'Head tracking active' : 'Drag to turn your head'}</span>
      </motion.div>
    </div>
  )
}

/**
 * Sound-blocking walls. Drag the slab to move it, drag an end to stretch/rotate it.
 * Sounds whose line to the listener crosses a wall are muffled.
 */
export function Walls({ r, toNorm }: { r: number; toNorm: (cx: number, cy: number) => [number, number] }) {
  const walls = useStore((s) => s.walls)
  const selected = useStore((s) => s.selectedWallId)
  const drag = useRef<{ id: string; part: 'a' | 'b' | 'body'; sx: number; sy: number; w: Wall } | null>(null)

  const start = (e: React.PointerEvent, w: Wall, part: 'a' | 'b' | 'body') => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const [sx, sy] = toNorm(e.clientX, e.clientY)
    drag.current = { id: w.id, part, sx, sy, w }
    useStore.setState({ selectedWallId: w.id, selectedId: null, multi: [] })
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const [x, y] = toNorm(e.clientX, e.clientY)
    const dx = x - d.sx
    const dy = y - d.sy
    const st = useStore.getState()
    if (d.part === 'body') st.updateWall(d.id, { x1: d.w.x1 + dx, y1: d.w.y1 + dy, x2: d.w.x2 + dx, y2: d.w.y2 + dy })
    else if (d.part === 'a') st.updateWall(d.id, { x1: x, y1: y })
    else st.updateWall(d.id, { x2: x, y2: y })
  }
  const end = () => {
    drag.current = null
  }

  return (
    <>
      {walls.map((w) => {
        const x1 = w.x1 * r
        const y1 = w.y1 * r
        const x2 = w.x2 * r
        const y2 = w.y2 * r
        const len = Math.hypot(x2 - x1, y2 - y1)
        const ang = Math.atan2(y2 - y1, x2 - x1)
        const sel = selected === w.id
        return (
          <div key={w.id} className="absolute left-1/2 top-1/2 z-[15]" style={{ width: 0, height: 0 }}>
            <motion.div
              initial={{ opacity: 0, scaleX: 0.3 }}
              animate={{ opacity: 1, scaleX: 1 }}
              className={cx('wall absolute cursor-move touch-none rounded-full', sel && 'wall-selected')}
              style={{ left: (x1 + x2) / 2 - len / 2, top: (y1 + y2) / 2 - 6, width: len, height: 12, rotate: `${ang}rad` }}
              onPointerDown={(e) => start(e, w, 'body')}
              onPointerMove={move}
              onPointerUp={end}
            />
            {(['a', 'b'] as const).map((p) => (
              <div
                key={p}
                className={cx('wall-handle absolute touch-none rounded-full', sel ? 'opacity-100' : 'opacity-0 hover:opacity-100')}
                style={{ left: (p === 'a' ? x1 : x2) - 9, top: (p === 'a' ? y1 : y2) - 9 }}
                onPointerDown={(e) => start(e, w, p)}
                onPointerMove={move}
                onPointerUp={end}
              />
            ))}
            {sel && (
              <button
                aria-label="Remove wall"
                className="glass-chip absolute grid h-6 w-6 place-items-center rounded-full text-white/80 hover:text-white"
                style={{ left: (x1 + x2) / 2 - 12 + Math.sin(ang) * 22, top: (y1 + y2) / 2 - 12 - Math.cos(ang) * 22 }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => useStore.getState().removeWall(w.id)}
              >
                <X size={12} />
              </button>
            )}
          </div>
        )
      })}
    </>
  )
}

/** Dashed glowing loops for every orb with a drawn path, plus the stroke being drawn. */
export function PathsOverlay({ r, w, h, drawing, lasso }: { r: number; w: number; h: number; drawing: [number, number][] | null; lasso: [number, number][] | null }) {
  const orbs = useStore((s) => s.orbs)
  const selected = useStore((s) => s.selectedId)
  const cx0 = w / 2
  const cy0 = h / 2
  const d = (pts: [number, number][], close = true) =>
    pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(cx0 + x * r).toFixed(1)} ${(cy0 + y * r).toFixed(1)}`).join(' ') + (close ? ' Z' : '')
  return (
    <svg className="pointer-events-none absolute inset-0 z-[5] h-full w-full overflow-visible" aria-hidden>
      {orbs
        .filter((o) => o.path)
        .map((o) => {
          const col = SOUND_MAP[o.soundId]?.colors[0] ?? '#fff'
          return (
            <path
              key={o.id}
              d={d(o.path!.pts)}
              fill="none"
              stroke={col}
              strokeOpacity={selected === o.id ? 0.75 : 0.32}
              strokeWidth={selected === o.id ? 2 : 1.2}
              strokeDasharray="3 6"
              strokeLinecap="round"
              className="path-flow"
              style={{ filter: `drop-shadow(0 0 6px ${col})` }}
            />
          )
        })}
      {drawing && drawing.length > 1 && (
        <path d={d(drawing, false)} fill="none" stroke="white" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 8px white)' }} />
      )}
      {lasso && lasso.length > 2 && (
        <path d={d(lasso)} fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.7)" strokeWidth={1.2} strokeDasharray="4 4" />
      )}
    </svg>
  )
}
