import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Progress } from './ui/8bit-progress'
import { useTheme } from '../theme'

export function Panel({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`arcade-frame rounded-2xl border border-edge bg-panel/80 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8)] backdrop-blur ${className}`}
    >
      {children}
    </div>
  )
}

export function Bar({
  value,
  max,
  tone = 'mana',
  label,
}: {
  value: number
  max: number
  tone?: 'mana' | 'xp' | 'hp' | 'heal'
  label?: string
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  const arcade = useTheme((s) => s.skin === 'arcade')
  const bgClass = {
    mana: 'bg-mana',
    xp: 'bg-xp',
    hp: 'bg-hp',
    heal: 'bg-heal',
  }[tone]
  return (
    <div className="w-full">
      {label && (
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>{label}</span>
          <span>
            {Math.round(value)} / {max}
          </span>
        </div>
      )}
      {arcade ? (
        <Progress
          variant="retro"
          value={pct}
          progressBg={bgClass}
          className="h-3 w-full"
        />
      ) : (
        <div className="h-3 w-full overflow-hidden rounded-full border border-edge bg-void">
          <motion.div
            className="h-full rounded-full"
            style={{ background: `var(--color-${tone})` }}
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
        </div>
      )}
    </div>
  )
}

export function Btn({
  children,
  onClick,
  disabled,
  variant = 'ghost',
  className = '',
  title,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'primary' | 'ghost' | 'danger'
  className?: string
  title?: string
  type?: 'button' | 'submit'
}) {
  const styles = {
    primary:
      'bg-mana text-on-accent border-mana hover:bg-mana-bright disabled:bg-edge disabled:text-muted',
    ghost:
      'bg-panel-2 text-ink border-edge hover:border-mana hover:text-mana-bright disabled:opacity-40',
    danger: 'bg-hp/15 text-hp border-hp/40 hover:bg-hp/25 disabled:opacity-40',
  }[variant]
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`arcade-btn rounded-xl border px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed ${styles} ${className}`}
    >
      {children}
    </button>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <motion.span
        className="inline-block h-3 w-3 rounded-full border-2 border-mana border-t-transparent"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
      />
      {label ?? 'ARIA is thinking…'}
    </div>
  )
}
