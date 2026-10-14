import { animate, motion, useDragControls, useMotionValue, type PanInfo } from 'framer-motion'
import { memo, useEffect, useLayoutEffect, useRef } from 'react'
import { SOUND_MAP } from '../audio/catalog'
import { ELEVATION_RANGE } from '../audio/engine'
import { RINGS, useStore, type OrbState } from '../store'
import { runtime, type OrbRuntime } from '../runtime'
import { haptic } from '../lib/haptics'
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
  const selected = useStore((s) => s.multi.includes(orb.id))
  const primary = useStore((s) => s.selectedId === orb.id)
  const soloing = useStore((s) => s.orbs.some((o) => o.solo))
  const tilt = useStore((s) => s.tilt)
  const rtRef = useRef<OrbRuntime | null>(null)
  const dragStart = useRef({ x: 0, y: 0, lx: 0, ly: 0 })

  useLayoutEffect(() => {
    const rt: OrbRuntime = {
      id: orb.id, soundId: orb.soundId, mx, my, el: ref.current, color: def.colors[0],
      dragging: false, animating: false, ring: ringAt(Math.hypot(orb.x, orb.y)),
      nx: orb.x, ny: orb.y, nz: orb.z, level: 0, pathT: 0, occluded: false, px: NaN, py: NaN, spawn: 0,
    }
    rtRef.current = rt
    runtime.set(orb.id, rt)
    return () => {
      runtime.delete(orb.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orb.id])

  // keep the orb at the same normalised spot when the stage resizes or zooms
  useLayoutEffect(() => {
    const rt = rtRef.current
    if (!rt || rt.dragging) return
    rt.px = NaN // don't paint a trail streak across the resize jump
    mx.set(rt.nx * radius)
    my.set(rt.ny * radius)
  }, [radius, mx, my])

  // external moves (keyboard nudges, undo) glide in on a spring
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

  const others = () => useStore.getState().multi.filter((id) => id !== orb.id)

  const onDrag = () => {
    const n = Math.hypot(mx.get(), my.get()) / radius
    const ring = others().length ? null : ringAt(n)
    const st = useStore.getState()
    if (st.magnetRing !== ring) {
      st.set('magnetRing', ring)
      if (ring !== null) haptic('cross')
    }
    // the rest of the selection follows along
    const d = dragStart.current
    const dx = mx.get() - d.lx
    const dy = my.get() - d.ly
    d.lx = mx.get()
    d.ly = my.get()
    for (const id of others()) {
      const o = runtime.get(id)
      if (!o) continue
      o.dragging = true
      o.mx.set(o.mx.get() + dx)
      o.my.set(o.my.get() + dy)
    }
  }

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const rt = rtRef.current!
    rt.dragging = false
    const st = useStore.getState()
    st.set('magnetRing', null)
    const group = others()
    if (group.length) {
      // multi-drag: no snapping, just commit everyone where they were dropped
      rt.ring = null
      st.commitPosition(orb.id, mx.get() / radius, my.get() / radius)
      for (const id of group) {
        const o = runtime.get(id)
        if (!o) continue
        o.dragging = false
        o.ring = ringAt(Math.hypot(o.nx, o.ny))
        st.commitPosition(id, o.mx.get() / radius, o.my.get() / radius)
      }
      return
    }
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
      haptic('snap')
    }
    rt.animating = true
    animate(mx, tx, { ...snapSpring, velocity: vx })
    animate(my, ty, {
      ...snapSpring,
      velocity: vy,
      onComplete: () => {
        rt.animating = false
        const cur = useStore.getState().orbs.find((o) => o.id === orb.id)
        const nx = tx / radius
        const ny = ty / radius
        if (cur?.path) {
          // a drawn loop travels with its orb
          const ddx = nx - dragStart.current.x
          const ddy = ny - dragStart.current.y
          useStore.getState().updateOrb(orb.id, {
            x: nx, y: ny,
            path: { ...cur.path, pts: cur.path.pts.map(([px, py]) => [px + ddx, py + ddy] as [number, number]) },
          })
        } else useStore.getState().commitPosition(orb.id, nx, ny)
      },
    })
  }

  const silent = orb.muted || (soloing && !orb.solo)
  const [c0, c1] = def.colors
  const arc = 2 * Math.PI * (size / 2 + 7)
  // elevation reads as scale + a shadow dropping away beneath the orb
  const lift = orb.z
  const elevScale = 1 + lift * 0.16
  const meters = lift * ELEVATION_RANGE

  return (
    <motion.div
      ref={ref}
      data-orb={orb.id}
      className="orb absolute left-1/2 top-1/2 z-20 touch-none select-none"
      style={{
        x: mx, y: my, z: tilt ? 36 + lift * 70 : 0,
        width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2,
        ['--c0' as string]: c0, ['--c1' as string]: c1,
      }}
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
      // scale springs; blur/opacity tween so the spring can't overshoot into negative blur
      transition={{ type: 'spring', stiffness: 260, damping: 18, filter: { type: 'tween', duration: 0.45 }, opacity: { duration: 0.3 } }}
      onPointerDown={(e) => {
        e.stopPropagation()
        const st = useStore.getState()
        if (st.drawPathFor) return
        const additive = e.shiftKey || e.metaKey
        if (additive) {
          st.select(orb.id, true)
          return
        }
        if (!st.multi.includes(orb.id)) st.select(orb.id)
        else st.set('selectedId', orb.id)
        const rt = rtRef.current
        if (rt) {
          rt.dragging = true
          rt.animating = false
          mx.stop()
          my.stop()
          dragStart.current = { x: rt.nx, y: rt.ny, lx: mx.get(), ly: my.get() }
        }
        controls.start(e)
      }}
      onPointerUp={() => {
        // a click without movement never fires dragEnd
        const rt = rtRef.current
        if (rt && rt.dragging && !rt.animating) rt.dragging = false
      }}
      onDoubleClick={() => useStore.getState().updateOrb(orb.id, { muted: !orb.muted })}
      onWheel={(e) => {
        if (e.ctrlKey || e.metaKey) return
        if (e.shiftKey) {
          // shift + scroll lifts the sound above or sinks it below you
          const z = Math.min(1, Math.max(-1, orb.z - (e.deltaY || e.deltaX) * 0.0015))
          useStore.getState().updateOrb(orb.id, { z })
        } else {
          const v = Math.min(1, Math.max(0, orb.volume - e.deltaY * 0.0012))
          useStore.getState().updateOrb(orb.id, { volume: v })
        }
      }}
    >
      {/* ground shadow: drops away as the orb rises */}
      <div
        className="orb-shadow"
        style={{
          transform: `translateY(${Math.max(0, lift) * 26 + 8}px) scale(${1 - Math.max(0, lift) * 0.35})`,
          opacity: lift < 0 ? 0.15 : 0.45 - lift * 0.15,
        }}
      />
      <div
        className={cx('orb-body relative h-full w-full transition-[filter,opacity,transform] duration-500', silent && 'opacity-45 grayscale')}
        style={{ transform: `scale(${elevScale})`, opacity: lift < 0 ? 0.75 + lift * 0.2 : undefined }}
      >
        <div className="orb-glow" />
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
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cx(
              'pointer-events-none absolute -inset-[17px] rounded-full border shadow-[0_0_30px_rgba(255,255,255,.25)]',
              primary ? 'border-white/60' : 'border-dashed border-white/40',
            )}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          />
        )}
        <div className={cx('orb-core', 'refract')}>
          <div className="orb-sheen" />
          <Icon
            className={cx('relative z-10 drop-shadow-[0_1px_4px_rgba(0,0,0,.45)]', def.anim && `icon-${def.anim}`)}
            size={size * 0.36}
            strokeWidth={1.7}
            color="white"
          />
        </div>
        {orb.groupId && <span className="absolute -right-1 -top-1 z-10 h-3 w-3 rounded-full border border-white/70 bg-white/30 backdrop-blur" />}
        <div
          className={cx(
            'pointer-events-none absolute left-1/2 top-full mt-3 -translate-x-1/2 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium tracking-tight transition-all duration-300',
            primary ? 'glass-chip text-white' : 'text-white/70 [text-shadow:0_1px_8px_rgba(0,0,0,.8)]',
          )}
        >
          {def.name}
          {Math.abs(meters) > 0.2 && (
            <span className="ml-1 text-sky-200/80">
              {meters > 0 ? '↑' : '↓'}
              {Math.abs(meters).toFixed(1)}m
            </span>
          )}
          {orb.muted && <span className="ml-1 text-white/45">· muted</span>}
          {orb.solo && <span className="ml-1 text-amber-200">· solo</span>}
        </div>
      </div>
    </motion.div>
  )
}

export const Orb = memo(OrbImpl)
