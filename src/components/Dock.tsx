import { AnimatePresence, motion } from 'framer-motion'
import {
  Blend, BookmarkPlus, BrickWall, Eraser, Layers, Library as LibraryIcon, Moon, Orbit, Pause, Play, Redo2, Rotate3d,
  Settings2, Share2, Shuffle, SlidersHorizontal, Sparkles, Trash, Undo2, Upload, Volume2, Wind, Wrench,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SCENES } from '../audio/scenes'
import { SOUND_MAP } from '../audio/catalog'
import { ROOMS } from '../audio/rooms'
import { engine } from '../audio/engine'
import { newId, useStore } from '../store'
import { encodeMix } from '../lib/share'
import { goTo, redo, undo, useHistory } from '../history'
import { morph } from '../morph'
import { pickAudioFile } from '../lib/imports'
import { cx, Glass, IconButton, Slider, spring, Switch } from './ui'

type Pop = 'scenes' | 'atmos' | 'view' | 'tools' | 'sleep' | 'history' | 'snapshots' | null

export function Dock({ compact }: { compact: boolean }) {
  const playing = useStore((s) => s.playing)
  const orbit = useStore((s) => s.orbit)
  const master = useStore((s) => s.masterVolume)
  const sceneId = useStore((s) => s.sceneId)
  const sleepAt = useStore((s) => s.sleepAt)
  const recordingSince = useStore((s) => s.recordingSince)
  const mobilePanel = useStore((s) => s.mobilePanel)
  const morphing = useStore((s) => s.morphing)
  const tilt = useStore((s) => s.tilt)
  const breathe = useStore((s) => s.breathe)
  const [pop, setPop] = useState<Pop>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pop) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setPop(null)
    }
    addEventListener('pointerdown', close)
    return () => removeEventListener('pointerdown', close)
  }, [pop])

  const toggle = (p: Pop) => setPop((cur) => (cur === p ? null : p))
  const scene = SCENES.find((s) => s.id === sceneId)
  const st = useStore.getState

  return (
    <div ref={ref} className="relative flex justify-center" data-tour="dock">
      <AnimatePresence>
        {pop && (
          <Glass
            key={pop}
            initial={{ opacity: 0, y: 14, scale: 0.96, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 10, scale: 0.97, filter: 'blur(6px)' }}
            transition={spring}
            className="absolute bottom-[calc(100%+12px)] z-50 max-h-[70dvh] w-[min(660px,calc(100vw-24px))] origin-bottom overflow-y-auto rounded-[32px] p-4"
          >
            {pop === 'scenes' && <ScenesPanel onPick={() => setPop(null)} />}
            {pop === 'atmos' && <AtmospherePanel />}
            {pop === 'view' && <ViewPanel />}
            {pop === 'tools' && <ToolsPanel onPick={() => setPop(null)} />}
            {pop === 'sleep' && <SleepPanel onPick={() => setPop(null)} />}
            {pop === 'history' && <HistoryPanel />}
            {pop === 'snapshots' && <SnapshotsPanel />}
          </Glass>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {morphing && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="glass-chip absolute bottom-[calc(100%+12px)] z-40 flex items-center gap-3 rounded-full py-1.5 pl-4 pr-1.5 text-[12px] font-medium text-white"
          >
            <Blend size={14} /> Morphing to {morphing.name}
            <span className="h-1 w-24 overflow-hidden rounded-full bg-white/15">
              <span className="block h-full origin-left rounded-full bg-white" style={{ transform: `scaleX(${morphing.progress})` }} />
            </span>
            <button className="rounded-full bg-white/15 px-2.5 py-1 hover:bg-white/25" onClick={() => morph.cancel()}>
              Stop
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <Glass
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 140, damping: 20, delay: 0.25 }}
        className="dock-scroll no-scrollbar flex max-w-full items-center gap-1 overflow-x-auto rounded-full p-1.5 sm:gap-1 sm:p-2"
      >
        <motion.button
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => st().setPlaying(!playing)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.9 }}
          transition={spring}
          className="play-btn relative grid h-12 w-12 shrink-0 place-items-center rounded-full bg-white text-black sm:h-14 sm:w-14"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={playing ? 'pause' : 'play'}
              initial={{ scale: 0.4, opacity: 0, rotate: -30 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.4, opacity: 0, rotate: 30 }}
              transition={{ duration: 0.18 }}
            >
              {playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" className="translate-x-[1px]" />}
            </motion.span>
          </AnimatePresence>
        </motion.button>

        {!compact && (
          <div className="flex shrink-0 items-center gap-2 px-2">
            <Volume2 size={16} className="text-white/55" />
            <Slider className="w-20" value={master} onChange={(v) => st().set('masterVolume', v)} />
          </div>
        )}

        <Divider />
        <DockPill active={pop === 'scenes'} onClick={() => toggle('scenes')} label="Scenes">
          <Layers size={17} />
          <span className="hidden max-w-24 truncate lg:inline">{scene?.name ?? 'Scenes'}</span>
        </DockPill>
        <motion.button
          data-tour="ai"
          aria-label="AI Composer"
          onClick={() => st().set('composerOpen', true)}
          whileTap={{ scale: 0.92 }}
          className="ai-btn group relative grid h-11 w-11 shrink-0 place-items-center rounded-full text-white"
        >
          <Sparkles size={18} />
          <span className="tooltip">
            AI Composer<kbd>A</kbd>
          </span>
        </motion.button>
        {compact && (
          <IconButton label="Library" active={mobilePanel === 'library'} onClick={() => st().set('mobilePanel', mobilePanel === 'library' ? null : 'library')}>
            <LibraryIcon size={18} />
          </IconButton>
        )}
        <Divider />
        <IconButton label="Orbit motion" shortcut="O" active={orbit} onClick={() => st().set('orbit', !orbit)}>
          <Orbit size={18} className={cx(orbit && 'animate-[spin_6s_linear_infinite]')} />
        </IconButton>
        <IconButton label="Atmosphere & room" active={pop === 'atmos'} onClick={() => toggle('atmos')}>
          <SlidersHorizontal size={18} />
        </IconButton>
        <IconButton label="View: 3D, breathe, zoom" active={pop === 'view' || tilt || breathe} onClick={() => toggle('view')}>
          <Rotate3d size={18} />
        </IconButton>
        <IconButton label="Tools: walls, import" active={pop === 'tools'} onClick={() => toggle('tools')}>
          <Wrench size={18} />
        </IconButton>
        <IconButton label="Sleep timer" active={pop === 'sleep' || !!sleepAt} onClick={() => toggle('sleep')}>
          <Moon size={18} />
        </IconButton>
        <RecordButton since={recordingSince} />
        <Divider />
        <IconButton label="History" shortcut="⌘Z" active={pop === 'history'} onClick={() => toggle('history')}>
          <Undo2 size={18} />
        </IconButton>
        <IconButton label="Snapshots & morph" active={pop === 'snapshots'} onClick={() => toggle('snapshots')}>
          <BookmarkPlus size={18} />
        </IconButton>
        {!compact && (
          <>
            <IconButton label="Surprise me" shortcut="S" onClick={() => st().scatter()}>
              <Shuffle size={18} />
            </IconButton>
            <IconButton label="Copy share link" onClick={shareMix}>
              <Share2 size={18} />
            </IconButton>
          </>
        )}
        <IconButton label="Settings" onClick={() => st().set('settingsOpen', true)}>
          <Settings2 size={18} />
        </IconButton>
        <SleepCountdown at={sleepAt} />
      </Glass>
    </div>
  )
}

export async function shareMix() {
  const { orbs, palette, walls, room, toast } = useStore.getState()
  const url = `${location.origin}${location.pathname}#mix=${encodeMix(orbs, palette, walls, room)}`
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ title: 'My Aether soundscape', url })
      return
    }
    await navigator.clipboard.writeText(url)
    toast('Share link copied to clipboard', 'success')
  } catch {
    history.replaceState(null, '', url)
    toast('Link added to the address bar')
  }
}

function Divider() {
  return <div className="mx-1 h-7 w-px shrink-0 bg-white/12" />
}

function DockPill({ children, onClick, active, label }: { children: ReactNode; onClick: () => void; active?: boolean; label: string }) {
  return (
    <motion.button
      aria-label={label}
      onClick={onClick}
      whileTap={{ scale: 0.94 }}
      transition={spring}
      className={cx(
        'flex h-11 shrink-0 items-center gap-2 rounded-full px-3.5 text-[13px] font-medium transition-colors',
        active ? 'bg-white text-black' : 'text-white/80 hover:bg-white/12 hover:text-white',
      )}
    >
      {children}
    </motion.button>
  )
}

function PanelTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between px-1">
      <h3 className="text-[15px] font-semibold tracking-tight text-white">{children}</h3>
      {aside && <span className="text-[11px] text-white/40">{aside}</span>}
    </div>
  )
}

function RecordButton({ since }: { since: number | null }) {
  const [, force] = useState(0)
  useEffect(() => {
    if (!since) return
    const t = setInterval(() => force((n) => n + 1), 500)
    return () => clearInterval(t)
  }, [since])
  const toggle = async () => {
    const st = useStore.getState()
    if (since) {
      const blob = await engine.stopRecording()
      st.set('recordingSince', null)
      if (blob) {
        const ext = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `aether-mix-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.${ext}`
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 4000)
        st.toast('Recording saved', 'success')
      }
    } else {
      if (!st.playing) st.setPlaying(true)
      if (engine.startRecording()) {
        st.set('recordingSince', Date.now())
        st.toast('Recording your mix…', 'record')
      } else st.toast('Recording is not supported in this browser', 'error')
    }
  }
  const secs = since ? Math.floor((Date.now() - since) / 1000) : 0
  return (
    <motion.button
      aria-label={since ? 'Stop recording' : 'Record mix'}
      onClick={toggle}
      whileTap={{ scale: 0.92 }}
      layout
      transition={spring}
      className={cx(
        'group relative flex h-11 shrink-0 items-center justify-center gap-2 rounded-full transition-colors',
        since ? 'bg-rose-500/25 px-3.5 text-rose-100 ring-1 ring-rose-400/50' : 'w-11 text-white/80 hover:bg-white/12',
      )}
    >
      <span className={cx('block h-3.5 w-3.5 rounded-full bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,.8)]', !!since && 'animate-pulse rounded-[4px]')} />
      {since && <span className="text-[12px] font-medium tabular-nums">{fmt(secs)}</span>}
      {!since && <span className="tooltip">Record mix</span>}
    </motion.button>
  )
}

function SleepCountdown({ at }: { at: number | null }) {
  const [, force] = useState(0)
  useEffect(() => {
    if (!at) return
    const t = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [at])
  if (!at) return null
  const left = Math.max(0, Math.round((at - Date.now()) / 1000))
  return (
    <motion.span
      initial={{ opacity: 0, width: 0 }}
      animate={{ opacity: 1, width: 'auto' }}
      className="flex shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap px-2 text-[12px] font-medium tabular-nums text-indigo-100/80"
    >
      <Moon size={12} /> {fmt(left)}
    </motion.span>
  )
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function ScenesPanel({ onPick }: { onPick: () => void }) {
  const sceneId = useStore((s) => s.sceneId)
  return (
    <div>
      <PanelTitle aside="Press 1–9, 0">Scenes</PanelTitle>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SCENES.map((s, i) => (
          <motion.button
            key={s.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: { delay: i * 0.03 } }}
            whileHover={{ y: -3 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              useStore.getState().loadScene(s)
              useStore.getState().setPlaying(true)
              onPick()
            }}
            className={cx(
              'group relative overflow-hidden rounded-[22px] p-3 text-left ring-1 transition-shadow',
              sceneId === s.id ? 'shadow-[0_0_30px_-6px_rgba(255,255,255,.5)] ring-white/70' : 'ring-white/10 hover:ring-white/30',
            )}
          >
            <div
              className="absolute inset-0 opacity-90 transition-transform duration-700 group-hover:scale-110"
              style={{
                background: `radial-gradient(circle at 20% 20%, ${s.palette[1]}, transparent 60%), radial-gradient(circle at 80% 30%, ${s.palette[2]}, transparent 55%), radial-gradient(circle at 60% 90%, ${s.palette[3]}, transparent 60%), ${s.palette[0]}`,
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            <div className="relative">
              <div className="flex -space-x-1.5">
                {s.orbs.slice(0, 5).map((o, k) => {
                  const d = SOUND_MAP[o.s]
                  if (!d) return null
                  const I = d.icon
                  return (
                    <span key={k} className="grid h-6 w-6 place-items-center rounded-full ring-2 ring-black/30" style={{ background: `linear-gradient(145deg, ${d.colors[0]}, ${d.colors[1]})` }}>
                      <I size={11} className="text-white" />
                    </span>
                  )
                })}
              </div>
              <div className="mt-6 text-[13.5px] font-semibold tracking-tight text-white">{s.name}</div>
              <div className="truncate text-[11px] text-white/65">{s.mood}</div>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  )
}

function AtmospherePanel() {
  const space = useStore((s) => s.space)
  const warmth = useStore((s) => s.warmth)
  const orbitSpeed = useStore((s) => s.orbitSpeed)
  const master = useStore((s) => s.masterVolume)
  const room = useStore((s) => s.room)
  const doppler = useStore((s) => s.doppler)
  const evolve = useStore((s) => s.evolve)
  const set = useStore.getState().set
  return (
    <div>
      <PanelTitle aside="Synthesised impulse responses">Room</PanelTitle>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {ROOMS.map((r) => (
          <button
            key={r.id}
            onClick={() => set('room', r.id)}
            className={cx(
              'rounded-[16px] px-3 py-2.5 text-left ring-1 transition-colors',
              room === r.id ? 'bg-white text-black ring-white' : 'bg-white/[0.05] text-white/85 ring-white/10 hover:bg-white/10',
            )}
          >
            <div className="text-[12.5px] font-semibold">{r.name}</div>
            <div className={cx('truncate text-[10.5px]', room === r.id ? 'text-black/55' : 'text-white/45')}>{r.blurb}</div>
          </button>
        ))}
      </div>
      <div className="mt-5 grid gap-x-6 gap-y-4 px-1 sm:grid-cols-2">
        <Slider label="Master" value={master} onChange={(v) => set('masterVolume', v)} />
        <Slider label="Space · reverb level" value={space} onChange={(v) => set('space', v)} accent="#a5b4fc" />
        <Slider
          label="Warmth"
          value={warmth}
          min={-1}
          max={1}
          bipolar
          onChange={(v) => set('warmth', v)}
          accent="#fdba74"
          format={(v) => (Math.abs(v) < 0.05 ? 'Neutral' : v < 0 ? `Dark ${Math.round(-v * 100)}` : `Bright ${Math.round(v * 100)}`)}
        />
        <Slider label="Orbit speed" value={orbitSpeed} min={0.2} max={4} onChange={(v) => set('orbitSpeed', v)} accent="#67e8f9" format={(v) => `${v.toFixed(1)}×`} />
      </div>
      <div className="mt-4 grid gap-1 px-1 sm:grid-cols-2 sm:gap-x-6">
        <Switch label="Doppler" hint="Moving orbs bend in pitch" checked={doppler} onChange={(v) => set('doppler', v)} />
        <Switch label="Evolving weather" hint="Storms build and pass over 20 min" checked={evolve} onChange={(v) => set('evolve', v)} />
      </div>
    </div>
  )
}

function ViewPanel() {
  const tilt = useStore((s) => s.tilt)
  const breathe = useStore((s) => s.breathe)
  const zoom = useStore((s) => s.zoom)
  const set = useStore.getState().set
  return (
    <div className="mx-auto max-w-md">
      <PanelTitle aside="Pinch or ⌘-scroll to zoom">View</PanelTitle>
      <div className="flex flex-col gap-1 px-1">
        <Switch label="3D tilt" hint="Tilt the field into perspective — orbs float by height" checked={tilt} onChange={(v) => set('tilt', v)} />
        <Switch label="Breathing mode" hint="The field expands and contracts at 6 breaths a minute" checked={breathe} onChange={(v) => set('breathe', v)} />
      </div>
      <div className="mt-4 px-1">
        <Slider label="Zoom" value={zoom} min={0.6} max={1.6} onChange={(v) => set('zoom', v)} format={(v) => `${Math.round(v * 100)}%`} />
      </div>
    </div>
  )
}

function ToolsPanel({ onPick }: { onPick: () => void }) {
  const walls = useStore((s) => s.walls.length)
  const st = useStore.getState
  const Tool = ({ icon, title, body, onClick }: { icon: ReactNode; title: string; body: string; onClick: () => void }) => (
    <button onClick={onClick} className="flex items-start gap-3 rounded-[20px] bg-white/[0.05] p-3 text-left ring-1 ring-white/10 transition-colors hover:bg-white/10">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-white/10 text-white">{icon}</span>
      <span>
        <span className="block text-[13px] font-semibold text-white">{title}</span>
        <span className="block text-[11.5px] leading-snug text-white/50">{body}</span>
      </span>
    </button>
  )
  return (
    <div>
      <PanelTitle>Tools</PanelTitle>
      <div className="grid gap-2 sm:grid-cols-2">
        <Tool
          icon={<BrickWall size={17} />}
          title="Add a wall"
          body="Sounds behind it are muffled. Drag to move, drag the ends to stretch."
          onClick={() => {
            st().addWall()
            onPick()
          }}
        />
        <Tool
          icon={<Upload size={17} />}
          title="Import audio"
          body="Turn your own recording into an orb (stays on this device)."
          onClick={() => {
            pickAudioFile()
            onPick()
          }}
        />
        <Tool
          icon={<Wind size={17} />}
          title="Draw a path"
          body="Select an orb, then sketch a loop for it to travel."
          onClick={() => {
            const id = st().selectedId
            if (id) st().set('drawPathFor', id)
            else st().toast('Select an orb first, then draw its path')
            onPick()
          }}
        />
        <Tool
          icon={<Eraser size={17} />}
          title="Clear field"
          body="Remove every sound (undo with ⌘Z)."
          onClick={() => {
            st().clear()
            onPick()
          }}
        />
      </div>
      {walls > 0 && (
        <button onClick={() => useStore.setState({ walls: [] })} className="mt-3 text-[12px] text-white/50 hover:text-white">
          Remove all {walls} wall{walls > 1 ? 's' : ''}
        </button>
      )}
    </div>
  )
}

function SleepPanel({ onPick }: { onPick: () => void }) {
  const sleepAt = useStore((s) => s.sleepAt)
  const opts = [15, 30, 45, 60, 90]
  return (
    <div className="mx-auto max-w-md">
      <h3 className="px-1 text-[15px] font-semibold tracking-tight text-white">Sleep timer</h3>
      <p className="mb-4 px-1 text-[12px] text-white/45">Your soundscape gently fades out over the final minute.</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {opts.map((m) => (
          <button
            key={m}
            onClick={() => {
              useStore.getState().set('sleepAt', Date.now() + m * 60_000)
              useStore.getState().toast(`Sleep timer set for ${m} minutes`)
              onPick()
            }}
            className="rounded-[18px] bg-white/[0.06] py-3 text-[13px] font-medium text-white/85 ring-1 ring-white/10 transition-colors hover:bg-white hover:text-black"
          >
            {m}m
          </button>
        ))}
        <button
          disabled={!sleepAt}
          onClick={() => {
            useStore.getState().set('sleepAt', null)
            onPick()
          }}
          className="rounded-[18px] bg-white/[0.06] py-3 text-[13px] font-medium text-white/60 ring-1 ring-white/10 transition-colors hover:bg-white/15 disabled:opacity-35"
        >
          Off
        </button>
      </div>
    </div>
  )
}

function HistoryPanel() {
  const { entries, index } = useHistory()
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current?.querySelector('[data-current]')?.scrollIntoView({ block: 'nearest' })
  }, [index])
  return (
    <div className="mx-auto max-w-md">
      <PanelTitle aside="⌘Z · ⇧⌘Z">History</PanelTitle>
      <div className="flex items-center gap-2 px-1">
        <IconButton label="Undo" size="sm" disabled={index <= 0} onClick={undo}>
          <Undo2 size={15} />
        </IconButton>
        <IconButton label="Redo" size="sm" disabled={index >= entries.length - 1} onClick={redo}>
          <Redo2 size={15} />
        </IconButton>
        <Slider
          className="flex-1"
          value={Math.max(0, index)}
          min={0}
          max={Math.max(1, entries.length - 1)}
          step={1}
          onChange={(v) => goTo(Math.round(v))}
          accent="#c7d2fe"
        />
      </div>
      <div ref={listRef} className="mask-fade-y mt-3 flex max-h-56 flex-col-reverse gap-0.5 overflow-y-auto px-1">
        {entries.map((e, i) => (
          <button
            key={e.at + i}
            data-current={i === index ? '' : undefined}
            onClick={() => goTo(i)}
            className={cx(
              'flex items-center justify-between rounded-[12px] px-3 py-1.5 text-left text-[12.5px] transition-colors',
              i === index ? 'bg-white text-black' : i > index ? 'text-white/35 hover:bg-white/8' : 'text-white/75 hover:bg-white/8',
            )}
          >
            {e.label}
            <span className={cx('text-[10.5px] tabular-nums', i === index ? 'text-black/50' : 'text-white/30')}>
              {new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function SnapshotsPanel() {
  const snapshots = useStore((s) => s.snapshots)
  const [secs, setSecs] = useState(8)
  const save = () => {
    const st = useStore.getState()
    if (!st.orbs.length) return st.toast('Add some sounds first')
    const name = `Snapshot ${String.fromCharCode(65 + (snapshots.length % 26))}`
    const snap = { id: newId('s'), name, createdAt: Date.now(), orbs: st.orbs.map((o) => ({ ...o })), palette: st.palette }
    const next = [...snapshots, snap].slice(-8)
    st.set('snapshots', next)
    persistSnapshots(next)
    st.toast(`${name} saved`, 'success')
  }
  return (
    <div className="mx-auto max-w-lg">
      <PanelTitle aside="Morph smoothly between mixes">Snapshots</PanelTitle>
      <div className="px-1">
        <Slider label="Morph time" value={secs} min={1} max={60} step={1} onChange={setSecs} format={(v) => `${Math.round(v)} s`} accent="#f0abfc" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {snapshots.map((s) => (
          <div key={s.id} className="group relative overflow-hidden rounded-[20px] p-3 ring-1 ring-white/10">
            <div className="absolute inset-0 opacity-70" style={{ background: `radial-gradient(circle at 30% 20%, ${s.palette[1]}, transparent 65%), radial-gradient(circle at 80% 90%, ${s.palette[2]}, transparent 60%), ${s.palette[0]}` }} />
            <div className="relative">
              <div className="text-[13px] font-semibold text-white">{s.name}</div>
              <div className="text-[10.5px] text-white/60">{s.orbs.length} sounds</div>
              <div className="mt-3 flex gap-1">
                <button onClick={() => morph.start(s, secs)} className="flex-1 rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-black">
                  Morph
                </button>
                <button
                  aria-label="Delete snapshot"
                  onClick={() => {
                    const next = snapshots.filter((x) => x.id !== s.id)
                    useStore.getState().set('snapshots', next)
                    persistSnapshots(next)
                  }}
                  className="grid w-7 place-items-center rounded-full bg-white/15 text-white/80 hover:bg-white/25"
                >
                  <Trash size={11} />
                </button>
              </div>
            </div>
          </div>
        ))}
        <button
          onClick={save}
          className="grid min-h-[96px] place-items-center rounded-[20px] border border-dashed border-white/25 text-[12px] font-medium text-white/70 transition-colors hover:border-white/50 hover:bg-white/5 hover:text-white"
        >
          <span className="flex flex-col items-center gap-1">
            <BookmarkPlus size={18} /> Save current
          </span>
        </button>
      </div>
    </div>
  )
}

export function persistSnapshots(list: unknown) {
  try {
    localStorage.setItem('aether:snapshots:v1', JSON.stringify(list))
  } catch {
    /* storage unavailable */
  }
}
