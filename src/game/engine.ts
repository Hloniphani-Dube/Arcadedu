import type { EnemyTier, GradedAnswer } from '../lib/types'

// Pure, deterministic game math. The AI never touches these numbers — it only
// decides `correct` / `quality`, and the engine turns that into progression.

export const XP_BASE = 100

/** Total XP required to have reached a given level (level 1 = 0 xp). */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0
  // Gentle quadratic curve: L2=100, L3=280, L4=540, ...
  let total = 0
  for (let l = 2; l <= level; l++) total += XP_BASE + (l - 2) * 80
  return total
}

export function levelForXp(xp: number): number {
  let level = 1
  while (xp >= xpForLevel(level + 1)) level++
  return level
}

export function levelProgress(xp: number): { level: number; into: number; span: number; pct: number } {
  const level = levelForXp(xp)
  const floor = xpForLevel(level)
  const ceil = xpForLevel(level + 1)
  const span = ceil - floor
  const into = xp - floor
  return { level, into, span, pct: Math.round((into / span) * 100) }
}

const TIER_XP: Record<EnemyTier, number> = {
  trivial: 40,
  easy: 70,
  medium: 110,
  hard: 160,
  boss: 300,
}

export function xpReward(tier: EnemyTier, graded: GradedAnswer): number {
  if (!graded.correct) return Math.round(TIER_XP[tier] * 0.1)
  return Math.round(TIER_XP[tier] * (0.5 + graded.quality * 0.5))
}

export type SkillRank = 'Locked' | 'Novice' | 'Developing' | 'Skilled' | 'Mastered'

export function skillRank(clears: number): SkillRank {
  if (clears <= 0) return 'Novice'
  if (clears === 1) return 'Developing'
  if (clears < 4) return 'Skilled'
  return 'Mastered'
}
