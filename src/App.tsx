import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { engine } from './audio/engine'
import { startAudioSync } from './audio/sync'
import { SCENES } from './audio/scenes'
import { useStore, type Snapshot } from './store'
import { runtime } from './runtime'
import { redo, startHistory, undo } from './history'
import { restoreImports } from './lib/imports'
import { decodeMix, loadLocal } from './lib/share'
import { MeshBackground } from './components/MeshBackground'
import { Stage } from './components/Stage'
import { Library } from './components/Library'
import { Inspector } from './components/Inspector'
import { Dock } from './components/Dock'
import { HelpSheet, Intro, Toasts, TopBar } from './components/Chrome'
import { Composer } from './components/Composer'
import { SettingsSheet } from './components/Settings'
import { maybeStartTour, Tour } from './components/Tour'
import { RefractionDefs } from './components/Refraction'
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
  await restoreImports()
  startAudioSync()
  const st = useStore.getState()
  try {
    const snaps = JSON.parse(localStorage.getItem('aether:snapshots:v1') ?? '[]') as Snapshot[]
    if (Array.isArray(snaps)) st.set('snapshots', snaps)
  } catch {
    /* ignore corrupt snapshots */
  }
  const hash = location.hash.startsWith('#mix=') ? decodeMix(location.hash.slice(5)) : null
  const local = !hash ? decodeMix(loadLocal() ?? '') : null
  const mix = hash ?? local
  if (mix && mix.orbs.length) {
    st.loadMix(mix.orbs, { palette: mix.palette, walls: mix.walls, room: mix.room })
    if (hash) st.toast('Loaded a shared soundscape', 'success')
  } else st.loadScene(SCENES[0])
  st.setStarted()
  st.setPlaying(true)
  startHistory()
  maybeStartTour()
}

export default function App() {
  const started = useStore((s) => s.started)
  const selectedId = useStore((s) => s.selectedId)
  const mobilePanel = useStore((s) => s.mobilePanel)
  const compact = useCompact()

  useKeyboard()

  return (
    <>
      <RefractionDefs />
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
                  data-tour="library"
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
                  data-tour="inspector"
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
      <Composer />
      <SettingsSheet />
      <Tour />
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
      const st = useStore.getState()
      if (!st.started) return
      if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (st.composerOpen || st.settingsOpen || st.tourStep !== null) {
        if (e.key === 'Escape') {
          st.set('composerOpen', false)
          st.set('settingsOpen', false)
        }
        return
      }
      const sel = st.orbs.find((o) => o.id === st.selectedId)
      const k = e.key
      if (k === ' ') {
        if (tgt.closest('button, [role="button"], [role="slider"]')) return
        e.preventDefault()
        st.setPlaying(!st.playing)
      } else if (k === 'Escape') {
        if (st.helpOpen) st.set('helpOpen', false)
        else if (st.drawPathFor) st.set('drawPathFor', null)
        else st.select(null)
      } else if (k === '?') st.set('helpOpen', !st.helpOpen)
      else if (k === 'o' || k === 'O') {
        st.set('orbit', !st.orbit)
        st.toast(st.orbit ? 'Orbit motion off' : 'Orbit motion on — ringed orbs now circle you')
      } else if (k === 's' || k === 'S') st.scatter()
      else if (/^[0-9]$/.test(k)) {
        const scene = SCENES[k === '0' ? 9 : Number(k) - 1]
        if (!scene) return
        st.loadScene(scene)
        st.setPlaying(true)
        st.toast(scene.name)
      } else if (k === '[' || k === ']') st.set('heading', st.heading + (k === '[' ? -Math.PI / 12 : Math.PI / 12))
      else if (k === 'a' || k === 'A') st.set('composerOpen', true)
      else if (k === 'w' || k === 'W') st.addWall()
      else if (k === 'b' || k === 'B') st.set('breathe', !st.breathe)
      else if (k === 't' || k === 'T') st.set('tilt', !st.tilt)
      else if (k === 'p' || k === 'P') {
        if (sel) st.set('drawPathFor', sel.id)
      } else if (k === 'g' || k === 'G') {
        if (st.multi.length > 1) st.groupSelected()
      } else if (k === '=' || k === '+') st.set('zoom', Math.min(1.6, st.zoom * 1.1))
      else if (k === '-' || k === '_') st.set('zoom', Math.max(0.6, st.zoom / 1.1))
      else if (k === 'PageUp' || k === 'PageDown') {
        if (sel) st.updateOrb(sel.id, { z: Math.max(-1, Math.min(1, sel.z + (k === 'PageUp' ? 0.1 : -0.1))) })
      } else if (st.selectedWallId && (k === 'Delete' || k === 'Backspace')) st.removeWall(st.selectedWallId)
      else if (sel && (k === 'Delete' || k === 'Backspace')) st.removeSelected()
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
