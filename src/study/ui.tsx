// Small shared presentational bits for the Study Mission screens.

import type { PlanConfidence, StrategyLevel } from './types'
import { STRATEGY_LABEL } from './labels'
import { Bar, Chip } from '../components/ui'

const CONFIDENCE: Record<PlanConfidence, { label: string; tone: 'heal' | 'xp' | 'hp' }> = {
  ON_TRACK: { label: 'On track', tone: 'heal' },
  AT_RISK: { label: 'At risk', tone: 'xp' },
  OFF_TRACK: { label: 'Off track', tone: 'hp' },
}

export function ConfidenceBadge({
  confidence,
  className = '',
}: {
  confidence: PlanConfidence
  className?: string
}) {
  const c = CONFIDENCE[confidence]
  return (
    <Chip tone={c.tone} className={`px-2.5 py-1 text-[11px] ${className}`}>
      {c.label}
    </Chip>
  )
}

export function MasteryBar({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  const tone = pct >= 75 ? 'heal' : pct >= 50 ? 'mana' : 'hp'
  return <Bar value={pct} tone={tone} label="Mastery" segments={20} />
}

export function StrategyPill({ level }: { level: StrategyLevel }) {
  const tone: 'neutral' | 'xp' | 'hp' =
    level === 'NORMAL' ? 'neutral' : level === 'STRUGGLING' ? 'xp' : 'hp'
  return <Chip tone={tone}>{STRATEGY_LABEL[level]}</Chip>
}
