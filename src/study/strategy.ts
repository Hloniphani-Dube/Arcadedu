// The strategy ladder.
//
// Each mission topic sits at NORMAL, STRUGGLING or PERSISTENT. The level decides
// how much scaffolding a mission session shows and how hard the graded item is.
// The agent may only ever move one rung per tick; the deterministic validator
// enforces that with `strategyStepIsLegal`.

import type { EnemyTier, LearnAction } from '../lib/types.ts'
import type { StrategyLevel } from './types.ts'

export const STRATEGY_ORDER: StrategyLevel[] = [
  'NORMAL',
  'STRUGGLING',
  'PERSISTENT',
]

export const strategyIndex = (level: StrategyLevel): number =>
  Math.max(0, STRATEGY_ORDER.indexOf(level))

/** A tick may change strategy by at most one rung (0 = unchanged is fine). */
export function strategyStepIsLegal(
  from: StrategyLevel,
  to: StrategyLevel,
): boolean {
  return Math.abs(strategyIndex(to) - strategyIndex(from)) <= 1
}

const TIER_LADDER: EnemyTier[] = ['trivial', 'easy', 'medium', 'hard', 'boss']

/** One tier easier, floored at 'trivial'. */
function oneTierLower(tier: EnemyTier): EnemyTier {
  const i = TIER_LADDER.indexOf(tier)
  return TIER_LADDER[Math.max(0, i - 1)] ?? tier
}

/** Difficulty for a mission item given the topic's strategy level. */
export function difficultyForStrategy(
  baseTier: EnemyTier,
  level: StrategyLevel,
): EnemyTier {
  return level === 'NORMAL' ? baseTier : oneTierLower(baseTier)
}

export interface StrategyPlan {
  /** Closed-action steps to walk the student through before the graded item.
   *  All of these are existing /api/ai Learn actions — none solves their problem. */
  scaffold: LearnAction[]
  /** PERSISTENT also drops a prerequisite_review session into the plan. */
  insertPrerequisiteReview: boolean
  label: string
  blurb: string
}

export const STRATEGY_PLAN: Record<StrategyLevel, StrategyPlan> = {
  NORMAL: {
    scaffold: [],
    insertPrerequisiteReview: false,
    label: 'Normal',
    blurb: 'Straight practice — generate, answer, grade.',
  },
  STRUGGLING: {
    scaffold: ['example', 'hint'],
    insertPrerequisiteReview: false,
    label: 'Struggling',
    blurb: 'Extra scaffolding: a worked example and a nudge before each item.',
  },
  PERSISTENT: {
    scaffold: ['steps', 'hint'],
    insertPrerequisiteReview: true,
    label: 'Persistent',
    blurb:
      'Steps on an analogous problem, a hint, then analogous practice. Adds a prerequisite review.',
  },
}
