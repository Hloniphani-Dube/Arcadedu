// Deterministic calendar + reminders engine.
//
// Turns fixed academic dates, recurring routines and the study plan into a
// single "on your plate" list, and surfaces deadline crossings for the agent.
// Pure — no DB, no model.

import { daysBetween, daysInMonth, parseDay } from './dates.ts'
import type { Reminder } from './types.ts'

interface EventLike {
  title: string
  kind: string
  event_date: string
  event_time?: string | null
  completed: boolean
}
interface EventLikeWithTopic extends EventLike {
  topic_id: string | null
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function ordinal(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return `${n}st`
  if (n % 10 === 2 && n % 100 !== 12) return `${n}nd`
  if (n % 10 === 3 && n % 100 !== 13) return `${n}rd`
  return `${n}th`
}

/** "18:05" -> "6:05 PM". Returns '' for anything that isn't HH:MM. */
export function formatTime(time?: string | null): string {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return ''
  const [h, m] = time.split(':').map(Number)
  const period = h < 12 ? 'AM' : 'PM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

/** e.g. "Every Tuesday at 6:00 PM", "Monthly on the 3rd", "Every day". */
export function routineScheduleLabel(r: {
  cadence: 'daily' | 'weekly' | 'biweekly' | 'monthly'
  weekday: number
  anchor_date: string
  time_of_day?: string | null
}): string {
  let base: string
  switch (r.cadence) {
    case 'daily':
      base = 'Every day'
      break
    case 'biweekly':
      base = `Every other ${WEEKDAY_NAMES[r.weekday]}`
      break
    case 'monthly':
      base = `Monthly on the ${ordinal(parseDay(r.anchor_date).getUTCDate())}`
      break
    default:
      base = `Every ${WEEKDAY_NAMES[r.weekday]}`
  }
  const time = formatTime(r.time_of_day)
  return time ? `${base} at ${time}` : base
}

// --- recurring routines ---------------------------------------------------

export interface RoutineShape {
  weekday: number // 0 = Sunday — only meaningful for weekly/biweekly
  cadence: 'daily' | 'weekly' | 'biweekly' | 'monthly'
  anchor_date: string // YYYY-MM-DD — biweekly parity anchor, or monthly's day-of-month
}

/** Due dates for a routine within [from, from + horizonDays], as YYYY-MM-DD. */
export function routineOccurrenceDates(
  routine: RoutineShape,
  from: string,
  horizonDays = 21,
): string[] {
  const out: string[] = []
  const anchorDayOfMonth = parseDay(routine.anchor_date).getUTCDate()

  for (let d = 0; d <= horizonDays; d++) {
    const day = new Date(parseDay(from).getTime() + d * 86400000)
    const iso = day.toISOString().slice(0, 10)

    if (routine.cadence === 'daily') {
      out.push(iso)
      continue
    }

    if (routine.cadence === 'monthly') {
      const dim = daysInMonth(day.getUTCFullYear(), day.getUTCMonth())
      // clamp e.g. an anchor of the 31st to the 28th/30th in a shorter month
      if (day.getUTCDate() !== Math.min(anchorDayOfMonth, dim)) continue
      out.push(iso)
      continue
    }

    // weekly / biweekly — anchored to a day of the week
    if (day.getUTCDay() !== routine.weekday) continue
    if (routine.cadence === 'biweekly') {
      const weeks = Math.floor(daysBetween(routine.anchor_date, iso) / 7)
      if (((weeks % 2) + 2) % 2 !== 0) continue
    }
    out.push(iso)
  }
  return out
}

// --- reminders ----------------------------------------------------------

export interface ReminderInputs {
  today: string
  /** how far ahead study sessions surface (calendar events use a wider window) */
  sessionHorizonDays?: number
  sessions: {
    id: string
    missionId: string
    topicName: string
    kind: string
    scheduled_date: string
  }[]
  events: (EventLike & { id: string })[]
  routineOccurrences: {
    id: string
    title: string
    due_date: string
    time_of_day?: string | null
  }[]
}

const KIND_DETAIL: Record<string, string> = {
  practice: 'Practice session',
  revision: 'Revision session',
  prerequisite_review: 'Prerequisite review',
  diagnostic: 'Diagnostic',
  exam: 'Exam',
  assignment: 'Assignment due',
  quiz: 'Quiz',
  deadline: 'Deadline',
  lecture: 'Lecture',
  other: 'Reminder',
  routine: 'Recurring task',
}

function whenFor(today: string, date: string): Reminder['when'] {
  const d = daysBetween(today, date)
  if (d < 0) return 'overdue'
  if (d === 0) return 'today'
  return 'soon'
}

export function buildReminders(input: ReminderInputs): Reminder[] {
  const { today } = input
  const sessionHorizon = input.sessionHorizonDays ?? 7
  const out: Reminder[] = []

  for (const s of input.sessions) {
    if (daysBetween(today, s.scheduled_date) > sessionHorizon) continue
    out.push({
      id: `session:${s.id}`,
      source: 'session',
      kind: s.kind,
      title: s.topicName,
      detail: KIND_DETAIL[s.kind] ?? 'Study session',
      date: s.scheduled_date,
      when: whenFor(today, s.scheduled_date),
      ref: { missionId: s.missionId, planSessionId: s.id },
    })
  }

  for (const e of input.events) {
    if (e.completed) continue
    const d = daysBetween(today, e.event_date)
    if (d < -3 || d > 21) continue
    out.push({
      id: `event:${e.id}`,
      source: 'event',
      kind: e.kind,
      title: e.title,
      detail: KIND_DETAIL[e.kind] ?? 'Calendar date',
      date: e.event_date,
      time: e.event_time ?? null,
      when: whenFor(today, e.event_date),
      ref: { eventId: e.id },
    })
  }

  // Only overdue/today occurrences show up as individual items — a recurring
  // routine's future dates are represented once, by its schedule line, not
  // as one reminder per upcoming date (see routineScheduleLabel).
  for (const r of input.routineOccurrences) {
    const when = whenFor(today, r.due_date)
    if (when === 'soon') continue
    const d = daysBetween(today, r.due_date)
    if (d < -7) continue
    out.push({
      id: `routine:${r.id}`,
      source: 'routine',
      kind: 'routine',
      title: r.title,
      detail: KIND_DETAIL.routine,
      date: r.due_date,
      time: r.time_of_day ?? null,
      when,
      ref: { routineOccurrenceId: r.id },
    })
  }

  const rank = { overdue: 0, today: 1, soon: 2 }
  return out.sort(
    (a, b) => rank[a.when] - rank[b.when] || a.date.localeCompare(b.date),
  )
}

// --- agent-facing views -----------------------------------------------

const CROSSINGS = [14, 7, 3, 1]

/** Events whose distance is exactly a notify-worthy milestone today. */
export function deadlineCrossings(
  events: EventLike[],
  today: string,
): { title: string; kind: string; days_until: number }[] {
  return events
    .filter((e) => !e.completed && CROSSINGS.includes(daysBetween(today, e.event_date)))
    .map((e) => ({ title: e.title, kind: e.kind, days_until: daysBetween(today, e.event_date) }))
}

/** Compact upcoming-calendar slice for the agent context. */
export function upcomingCalendar(
  events: EventLikeWithTopic[],
  today: string,
  horizonDays = 28,
): { title: string; kind: string; days_until: number; topic_id: string | null }[] {
  return events
    .filter((e) => {
      const d = daysBetween(today, e.event_date)
      return !e.completed && d >= 0 && d <= horizonDays
    })
    .map((e) => ({
      title: e.title,
      kind: e.kind,
      days_until: daysBetween(today, e.event_date),
      topic_id: e.topic_id ?? null,
    }))
    .sort((a, b) => a.days_until - b.days_until)
}

/** Missed + overdue routine occurrences in the recent past. */
export function routinesBehind(
  occurrences: { due_date: string; status: string }[],
  today: string,
): number {
  return occurrences.filter((o) => {
    if (daysBetween(today, o.due_date) < -21) return false
    return o.status === 'missed' || (o.status === 'pending' && daysBetween(today, o.due_date) < 0)
  }).length
}
