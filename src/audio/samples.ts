/** Decoded-audio cache for field recordings and user-imported files (persisted in IndexedDB). */

const cache = new Map<string, Promise<AudioBuffer | null>>()

export function loadBuffer(ctx: BaseAudioContext, url: string): Promise<AudioBuffer | null> {
  let p = cache.get(url)
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((ab) => ctx.decodeAudioData(ab))
      .catch(() => null)
    cache.set(url, p)
  }
  return p
}

// ─── imported audio ─────────────────────────────────────────────────────────

export interface ImportedAudio {
  id: string
  name: string
  data: ArrayBuffer
}

const DB = 'aether'
const STORE = 'imports'

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function saveImport(item: ImportedAudio) {
  try {
    const d = await db()
    await new Promise<void>((res, rej) => {
      const tx = d.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(item)
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
  } catch {
    /* private mode / storage blocked: the import still works for this session */
  }
}

export async function listImports(): Promise<ImportedAudio[]> {
  try {
    const d = await db()
    return await new Promise((res, rej) => {
      const req = d.transaction(STORE).objectStore(STORE).getAll()
      req.onsuccess = () => res(req.result as ImportedAudio[])
      req.onerror = () => rej(req.error)
    })
  } catch {
    return []
  }
}

export async function deleteImport(id: string) {
  try {
    const d = await db()
    d.transaction(STORE, 'readwrite').objectStore(STORE).delete(id)
  } catch {
    /* ignore */
  }
}

/** Decoded buffers for imported sounds, keyed by sound id. */
export const importedBuffers = new Map<string, AudioBuffer>()
