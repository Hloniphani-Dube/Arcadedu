// Deterministic initial study-plan generator.
//
// Spreads practice sessions across the days before the exam, weighted toward the
// weakest topics, never exceeding the mission's weekly cadence and never landing
// outside [today, exam_date]. Produces plain drafts; the IO layer attaches ids.

import { EXPECTED_GAIN_PER_SESSION, SESSION_ITEM_COUNT } from './config.ts'
import { addDays, dayRange, parseDay, truncateToDay } from './dates.ts'
import type { PlanSessionKind, StrategyLevel } from './types.ts'

export interface PlanTopicInput {
  topic_id: string
  mastery: number
  target: number
  strategy_level: StrategyLevel
  priority?: number
}

export interface PlanDraft {
  topic_id: string
  scheduled_date: string // YYYY-MM-DD
  kind: PlanSessionKind
  strategy_level: StrategyLevel
  item_count: number
}

export interface GeneratePlanInput {
  exam_date: string
  sessions_per_week: number
  topics: PlanTopicInput[]
  current_date?: Date
  item_count?: number
}

/** Even-ish picks of `perWeek` days out of one calendar week. */
function spreadWeek(weekDays: string[], perWeek: number): string[] {
  const k = Math.min(perWeek, weekDays.length)
  if (k <= 0) return []
  const picks = new Set<string>()
  for (let j = 0; j < k; j++) {
    const idx = Math.min(
      weekDays.length - 1,
      Math.round((j * weekDays.length) / k),
    )
    picks.add(weekDays[idx])
  }
  return [...picks]
}

/** Ordered list of study-day slots that respects the weekly cadence. */
export function scheduleSlots(
  examDate: string,
  sessionsPerWeek: number,
  currentDate = new Date(),
): string[] {
  const today = truncateToDay(currentDate)
  if (parseDay(examDate) <= today) return []

  const days = dayRange(today, examDate)
  const slots: string[] = []
  for (let i = 0; i < days.length; i += 7) {
    slots.push(...spreadWeek(days.slice(i, i + 7), sessionsPerWeek))
  }
  return slots.sort()
}

export function generatePlan(input: GeneratePlanInput): PlanDraft[] {
  const itemCount = input.item_count ?? SESSION_ITEM_COUNT
  const slots = scheduleSlots(
    input.exam_date,
    input.sessions_per_week,
    input.current_date ?? new Date(),
  )
  if (!slots.length || !input.topics.length) return []

  // "Need" drives selection: how far below target, nudged by explicit priority.
  const need = new Map<string, number>()
  for (const t of input.topics) {
    need.set(
      t.topic_id,
      Math.max(0.0001, t.target - t.mastery) + (t.priority ?? 0) * 0.01,
    )
  }

  const byTopic = new Map(input.topics.map((t) => [t.topic_id, t]))
  const revisionFrom = truncateToDay(addDays(input.exam_date, -3))

  // Guarantee one slot per topic first (weakest first) when there's room.
  const order = [...input.topics].sort(
    (a, b) => (need.get(b.topic_id) ?? 0) - (need.get(a.topic_id) ?? 0),
  )
  const seeded = order.slice(0, slots.length).map((t) => t.topic_id)
  const count = new Map<string, number>(
    input.topics.map((t) => [t.topic_id, 0]),
  )

  const drafts: PlanDraft[] = []
  slots.forEach((day, i) => {
    let topicId: string
    if (i < seeded.length) {
      topicId = seeded[i]
    } else {
      const [maxTopic, maxNeed] = [...need.entries()].sort(
        (a, b) => b[1] - a[1],
      )[0]
      // Once every topic is projected to reach its target, switch from
      // "chase the weakest" to balanced coverage: fewest sessions so far,
      // breaking ties by the larger original gap.
      topicId =
        maxNeed < 0.02
          ? [...count.entries()].sort(
              (a, b) =>
                a[1] - b[1] ||
                (need.get(b[0]) ?? 0) - (need.get(a[0]) ?? 0),
            )[0][0]
          : maxTopic
    }
    count.set(topicId, (count.get(topicId) ?? 0) + 1)
    const topic = byTopic.get(topicId)!
    const isRevision = parseDay(day) >= revisionFrom
    drafts.push({
      topic_id: topicId,
      scheduled_date: day,
      kind: isRevision ? 'revision' : 'practice',
      strategy_level: topic.strategy_level,
      item_count: itemCount,
    })
    need.set(
      topicId,
      Math.max(0, (need.get(topicId) ?? 0) - EXPECTED_GAIN_PER_SESSION),
    )
  })

  return drafts.sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
}
