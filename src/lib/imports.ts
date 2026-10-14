import { FileMusic } from 'lucide-react'
import { registerSound } from '../audio/catalog'
import { engine } from '../audio/engine'
import { VoiceBuilder, gain } from '../audio/kit'
import { importedBuffers, listImports, saveImport, type ImportedAudio } from '../audio/samples'
import { newId, useStore } from '../store'

const PALETTES: [string, string][] = [
  ['#a5f3fc', '#0e7490'], ['#fbcfe8', '#9d174d'], ['#fde68a', '#92400e'], ['#c4b5fd', '#5b21b6'], ['#bbf7d0', '#166534'],
]

function register(id: string, name: string, buffer: AudioBuffer) {
  importedBuffers.set(id, buffer)
  registerSound({
    id,
    name,
    blurb: `Your recording · ${Math.round(buffer.duration)}s loop`,
    category: 'Imported',
    icon: FileMusic,
    colors: PALETTES[Math.abs(hash(id)) % PALETTES.length],
    anim: 'pulse',
    factory: (kit) => {
      const v = new VoiceBuilder(kit, 0.9)
      const src = kit.ctx.createBufferSource()
      src.buffer = importedBuffers.get(id)!
      src.loop = true
      src.connect(gain(kit.ctx, 1)).connect(v.out)
      src.start(kit.ctx.currentTime, Math.random() * buffer.duration)
      v.keep(src)
      return v.build()
    },
  })
  const st = useStore.getState()
  if (!st.customSounds.includes(id)) st.set('customSounds', [...st.customSounds, id])
}

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)

/** Decode a user's audio file, register it as a sound, persist it, and drop it into the field. */
export async function importFile(file: File) {
  const st = useStore.getState()
  if (!engine.ctx) return
  if (file.size > 40 * 1024 * 1024) {
    st.toast('That file is over 40 MB — try a shorter clip', 'error')
    return
  }
  try {
    const data = await file.arrayBuffer()
    const buffer = await engine.ctx.decodeAudioData(data.slice(0))
    const id = newId('imp-')
    const name = file.name.replace(/\.[^.]+$/, '').slice(0, 28) || 'Recording'
    register(id, name, buffer)
    const item: ImportedAudio = { id, name, data }
    await saveImport(item)
    st.addOrb(id)
    st.toast(`${name} imported`, 'success')
  } catch {
    st.toast('Could not decode that audio file', 'error')
  }
}

/** Restore previously imported recordings from IndexedDB. */
export async function restoreImports() {
  if (!engine.ctx) return
  const items = await listImports()
  for (const it of items) {
    try {
      const buffer = await engine.ctx.decodeAudioData(it.data.slice(0))
      register(it.id, it.name, buffer)
    } catch {
      /* skip unreadable entries */
    }
  }
}

export function pickAudioFile() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'audio/*'
  input.onchange = () => {
    const f = input.files?.[0]
    if (f) importFile(f)
  }
  input.click()
}
