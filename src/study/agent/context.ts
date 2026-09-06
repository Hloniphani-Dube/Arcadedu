// Builds the compact snapshot the agent reasons over (spec §19). Pure: give it
// rows + a name lookup + the clock, get back an AgentContext. No DB, no model.

import { calculatePlanConfidence } from '../confidence.ts'
import { TARGET_MASTERY_DEFAULT } from '../config.ts'
import { daysBetween, toDayString } from '../dates.ts'
import type { MissionSnapshot } from '../types.ts'
import type { AgentContext } from './contract.ts'

const PROXIMITY_MILESTONES = [14, 7, 3, 1]

export interface BuildContextInput {
  snapshot: MissionSnapshot
  topicName: (topicId: string) => string
  level: number
  currentDate?: Date
}

export function buildAgentContext(input: BuildContextInput): AgentContext {
  const now = input.currentDate ?? new Date()
  const today = toDayString(now)
  const { mission, topics, mastery, sessions, recent_logs } = input.snapshot

  const masteryByTopic = new Map(mastery.map((m) => [m.topic_id, m]))
  const days_remaining = Math.max(0, daysBetween(now, mission.exam_date))

  const missed_sessions = sessions.filter(
    (s) =>
      s.status === 'missed' ||
      (s.status === 'pending' && daysBetween(now, s.scheduled_date) < 0),
  ).length

  const plan_confidence = calculatePlanConfidence(mission, topics, mastery, now)

  return {
    current_date: today,
    mission: {
      id: mission.id,
      title: mission.title,
      subject_id: mission.subject_id,
      exam_date: mission.exam_date,
      sessions_per_week: mission.sessions_per_week,
      minutes_per_session: mission.minutes_per_session,
      status: mission.status,
    },
    student_model: { level: input.level },
    topics: topics.map((t) => {
      const tm = masteryByTopic.get(t.topic_id)
      return {
        topic_id: t.topic_id,
        name: input.topicName(t.topic_id),
        priority: t.priority,
        target_mastery: t.target_mastery ?? TARGET_MASTERY_DEFAULT,
        mastery: tm?.mastery_score ?? 0,
        quality_avg: tm?.quality_avg ?? 0,
        attempts: tm?.attempts ?? 0,
        strategy_level: tm?.strategy_level ?? 'NORMAL',
        consecutive_flat_sessions: tm?.consecutive_flat_sessions ?? 0,
      }
    }),
    current_plan: sessions
      .filter(
        (s) => s.status === 'pending' || daysBetween(s.scheduled_date, today) <= 7,
      )
      .slice(0, 60)
      .map((s) => ({
        id: s.id,
        topic_id: s.topic_id,
        scheduled_date: s.scheduled_date,
        kind: s.kind,
        strategy_level: s.strategy_level,
        status: s.status,
      })),
    recent_sessions: recent_logs.slice(0, 10).map((l) => ({
      topic_id: l.topic_id,
      created_at: l.created_at,
      items: l.items,
      correct: l.correct,
      mastery_before: l.mastery_before,
      mastery_after: l.mastery_after,
    })),
    missed_sessions,
    days_remaining,
    exam_proximity_crossing: PROXIMITY_MILESTONES.includes(days_remaining)
      ? days_remaining
      : null,
    plan_confidence,
  }
}
