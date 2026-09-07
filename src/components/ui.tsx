import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

/* ------------------------------------------------------------------ Panel --- */

export function Panel({
  children,
  className = '',
  interactive = false,
}: {
  children: ReactNode
  className?: string
  interactive?: boolean
}) {
  return (
    <div
      className={`arcade-frame border-edge bg-panel ${interactive ? 'is-interactive cursor-pointer transition' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

/* -------------------------------------------------------------------- Btn --- */

type BtnVariant = 'primary' | 'accent' | 'ghost' | 'danger' | 'link'
type BtnSize = 'sm' | 'md' | 'lg'

const BTN_VARIANT: Record<BtnVariant, string> = {
  primary:
    'arcade-btn border bg-mana text-on-accent border-edge hover:bg-mana-bright disabled:bg-panel-2 disabled:text-muted',
  accent:
    'arcade-btn border bg-xp text-on-accent border-edge hover:brightness-110 disabled:bg-panel-2 disabled:text-muted',
  ghost:
    'arcade-btn border bg-panel-2 text-ink border-edge hover:border-mana hover:text-mana-bright disabled:opacity-40',
  danger:
    'arcade-btn border bg-hp/15 text-hp border-hp/50 hover:bg-hp/25 disabled:opacity-40',
  link: 'text-mana-bright underline-offset-2 hover:underline disabled:opacity-40',
}

const BTN_SIZE: Record<BtnSize, string> = {
  sm: 'px-2.5 py-1.5 text-[0.55rem]',
  md: 'px-4 py-2.5',
  lg: 'px-6 py-3 text-[0.7rem]',
}

export function Btn({
  children,
  onClick,
  disabled,
  variant = 'ghost',
  size = 'md',
  className = '',
  title,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: BtnVariant
  size?: BtnSize
  className?: string
  title?: string
  type?: 'button' | 'submit'
}) {
  const sizing = variant === 'link' ? '' : BTN_SIZE[size]
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 font-semibold transition disabled:cursor-not-allowed ${BTN_VARIANT[variant]} ${sizing} ${className}`}
    >
      {children}
    </button>
  )
}

/* -------------------------------------------------------------------- Bar --- */

const BAR_TONE: Record<string, string> = {
  mana: 'bg-mana',
  xp: 'bg-xp',
  hp: 'bg-hp',
  heal: 'bg-heal',
}

/** Segmented pixel meter. */
export function Bar({
  value,
  max = 100,
  tone = 'xp',
  label,
  showValue = true,
  segments = 24,
}: {
  value: number
  max?: number
  tone?: 'mana' | 'xp' | 'hp' | 'heal'
  label?: string
  showValue?: boolean
  segments?: number
}) {
  const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  const filled = Math.round(pct * segments)
  return (
    <div className="w-full">
      {(label || showValue) && (
        <div className="mb-1 flex items-baseline justify-between text-xs text-muted">
          {label && <span className="uppercase tracking-wide">{label}</span>}
          {showValue && (
            <span className="text-ink">
              {Math.round(value)}
              {max !== 100 ? ` / ${max}` : '%'}
            </span>
          )}
        </div>
      )}
      <div className="flex h-3 w-full gap-px border border-edge bg-void p-px">
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={`h-full flex-1 ${i < filled ? BAR_TONE[tone] : 'bg-transparent'}`}
          />
        ))}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- Spinner --- */

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <span className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="inline-block h-2 w-2 bg-mana"
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.15 }}
          />
        ))}
      </span>
      {label ?? 'ARIA is thinking…'}
    </div>
  )
}

/* ------------------------------------------------------------- PageHeader --- */

export function PageHeader({
  icon,
  title,
  actions,
}: {
  icon?: ReactNode
  title: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="bg-grid -mx-4 mb-6 border-b-2 border-edge px-4 pb-6 pt-4 md:-mx-8 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {icon && (
            <span className="arcade-frame grid h-11 w-11 flex-shrink-0 place-items-center border-2 border-edge bg-panel text-mana-bright">
              {icon}
            </span>
          )}
          <h1 className="title-serif">{title}</h1>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

/* ----------------------------------------------------------- SectionTitle --- */

export function SectionTitle({
  children,
  actions,
  className = '',
}: {
  children: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={`mb-3 flex items-center justify-between gap-3 ${className}`}>
      <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-muted">
        {children}
      </h2>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

/* -------------------------------------------------------------------- Chip -- */

const CHIP_TONE: Record<string, string> = {
  neutral: 'border-edge text-muted',
  mana: 'border-mana/50 text-mana-bright bg-mana/10',
  xp: 'border-xp/50 text-xp bg-xp/10',
  hp: 'border-hp/50 text-hp bg-hp/10',
  heal: 'border-heal/50 text-heal bg-heal/10',
}

export function Chip({
  children,
  tone = 'neutral',
  className = '',
}: {
  children: ReactNode
  tone?: 'neutral' | 'mana' | 'xp' | 'hp' | 'heal'
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${CHIP_TONE[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

/* -------------------------------------------------------------------- Stat -- */

const STAT_TONE: Record<string, string> = {
  ink: 'text-ink',
  mana: 'text-mana-bright',
  xp: 'text-xp',
  hp: 'text-hp',
  heal: 'text-heal',
}

export function Stat({
  label,
  value,
  hint,
  tone = 'ink',
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'ink' | 'mana' | 'xp' | 'hp' | 'heal'
}) {
  return (
    <div>
      <div className={`text-3xl leading-none ${STAT_TONE[tone]}`}>{value}</div>
      <div className="mt-1.5 text-xs uppercase tracking-wide text-muted">
        {label}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-muted">{hint}</div>}
    </div>
  )
}

/* -------------------------------------------------------------- EmptyState -- */

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <Panel className="flex flex-col items-start gap-3 p-6">
      {icon && (
        <span className="arcade-frame grid h-11 w-11 place-items-center border border-edge bg-panel-2 text-mana-bright">
          {icon}
        </span>
      )}
      <div className="font-bold">{title}</div>
      {children && <div className="text-sm text-muted">{children}</div>}
      {action}
    </Panel>
  )
}
