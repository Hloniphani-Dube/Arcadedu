// Supabase IO for Study Missions. Same shape as src/lib/progress.ts: thin,
// typed, RLS-scoped. Every mastery write goes through the deterministic engine in
// this folder — the model never has a path to these tables.

import { supabase } from '../lib/supabase'
import {
  applySession,
  rollQualityAvg,
  seedMastery,
} from './mastery'
import { generatePlan, type PlanDraft } from './plan'
import { TARGET_MASTERY_DEFAULT } from './config'
import { toDayString } from './dates'
import type {
  AgentEvent,
  GradedItem,
  MasteryUpdate,
  MissionSnapshot,
  MissionTopic,
  PlanSession,
  SessionLog,
  StrategyLevel,
  StudyMission,
  StudyNotification,
  TopicMastery,
} from './types'

export class StudyDbError extends Error {}

function requireDb() {
  if (!supabase) {
    throw new StudyDbError('Study Missions need a signed-in account.')
  }
  return supabase
}

// --- creation ------------------------------------------------------------

export interface CreateMissionInput {
  user_id: string
  subject_id: string
  title: string
  exam_date: string // YYYY-MM-DD
  sessions_per_week: number
  minutes_per_session: number
  topic_ids: string[]
  target_mastery?: number
}

export async function createMission(
  input: CreateMissionInput,
): Promise<string> {
  const db = requireDb()
  const { data: mission, error } = await db
    .from('study_missions')
    .insert({
      user_id: input.user_id,
      subject_id: input.subject_id,
      title: input.title.trim() || 'Study Mission',
      exam_date: input.exam_date,
      sessions_per_week: input.sessions_per_week,
      minutes_per_session: input.minutes_per_session,
      syllabus_source: 'atlas',
      status: 'active',
    })
    .select('id')
    .single()

  if (error || !mission) {
    throw new StudyDbError(error?.message ?? 'Could not create the mission')
  }

  const target = input.target_mastery ?? TARGET_MASTERY_DEFAULT
  const rows = input.topic_ids.map((topic_id, i) => ({
    mission_id: mission.id as string,
    topic_id,
    priority: input.topic_ids.length - i, // selection order → priority
    target_mastery: target,
  }))
  const { error: topicsError } = await db.from('mission_topics').insert(rows)
  if (topicsError) {
    throw new StudyDbError(topicsError.message)
  }

  return mission.id as string
}

// --- reads -------------------------------------------------------------

export async function fetchMissions(userId: string): Promise<StudyMission[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('study_missions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw new StudyDbError(error.message)
  return (data ?? []) as StudyMission[]
}

export async function fetchMissionSnapshot(
  missionId: string,
): Promise<MissionSnapshot | null> {
  if (!supabase) return null
  const [mission, topics, mastery, sessions, logs] = await Promise.all([
    supabase.from('study_missions').select('*').eq('id', missionId).maybeSingle(),
    supabase.from('mission_topics').select('*').eq('mission_id', missionId),
    supabase.from('topic_mastery').select('*').eq('mission_id', missionId),
    supabase
      .from('plan_sessions')
      .select('*')
      .eq('mission_id', missionId)
      .order('scheduled_date', { ascending: true }),
    supabase
      .from('session_log')
      .select('*')
      .eq('mission_id', missionId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  if (mission.error || !mission.data) return null
  return {
    mission: mission.data as StudyMission,
    topics: (topics.data ?? []) as MissionTopic[],
    mastery: (mastery.data ?? []) as TopicMastery[],
    sessions: (sessions.data ?? []) as PlanSession[],
    recent_logs: (logs.data ?? []) as SessionLog[],
  }
}

// --- diagnostic seeding ----------------------------------------------------

export interface DiagnosticResult {
  topic_id: string
  items: GradedItem[]
}

/** Turn diagnostic answers into initial mastery + the first study plan. */
export async function seedDiagnosticAndPlan(
  snapshot: MissionSnapshot,
  results: DiagnosticResult[],
): Promise<void> {
  const db = requireDb()
  const { mission } = snapshot

  const now = new Date().toISOString()
  const masteryRows = results.map((r) => {
    const mastery = seedMastery(r.items)
    return {
      mission_id: mission.id,
      topic_id: r.topic_id,
      attempts: r.items.length,
      correct: r.items.filter((i) => i.correct).length,
      quality_avg:
        r.items.reduce((s, i) => s + Math.max(0, Math.min(1, i.quality)), 0) /
        Math.max(1, r.items.length),
      mastery_score: mastery,
      strategy_level: 'NORMAL' as StrategyLevel,
      consecutive_flat_sessions: 0,
      last_attempt_at: now,
    }
  })

  const { error: mErr } = await db
    .from('topic_mastery')
    .upsert(masteryRows, { onConflict: 'mission_id,topic_id' })
  if (mErr) throw new StudyDbError(mErr.message)

  const { error: lErr } = await db.from('session_log').insert(
    masteryRows.map((row) => ({
      mission_id: mission.id,
      plan_session_id: null,
      topic_id: row.topic_id,
      items: row.attempts,
      correct: row.correct,
      quality_avg: row.quality_avg,
      mastery_before: 0,
      mastery_after: row.mastery_score,
    })),
  )
  if (lErr) throw new StudyDbError(lErr.message)

  await regeneratePlan({
    ...snapshot,
    mastery: masteryRows.map((r) => ({
      ...(r as unknown as TopicMastery),
    })),
  })
}

// --- planning ------------------------------------------------------------

function draftsFor(snapshot: MissionSnapshot, from: Date): PlanDraft[] {
  const masteryByTopic = new Map(
    snapshot.mastery.map((m) => [m.topic_id, m]),
  )
  return generatePlan({
    exam_date: snapshot.mission.exam_date,
    sessions_per_week: snapshot.mission.sessions_per_week,
    current_date: from,
    topics: snapshot.topics.map((t) => ({
      topic_id: t.topic_id,
      target: t.target_mastery ?? TARGET_MASTERY_DEFAULT,
      mastery: masteryByTopic.get(t.topic_id)?.mastery_score ?? 0,
      strategy_level:
        masteryByTopic.get(t.topic_id)?.strategy_level ?? 'NORMAL',
      priority: t.priority,
    })),
  })
}

/** Replace all still-pending sessions with a freshly generated plan. */
export async function regeneratePlan(
  snapshot: MissionSnapshot,
  from: Date = new Date(),
): Promise<void> {
  const db = requireDb()
  const drafts = draftsFor(snapshot, from)

  await db
    .from('plan_sessions')
    .delete()
    .eq('mission_id', snapshot.mission.id)
    .eq('status', 'pending')

  if (!drafts.length) return
  const { error } = await db.from('plan_sessions').insert(
    drafts.map((d) => ({
      mission_id: snapshot.mission.id,
      topic_id: d.topic_id,
      scheduled_date: d.scheduled_date,
      kind: d.kind,
      strategy_level: d.strategy_level,
      item_count: d.item_count,
      status: 'pending',
    })),
  )
  if (error) throw new StudyDbError(error.message)
}

/** Flag pending sessions whose scheduled date has slipped past. */
export async function markMissedSessions(
  missionId: string,
  today: Date = new Date(),
): Promise<void> {
  if (!supabase) return
  await supabase
    .from('plan_sessions')
    .update({ status: 'missed' })
    .eq('mission_id', missionId)
    .eq('status', 'pending')
    .lt('scheduled_date', toDayString(today))
}

// --- session recording ---------------------------------------------------

export interface RecordSessionInput {
  missionId: string
  planSessionId?: string | null
  topicId: string
  targetMastery?: number
  items: GradedItem[]
}

/** Deterministic mastery update + session log for one completed mission session. */
export async function recordMissionSession(
  input: RecordSessionInput,
): Promise<MasteryUpdate> {
  const db = requireDb()

  const { data: prevRow } = await db
    .from('topic_mastery')
    .select('*')
    .eq('mission_id', input.missionId)
    .eq('topic_id', input.topicId)
    .maybeSingle()

  const prev = (prevRow ?? null) as TopicMastery | null
  const prevMastery = prev?.mastery_score ?? 0
  const prevAttempts = prev?.attempts ?? 0
  const prevCorrect = prev?.correct ?? 0
  const prevFlat = prev?.consecutive_flat_sessions ?? 0

  const upd = applySession(
    prevMastery,
    input.items,
    prevFlat,
    input.targetMastery ?? TARGET_MASTERY_DEFAULT,
  )

  const now = new Date().toISOString()
  const { error: mErr } = await db.from('topic_mastery').upsert(
    {
      mission_id: input.missionId,
      topic_id: input.topicId,
      attempts: prevAttempts + upd.items,
      correct: prevCorrect + upd.correct,
      quality_avg: rollQualityAvg(
        prev?.quality_avg ?? 0,
        prevAttempts,
        upd.quality_avg,
        upd.items,
      ),
      mastery_score: upd.mastery_after,
      strategy_level: prev?.strategy_level ?? 'NORMAL',
      consecutive_flat_sessions: upd.consecutive_flat_sessions,
      last_attempt_at: now,
    },
    { onConflict: 'mission_id,topic_id' },
  )
  if (mErr) throw new StudyDbError(mErr.message)

  const { error: lErr } = await db.from('session_log').insert({
    mission_id: input.missionId,
    plan_session_id: input.planSessionId ?? null,
    topic_id: input.topicId,
    items: upd.items,
    correct: upd.correct,
    quality_avg: upd.quality_avg,
    mastery_before: upd.mastery_before,
    mastery_after: upd.mastery_after,
  })
  if (lErr) throw new StudyDbError(lErr.message)

  if (input.planSessionId) {
    await db
      .from('plan_sessions')
      .update({ status: 'done', completed_at: now })
      .eq('id', input.planSessionId)
  }

  return upd
}

export async function archiveMission(missionId: string): Promise<void> {
  const db = requireDb()
  await db
    .from('study_missions')
    .update({ status: 'archived' })
    .eq('id', missionId)
}

// --- agent activity + notifications ------------------------------------------

export async function fetchAgentEvents(
  missionId: string,
  limit = 50,
): Promise<AgentEvent[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('agent_events')
    .select('*')
    .eq('mission_id', missionId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new StudyDbError(error.message)
  return (data ?? []) as AgentEvent[]
}

export async function fetchNotifications(
  userId: string,
  opts: { unreadOnly?: boolean; limit?: number } = {},
): Promise<StudyNotification[]> {
  if (!supabase) return []
  let q = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 20)
  if (opts.unreadOnly) q = q.eq('read', false)
  const { data, error } = await q
  if (error) throw new StudyDbError(error.message)
  return (data ?? []) as StudyNotification[]
}

export async function markNotificationRead(id: string): Promise<void> {
  if (!supabase) return
  await supabase.from('notifications').update({ read: true }).eq('id', id)
}
