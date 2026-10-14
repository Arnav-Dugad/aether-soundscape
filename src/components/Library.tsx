import { AnimatePresence, LayoutGroup, motion } from 'framer-motion'
import { Plus, Search, Upload, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { CATEGORIES, SOUNDS, type Category, type SoundDef } from '../audio/catalog'
import { useStore } from '../store'
import { pickAudioFile } from '../lib/imports'
import { cx, spring } from './ui'

export function Library({ onPicked }: { onPicked?: () => void }) {
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState<Category | 'All'>('All')
  const counts = useStore((s) => {
    const m: Record<string, number> = {}
    for (const o of s.orbs) m[o.soundId] = (m[o.soundId] ?? 0) + 1
    return JSON.stringify(m)
  })
  const inMix = useMemo(() => JSON.parse(counts) as Record<string, number>, [counts])

  const custom = useStore((s) => s.customSounds.length)
  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return SOUNDS.filter(
      (s) =>
        (cat === 'All' || s.category === cat) &&
        (!q || s.name.toLowerCase().includes(q) || s.blurb.toLowerCase().includes(q) || s.category.toLowerCase().includes(q)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, cat, custom])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-5 pb-3 pt-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[17px] font-semibold tracking-tight text-white">Sound Library</h2>
          <span className="flex items-center gap-2">
            <span className="text-[11px] tabular-nums text-white/40">{SOUNDS.length} sounds</span>
            <button
              onClick={pickAudioFile}
              aria-label="Import audio"
              className="group relative grid h-7 w-7 place-items-center rounded-full bg-white/[0.08] text-white/70 hover:bg-white hover:text-black"
            >
              <Upload size={13} />
              <span className="tooltip">Import your own audio</span>
            </button>
          </span>
        </div>
        <p className="mt-0.5 text-[12px] text-white/45">Every sound is synthesised live in your browser.</p>
        <label className="mt-4 flex h-10 items-center gap-2 rounded-2xl bg-white/[0.07] px-3 shadow-[inset_0_1px_1px_rgba(0,0,0,.25)] ring-1 ring-white/10 focus-within:ring-white/30">
          <Search size={15} className="text-white/45" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search rain, café, drone…"
            className="w-full bg-transparent text-[13px] text-white placeholder:text-white/35 focus:outline-none"
            onKeyDown={(e) => e.stopPropagation()}
          />
          {query && (
            <button aria-label="Clear search" onClick={() => setQuery('')} className="text-white/50 hover:text-white">
              <X size={14} />
            </button>
          )}
        </label>
        <LayoutGroup id="cats">
          <div className="no-scrollbar -mx-1 mt-3 flex gap-1 overflow-x-auto px-1 pb-1">
            {(['All', ...CATEGORIES.filter((c) => c !== 'Imported' || custom > 0)] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCat(c)}
                className={cx(
                  'relative shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors',
                  cat === c ? 'text-black' : 'text-white/60 hover:text-white',
                )}
              >
                {cat === c && (
                  <motion.span layoutId="cat-pill" className="absolute inset-0 rounded-full bg-white" transition={spring} />
                )}
                <span className="relative">{c}</span>
              </button>
            ))}
          </div>
        </LayoutGroup>
      </div>
      <div className="mask-fade-y min-h-0 flex-1 overflow-y-auto px-3 pb-5">
        <motion.ul layout className="flex flex-col gap-1">
          <AnimatePresence initial={false} mode="popLayout">
            {list.map((s, i) => (
              <SoundCard key={s.id} sound={s} count={inMix[s.id] ?? 0} index={i} onPicked={onPicked} />
            ))}
          </AnimatePresence>
        </motion.ul>
        {list.length === 0 && <p className="px-3 py-8 text-center text-sm text-white/45">No sounds match “{query}”.</p>}
      </div>
    </div>
  )
}

function SoundCard({ sound, count, index, onPicked }: { sound: SoundDef; count: number; index: number; onPicked?: () => void }) {
  const Icon = sound.icon
  const add = () => {
    useStore.getState().addOrb(sound.id)
    useStore.getState().toast(`${sound.name} added`)
    onPicked?.()
  }
  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { delay: Math.min(index * 0.02, 0.3), ...spring } }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
    >
      <div
        role="button"
        tabIndex={0}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/x-aether-sound', sound.id)
          e.dataTransfer.effectAllowed = 'copy'
          const ghost = e.currentTarget.querySelector('.card-icon') as HTMLElement | null
          if (ghost) e.dataTransfer.setDragImage(ghost, 20, 20)
        }}
        onClick={add}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            e.stopPropagation()
            add()
          }
        }}
        className="group flex cursor-pointer items-center gap-3 rounded-[20px] p-2 pr-3 outline-none transition-colors duration-200 hover:bg-white/[0.07] focus-visible:bg-white/10 active:scale-[0.99]"
      >
        <div
          className="card-icon relative grid h-11 w-11 shrink-0 place-items-center rounded-[14px] shadow-[inset_0_1px_0_rgba(255,255,255,.4),0_6px_16px_-6px_var(--c1)] transition-transform duration-300 group-hover:scale-105"
          style={{ background: `linear-gradient(145deg, ${sound.colors[0]}, ${sound.colors[1]})`, ['--c1' as string]: sound.colors[1] }}
        >
          <Icon size={19} strokeWidth={1.8} className="text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.35)]" />
          {count > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-white px-1 text-[9px] font-bold text-black shadow"
            >
              {count}
            </motion.span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-medium tracking-tight text-white/95">{sound.name}</div>
          <div className="truncate text-[11.5px] text-white/45">{sound.blurb}</div>
        </div>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/[0.08] text-white/60 opacity-0 transition-all duration-200 group-hover:opacity-100 group-hover:bg-white group-hover:text-black">
          <Plus size={14} strokeWidth={2.4} />
        </span>
      </div>
    </motion.li>
  )
}
