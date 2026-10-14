import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useLayoutEffect, useState } from 'react'
import { useStore } from '../store'
import { spring } from './ui'

interface Step {
  /** `data-tour` target, or a CSS selector. */
  target: string
  title: string
  body: string
  /** Spotlight shape. */
  round?: boolean
}

const STEPS: Step[] = [
  { target: '[data-tour="listener"] .listener', title: 'This is you', body: 'Every sound is heard from this point, in binaural 3D. Drag around it to turn your head.', round: true },
  { target: '[data-orb]', title: 'Sounds are orbs', body: 'Drag one closer to hear it louder and drier, further for distance and air. Release near a ring and it snaps on magnetically.', round: true },
  { target: '[data-tour="library"]', title: 'A library of living sounds', body: 'Over 35 generators, all synthesised in real time. Click to add, or drag one straight into the field.' },
  { target: '[data-tour="inspector"]', title: 'Shape every source', body: 'Height, EQ, bit-crush, freeze, tape-stop, a field-recording blend, and paths the orb can travel.' },
  { target: '[data-tour="ai"]', title: 'Compose with AI', body: 'Describe a place and Claude, GPT or Gemini will build the soundscape for you.', round: true },
  { target: '[data-tour="dock"]', title: 'Your controls', body: 'Scenes, orbit, rooms, 3D view, breathing mode, snapshots, history, recording and more. Press ? for shortcuts.' },
]

const KEY = 'aether:tour:v1'

export function maybeStartTour() {
  try {
    if (localStorage.getItem(KEY)) return
  } catch {
    return
  }
  setTimeout(() => useStore.getState().set('tourStep', 0), 1600)
}

/** First-run guided tour: a spotlight cut-out over each feature with a glass hint card. */
export function Tour() {
  const step = useStore((s) => s.tourStep)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const cur = step === null ? null : STEPS[step]

  useLayoutEffect(() => {
    if (!cur) return
    const measure = () => {
      const el = document.querySelector(cur.target)
      setRect(el && el.getBoundingClientRect().width > 0 ? el.getBoundingClientRect() : null)
    }
    measure()
    const t = setInterval(measure, 300)
    addEventListener('resize', measure)
    return () => {
      clearInterval(t)
      removeEventListener('resize', measure)
    }
  }, [cur])

  const end = () => {
    useStore.getState().set('tourStep', null)
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* ignore */
    }
  }
  const next = () => {
    if (step === null) return
    if (step >= STEPS.length - 1) end()
    else useStore.getState().set('tourStep', step + 1)
  }

  useEffect(() => {
    if (step === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') end()
      if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      e.stopPropagation()
    }
    addEventListener('keydown', onKey, true)
    return () => removeEventListener('keydown', onKey, true)
  })

  const pad = 10
  const box = rect
    ? cur?.round
      ? (() => {
          const s = Math.max(rect.width, rect.height) + pad * 2
          return { x: rect.left + rect.width / 2 - s / 2, y: rect.top + rect.height / 2 - s / 2, w: s, h: s, r: s / 2 }
        })()
      : { x: rect.left - pad, y: rect.top - pad, w: rect.width + pad * 2, h: rect.height + pad * 2, r: 30 }
    : { x: innerWidth / 2 - 60, y: innerHeight / 2 - 60, w: 120, h: 120, r: 60 }

  // place the card beside the spotlight, wherever there's room
  const cardW = 320
  const below = box.y + box.h + 210 < innerHeight
  const cardX = Math.min(innerWidth - cardW - 16, Math.max(16, box.x + box.w / 2 - cardW / 2))
  const cardY = below ? box.y + box.h + 16 : Math.max(16, box.y - 196)

  return (
    <AnimatePresence>
      {cur && (
        <motion.div key="tour" className="fixed inset-0 z-[120]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={next}>
          <motion.div
            className="tour-spot absolute"
            animate={{ left: box.x, top: box.y, width: box.w, height: box.h, borderRadius: box.r }}
            transition={{ type: 'spring', stiffness: 180, damping: 24 }}
          />
          <motion.div
            className="glass absolute rounded-[26px] p-5"
            style={{ width: cardW }}
            animate={{ left: cardX, top: cardY }}
            transition={{ type: 'spring', stiffness: 180, damping: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <AnimatePresence mode="wait">
              <motion.div key={step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
                  {step! + 1} of {STEPS.length}
                </div>
                <h3 className="mt-1 text-[17px] font-semibold tracking-tight text-white">{cur.title}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/65">{cur.body}</p>
              </motion.div>
            </AnimatePresence>
            <div className="mt-4 flex items-center justify-between">
              <div className="flex gap-1">
                {STEPS.map((_, i) => (
                  <motion.span key={i} className="h-1.5 rounded-full bg-white" animate={{ width: i === step ? 16 : 6, opacity: i === step ? 0.9 : 0.25 }} transition={spring} />
                ))}
              </div>
              <div className="flex gap-2">
                <button onClick={end} className="rounded-full px-3 py-1.5 text-[12px] text-white/55 hover:text-white">
                  Skip
                </button>
                <button onClick={next} className="rounded-full bg-white px-4 py-1.5 text-[12px] font-semibold text-black">
                  {step === STEPS.length - 1 ? 'Start mixing' : 'Next'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
