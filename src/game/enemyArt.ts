import type { EnemyTier } from '../lib/types'

// Pixel-art enemy portraits, dropped in public/enemy/. Folder names come
// from the assets themselves — medium and hard share one pool.
const POOLS: Record<EnemyTier, string[]> = {
  trivial: range(4).map((i) => `/enemy/stage_1_enemy/${i}.png`),
  easy: range(3).map((i) => `/enemy/stage_2_enemy/${i}.png`),
  medium: range(7).map((i) => `/enemy/stage_3and4_enemy/${i}.png`),
  hard: range(7).map((i) => `/enemy/stage_3and4_enemy/${i}.png`),
  boss: range(5).map((i) => `/enemy/stage_5_enemy/${i}.png`),
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i + 1)
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

/** Deterministic enemy portrait for a tier — same seed always picks the same one. */
export function enemyArtFor(tier: EnemyTier, seed: string): string {
  const pool = POOLS[tier]
  return pool[hash(seed) % pool.length]
}
