// Shared scheduling helpers for the validator (simulate) and apply (persist), so
// the two always agree on where an inserted session lands.

import { daysBetween, parseDay, toDayString } from '../dates.ts'

const DAY_MS = 86400000

export function weekIndexFrom(fromISO: string, dayISO: string): number {
  return Math.floor(daysBetween(fromISO, dayISO) / 7)
}

/** Earliest day in [from, exam] whose calendar week still has capacity. */
export function pickInsertDate(
  from: string,
  exam: string,
  perWeekCount: Map<number, number>,
  cap: number,
  before?: string,
): string {
  const limit =
    before && daysBetween(from, before) >= 0
      ? Math.min(daysBetween(from, exam), daysBetween(from, before))
      : daysBetween(from, exam)

  for (let d = 0; d <= Math.max(0, limit); d++) {
    const w = Math.floor(d / 7)
    if ((perWeekCount.get(w) ?? 0) < cap) {
      return toDayString(new Date(parseDay(from).getTime() + d * DAY_MS))
    }
  }
  // Everything up to the deadline is full — fall back to `before` or the exam.
  return before ?? exam
}
