import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import {
  ArrowUpDown, CloudLightning, Copy, Disc3, Headphones, Link2, Orbit, Route, Snowflake, Trash, Unlink, Volume2, VolumeX,
} from 'lucide-react'
import { useRef, useState } from 'react'
import { SOUND_MAP } from '../audio/catalog'
import { ELEVATION_RANGE, engine, WORLD_RADIUS } from '../audio/engine'
import { RING_NAMES, useStore, type OrbState } from '../store'
import { runtime } from '../runtime'
import { cx, Slider, spring } from './ui'
import { PhaseScope, Spectrum, useFrame, Waterfall } from './Visualizers'

export function Inspector() {
  const selected = useStore((s) => s.orbs.find((o) => o.id === s.selectedId) ?? null)
  const multi = useStore((s) => s.multi.length)
  const key = multi > 1 ? 'group' : (selected?.id ?? 'overview')
  return (
    <div className="relative h-full min-h-0">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={key}
          initial={{ opacity: 0, x: 16, filter: 'blur(6px)' }}
          animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, x: -16, filter: 'blur(6px)' }}
          transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
          className="h-full overflow-y-auto"
        >
          {multi > 1 ? <GroupDetail /> : selected ? <OrbDetail orb={selected} /> : <MixOverview />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

type Viz = 'spectrum' | 'waterfall' | 'phase'

function VizTabs({ id, colors }: { id: string | null; colors: [string, string] }) {
  const [viz, setViz] = useState<Viz>('spectrum')
  return (
    <div className="overflow-hidden rounded-[22px] bg-black/20 p-3 ring-1 ring-white/[0.07]">
      <LayoutGroup id={`viz-${id ?? 'master'}`}>
        <div className="mb-2 flex gap-1">
          {(['spectrum', 'waterfall', ...(id ? [] : ['phase'])] as Viz[]).map((v) => (
            <button
              key={v}
              onClick={() => setViz(v)}
              className={cx('relative rounded-full px-2.5 py-1 text-[10.5px] font-medium capitalize transition-colors', viz === v ? 'text-black' : 'text-white/50 hover:text-white')}
            >
              {viz === v && <motion.span layoutId="viz-pill" className="absolute inset-0 rounded-full bg-white/90" transition={spring} />}
              <span className="relative">{v === 'phase' ? '3D Phase' : v}</span>
            </button>
          ))}
        </div>
      </LayoutGroup>
      {viz === 'spectrum' && <Spectrum id={id} colors={colors} height={id ? 72 : 64} />}
      {viz === 'waterfall' && <Waterfall id={id} colors={colors} height={id ? 88 : 96} />}
      {viz === 'phase' && <PhaseScope height={140} color={colors[0]} />}
    </div>
  )
}

function OrbDetail({ orb }: { orb: OrbState }) {
  const def = SOUND_MAP[orb.soundId]
  const Icon = def.icon
  const update = (patch: Partial<OrbState>) => useStore.getState().updateOrb(orb.id, patch)
  const distRef = useRef<HTMLSpanElement>(null)
  const azRef = useRef<HTMLSpanElement>(null)
  const zoneRef = useRef<HTMLSpanElement>(null)
  const dotRef = useRef<SVGCircleElement>(null)
  const [tapeStopped, setTapeStopped] = useState(false)
  const hasRec = !!def.recording

  useFrame(() => {
    const rt = runtime.get(orb.id)
    if (!rt) return
    const d = Math.hypot(rt.nx, rt.ny)
    const heading = useStore.getState().heading
    let az = (Math.atan2(rt.nx, -rt.ny) - heading) * (180 / Math.PI)
    az = ((az + 540) % 360) - 180
    if (distRef.current) distRef.current.textContent = Math.hypot(d * WORLD_RADIUS, rt.nz * ELEVATION_RANGE).toFixed(1)
    if (azRef.current) {
      const a = Math.round(Math.abs(az))
      azRef.current.textContent = a < 3 ? 'Front' : a > 177 ? 'Behind' : `${a}° ${az > 0 ? 'R' : 'L'}`
    }
    if (zoneRef.current) {
      zoneRef.current.textContent = rt.occluded ? 'Behind wall' : orb.path ? 'Path' : rt.ring !== null ? RING_NAMES[rt.ring] : 'Free'
    }
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
          <Icon size={24} strokeWidth={1.7} className={cx('text-white', def.anim && `icon-${def.anim}`)} />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">{def.category}</div>
          <h2 className="truncate text-[19px] font-semibold tracking-tight text-white">{def.name}</h2>
          <p className="truncate text-[12px] text-white/50">{def.blurb}</p>
        </div>
      </div>

      <VizTabs id={orb.id} colors={def.colors} />

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Distance">
          <span ref={distRef} className="tabular-nums">0.0</span>
          <span className="ml-0.5 text-white/40">m</span>
        </Stat>
        <Stat label="Azimuth">
          <span ref={azRef} className="tabular-nums">—</span>
        </Stat>
        <Stat label="Zone">
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
          Scroll over the orb for volume, <b className="font-medium text-white/70">⇧ scroll</b> for height. Double-click to mute.
        </p>
      </div>

      <Section title="Mix">
        <Slider label="Volume" value={orb.volume} onChange={(v) => update({ volume: v })} accent={def.colors[0]} />
        <Slider
          label="Height"
          value={orb.z}
          min={-1}
          max={1}
          bipolar
          onChange={(v) => update({ z: Math.abs(v) < 0.04 ? 0 : v })}
          accent="#7dd3fc"
          format={(v) => (Math.abs(v) < 0.04 ? 'Ear level' : `${v > 0 ? '+' : '−'}${Math.abs(v * ELEVATION_RANGE).toFixed(1)} m`)}
        />
        <Slider
          label="Tone"
          value={orb.tone}
          onChange={(v) => update({ tone: v })}
          accent={def.colors[0]}
          format={(v) => (v > 0.98 ? 'Open' : `${Math.round(180 * Math.pow(20000 / 180, v))} Hz`)}
        />
        <Slider label="Reverb Send" value={orb.reverb} onChange={(v) => update({ reverb: v })} accent={def.colors[0]} />
        {hasRec && (
          <Slider
            label="Realism · field recording"
            value={orb.realism}
            onChange={(v) => update({ realism: v })}
            accent="#fde68a"
            format={(v) => (v < 0.02 ? 'Synth' : v > 0.98 ? 'Recording' : `${Math.round(v * 100)}% real`)}
          />
        )}
      </Section>

      <Section title="EQ">
        <div className="grid grid-cols-3 gap-3">
          {(['eqLow', 'eqMid', 'eqHigh'] as const).map((k, i) => (
            <Slider
              key={k}
              label={['Low', 'Mid', 'High'][i]}
              value={orb[k]}
              min={-1}
              max={1}
              bipolar
              onChange={(v) => update({ [k]: Math.abs(v) < 0.04 ? 0 : v })}
              accent={def.colors[0]}
              format={(v) => `${v > 0 ? '+' : ''}${(v * 12).toFixed(0)}dB`}
            />
          ))}
        </div>
      </Section>

      <Section title="Effects">
        <Slider
          label="Bit-crusher"
          value={orb.crush}
          onChange={(v) => update({ crush: v < 0.02 ? 0 : v })}
          accent="#f0abfc"
          format={(v) => (v < 0.02 ? 'Off' : `${Math.round(12 - v * 9)}-bit`)}
        />
        <div className="grid grid-cols-3 gap-2">
          <Action label={orb.freeze ? 'Frozen' : 'Freeze'} active={orb.freeze} onClick={() => update({ freeze: !orb.freeze })}>
            <Snowflake size={16} />
          </Action>
          <Action
            label={tapeStopped ? 'Spin up' : 'Tape stop'}
            active={tapeStopped}
            onClick={() => setTapeStopped(engine.toggleTape(orb.id))}
          >
            <Disc3 size={16} className={cx(tapeStopped ? '' : 'animate-[spin_3s_linear_infinite]')} />
          </Action>
          <Action
            label={orb.path ? 'Clear path' : 'Draw path'}
            active={!!orb.path}
            onClick={() => {
              if (orb.path) update({ path: null })
              else useStore.getState().set('drawPathFor', orb.id)
            }}
          >
            <Route size={16} />
          </Action>
        </div>
        {orb.path && (
          <Slider
            label="Path speed"
            value={orb.path.speed}
            min={0.2}
            max={12}
            step={0.1}
            onChange={(v) => update({ path: { ...orb.path!, speed: v } })}
            accent={def.colors[0]}
            format={(v) => `${v.toFixed(1)} laps/min`}
          />
        )}
      </Section>

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

function GroupDetail() {
  const multi = useStore((s) => s.multi)
  const allOrbs = useStore((s) => s.orbs)
  const orbs = allOrbs.filter((o) => multi.includes(o.id))
  const groups = useStore((s) => s.groups)
  const gid = orbs[0]?.groupId && orbs.every((o) => o.groupId === orbs[0].groupId) ? orbs[0].groupId : null
  const group = gid ? groups[gid] : null
  const st = useStore.getState
  const avgVol = orbs.reduce((a, o) => a + o.volume, 0) / Math.max(1, orbs.length)

  const rotate = (deg: number) => {
    const a = (deg * Math.PI) / 180
    for (const o of orbs) {
      const rt = runtime.get(o.id)
      const x = rt?.nx ?? o.x
      const y = rt?.ny ?? o.y
      st().updateOrb(o.id, { x: x * Math.cos(a) - y * Math.sin(a), y: x * Math.sin(a) + y * Math.cos(a), rev: o.rev + 1 })
    }
  }

  return (
    <div className="flex flex-col gap-5 p-5">
      <div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">{gid ? 'Group' : 'Selection'}</div>
        <h2 className="text-[19px] font-semibold tracking-tight text-white">{multi.length} sounds</h2>
        <p className="text-[12px] text-white/50">Drag any of them to move the whole formation.</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {orbs.map((o) => {
          const d = SOUND_MAP[o.soundId]
          const I = d.icon
          return (
            <span key={o.id} className="flex items-center gap-1.5 rounded-full bg-white/[0.07] py-1 pl-1 pr-2.5 text-[11.5px] text-white/80 ring-1 ring-white/10">
              <span className="grid h-5 w-5 place-items-center rounded-full" style={{ background: `linear-gradient(145deg, ${d.colors[0]}, ${d.colors[1]})` }}>
                <I size={10} className="text-white" />
              </span>
              {d.name}
            </span>
          )
        })}
      </div>
      <Section title="Formation">
        <Slider
          label="Group volume"
          value={avgVol}
          onChange={(v) => {
            const k = avgVol > 0.001 ? v / avgVol : 1
            for (const o of orbs) st().updateOrb(o.id, { volume: Math.min(1, Math.max(0, avgVol > 0.001 ? o.volume * k : v)) })
          }}
        />
        <div className="grid grid-cols-4 gap-2">
          {[-45, -15, 15, 45].map((d) => (
            <button
              key={d}
              onClick={() => rotate(d)}
              className="rounded-[14px] bg-white/[0.06] py-2 text-[12px] font-medium tabular-nums text-white/80 ring-1 ring-white/10 hover:bg-white/12"
            >
              {d > 0 ? `↻ ${d}°` : `↺ ${-d}°`}
            </button>
          ))}
        </div>
      </Section>
      <div className="grid grid-cols-3 gap-2">
        {gid ? (
          <>
            <Action label={group?.orbit ? 'Orbiting' : 'Orbit'} active={!!group?.orbit} onClick={() => st().setGroupOrbit(gid, !group?.orbit)}>
              <Orbit size={16} className={cx(group?.orbit && 'animate-[spin_6s_linear_infinite]')} />
            </Action>
            <Action label="Ungroup" onClick={() => st().ungroup(gid)}>
              <Unlink size={16} />
            </Action>
          </>
        ) : (
          <Action label="Group" onClick={() => st().groupSelected()}>
            <Link2 size={16} />
          </Action>
        )}
        <Action label="Remove all" danger onClick={() => st().removeSelected()}>
          <Trash size={16} />
        </Action>
      </div>
      <p className="text-[11px] leading-relaxed text-white/35">
        Tip: drag on empty space to lasso sounds. Hold ⇧ to add to the selection. Grouped orbs move and orbit together.
      </p>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">{title}</div>
      {children}
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
  const evolve = useStore((s) => s.evolve)
  const walls = useStore((s) => s.walls.length)
  const meters = useRef(new Map<string, HTMLElement>())
  const weatherRef = useRef<HTMLSpanElement>(null)
  const weatherBar = useRef<HTMLSpanElement>(null)
  useFrame(() => {
    for (const [id, el] of meters.current) {
      const l = Math.min(1, (runtime.get(id)?.level ?? 0) * 1.4)
      el.style.transform = `scaleX(${l.toFixed(3)})`
    }
    if (evolve && weatherRef.current && weatherBar.current) {
      weatherRef.current.textContent = engine.weatherPhase()
      weatherBar.current.style.transform = `scaleX(${engine.weatherArc().toFixed(3)})`
    }
  })
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-5">
      <div>
        <h2 className="text-[17px] font-semibold tracking-tight text-white">Mix</h2>
        <p className="mt-0.5 text-[12px] text-white/45">
          {orbs.length ? `${orbs.length} source${orbs.length > 1 ? 's' : ''} in your field` : 'Your field is empty'}
          {walls ? ` · ${walls} wall${walls > 1 ? 's' : ''}` : ''}
        </p>
      </div>
      <VizTabs id={null} colors={[lighten(palette[2]), lighten(palette[1])]} />
      {evolve && (
        <div className="flex items-center gap-3 rounded-[18px] bg-white/[0.05] px-3 py-2.5 ring-1 ring-white/[0.06]">
          <CloudLightning size={16} className="text-indigo-200" />
          <div className="min-w-0 flex-1">
            <div className="flex justify-between text-[11px] text-white/55">
              <span>Weather</span>
              <span ref={weatherRef} className="capitalize text-white/80">calm</span>
            </div>
            <span className="mt-1.5 block h-[3px] overflow-hidden rounded-full bg-white/10">
              <span ref={weatherBar} className="block h-full origin-left rounded-full bg-gradient-to-r from-sky-300 to-indigo-400" style={{ transform: 'scaleX(0)' }} />
            </span>
          </div>
        </div>
      )}
      <ul className="mask-fade-y -mx-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
        <AnimatePresence initial={false}>
          {orbs.map((o) => {
            const def = SOUND_MAP[o.soundId]
            if (!def) return null
            const Icon = def.icon
            return (
              <motion.li key={o.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <button
                  onClick={(e) => useStore.getState().select(o.id, e.shiftKey)}
                  className="flex w-full items-center gap-3 rounded-[18px] p-2 text-left transition-colors hover:bg-white/[0.07]"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px]" style={{ background: `linear-gradient(145deg, ${def.colors[0]}, ${def.colors[1]})` }}>
                    <Icon size={16} className="text-white" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cx('flex items-center gap-1 truncate text-[13px] font-medium', o.muted ? 'text-white/40' : 'text-white/90')}>
                      {def.name}
                      {o.z !== 0 && <ArrowUpDown size={11} className="text-sky-200/70" />}
                      {o.path && <Route size={11} className="text-white/50" />}
                    </span>
                    <span className="mt-1.5 block h-[3px] overflow-hidden rounded-full bg-white/10">
                      <span
                        ref={(el) => {
                          if (el) meters.current.set(o.id, el)
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
        Tip: closer orbs are louder and drier. Far orbs lose high frequencies and bloom into the room — just like real air.
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
