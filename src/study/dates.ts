// Date-only helpers for scheduling. Everything works in whole calendar days and
// treats a YYYY-MM-DD string as midnight UTC so the maths never drifts with the
// viewer's timezone.

const DAY_MS = 24 * 60 * 60 * 1000

/** Parse 'YYYY-MM-DD' (or an ISO timestamp) to a UTC-midnight Date. */
export function parseDay(value: string | Date): Date {
  if (value instanceof Date) return truncateToDay(value)
  const [y, m, d] = value.slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1))
}

/** Drop the time part, keeping the calendar date in UTC. */
export function truncateToDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  )
}

/** Format a Date as 'YYYY-MM-DD' (UTC). */
export function toDayString(date: Date): string {
  return truncateToDay(date).toISOString().slice(0, 10)
}

/** Whole days from `from` to `to`. Negative if `to` is in the past. */
export function daysBetween(from: string | Date, to: string | Date): number {
  return Math.round(
    (parseDay(to).getTime() - parseDay(from).getTime()) / DAY_MS,
  )
}

/** `from` shifted by `n` days. */
export function addDays(from: string | Date, n: number): Date {
  return new Date(parseDay(from).getTime() + n * DAY_MS)
}

/** Number of days in a given UTC year/month (0-indexed month). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

/** Every calendar day in [start, end] inclusive, as 'YYYY-MM-DD' strings. */
export function dayRange(start: string | Date, end: string | Date): string[] {
  const out: string[] = []
  const last = parseDay(end).getTime()
  for (let t = parseDay(start).getTime(); t <= last; t += DAY_MS) {
    out.push(toDayString(new Date(t)))
  }
  return out
}
