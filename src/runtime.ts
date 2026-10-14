import type { MotionValue } from 'framer-motion'

/**
 * Per-frame, non-React state for each orb. The animation loop reads and writes
 * these directly so 60fps work never round-trips through React renders.
 */
export interface OrbRuntime {
  id: string
  soundId: string
  mx: MotionValue<number>
  my: MotionValue<number>
  el: HTMLElement | null
  color: string
  dragging: boolean
  /** True while a spring (snap / scene move / morph) owns the position. */
  animating: boolean
  /** Ring index the orb is locked onto, or null if free-floating. */
  ring: number | null
  /** Last known normalised position and elevation. */
  nx: number
  ny: number
  nz: number
  /** Smoothed audio level written by the stage loop each frame. */
  level: number
  /** Progress (laps) along the orb's drawn path. */
  pathT: number
  occluded: boolean
  /** Last painted screen position, for trails. */
  px: number
  py: number
  /** Particle spawn accumulator. */
  spawn: number
}

export const runtime = new Map<string, OrbRuntime>()

/** Field radius in CSS pixels — updated by the stage's resize observer. */
export const field = { radius: 300, breath: 1 }
