import { animate, motion, useDragControls, useMotionValue, type PanInfo } from 'framer-motion'
import { memo, useEffect, useLayoutEffect, useRef } from 'react'
import { SOUND_MAP } from '../audio/catalog'
import { RINGS, useStore, type OrbState } from '../store'
import { runtime, type OrbRuntime } from '../runtime'
import { cx } from './ui'

const SNAP_ZONE = 0.085
const snapSpring = { type: 'spring', stiffness: 340, damping: 19, mass: 0.9 } as const

/** Which ring (if any) is close enough to magnetically capture a normalised radius. */
export function ringAt(n: number): number | null {
  let best: number | null = null
  let bestD = SNAP_ZONE
  RINGS.forEach((r, i) => {
    const d = Math.abs(n - r)
    if (d < bestD) {
      bestD = d
      best = i
    }
  })
  return best
}

function OrbImpl({ orb, radius, size }: { orb: OrbState; radius: number; size: number }) {
  const def = SOUND_MAP[orb.soundId]
  const Icon = def.icon
  const mx = useMotionValue(orb.x * radius)
  const my = useMotionValue(orb.y * radius)
  const controls = useDragControls()
  const ref = useRef<HTMLDivElement>(null)
  const selected = useStore((s) => s.selectedId === orb.id)
  const soloing = useStore((s) => s.orbs.some((o) => o.solo))
  const rtRef = useRef<OrbRuntime | null>(null)

  useLayoutEffect(() => {
    const n = Math.hypot(orb.x, orb.y)
    const rt: OrbRuntime = {
      id: orb.id, mx, my, el: ref.current, color: def.colors[0],
      dragging: false, animating: false, ring: ringAt(n),
      nx: orb.x, ny: orb.y, level: 0, px: NaN, py: NaN,
    }
    rtRef.current = rt
    runtime.set(orb.id, rt)
    return () => {
      runtime.delete(orb.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orb.id])

  // keep the orb at the same normalised spot when the stage resizes
  useLayoutEffect(() => {
    const rt = rtRef.current
    if (!rt || rt.dragging) return
    rt.px = NaN // don't paint a trail streak across the resize jump
    mx.set(rt.nx * radius)
    my.set(rt.ny * radius)
  }, [radius, mx, my])

  // external moves (keyboard nudges, arrange) glide in on a spring
  const firstRev = useRef(true)
  useEffect(() => {
    if (firstRev.current) {
      firstRev.current = false
      return
    }
    const rt = rtRef.current
    if (!rt) return
    rt.animating = true
    rt.ring = ringAt(Math.hypot(orb.x, orb.y))
    animate(mx, orb.x * radius, snapSpring)
    animate(my, orb.y * radius, { ...snapSpring, onComplete: () => (rt.animating = false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orb.rev])

  const onDrag = () => {
    const n = Math.hypot(mx.get(), my.get()) / radius
    const ring = ringAt(n)
    if (useStore.getState().magnetRing !== ring) useStore.getState().set('magnetRing', ring)
  }

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const rt = rtRef.current!
    rt.dragging = false
    useStore.getState().set('magnetRing', null)
    // project the flick a little so throws feel weighty
    const vx = Math.max(-1500, Math.min(1500, info.velocity.x))
    const vy = Math.max(-1500, Math.min(1500, info.velocity.y))
    let tx = mx.get() + vx * 0.07
    let ty = my.get() + vy * 0.07
    let n = Math.hypot(tx, ty) / radius
    if (n > 1.02) {
      tx *= 1.02 / n
      ty *= 1.02 / n
      n = 1.02
    }
    const ring = ringAt(n)
    rt.ring = ring
    if (ring !== null && n > 0.001) {
      const k = (RINGS[ring] * radius) / Math.hypot(tx, ty)
      tx *= k
      ty *= k
      navigator.vibrate?.(6)
    }
    rt.animating = true
    animate(mx, tx, { ...snapSpring, velocity: vx })
    animate(my, ty, {
      ...snapSpring,
      velocity: vy,
      onComplete: () => {
        rt.animating = false
        useStore.getState().commitPosition(orb.id, tx / radius, ty / radius)
      },
    })
  }

  const silent = orb.muted || (soloing && !orb.solo)
  const [c0, c1] = def.colors
  const arc = 2 * Math.PI * (size / 2 + 7)

  return (
    <motion.div
      ref={ref}
      data-orb={orb.id}
      className="orb absolute left-1/2 top-1/2 z-20 touch-none select-none"
      style={{ x: mx, y: my, width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2, ['--c0' as string]: c0, ['--c1' as string]: c1 }}
      drag
      dragControls={controls}
      dragListener={false}
      dragMomentum={false}
      dragElastic={0}
      onDrag={onDrag}
      onDragEnd={onDragEnd}
      initial={{ scale: 0, opacity: 0, filter: 'blur(12px)' }}
      animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }}
      exit={{ scale: 0.3, opacity: 0, filter: 'blur(14px)', transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] } }}
      whileHover={{ scale: 1.07 }}
      whileDrag={{ scale: 1.16, zIndex: 40 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      onPointerDown={(e) => {
        e.stopPropagation()
        const rt = rtRef.current
        if (rt) {
          rt.dragging = true
          rt.animating = false
          mx.stop()
          my.stop()
        }
        useStore.getState().select(orb.id)
        controls.start(e)
      }}
      onPointerUp={() => {
        // a click without movement never fires dragEnd
        const rt = rtRef.current
        if (rt && rt.dragging && !rt.animating) {
          rt.dragging = false
        }
      }}
      onDoubleClick={() => useStore.getState().updateOrb(orb.id, { muted: !orb.muted })}
      onWheel={(e) => {
        const v = Math.min(1, Math.max(0, orb.volume - e.deltaY * 0.0012))
        useStore.getState().updateOrb(orb.id, { volume: v })
      }}
    >
      <div className={cx('relative h-full w-full transition-[filter,opacity] duration-500', silent && 'opacity-45 grayscale')}>
        <div className="orb-glow" />
        {/* volume arc */}
        <svg className="pointer-events-none absolute -inset-[9px] h-[calc(100%+18px)] w-[calc(100%+18px)] -rotate-90 overflow-visible" aria-hidden>
          <circle cx="50%" cy="50%" r={size / 2 + 7} fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="2" />
          <motion.circle
            cx="50%" cy="50%" r={size / 2 + 7} fill="none" stroke={c0} strokeWidth="2" strokeLinecap="round"
            strokeDasharray={arc}
            animate={{ strokeDashoffset: arc * (1 - orb.volume), opacity: selected ? 1 : 0.55 }}
            transition={{ type: 'spring', stiffness: 200, damping: 30 }}
            style={{ filter: `drop-shadow(0 0 4px ${c0})` }}
          />
        </svg>
        {selected && (
          <motion.div
            layoutId="orb-selection"
            className="pointer-events-none absolute -inset-[17px] rounded-full border border-white/50 shadow-[0_0_30px_rgba(255,255,255,.25)]"
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          />
        )}
        <div className="orb-core">
          <div className="orb-sheen" />
          <Icon className="relative z-10 drop-shadow-[0_1px_4px_rgba(0,0,0,.45)]" size={size * 0.36} strokeWidth={1.7} color="white" />
        </div>
        <div
          className={cx(
            'pointer-events-none absolute left-1/2 top-full mt-3 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium tracking-tight transition-all duration-300',
            selected ? 'glass-chip text-white' : 'text-white/70 [text-shadow:0_1px_8px_rgba(0,0,0,.8)]',
          )}
        >
          {def.name}
          {orb.muted && <span className="ml-1 text-white/45">· muted</span>}
          {orb.solo && <span className="ml-1 text-amber-200">· solo</span>}
        </div>
      </div>
    </motion.div>
  )
}

export const Orb = memo(OrbImpl)
