import { AnimatePresence, motion } from 'framer-motion'
import { Eye, EyeOff, Smartphone, Video, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useEscape } from '../lib/useEscape'
import { listModels } from '../ai/compose'
import { setHeadTracking } from '../lib/headTracking'
import { DEFAULT_MODELS, useStore, type Provider } from '../store'
import { PROVIDERS } from './Composer'
import { Glass, IconButton, Segmented, spring, Switch } from './ui'

const KEY_HELP: Record<Provider, { url: string; prefix: string }> = {
  claude: { url: 'https://platform.claude.com/settings/keys', prefix: 'sk-ant-' },
  openai: { url: 'https://platform.openai.com/api-keys', prefix: 'sk-' },
  gemini: { url: 'https://aistudio.google.com/apikey', prefix: 'AIza' },
}

export function SettingsSheet() {
  const open = useStore((s) => s.settingsOpen)
  const close = () => useStore.getState().set('settingsOpen', false)
  useEscape(open, close)
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[95] grid place-items-center bg-black/40 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close}>
          <Glass
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={spring}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-[36px] p-6 sm:p-7"
          >
            <div className="flex items-start justify-between">
              <h2 className="text-2xl font-semibold tracking-tight text-white">Settings</h2>
              <IconButton label="Close" size="sm" onClick={close}>
                <X size={16} />
              </IconButton>
            </div>
            <AiSection />
            <HeadSection />
            <FeelSection />
          </Glass>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Heading({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3 mt-7">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">{children}</h3>
      {hint && <p className="mt-1 text-[12px] leading-relaxed text-white/45">{hint}</p>}
    </div>
  )
}

function AiSection() {
  const ai = useStore((s) => s.ai)
  const [tab, setTab] = useState<Provider>(ai.provider)
  const [show, setShow] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const key = ai.keys[tab]

  useEffect(() => {
    setModels([])
    if (!key || key.length < 12) return
    let live = true
    setLoading(true)
    const t = setTimeout(async () => {
      const list = await listModels(tab, key)
      if (live) {
        setModels(list)
        setLoading(false)
      }
    }, 500)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [tab, key])

  const set = useStore.getState().setAi
  return (
    <>
      <Heading hint="Bring your own key for Claude, GPT or Gemini to power the AI Composer. Keys stay in this browser and are only ever used for that provider (OpenAI requests pass through this site’s relay, which never stores them).">
        AI providers
      </Heading>
      <Segmented id="settings-provider" value={tab} onChange={setTab} options={PROVIDERS.map((p) => ({ value: p.id, label: p.name }))} />
      <div className="mt-4 flex flex-col gap-3">
        <label className="block">
          <span className="mb-1.5 flex justify-between text-[11.5px] text-white/55">
            {PROVIDERS.find((p) => p.id === tab)?.vendor} API key
            <a href={KEY_HELP[tab].url} target="_blank" rel="noreferrer" className="text-sky-200/80 hover:text-sky-100">
              Get a key ↗
            </a>
          </span>
          <span className="flex h-11 items-center gap-2 rounded-2xl bg-white/[0.07] px-3 ring-1 ring-white/10 focus-within:ring-white/30">
            <input
              type={show ? 'text' : 'password'}
              value={key}
              autoComplete="off"
              spellCheck={false}
              placeholder={`${KEY_HELP[tab].prefix}…`}
              onKeyDown={(e) => e.stopPropagation()}
              onChange={(e) => set({ keys: { ...ai.keys, [tab]: e.target.value.trim() } })}
              className="w-full bg-transparent font-mono text-[12.5px] text-white placeholder:text-white/30 focus:outline-none"
            />
            <button aria-label={show ? 'Hide key' : 'Show key'} onClick={() => setShow(!show)} className="text-white/50 hover:text-white">
              {show ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </span>
        </label>
        <label className="block">
          <span className="mb-1.5 flex justify-between text-[11.5px] text-white/55">
            Model
            <span className="text-white/35">{loading ? 'loading models…' : models.length ? `${models.length} available` : ''}</span>
          </span>
          <input
            list={`models-${tab}`}
            value={ai.models[tab]}
            onKeyDown={(e) => e.stopPropagation()}
            onChange={(e) => set({ models: { ...ai.models, [tab]: e.target.value.trim() } })}
            className="h-11 w-full rounded-2xl bg-white/[0.07] px-3 font-mono text-[12.5px] text-white ring-1 ring-white/10 focus:outline-none focus:ring-white/30"
          />
          <datalist id={`models-${tab}`}>
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          {ai.models[tab] !== DEFAULT_MODELS[tab] && (
            <button onClick={() => set({ models: { ...ai.models, [tab]: DEFAULT_MODELS[tab] } })} className="mt-1.5 text-[11px] text-white/45 hover:text-white">
              Reset to {DEFAULT_MODELS[tab]}
            </button>
          )}
        </label>
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-white/50">Use for the composer</span>
          <button
            onClick={() => set({ provider: tab })}
            className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${ai.provider === tab ? 'bg-white text-black' : 'bg-white/10 text-white/80 hover:bg-white/15'}`}
          >
            {ai.provider === tab ? 'Active' : 'Make active'}
          </button>
        </div>
      </div>
    </>
  )
}

function HeadSection() {
  const mode = useStore((s) => s.headTracking)
  const [busy, setBusy] = useState(false)
  const holder = useRef<HTMLDivElement>(null)
  const choose = async (m: 'off' | 'motion' | 'camera') => {
    setBusy(true)
    await setHeadTracking(m, (video) => {
      const h = document.getElementById('head-preview')
      if (!h) return
      h.innerHTML = ''
      if (video) {
        video.className = 'h-full w-full object-cover -scale-x-100'
        h.appendChild(video)
      }
    })
    setBusy(false)
  }
  return (
    <>
      <Heading hint="Turn your real head (webcam) or your phone (motion sensors) and the soundscape stays fixed in space around you.">Head tracking</Heading>
      <Segmented
        id="head"
        value={mode}
        onChange={(m) => !busy && choose(m)}
        options={[
          { value: 'off', label: 'Off' },
          { value: 'motion', label: <><Smartphone size={13} /> Motion</> },
          { value: 'camera', label: <><Video size={13} /> Webcam</> },
        ]}
      />
      <div ref={holder} className={mode === 'camera' ? 'mt-3 flex items-center gap-3' : 'hidden'}>
        <div id="head-preview" className="h-20 w-28 overflow-hidden rounded-2xl bg-black/40 ring-1 ring-white/15" />
        <p className="text-[11.5px] leading-relaxed text-white/45">Video is processed on-device by MediaPipe and never leaves your browser.</p>
      </div>
      {busy && <p className="mt-2 text-[11.5px] text-white/50">Starting…</p>}
    </>
  )
}

function FeelSection() {
  const haptics = useStore((s) => s.haptics)
  const uiSounds = useStore((s) => s.uiSounds)
  const set = useStore.getState().set
  return (
    <>
      <Heading>Feel</Heading>
      <div className="flex flex-col gap-1">
        <Switch label="Haptic ticks" hint="Vibrate on ring snaps and crossings (phones)" checked={haptics} onChange={(v) => set('haptics', v)} />
        <Switch label="Interface sounds" hint="Soft clicks on snaps — a haptic stand-in for desktop" checked={uiSounds} onChange={(v) => set('uiSounds', v)} />
      </div>
      <button
        onClick={() => {
          set('settingsOpen', false)
          set('tourStep', 0)
        }}
        className="mt-5 w-full rounded-[18px] bg-white/[0.07] py-3 text-[13px] font-medium text-white/85 ring-1 ring-white/10 hover:bg-white/12"
      >
        Replay the guided tour
      </button>
    </>
  )
}
