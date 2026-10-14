import { z } from 'zod'
import { SOUND_MAP } from '../audio/catalog'
import { ROOM_MAP } from '../audio/rooms'
import { polar, type OrbState, type Palette, type Provider } from '../store'
import { catalogPrompt, ComposedScene, roomsPrompt, strictify } from './schema'

export interface ComposeRequest {
  provider: Provider
  apiKey: string
  model: string
  prompt: string
  /** When set, the model edits this mix instead of starting fresh. */
  current?: { orbs: OrbState[]; room: string }
  signal?: AbortSignal
}

const SYSTEM = `You are the sound designer inside Aether, a spatial ambient soundscape mixer.
The listener sits at the centre of a circular 16-metre field and hears every source binaurally in 3D.
You compose a soundscape by choosing sound generators from the catalogue and placing them around the listener.

Placement rules of thumb:
- Close (radius ~0.34) = intimate, loud, dry, detailed. Far (~0.9) = distant, darker, roomier.
- Spread sources around the full circle — use the sides and behind, not just the front.
- Height adds realism: rain, birds, thunder, chimes come from above; streams, waves, purring from slightly below.
- Usually 3–6 sources. Keep one or two as the "bed" (steady textures) and the rest as detail.
- Balance volumes so nothing dominates; quiet detail sounds 0.35–0.55, beds 0.5–0.75.
- Pick a room that fits the place, and a palette whose colours evoke it (first colour very dark).
- Generative music (the "piano" sound, if present) follows the key/mode you choose.

Sound catalogue (use these ids exactly):
${catalogPrompt()}

Rooms:
${roomsPrompt()}`

function userMessage(req: ComposeRequest) {
  if (!req.current) return `Compose a soundscape for: ${req.prompt}`
  const mix = req.current.orbs.map((o) => {
    const r = Math.hypot(o.x, o.y)
    const angle = Math.round((Math.atan2(o.x, -o.y) * 180) / Math.PI)
    return { sound: o.soundId, radius: +r.toFixed(2), angle, height: +o.z.toFixed(2), volume: +o.volume.toFixed(2), tone: +o.tone.toFixed(2), reverb: +o.reverb.toFixed(2) }
  })
  return `Here is the listener's current mix (room: ${req.current.room}):
${JSON.stringify(mix)}

Modify it according to this request, keeping what already works: ${req.prompt}`
}

export class ComposeError extends Error {}

/** OpenAI blocks browser CORS, so its calls go through this site's own edge worker (key passed through, never stored). */
const OPENAI_BASE = () => `${location.origin}/api/openai/v1`

/** Ask the chosen provider for a scene and validate it against the shared schema. */
export async function compose(req: ComposeRequest): Promise<ComposedScene> {
  if (!req.apiKey) throw new ComposeError('Add an API key in Settings first.')
  const raw = req.provider === 'claude' ? await viaClaude(req) : req.provider === 'openai' ? await viaOpenAI(req) : await viaGemini(req)
  const parsed = ComposedScene.safeParse(raw)
  if (!parsed.success) throw new ComposeError('The model returned an unexpected layout. Try again or rephrase.')
  return parsed.data
}

async function viaClaude(req: ComposeRequest): Promise<unknown> {
  const [{ default: Anthropic }, { betaZodOutputFormat }] = await Promise.all([
    import('@anthropic-ai/sdk'),
    import('@anthropic-ai/sdk/helpers/beta/zod'),
  ])
  // BYOK: the key never leaves this browser except to Anthropic's API
  const client = new Anthropic({ apiKey: req.apiKey, dangerouslyAllowBrowser: true })
  // server-side refusal fallback is supported on the current Opus / Fable / Sonnet 5.5 line
  const fallback = /^claude-(opus-5|fable|sonnet-5-5)/.test(req.model)
  try {
    const res = await client.beta.messages.parse(
      {
        model: req.model,
        max_tokens: 16000,
        system: SYSTEM,
        messages: [{ role: 'user', content: userMessage(req) }],
        output_config: { format: betaZodOutputFormat(ComposedScene), effort: 'medium' },
        ...(fallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      },
      { signal: req.signal },
    )
    if (res.stop_reason === 'refusal') throw new ComposeError('Claude declined this request. Try a different description.')
    if (res.stop_reason === 'max_tokens') throw new ComposeError('The response was cut off. Try a simpler request.')
    return res.parsed_output
  } catch (e) {
    if (e instanceof ComposeError) throw e
    if (e instanceof Anthropic.AuthenticationError) throw new ComposeError('Claude rejected the API key.')
    if (e instanceof Anthropic.NotFoundError) throw new ComposeError(`Model "${req.model}" was not found for this key.`)
    if (e instanceof Anthropic.RateLimitError) throw new ComposeError('Rate limited by Anthropic — wait a moment and retry.')
    if (e instanceof Anthropic.BadRequestError) throw new ComposeError(`Claude: ${e.message}`)
    if (e instanceof Anthropic.APIError) throw new ComposeError(`Claude API error ${e.status ?? ''}: ${e.message}`)
    throw e
  }
}

async function viaOpenAI(req: ComposeRequest): Promise<unknown> {
  const { default: OpenAI } = await import('openai')
  const client = new OpenAI({ apiKey: req.apiKey, baseURL: OPENAI_BASE(), dangerouslyAllowBrowser: true })
  try {
    const res = await client.chat.completions.create(
      {
        model: req.model,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: userMessage(req) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'aether_scene', strict: true, schema: strictify(z.toJSONSchema(ComposedScene)) as Record<string, unknown> },
        },
      },
      { signal: req.signal },
    )
    const msg = res.choices[0]?.message
    if (msg?.refusal) throw new ComposeError(`The model declined: ${msg.refusal}`)
    if (!msg?.content) throw new ComposeError('Empty response from OpenAI.')
    return JSON.parse(msg.content)
  } catch (e) {
    if (e instanceof ComposeError) throw e
    if (e instanceof OpenAI.AuthenticationError) throw new ComposeError('OpenAI rejected the API key.')
    if (e instanceof OpenAI.NotFoundError) throw new ComposeError(`Model "${req.model}" was not found for this key.`)
    if (e instanceof OpenAI.RateLimitError) throw new ComposeError('Rate limited by OpenAI — wait a moment and retry.')
    if (e instanceof OpenAI.APIError) throw new ComposeError(`OpenAI error ${e.status ?? ''}: ${e.message}`)
    throw e
  }
}

async function viaGemini(req: ComposeRequest): Promise<unknown> {
  const { GoogleGenAI } = await import('@google/genai')
  const ai = new GoogleGenAI({ apiKey: req.apiKey })
  try {
    const res = await ai.models.generateContent({
      model: req.model,
      contents: userMessage(req),
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: 'application/json',
        responseJsonSchema: z.toJSONSchema(ComposedScene),
        abortSignal: req.signal,
      },
    })
    const text = res.text
    if (!text) throw new ComposeError('Empty response from Gemini (it may have been blocked by safety filters).')
    return JSON.parse(text)
  } catch (e) {
    if (e instanceof ComposeError) throw e
    const msg = e instanceof Error ? e.message : String(e)
    if (/API key/i.test(msg)) throw new ComposeError('Gemini rejected the API key.')
    if (/not found/i.test(msg)) throw new ComposeError(`Model "${req.model}" was not found for this key.`)
    throw new ComposeError(`Gemini: ${msg.slice(0, 200)}`)
  }
}

/** List models the key can use, so the settings picker stays current as providers ship new ones. */
export async function listModels(provider: Provider, apiKey: string): Promise<string[]> {
  if (!apiKey) return []
  try {
    if (provider === 'claude') {
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
      const out: string[] = []
      for await (const m of client.models.list()) out.push(m.id)
      return out
    }
    if (provider === 'openai') {
      const { default: OpenAI } = await import('openai')
      const client = new OpenAI({ apiKey, baseURL: OPENAI_BASE(), dangerouslyAllowBrowser: true })
      const out: string[] = []
      for await (const m of client.models.list()) if (/^(gpt|o\d|chatgpt)/.test(m.id) && !/audio|realtime|tts|transcribe|image|search/.test(m.id)) out.push(m.id)
      return out.sort().reverse()
    }
    const { GoogleGenAI } = await import('@google/genai')
    const ai = new GoogleGenAI({ apiKey })
    const out: string[] = []
    const pager = await ai.models.list()
    for await (const m of pager) {
      const id = m.name?.replace(/^models\//, '')
      if (id && /gemini/.test(id) && (m.supportedActions ?? []).includes('generateContent')) out.push(id)
    }
    return out
  } catch {
    return []
  }
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, Number.isFinite(v) ? v : a))
const isHex = (c: string) => /^#[0-9a-f]{6}$/i.test(c)

/** Turn a validated AI scene into store-ready orbs, clamping every value into range. */
export function toMix(scene: ComposedScene) {
  const orbs: Partial<OrbState>[] = scene.orbs
    .filter((o) => SOUND_MAP[o.sound])
    .slice(0, 10)
    .map((o) => {
      const { x, y } = polar(clamp(o.radius, 0.12, 1), o.angle)
      return {
        soundId: o.sound, x, y,
        z: clamp(o.height, -1, 1),
        volume: clamp(o.volume, 0.05, 1),
        tone: clamp(o.tone, 0.2, 1),
        reverb: clamp(o.reverb, 0, 1),
      }
    })
  const p = scene.palette
  const palette = [p.base, p.a, p.b, p.c].every(isHex) ? ([p.base, p.a, p.b, p.c] as Palette) : undefined
  const music = {
    root: Math.round(clamp(scene.music.root, 40, 80)),
    mode: scene.music.mode,
    density: clamp(scene.music.density, 0, 1),
    brightness: clamp(scene.music.brightness, 0, 1),
    tempo: clamp(scene.music.tempo, 40, 120),
  }
  return { orbs, palette, music, room: ROOM_MAP[scene.room] ? scene.room : 'hall' }
}
