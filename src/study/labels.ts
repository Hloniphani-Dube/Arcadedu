// Display labels for study-plan enums. Plain data — kept out of ui.tsx so that
// file can stay component-only (react-refresh).

import type { PlanSessionKind, StrategyLevel } from './types'

export const STRATEGY_LABEL: Record<StrategyLevel, string> = {
  NORMAL: 'Normal',
  STRUGGLING: 'Struggling',
  PERSISTENT: 'Persistent',
}

export const SESSION_KIND_LABEL: Record<PlanSessionKind, string> = {
  practice: 'Practice',
  diagnostic: 'Diagnostic',
  prerequisite_review: 'Prerequisite review',
  revision: 'Revision',
}
