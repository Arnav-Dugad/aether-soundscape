import { z } from 'zod'
import { SOUNDS } from '../audio/catalog'
import { ROOMS } from '../audio/rooms'
import { MODES, type ModeName } from '../audio/mood'

const soundIds = SOUNDS.filter((s) => s.category !== 'Imported').map((s) => s.id) as [string, ...string[]]
const roomIds = ROOMS.map((r) => r.id) as [string, ...string[]]
const modeNames = Object.keys(MODES) as [ModeName, ...ModeName[]]

/**
 * The one schema every provider answers in. Kept free of numeric/length constraints
 * because not every structured-output engine supports them — values are clamped after parsing.
 */
export const ComposedScene = z.object({
  name: z.string().describe('Evocative 2–4 word title for the soundscape'),
  mood: z.string().describe('One short poetic line describing the atmosphere'),
  narration: z.string().describe('One or two sentences explaining the spatial choices to the listener'),
  palette: z
    .object({
      base: z.string().describe('Very dark background hex colour, e.g. #0b0a1f'),
      a: z.string().describe('Rich accent hex colour'),
      b: z.string().describe('Second accent hex colour'),
      c: z.string().describe('Third accent hex colour'),
    })
    .describe('Mesh-gradient palette for the background'),
  room: z.enum(roomIds).describe('Acoustic space'),
  music: z.object({
    root: z.number().describe('MIDI note of the tonic (48–72), used by generative music'),
    mode: z.enum(modeNames),
    density: z.number().describe('0 sparse … 1 busy'),
    brightness: z.number().describe('0 dark … 1 bright'),
    tempo: z.number().describe('BPM, 40–110'),
  }),
  orbs: z
    .array(
      z.object({
        sound: z.enum(soundIds),
        radius: z.number().describe('Distance from the listener: 0.15–1. Rings sit at 0.34 (intimate), 0.64 (near), 0.9 (horizon)'),
        angle: z.number().describe('Degrees clockwise from straight ahead: 0 front, 90 right, 180 behind, -90 left'),
        height: z.number().describe('-1 far below … 0 ear level … 1 far above'),
        volume: z.number().describe('0–1, typically 0.35–0.85'),
        tone: z.number().describe('Lowpass openness 0 muffled … 1 open (usually 0.7–1)'),
        reverb: z.number().describe('Reverb send 0–1'),
      }),
    )
    .describe('2–7 sound sources placed around the listener'),
})

export type ComposedScene = z.infer<typeof ComposedScene>

export function catalogPrompt() {
  return SOUNDS.filter((s) => s.category !== 'Imported')
    .map((s) => `- ${s.id}: ${s.name} — ${s.blurb} [${s.category}]`)
    .join('\n')
}

export function roomsPrompt() {
  return ROOMS.map((r) => `- ${r.id}: ${r.name} (${r.blurb})`).join('\n')
}

/** Recursively mark every object strict with all keys required (OpenAI strict JSON schema rules). */
export function strictify(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strictify)
  if (!schema || typeof schema !== 'object') return schema
  const s = { ...(schema as Record<string, unknown>) }
  delete s.$schema
  for (const k of Object.keys(s)) s[k] = strictify(s[k])
  if (s.type === 'object' && s.properties) {
    s.additionalProperties = false
    s.required = Object.keys(s.properties as object)
  }
  return s
}
