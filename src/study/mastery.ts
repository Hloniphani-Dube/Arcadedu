// Deterministic mastery engine.
//
// The LLM only ever returns { correct, quality } per graded item (the same shape
// the game engine consumes). This module turns a stream of those into a mastery
// score with a rolling EWMA, and decides whether a session was "flat". Nothing
// here calls the model; nothing here is allowed to.

import {
  FLAT_DELTA,
  MASTERY_ALPHA,
  TARGET_MASTERY_DEFAULT,
  WRONG_ANSWER_QUALITY_FACTOR,
} from './config.ts'
import type { GradedItem, MasteryUpdate } from './types.ts'

export const clamp01 = (n: number): number =>
  Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0

/** Observed quality for one item: a wrong answer still carries partial signal. */
export function observedQuality(item: GradedItem): number {
  const q = clamp01(item.quality)
  return item.correct ? q : q * WRONG_ANSWER_QUALITY_FACTOR
}

/** One EWMA step: nudge `prev` toward this item's observed quality. */
export function nextMastery(prev: number, item: GradedItem): number {
  const p = clamp01(prev)
  const qObs = observedQuality(item)
  return clamp01(p + MASTERY_ALPHA * (qObs - p))
}

/**
 * Fold a whole session's graded items through the EWMA and report the result.
 *
 * `prevFlatCount` is the topic's current `consecutive_flat_sessions`; this
 * returns the next value (incremented on a flat session, reset to 0 otherwise).
 */
export function applySession(
  prevMastery: number,
  items: GradedItem[],
  prevFlatCount = 0,
  target: number = TARGET_MASTERY_DEFAULT,
): MasteryUpdate {
  const before = clamp01(prevMastery)
  let mastery = before
  let correct = 0
  let qualitySum = 0

  for (const item of items) {
    mastery = nextMastery(mastery, item)
    if (item.correct) correct += 1
    qualitySum += clamp01(item.quality)
  }

  const after = mastery
  const delta = after - before
  // Flat: barely moved AND still short of the goal. Reaching/keeping the target
  // is never "flat" even if the delta is tiny.
  const flat = delta < FLAT_DELTA && after < target
  const consecutive_flat_sessions = flat ? prevFlatCount + 1 : 0

  return {
    mastery_before: before,
    mastery_after: after,
    quality_avg: items.length ? qualitySum / items.length : 0,
    items: items.length,
    correct,
    flat,
    consecutive_flat_sessions,
  }
}

/** Initial mastery from a diagnostic: fold its items starting from zero. */
export function seedMastery(items: GradedItem[]): number {
  return applySession(0, items).mastery_after
}

/** Rolling mean update for `topic_mastery.quality_avg`. */
export function rollQualityAvg(
  prevAvg: number,
  prevAttempts: number,
  sessionQualityAvg: number,
  sessionItems: number,
): number {
  const total = prevAttempts + sessionItems
  if (total <= 0) return 0
  return clamp01(
    (clamp01(prevAvg) * prevAttempts + sessionQualityAvg * sessionItems) / total,
  )
}
