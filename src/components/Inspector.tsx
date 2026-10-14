import { AnimatePresence, motion } from 'framer-motion'
import { Copy, Headphones, Trash, Volume2, VolumeX } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { SOUND_MAP } from '../audio/catalog'
import { engine, WORLD_RADIUS } from '../audio/engine'
import { RING_NAMES, useStore, type OrbState } from '../store'
import { runtime } from '../runtime'
import { cx, Slider, spring } from './ui'

export function Inspector() {
  const selected = useStore((s) => s.orbs.find((o) => o.id === s.selectedId) ?? null)
  return (
    <div className="relative h-full min-h-0">
      <AnimatePresence mode="wait" initial={false}>
        {selected ? (
          <motion.div
            key={selected.id}
            initial={{ opacity: 0, x: 16, filter: 'blur(6px)' }}
            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: -16, filter: 'blur(6px)' }}
            transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
            className="h-full overflow-y-auto"
          >
            <OrbDetail orb={selected} />
          </motion.div>
        ) : (
          <motion.div
            key="overview"
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.28 }}
            className="h-full"
          >
            <MixOverview />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function useFrame(cb: (t: number) => void) {
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

/** Mirrored, glowing frequency spectrum for one channel (or the master when id is null). */
function Spectrum({ id, colors, height = 88 }: { id: string | null; colors: [string, string]; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const data = useRef(new Uint8Array(256))
  const smooth = useRef(new Float32Array(48))
  useFrame(() => {
    const c = ref.current
    if (!c) return
    const dpr = Math.min(2, devicePixelRatio)
    const w = c.clientWidth
    if (c.width !== w * dpr) {
      c.width = w * dpr
      c.height = height * dpr
    }
    const g = c.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, height)
    if (!engine.started) return
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
      const x = i * bw + bw * 0.18
      g.beginPath()
      g.roundRect(x, mid - hgt, bw * 0.64, hgt * 2, bw * 0.32)
      g.fill()
    }
  })
  return <canvas ref={ref} className="block w-full" style={{ height }} />
}

function OrbDetail({ orb }: { orb: OrbState }) {
  const def = SOUND_MAP[orb.soundId]
  const Icon = def.icon
  const update = (patch: Partial<OrbState>) => useStore.getState().updateOrb(orb.id, patch)
  const distRef = useRef<HTMLSpanElement>(null)
  const azRef = useRef<HTMLSpanElement>(null)
  const zoneRef = useRef<HTMLSpanElement>(null)
  const dotRef = useRef<SVGCircleElement>(null)

  useFrame(() => {
    const rt = runtime.get(orb.id)
    if (!rt) return
    const d = Math.hypot(rt.nx, rt.ny)
    const heading = useStore.getState().heading
    let az = (Math.atan2(rt.nx, -rt.ny) - heading) * (180 / Math.PI)
    az = ((az + 540) % 360) - 180
    if (distRef.current) distRef.current.textContent = (d * WORLD_RADIUS).toFixed(1)
    if (azRef.current) {
      const a = Math.round(Math.abs(az))
      azRef.current.textContent = a < 3 ? 'Front' : a > 177 ? 'Behind' : `${a}° ${az > 0 ? 'R' : 'L'}`
    }
    if (zoneRef.current) zoneRef.current.textContent = rt.ring !== null ? RING_NAMES[rt.ring] : 'Free'
    if (dotRef.current) {
      const rad = (az * Math.PI) / 180
      const r = 14 * Math.min(1, d)
      dotRef.current.setAttribute('cx', String(18 + Math.sin(rad) * r))
      dotRef.current.setAttribute('cy', String(18 - Math.cos(rad) * r))
    }
  })

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex items-center gap-3.5">
        <div
          className="relative grid h-14 w-14 shrink-0 place-items-center rounded-[18px] shadow-[inset_0_1px_0_rgba(255,255,255,.45),0_10px_30px_-8px_var(--c)]"
          style={{ background: `linear-gradient(145deg, ${def.colors[0]}, ${def.colors[1]})`, ['--c' as string]: def.colors[1] }}
        >
          <Icon size={24} strokeWidth={1.7} className="text-white" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">{def.category}</div>
          <h2 className="truncate text-[19px] font-semibold tracking-tight text-white">{def.name}</h2>
          <p className="truncate text-[12px] text-white/50">{def.blurb}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-[22px] bg-black/20 p-3 ring-1 ring-white/[0.07]">
        <Spectrum id={orb.id} colors={def.colors} height={72} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Distance">
          <span ref={distRef} className="tabular-nums">0.0</span>
          <span className="ml-0.5 text-white/40">m</span>
        </Stat>
        <Stat label="Azimuth">
          <span ref={azRef} className="tabular-nums">—</span>
        </Stat>
        <Stat label="Orbit">
          <span ref={zoneRef}>—</span>
        </Stat>
      </div>

      <div className="flex items-center gap-4 rounded-[22px] bg-white/[0.04] p-3 ring-1 ring-white/[0.06]">
        <svg width="36" height="36" viewBox="0 0 36 36" className="shrink-0" aria-hidden>
          <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,.15)" />
          <circle cx="18" cy="18" r="8" fill="none" stroke="rgba(255,255,255,.08)" />
          <path d="M18 4 L20 8 L16 8 Z" fill="rgba(255,255,255,.6)" />
          <circle ref={dotRef} cx="18" cy="18" r="3" fill={def.colors[0]} style={{ filter: `drop-shadow(0 0 4px ${def.colors[0]})` }} />
        </svg>
        <p className="text-[11.5px] leading-snug text-white/50">
          Relative to where you’re facing. Drag the orb — or scroll over it to change volume. Double-click to mute.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <Slider label="Volume" value={orb.volume} onChange={(v) => update({ volume: v })} accent={def.colors[0]} />
        <Slider
          label="Tone"
          value={orb.tone}
          onChange={(v) => update({ tone: v })}
          accent={def.colors[0]}
          format={(v) => (v > 0.98 ? 'Open' : `${Math.round(180 * Math.pow(20000 / 180, v))} Hz`)}
        />
        <Slider label="Reverb Send" value={orb.reverb} onChange={(v) => update({ reverb: v })} accent={def.colors[0]} />
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Action label={orb.muted ? 'Unmute' : 'Mute'} active={orb.muted} onClick={() => update({ muted: !orb.muted })}>
          {orb.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </Action>
        <Action label="Solo" active={orb.solo} onClick={() => update({ solo: !orb.solo })}>
          <Headphones size={16} />
        </Action>
        <Action label="Duplicate" onClick={() => useStore.getState().duplicateOrb(orb.id)}>
          <Copy size={16} />
        </Action>
        <Action label="Remove" danger onClick={() => useStore.getState().removeOrb(orb.id)}>
          <Trash size={16} />
        </Action>
      </div>
    </div>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[18px] bg-white/[0.05] px-3 py-2.5 ring-1 ring-white/[0.06]">
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/40">{label}</div>
      <div className="mt-0.5 truncate text-[14px] font-medium text-white">{children}</div>
    </div>
  )
}

function Action({
  label, onClick, children, active, danger,
}: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean; danger?: boolean }) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      transition={spring}
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'flex flex-col items-center gap-1 rounded-[18px] py-2.5 text-[10.5px] font-medium ring-1 transition-colors',
        active
          ? 'bg-white text-black ring-white'
          : danger
            ? 'bg-white/[0.05] text-rose-200/90 ring-white/[0.06] hover:bg-rose-500/20'
            : 'bg-white/[0.05] text-white/75 ring-white/[0.06] hover:bg-white/10 hover:text-white',
      )}
    >
      {children}
      {label}
    </motion.button>
  )
}

function MixOverview() {
  const orbs = useStore((s) => s.orbs)
  const palette = useStore((s) => s.palette)
  const meters = useRef(new Map<string, HTMLDivElement>())
  useFrame(() => {
    for (const [id, el] of meters.current) {
      const l = Math.min(1, (runtime.get(id)?.level ?? 0) * 1.4)
      el.style.transform = `scaleX(${l.toFixed(3)})`
    }
  })
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-5">
      <div>
        <h2 className="text-[17px] font-semibold tracking-tight text-white">Mix</h2>
        <p className="mt-0.5 text-[12px] text-white/45">
          {orbs.length ? `${orbs.length} source${orbs.length > 1 ? 's' : ''} in your field` : 'Your field is empty'}
        </p>
      </div>
      <div className="overflow-hidden rounded-[22px] bg-black/20 p-3 ring-1 ring-white/[0.07]">
        <Spectrum id={null} colors={[lighten(palette[2]), lighten(palette[1])]} height={64} />
      </div>
      <ul className="mask-fade-y -mx-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
        <AnimatePresence initial={false}>
          {orbs.map((o) => {
            const def = SOUND_MAP[o.soundId]
            const Icon = def.icon
            return (
              <motion.li
                key={o.id}
                layout
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <button
                  onClick={() => useStore.getState().select(o.id)}
                  className="flex w-full items-center gap-3 rounded-[18px] p-2 text-left transition-colors hover:bg-white/[0.07]"
                >
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px]"
                    style={{ background: `linear-gradient(145deg, ${def.colors[0]}, ${def.colors[1]})` }}
                  >
                    <Icon size={16} className="text-white" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cx('block truncate text-[13px] font-medium', o.muted ? 'text-white/40' : 'text-white/90')}>{def.name}</span>
                    <span className="mt-1.5 block h-[3px] overflow-hidden rounded-full bg-white/10">
                      <span
                        ref={(el) => {
                          if (el) meters.current.set(o.id, el as unknown as HTMLDivElement)
                          else meters.current.delete(o.id)
                        }}
                        className="block h-full origin-left rounded-full"
                        style={{ background: `linear-gradient(90deg, ${def.colors[1]}, ${def.colors[0]})`, transform: 'scaleX(0)' }}
                      />
                    </span>
                  </span>
                  <span className="text-[11px] tabular-nums text-white/40">{Math.round(o.volume * 100)}</span>
                </button>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
      <p className="text-[11px] leading-relaxed text-white/35">
        Tip: closer orbs are louder and drier. Far orbs lose high frequencies and bloom into the hall reverb — just like real air.
      </p>
    </div>
  )
}

function lighten(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * 0.45)
  const r = mix((n >> 16) & 255)
  const g = mix((n >> 8) & 255)
  const b = mix(n & 255)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}
