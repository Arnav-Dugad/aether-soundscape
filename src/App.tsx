import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { engine } from './audio/engine'
import { startAudioSync } from './audio/sync'
import { SCENES } from './audio/scenes'
import { useStore } from './store'
import { runtime } from './runtime'
import { decodeMix, loadLocal } from './lib/share'
import { MeshBackground } from './components/MeshBackground'
import { Stage } from './components/Stage'
import { Library } from './components/Library'
import { Inspector } from './components/Inspector'
import { Dock } from './components/Dock'
import { HelpSheet, Intro, Toasts, TopBar } from './components/Chrome'
import { Glass, IconButton } from './components/ui'
import { X } from 'lucide-react'

function useCompact() {
  const q = '(max-width: 1079px)'
  const [compact, set] = useState(() => matchMedia(q).matches)
  useEffect(() => {
    const m = matchMedia(q)
    const on = () => set(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return compact
}

async function enter() {
  await engine.start()
  startAudioSync()
  const st = useStore.getState()
  const hash = location.hash.startsWith('#mix=') ? decodeMix(location.hash.slice(5)) : null
  const local = !hash ? decodeMix(loadLocal() ?? '') : null
  const mix = hash ?? local
  if (mix && mix.orbs.length) {
    st.loadMix(mix.orbs, mix.palette)
    if (hash) st.toast('Loaded a shared soundscape', 'success')
  } else st.loadScene(SCENES[0])
  st.setStarted()
  st.setPlaying(true)
}

export default function App() {
  const started = useStore((s) => s.started)
  const selectedId = useStore((s) => s.selectedId)
  const mobilePanel = useStore((s) => s.mobilePanel)
  const compact = useCompact()

  useKeyboard()

  return (
    <>
      <MeshBackground />
      <AnimatePresence>
        {started && (
          <motion.main
            key="app"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="relative z-10 flex h-dvh flex-col gap-3 p-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:gap-4 sm:p-5"
          >
            <TopBar />
            <div className="flex min-h-0 flex-1 gap-4">
              {!compact && (
                <Glass
                  initial={{ x: -40, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 120, damping: 20, delay: 0.15 }}
                  className="w-[280px] shrink-0 overflow-hidden rounded-[36px] xl:w-[310px]"
                >
                  <Library />
                </Glass>
              )}
              <div className="min-w-0 flex-1">
                <Stage />
              </div>
              {!compact && (
                <Glass
                  initial={{ x: 40, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 120, damping: 20, delay: 0.2 }}
                  className="w-[290px] shrink-0 overflow-hidden rounded-[36px] xl:w-[320px]"
                >
                  <Inspector />
                </Glass>
              )}
            </div>
            <Dock compact={compact} />
          </motion.main>
        )}
      </AnimatePresence>

      {started && compact && (
        <AnimatePresence>
          {mobilePanel === 'library' ? (
            <Sheet key="lib" onClose={() => useStore.getState().set('mobilePanel', null)} tall>
              <Library onPicked={() => useStore.getState().set('mobilePanel', null)} />
            </Sheet>
          ) : selectedId ? (
            <Sheet key="insp" onClose={() => useStore.getState().select(null)}>
              <Inspector />
            </Sheet>
          ) : null}
        </AnimatePresence>
      )}

      <AnimatePresence>{!started && <Intro key="intro" onEnter={enter} />}</AnimatePresence>
      <Toasts />
      <HelpSheet />
    </>
  )
}

/** Mobile bottom sheet with drag-to-dismiss. */
function Sheet({ children, onClose, tall }: { children: React.ReactNode; onClose: () => void; tall?: boolean }) {
  return (
    <Glass
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0.05, bottom: 0.6 }}
      onDragEnd={(_, info) => {
        if (info.offset.y > 90 || info.velocity.y > 500) onClose()
      }}
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 260, damping: 30 }}
      className={`fixed inset-x-2 bottom-2 z-[60] flex flex-col overflow-hidden rounded-[34px] ${tall ? 'h-[72dvh]' : 'max-h-[58dvh]'}`}
    >
      <div className="relative flex shrink-0 justify-center pb-1 pt-2.5">
        <div className="h-1.5 w-10 rounded-full bg-white/30" />
        <IconButton label="Close" size="sm" className="!absolute right-3 top-2" onClick={onClose}>
          <X size={15} />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" onPointerDownCapture={(e) => e.stopPropagation()}>
        {children}
      </div>
    </Glass>
  )
}

function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement
      if (tgt.closest('input, textarea, [contenteditable]')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const st = useStore.getState()
      if (!st.started) return
      const sel = st.orbs.find((o) => o.id === st.selectedId)
      const k = e.key
      if (k === ' ') {
        if (tgt.closest('button, [role="button"], [role="slider"]')) return
        e.preventDefault()
        st.setPlaying(!st.playing)
      } else if (k === 'Escape') {
        if (st.helpOpen) st.set('helpOpen', false)
        else st.select(null)
      } else if (k === '?') st.set('helpOpen', !st.helpOpen)
      else if (k === 'o' || k === 'O') {
        st.set('orbit', !st.orbit)
        st.toast(st.orbit ? 'Orbit motion off' : 'Orbit motion on — ringed orbs now circle you')
      } else if (k === 's' || k === 'S') st.scatter()
      else if (/^[1-8]$/.test(k)) {
        const scene = SCENES[Number(k) - 1]
        st.loadScene(scene)
        st.setPlaying(true)
        st.toast(scene.name)
      } else if (k === '[' || k === ']') st.set('heading', st.heading + (k === '[' ? -Math.PI / 12 : Math.PI / 12))
      else if (sel && (k === 'Delete' || k === 'Backspace')) st.removeOrb(sel.id)
      else if (sel && (k === 'm' || k === 'M')) st.updateOrb(sel.id, { muted: !sel.muted })
      else if (sel && (k === 'd' || k === 'D')) st.duplicateOrb(sel.id)
      else if (sel && k.startsWith('Arrow')) {
        e.preventDefault()
        const step = e.shiftKey ? 0.12 : 0.04
        const rt = runtime.get(sel.id)
        let x = rt?.nx ?? sel.x
        let y = rt?.ny ?? sel.y
        if (k === 'ArrowLeft') x -= step
        if (k === 'ArrowRight') x += step
        if (k === 'ArrowUp') y -= step
        if (k === 'ArrowDown') y += step
        const n = Math.hypot(x, y)
        if (n > 1) {
          x /= n
          y /= n
        }
        st.updateOrb(sel.id, { x, y, rev: sel.rev + 1 })
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
}
