// Small shared presentational bits for the Study Mission screens. Keeps the
// screens themselves focused on flow, and the theming in one place.

import type { PlanConfidence, StrategyLevel } from './types'
import { STRATEGY_LABEL } from './labels'

const CONFIDENCE_STYLE: Record<
  PlanConfidence,
  { label: string; cls: string }
> = {
  ON_TRACK: { label: 'On track', cls: 'border-heal/40 bg-heal/10 text-heal' },
  AT_RISK: { label: 'At risk', cls: 'border-xp/40 bg-xp/10 text-xp' },
  OFF_TRACK: { label: 'Off track', cls: 'border-hp/40 bg-hp/10 text-hp' },
}

export function ConfidenceBadge({
  confidence,
  className = '',
}: {
  confidence: PlanConfidence
  className?: string
}) {
  const s = CONFIDENCE_STYLE[confidence]
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-wide ${s.cls} ${className}`}
    >
      {s.label}
    </span>
  )
}

export function MasteryBar({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  const tone = pct >= 75 ? 'bg-heal' : pct >= 50 ? 'bg-mana' : 'bg-hp'
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted">
        <span>Mastery</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full border border-edge bg-void">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function StrategyPill({ level }: { level: StrategyLevel }) {
  const cls =
    level === 'NORMAL'
      ? 'border-edge text-muted'
      : level === 'STRUGGLING'
        ? 'border-xp/40 text-xp'
        : 'border-hp/40 text-hp'
  return (
    <span
      className={`inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {STRATEGY_LABEL[level]}
    </span>
  )
}
