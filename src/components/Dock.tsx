import { AnimatePresence, motion } from 'framer-motion'
import {
  Eraser, Layers, Library as LibraryIcon, Moon, Orbit, Pause, Play, Share2, Shuffle, SlidersHorizontal, Volume2,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { SCENES } from '../audio/scenes'
import { SOUND_MAP } from '../audio/catalog'
import { engine } from '../audio/engine'
import { useStore } from '../store'
import { encodeMix } from '../lib/share'
import { cx, Glass, IconButton, Slider, spring } from './ui'

type Pop = 'scenes' | 'atmos' | 'sleep' | null

export function Dock({ compact }: { compact: boolean }) {
  const playing = useStore((s) => s.playing)
  const orbit = useStore((s) => s.orbit)
  const master = useStore((s) => s.masterVolume)
  const sceneId = useStore((s) => s.sceneId)
  const sleepAt = useStore((s) => s.sleepAt)
  const recordingSince = useStore((s) => s.recordingSince)
  const mobilePanel = useStore((s) => s.mobilePanel)
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

  return (
    <div ref={ref} className="relative flex justify-center">
      <AnimatePresence>
        {pop && (
          <Glass
            key={pop}
            initial={{ opacity: 0, y: 14, scale: 0.96, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: 10, scale: 0.97, filter: 'blur(6px)' }}
            transition={spring}
            className="absolute bottom-[calc(100%+12px)] z-50 w-[min(640px,calc(100vw-24px))] origin-bottom rounded-[32px] p-4"
          >
            {pop === 'scenes' && <ScenesPanel onPick={() => setPop(null)} />}
            {pop === 'atmos' && <AtmospherePanel />}
            {pop === 'sleep' && <SleepPanel onPick={() => setPop(null)} />}
          </Glass>
        )}
      </AnimatePresence>

      <Glass
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 140, damping: 20, delay: 0.25 }}
        className="flex max-w-full items-center gap-1 rounded-full p-1.5 sm:gap-1.5 sm:p-2"
      >
        <motion.button
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => useStore.getState().setPlaying(!playing)}
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
          <div className="flex items-center gap-2 px-2">
            <Volume2 size={16} className="text-white/55" />
            <Slider className="w-24" value={master} onChange={(v) => useStore.getState().set('masterVolume', v)} />
          </div>
        )}

        <Divider />

        <DockPill active={pop === 'scenes'} onClick={() => toggle('scenes')} label="Scenes">
          <Layers size={17} />
          <span className="hidden max-w-28 truncate sm:inline">{scene?.name ?? 'Scenes'}</span>
        </DockPill>

        {compact && (
          <IconButton
            label="Library"
            active={mobilePanel === 'library'}
            onClick={() => useStore.getState().set('mobilePanel', mobilePanel === 'library' ? null : 'library')}
          >
            <LibraryIcon size={18} />
          </IconButton>
        )}
        <IconButton label="Orbit motion" shortcut="O" active={orbit} onClick={() => useStore.getState().set('orbit', !orbit)}>
          <Orbit size={18} className={cx(orbit && 'animate-[spin_6s_linear_infinite]')} />
        </IconButton>
        <IconButton label="Atmosphere" active={pop === 'atmos'} onClick={() => toggle('atmos')}>
          <SlidersHorizontal size={18} />
        </IconButton>
        <IconButton label="Sleep timer" active={pop === 'sleep' || !!sleepAt} onClick={() => toggle('sleep')}>
          <Moon size={18} />
        </IconButton>
        <RecordButton since={recordingSince} />

        {!compact && <Divider />}
        {!compact && (
          <>
            <IconButton label="Surprise me" shortcut="S" onClick={() => useStore.getState().scatter()}>
              <Shuffle size={18} />
            </IconButton>
            <IconButton label="Copy share link" onClick={shareMix}>
              <Share2 size={18} />
            </IconButton>
            <IconButton label="Clear field" onClick={() => useStore.getState().clear()}>
              <Eraser size={18} />
            </IconButton>
          </>
        )}
        <SleepCountdown at={sleepAt} />
      </Glass>
    </div>
  )
}

export async function shareMix() {
  const { orbs, palette, toast } = useStore.getState()
  const url = `${location.origin}${location.pathname}#mix=${encodeMix(orbs, palette)}`
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
      } else st.toast('Recording is not supported in this browser')
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
      <div className="mb-3 flex items-baseline justify-between px-1">
        <h3 className="text-[15px] font-semibold tracking-tight text-white">Scenes</h3>
        <span className="text-[11px] text-white/40">Press 1–8</span>
      </div>
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
              sceneId === s.id ? 'ring-white/70 shadow-[0_0_30px_-6px_rgba(255,255,255,.5)]' : 'ring-white/10 hover:ring-white/30',
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
  const set = useStore.getState().set
  return (
    <div className="mx-auto max-w-sm">
      <h3 className="mb-4 px-1 text-[15px] font-semibold tracking-tight text-white">Atmosphere</h3>
      <div className="flex flex-col gap-4 px-1 pb-1">
        <Slider label="Master" value={master} onChange={(v) => set('masterVolume', v)} />
        <Slider label="Space · Hall reverb" value={space} onChange={(v) => set('space', v)} accent="#a5b4fc" />
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
        <Slider
          label="Orbit speed"
          value={orbitSpeed}
          min={0.2}
          max={4}
          onChange={(v) => set('orbitSpeed', v)}
          accent="#67e8f9"
          format={(v) => `${v.toFixed(1)}×`}
        />
      </div>
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
