import { motion } from 'framer-motion'
import { useRef, useState, type ReactNode, type ComponentProps } from 'react'

export const spring = { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 } as const
export const softSpring = { type: 'spring', stiffness: 220, damping: 26 } as const

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ')
}

/** Frosted visionOS-style glass surface. */
export function Glass({ className, children, ...rest }: ComponentProps<typeof motion.div>) {
  return (
    <motion.div {...rest} className={cx('glass', className)}>
      {children}
    </motion.div>
  )
}

export function IconButton({
  label, onClick, active, children, className, size = 'md', shortcut, disabled,
}: {
  label: string
  onClick?: () => void
  active?: boolean
  children: ReactNode
  className?: string
  size?: 'sm' | 'md' | 'lg'
  shortcut?: string
  disabled?: boolean
}) {
  const dims = size === 'lg' ? 'h-14 w-14' : size === 'sm' ? 'h-8 w-8' : 'h-11 w-11'
  return (
    <motion.button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.92 }}
      transition={spring}
      className={cx(
        'group relative grid shrink-0 place-items-center rounded-full text-white/80 outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-white/50 disabled:opacity-40',
        active ? 'bg-white/90 text-black shadow-[0_0_24px_rgba(255,255,255,.35)]' : 'hover:bg-white/12 hover:text-white',
        dims,
        className,
      )}
    >
      {children}
      <span className="tooltip">
        {label}
        {shortcut && <kbd>{shortcut}</kbd>}
      </span>
    </motion.button>
  )
}

/** Premium slider: glowing gradient fill, springy thumb, keyboard accessible. */
export function Slider({
  value, onChange, label, min = 0, max = 1, step = 0.01, format, accent = '#ffffff', className, bipolar,
}: {
  value: number
  onChange: (v: number) => void
  label?: string
  min?: number
  max?: number
  step?: number
  format?: (v: number) => string
  accent?: string
  className?: string
  bipolar?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState(false)
  const pct = (value - min) / (max - min)
  const update = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect()
    const p = Math.min(1, Math.max(0, (clientX - r.left) / r.width))
    const v = Math.round((min + p * (max - min)) / step) * step
    onChange(Math.min(max, Math.max(min, v)))
  }
  const fillFrom = bipolar ? Math.min(0.5, pct) : 0
  const fillTo = bipolar ? Math.max(0.5, pct) : pct
  return (
    <div className={cx('select-none', className)}>
      {label && (
        <div className="mb-2 flex items-baseline justify-between text-[11px] font-medium tracking-wide text-white/50">
          <span className="uppercase tracking-[0.12em]">{label}</span>
          <span className="tabular-nums text-white/75">{format ? format(value) : Math.round(pct * 100)}</span>
        </div>
      )}
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number(value.toFixed(2))}
        className="relative h-6 cursor-pointer touch-none outline-none focus-visible:[&>.track]:ring-2 focus-visible:[&>.track]:ring-white/40"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setDrag(true)
          update(e.clientX)
        }}
        onPointerMove={(e) => drag && update(e.clientX)}
        onPointerUp={() => setDrag(false)}
        onPointerCancel={() => setDrag(false)}
        onKeyDown={(e) => {
          const big = e.shiftKey ? 10 : 1
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange(Math.min(max, value + step * 5 * big))
          else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange(Math.max(min, value - step * 5 * big))
          else return
          e.preventDefault()
          e.stopPropagation()
        }}
      >
        <div className="track absolute inset-x-0 top-1/2 h-[6px] -translate-y-1/2 overflow-hidden rounded-full bg-white/10 shadow-[inset_0_1px_2px_rgba(0,0,0,.35)]">
          <div
            className="absolute inset-y-0 rounded-full"
            style={{
              left: `${fillFrom * 100}%`,
              width: `${(fillTo - fillFrom) * 100}%`,
              background: `linear-gradient(90deg, ${accent}55, ${accent})`,
              boxShadow: `0 0 12px ${accent}88`,
            }}
          />
        </div>
        <motion.div
          className="absolute top-1/2 h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,.4),0_0_0_0.5px_rgba(0,0,0,.1)]"
          style={{ left: `${pct * 100}%` }}
          animate={{ scale: drag ? 1.3 : 1 }}
          transition={spring}
        />
      </div>
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-6 items-center justify-center rounded-md border border-white/15 bg-white/8 px-1.5 py-0.5 font-sans text-[11px] font-medium text-white/80 shadow-[inset_0_-1px_0_rgba(255,255,255,.08)]">
      {children}
    </kbd>
  )
}

/** iOS-style toggle switch. */
export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-[16px] px-1 py-1.5 text-left"
    >
      <span>
        <span className="block text-[13px] font-medium text-white/90">{label}</span>
        {hint && <span className="block text-[11.5px] leading-snug text-white/45">{hint}</span>}
      </span>
      <span className={cx('relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors duration-300', checked ? 'bg-emerald-400/90' : 'bg-white/15')}>
        <motion.span
          className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,.35)]"
          animate={{ left: checked ? 21 : 3 }}
          transition={spring}
        />
      </span>
    </button>
  )
}

/** Segmented control with a sliding glass thumb. */
export function Segmented<T extends string>({
  value, options, onChange, id,
}: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; id: string }) {
  return (
    <div className="flex rounded-full bg-white/[0.07] p-1 ring-1 ring-white/10">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx('relative flex-1 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors', value === o.value ? 'text-black' : 'text-white/60 hover:text-white')}
        >
          {value === o.value && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-full bg-white" transition={spring} />}
          <span className="relative flex items-center justify-center gap-1.5">{o.label}</span>
        </button>
      ))}
    </div>
  )
}
