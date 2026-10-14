import { engine } from '../audio/engine'
import { useStore } from '../store'

/** Haptic tick: vibration where supported, plus an optional soft UI click (desktop stand-in). */
export function haptic(kind: 'snap' | 'cross' | 'soft' = 'soft') {
  const { haptics, uiSounds } = useStore.getState()
  if (haptics) navigator.vibrate?.(kind === 'snap' ? 14 : kind === 'cross' ? 6 : 4)
  if (uiSounds) engine.uiTick(kind)
}
