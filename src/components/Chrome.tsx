import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Check, Circle, Headphones, HelpCircle, Maximize2, Minimize2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SOUNDS } from '../audio/catalog'
import { CREDITS } from '../audio/credits'
import { useStore } from '../store'
import { Glass, IconButton, Kbd, spring } from './ui'

/** Animated brand mark: a tiny orbiting system. */
export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full border border-white/25" />
      <div className="absolute inset-[28%] rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff,#a5b4fc_40%,#7c3aed_80%)] shadow-[0_0_18px_rgba(165,180,252,.8)]" />
      <div className="absolute inset-0 animate-[spin_5s_linear_infinite]">
        <div className="absolute -top-[3px] left-1/2 h-[7px] w-[7px] -translate-x-1/2 rounded-full bg-cyan-300 shadow-[0_0_10px_#67e8f9]" />
      </div>
      <div className="absolute inset-0 animate-[spin_9s_linear_infinite_reverse]">
        <div className="absolute -bottom-[2px] left-1/2 h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-pink-300 shadow-[0_0_10px_#f9a8d4]" />
      </div>
    </div>
  )
}

export function TopBar() {
  const [fs, setFs] = useState(false)
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  return (
    <motion.header
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 140, damping: 20 }}
      className="flex items-center justify-between gap-3"
    >
      <Glass className="flex items-center gap-3 rounded-full py-2 pl-2.5 pr-5">
        <LogoMark />
        <div className="leading-tight">
          <div className="text-[15px] font-semibold tracking-tight text-white">Aether</div>
          <div className="hidden text-[11px] text-white/50 sm:block">Spatial Soundscape Mixer</div>
        </div>
      </Glass>
      <Glass className="flex items-center gap-1 rounded-full p-1.5">
        <div className="hidden items-center gap-2 px-3 text-[12px] font-medium text-white/65 md:flex">
          <Headphones size={15} />
          HRTF binaural · 3D
          <span className="relative ml-1 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
        </div>
        <IconButton label="Shortcuts & tips" shortcut="?" onClick={() => useStore.getState().set('helpOpen', true)}>
          <HelpCircle size={18} />
        </IconButton>
        <IconButton
          label={fs ? 'Exit full screen' : 'Full screen'}
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())}
        >
          {fs ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
        </IconButton>
      </Glass>
    </motion.header>
  )
}

export function Intro({ onEnter }: { onEnter: () => void }) {
  const [busy, setBusy] = useState(false)
  const sample = SOUNDS.filter((_, i) => i % 3 === 0).slice(0, 8)
  return (
    <motion.div
      className="fixed inset-0 z-[100] grid place-items-center overflow-hidden p-5"
      exit={{ opacity: 0, scale: 1.08, filter: 'blur(24px)' }}
      transition={{ duration: 0.9, ease: [0.4, 0, 0.2, 1] }}
    >
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative flex flex-col items-center text-center">
        {/* orbiting constellation */}
        <div className="relative mb-10 h-56 w-56 sm:h-64 sm:w-64">
          {[0.42, 0.72, 1].map((r, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full border border-white/15"
              style={{ inset: `${(1 - r) * 50}%` }}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 + i * 0.12, ...spring }}
            />
          ))}
          <motion.div
            className="absolute inset-[38%] rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff,#c7d2fe_35%,#7c3aed_85%)] shadow-[0_0_60px_rgba(165,180,252,.7)]"
            initial={{ scale: 0 }}
            animate={{ scale: [1, 1.06, 1] }}
            transition={{ scale: { repeat: Infinity, duration: 3.2, ease: 'easeInOut' } }}
          />
          {sample.map((s, i) => {
            const ring = [0.42, 0.72, 1][i % 3]
            const Icon = s.icon
            const dur = 18 + (i % 3) * 10
            return (
              <motion.div
                key={s.id}
                className="absolute inset-0"
                initial={{ rotate: (i / sample.length) * 360, opacity: 0 }}
                animate={{ rotate: (i / sample.length) * 360 + 360, opacity: 1 }}
                transition={{ rotate: { repeat: Infinity, duration: dur, ease: 'linear' }, opacity: { delay: 0.5 + i * 0.08 } }}
              >
                <div
                  className="absolute left-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full shadow-[inset_0_1px_3px_rgba(255,255,255,.6)]"
                  style={{
                    top: `${(1 - ring) * 50}%`,
                    background: `radial-gradient(circle at 35% 30%, #fff 0%, ${s.colors[0]} 25%, ${s.colors[1]} 90%)`,
                    boxShadow: `0 0 24px ${s.colors[0]}`,
                  }}
                >
                  <Icon size={15} className="text-white" />
                </div>
              </motion.div>
            )
          })}
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 20, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: 0.3, duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
          className="text-gradient text-6xl font-semibold tracking-[-0.045em] sm:text-8xl"
        >
          Aether
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="mt-4 max-w-md text-balance text-[15px] leading-relaxed text-white/65 sm:text-[17px]"
        >
          Sculpt sound in space. Drag glowing sources around you and mix a living, three-dimensional soundscape — synthesised
          live, in real time.
        </motion.p>
        <motion.button
          initial={{ opacity: 0, y: 14, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.7, ...spring }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            await onEnter()
          }}
          className="enter-btn group mt-9 flex h-14 items-center gap-3 rounded-full bg-white pl-7 pr-2 text-[15px] font-semibold text-black"
        >
          {busy ? 'Tuning the room…' : 'Enter the soundscape'}
          <span className="grid h-10 w-10 place-items-center rounded-full bg-black text-white transition-transform duration-300 group-hover:translate-x-0.5">
            <ArrowRight size={18} />
          </span>
        </motion.button>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-6 flex items-center gap-2 text-[12.5px] text-white/50"
        >
          <Headphones size={15} /> Best experienced with headphones
        </motion.div>
      </div>
    </motion.div>
  )
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[90] flex flex-col items-center gap-2 px-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <Glass
            key={t.id}
            layout
            initial={{ opacity: 0, y: -16, scale: 0.9, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -10, scale: 0.95, filter: 'blur(6px)' }}
            transition={spring}
            className="flex items-center gap-2 rounded-full py-2 pl-2.5 pr-4 text-[13px] font-medium text-white"
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-white/15">
              {t.tone === 'record' ? (
                <Circle size={10} className="fill-rose-500 text-rose-500" />
              ) : (
                <Check size={13} />
              )}
            </span>
            {t.text}
          </Glass>
        ))}
      </AnimatePresence>
    </div>
  )
}

const SHORTCUTS: [string[], string][] = [
  [['Space'], 'Play / pause'],
  [['1', '–', '0'], 'Load a scene'],
  [['A'], 'AI Composer'],
  [['⌘', 'Z'], 'Undo  ·  ⇧⌘Z redo'],
  [['O'], 'Toggle orbit motion'],
  [['S'], 'Surprise me — random constellation'],
  [['W'], 'Add a wall'],
  [['P'], 'Draw a path for the selected orb'],
  [['G'], 'Group the selection'],
  [['B'], 'Breathing mode'],
  [['T'], '3D tilt view'],
  [['+', '−'], 'Zoom the field'],
  [['←', '↑', '→', '↓'], 'Nudge selected orb (⇧ for more)'],
  [['PgUp', 'PgDn'], 'Raise / lower selected orb'],
  [['[', ']'], 'Turn your head'],
  [['M'], 'Mute selected'],
  [['D'], 'Duplicate selected'],
  [['⌫'], 'Remove selection / wall'],
  [['Esc'], 'Deselect'],
]

export function HelpSheet() {
  const open = useStore((s) => s.helpOpen)
  const close = () => useStore.getState().set('helpOpen', false)
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[95] grid place-items-center bg-black/40 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={close}
        >
          <Glass
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={spring}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85dvh] w-full max-w-xl overflow-y-auto rounded-[36px] p-6 sm:p-8"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-white">How Aether works</h2>
                <p className="mt-1 text-[13px] text-white/55">You are the node in the centre. Every orb is a sound source in a 16-metre space.</p>
              </div>
              <IconButton label="Close" size="sm" onClick={close}>
                <X size={16} />
              </IconButton>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                ['Distance', 'Closer is louder and drier. Far sources lose treble to the air and bloom into the hall.'],
                ['Direction', 'HRTF binaural panning places each sound left, right, in front of or behind you.'],
                ['Orbital rings', 'Release near a ring and the orb snaps on magnetically. Turn on Orbit and ringed orbs circle you.'],
                ['Your head', 'Drag the centre node to turn — or enable webcam / motion head tracking in Settings.'],
                ['Walls & paths', 'Walls muffle what is behind them. Draw a loop and an orb will travel it forever.'],
                ['Snapshots', 'Save mixes and morph between them over seconds or minutes. Every edit is undoable.'],
              ].map(([t, d]) => (
                <div key={t} className="rounded-[22px] bg-white/[0.05] p-4 ring-1 ring-white/[0.07]">
                  <div className="text-[13px] font-semibold text-white">{t}</div>
                  <div className="mt-1 text-[12.5px] leading-relaxed text-white/55">{d}</div>
                </div>
              ))}
            </div>
            <h3 className="mb-3 mt-7 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Keyboard</h3>
            <ul className="divide-y divide-white/[0.06]">
              {SHORTCUTS.map(([keys, label]) => (
                <li key={label} className="flex items-center justify-between py-2.5 text-[13px] text-white/75">
                  {label}
                  <span className="flex gap-1">
                    {keys.map((k) => (k === '–' ? <span key={k} className="px-0.5 text-white/40">–</span> : <Kbd key={k}>{k}</Kbd>))}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-[12px] leading-relaxed text-white/40">
              Mouse: scroll over an orb for volume, ⇧-scroll for height, double-click to mute. Drag empty space to lasso (⇧ adds).
              Touch: pinch to zoom, twist two fingers to turn your head.
            </p>
            <h3 className="mb-2 mt-7 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">Field recording credits</h3>
            <p className="mb-3 text-[12px] leading-relaxed text-white/45">
              Every sound is synthesised live. The optional “Realism” blend uses these field recordings, each trimmed, looped,
              loudness-normalised and re-encoded.
            </p>
            <ul className="flex flex-col gap-1.5 text-[11.5px] leading-snug text-white/60">
              {CREDITS.map((c) => (
                <li key={c.sound}>
                  <span className="text-white/80">{c.sound}:</span>{' '}
                  <a href={c.source} target="_blank" rel="noreferrer" className="underline decoration-white/25 underline-offset-2 hover:text-white">
                    “{c.title}”
                  </a>{' '}
                  by {c.author},{' '}
                  {c.licenseUrl ? (
                    <a href={c.licenseUrl} target="_blank" rel="noreferrer" className="underline decoration-white/25 underline-offset-2 hover:text-white">
                      {c.license}
                    </a>
                  ) : (
                    c.license
                  )}
                </li>
              ))}
            </ul>
          </Glass>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
