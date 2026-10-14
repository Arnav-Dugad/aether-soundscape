import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, KeyRound, LoaderCircle, Sparkles, WandSparkles, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useEscape } from '../lib/useEscape'
import { compose, ComposeError, toMix } from '../ai/compose'
import { useStore, type Provider } from '../store'
import { Glass, IconButton, Segmented, spring } from './ui'

export const PROVIDERS: { id: Provider; name: string; vendor: string }[] = [
  { id: 'claude', name: 'Claude', vendor: 'Anthropic' },
  { id: 'openai', name: 'GPT', vendor: 'OpenAI' },
  { id: 'gemini', name: 'Gemini', vendor: 'Google' },
]

const IDEAS = [
  'A rainy night in a Tokyo jazz bar',
  'Camping by a lake at dawn, loons and a crackling fire',
  'Deep-focus library during a thunderstorm',
  'Floating in a kelp forest at midnight',
  'A Kyoto temple garden after the rain',
  'Make it rainier and move the thunder behind me',
]

/** "Describe a place" → an AI-composed spatial soundscape, from Claude, GPT or Gemini. */
export function Composer() {
  const open = useStore((s) => s.composerOpen)
  const ai = useStore((s) => s.ai)
  const hasOrbs = useStore((s) => s.orbs.length > 0)
  const [prompt, setPrompt] = useState('')
  const [mode, setMode] = useState<'new' | 'edit'>('new')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ name: string; narration: string; mood: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  const close = () => {
    abort.current?.abort()
    useStore.getState().set('composerOpen', false)
  }
  const key = ai.keys[ai.provider]
  useEscape(open, close)

  const run = async (text = prompt) => {
    if (!text.trim() || busy) return
    const st = useStore.getState()
    setBusy(true)
    setError(null)
    setResult(null)
    abort.current = new AbortController()
    try {
      const scene = await compose({
        provider: ai.provider,
        apiKey: key,
        model: ai.models[ai.provider],
        prompt: text.trim(),
        current: mode === 'edit' ? { orbs: st.orbs, room: st.room } : undefined,
        signal: abort.current.signal,
      })
      const mix = toMix(scene)
      st.loadMix(mix.orbs, { palette: mix.palette, room: mix.room })
      st.set('music', mix.music)
      st.setPlaying(true)
      setResult({ name: scene.name, narration: scene.narration, mood: scene.mood })
      st.toast(`Composed “${scene.name}”`, 'success')
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
      setError(e instanceof ComposeError ? e.message : `Something went wrong: ${(e as Error)?.message ?? e}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[95] grid place-items-center bg-black/40 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
          <Glass
            initial={{ opacity: 0, scale: 0.92, y: 24, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={spring}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-[36px] p-6 sm:p-7"
          >
            <div className="ai-aurora pointer-events-none absolute -inset-20 opacity-60" />
            <div className="relative">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/50">
                    <Sparkles size={13} /> AI Composer
                  </div>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight text-white">Describe a place</h2>
                  <p className="mt-1 text-[13px] text-white/55">The model picks sounds, places them around you in 3D, and chooses the room, key and colours.</p>
                </div>
                <IconButton label="Close" size="sm" onClick={close}>
                  <X size={16} />
                </IconButton>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <div className="min-w-[230px] flex-1">
                  <Segmented
                    id="provider"
                    value={ai.provider}
                    onChange={(p) => useStore.getState().setAi({ provider: p })}
                    options={PROVIDERS.map((p) => ({ value: p.id, label: p.name }))}
                  />
                </div>
                <div className="w-[190px]">
                  <Segmented
                    id="compose-mode"
                    value={mode}
                    onChange={setMode}
                    options={[
                      { value: 'new', label: 'New' },
                      { value: 'edit', label: 'Modify mix' },
                    ]}
                  />
                </div>
              </div>

              <form
                className="mt-4 flex items-end gap-2 rounded-[24px] bg-black/25 p-2 pl-4 ring-1 ring-white/10 focus-within:ring-white/30"
                onSubmit={(e) => {
                  e.preventDefault()
                  run()
                }}
              >
                <textarea
                  autoFocus
                  rows={2}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation()
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      run()
                    }
                  }}
                  placeholder={mode === 'edit' ? 'e.g. add distant thunder behind me and make it darker' : 'e.g. a lighthouse keeper’s cabin during a winter storm'}
                  className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent py-2 text-[14px] leading-relaxed text-white placeholder:text-white/35 focus:outline-none"
                />
                <motion.button
                  type="submit"
                  disabled={!prompt.trim() || busy || !key || (mode === 'edit' && !hasOrbs)}
                  whileTap={{ scale: 0.9 }}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-black disabled:opacity-35"
                  aria-label="Compose"
                >
                  {busy ? <LoaderCircle size={18} className="animate-spin" /> : <ArrowUp size={18} />}
                </motion.button>
              </form>

              {!key && (
                <button
                  onClick={() => {
                    useStore.getState().set('composerOpen', false)
                    useStore.getState().set('settingsOpen', true)
                  }}
                  className="mt-3 flex w-full items-center gap-3 rounded-[18px] bg-amber-300/10 px-4 py-3 text-left text-[12.5px] text-amber-100/90 ring-1 ring-amber-200/20 hover:bg-amber-300/15"
                >
                  <KeyRound size={16} />
                  Add your {PROVIDERS.find((p) => p.id === ai.provider)?.vendor} API key in Settings to start composing.
                </button>
              )}

              <div className="mt-4 flex flex-wrap gap-1.5">
                {IDEAS.map((idea) => (
                  <button
                    key={idea}
                    onClick={() => {
                      setPrompt(idea)
                      if (idea.startsWith('Make it')) setMode('edit')
                    }}
                    className="rounded-full bg-white/[0.06] px-3 py-1.5 text-[11.5px] text-white/65 ring-1 ring-white/10 transition-colors hover:bg-white/12 hover:text-white"
                  >
                    {idea}
                  </button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                {busy && (
                  <motion.div key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-5 flex items-center gap-3 text-[13px] text-white/65">
                    <span className="shimmer-text">Composing with {PROVIDERS.find((p) => p.id === ai.provider)?.name} · {ai.models[ai.provider]}</span>
                  </motion.div>
                )}
                {error && (
                  <motion.p key="err" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5 rounded-[18px] bg-rose-500/12 px-4 py-3 text-[12.5px] text-rose-100 ring-1 ring-rose-300/20">
                    {error}
                  </motion.p>
                )}
                {result && (
                  <motion.div key="res" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5 rounded-[22px] bg-white/[0.06] p-4 ring-1 ring-white/10">
                    <div className="flex items-center gap-2 text-[15px] font-semibold text-white">
                      <WandSparkles size={15} /> {result.name}
                    </div>
                    <div className="text-[12px] italic text-white/55">{result.mood}</div>
                    <p className="mt-2 text-[12.5px] leading-relaxed text-white/70">{result.narration}</p>
                  </motion.div>
                )}
              </AnimatePresence>
              <p className="mt-5 text-[11px] leading-relaxed text-white/35">
                Your key is stored only on this device. Claude and Gemini are called directly from your browser; OpenAI blocks
                browser calls, so those pass through this site’s edge relay, which never stores or logs keys.
              </p>
            </div>
          </Glass>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
