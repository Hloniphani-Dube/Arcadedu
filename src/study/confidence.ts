// Deterministic plan-confidence.
//
// The agent's primary job is keeping the plan feasible; this is the number it
// watches. No LLM involvement — pure arithmetic over mastery, the calendar and
// the mission's cadence.

import {
  CONFIDENCE_AT_RISK_RATIO,
  CONFIDENCE_ON_TRACK_RATIO,
  EXPECTED_GAIN_PER_SESSION,
  TARGET_MASTERY_DEFAULT,
} from './config.ts'
import { daysBetween } from './dates.ts'
import type {
  MissionTopic,
  PlanConfidenceResult,
  StudyMission,
  TopicMastery,
  WeakTopic,
} from './types.ts'

const EMERGENCY_DAYS = 2
const EMERGENCY_MASTERY = 0.5

export interface ConfidenceInput {
  exam_date: string
  sessions_per_week: number
  topics: { topic_id: string; target: number; mastery: number }[]
  current_date: Date
}

/** Core computation — trivially testable, no row types. */
export function planConfidence(input: ConfidenceInput): PlanConfidenceResult {
  const days_remaining = Math.max(
    0,
    daysBetween(input.current_date, input.exam_date),
  )

  const weak_topics: WeakTopic[] = input.topics
    .map((t) => ({
      topic_id: t.topic_id,
      mastery: t.mastery,
      target: t.target,
      gap: Math.max(0, t.target - t.mastery),
    }))
    .filter((t) => t.gap > 0)
    .sort((a, b) => b.gap - a.gap)

  const required_sessions = input.topics.reduce((sum, t) => {
    const gap = Math.max(0, t.target - t.mastery)
    return sum + Math.ceil(gap / EXPECTED_GAIN_PER_SESSION)
  }, 0)

  const available_sessions = Math.floor(
    (days_remaining / 7) * input.sessions_per_week,
  )

  const ratio = available_sessions / Math.max(required_sessions, 1)

  let confidence: PlanConfidenceResult['confidence']
  if (ratio >= CONFIDENCE_ON_TRACK_RATIO) confidence = 'ON_TRACK'
  else if (ratio >= CONFIDENCE_AT_RISK_RATIO) confidence = 'AT_RISK'
  else confidence = 'OFF_TRACK'

  // Hard override: the exam is on top of us and a topic is still weak.
  if (
    days_remaining <= EMERGENCY_DAYS &&
    input.topics.some((t) => t.mastery < EMERGENCY_MASTERY)
  ) {
    confidence = 'OFF_TRACK'
  }

  return {
    confidence,
    days_remaining,
    required_sessions,
    available_sessions,
    ratio,
    weak_topics,
  }
}

/** Adapter over the DB row types used across the app. */
export function calculatePlanConfidence(
  mission: Pick<StudyMission, 'exam_date' | 'sessions_per_week'>,
  topics: Pick<MissionTopic, 'topic_id' | 'target_mastery'>[],
  mastery: Pick<TopicMastery, 'topic_id' | 'mastery_score'>[],
  currentDate: Date = new Date(),
): PlanConfidenceResult {
  const masteryByTopic = new Map(
    mastery.map((m) => [m.topic_id, m.mastery_score]),
  )
  return planConfidence({
    exam_date: mission.exam_date,
    sessions_per_week: mission.sessions_per_week,
    current_date: currentDate,
    topics: topics.map((t) => ({
      topic_id: t.topic_id,
      target: t.target_mastery ?? TARGET_MASTERY_DEFAULT,
      mastery: masteryByTopic.get(t.topic_id) ?? 0,
    })),
  })
}
