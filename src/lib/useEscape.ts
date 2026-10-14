import { useEffect } from 'react'

/** Close a modal on Escape — capture phase, so focused inputs that swallow keys can't block it. */
export function useEscape(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return
    const on = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onEscape()
    }
    addEventListener('keydown', on, true)
    return () => removeEventListener('keydown', on, true)
  }, [active, onEscape])
}
