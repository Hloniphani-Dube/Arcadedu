// Supabase IO for Study Missions. Same shape as src/lib/progress.ts: thin,
// typed, RLS-scoped. Every mastery write goes through the deterministic engine in
// this folder — the model never has a path to these tables.

import { supabase } from '../lib/supabase'
import {
  draftMessage,
  generateEnemyQuestion,
  mapSyllabus,
  writeProgressReport,
  writeRevisionSheet,
} from '../lib/ai'
import type { AiRequestContext } from '../lib/types'
import {
  applySession,
  rollQualityAvg,
  seedMastery,
} from './mastery'
import { calculatePlanConfidence } from './confidence'
import { generatePlan, type PlanDraft } from './plan'
import { routineOccurrenceDates } from './calendar'
import { SESSION_ITEM_COUNT, TARGET_MASTERY_DEFAULT } from './config'
import { difficultyForStrategy } from './strategy'
import { addDays, toDayString } from './dates'
import type {
  AgentEvent,
  CalendarEvent,
  CalendarEventKind,
  GradedItem,
  MasteryUpdate,
  MissionArtifact,
  MissionArtifactKind,
  MissionArtifactStatus,
  MissionSnapshot,
  MissionTopic,
  PlanSession,
  PreparedItem,
  Routine,
  RoutineCadence,
  RoutineOccurrence,
  RoutineOccurrenceStatus,
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

// --- mission artifacts (things the agent produces FOR you) -----------------

export async function fetchArtifacts(
  missionId: string,
  kind?: MissionArtifactKind,
): Promise<MissionArtifact[]> {
  if (!supabase) return []
  let q = supabase
    .from('mission_artifacts')
    .select('*')
    .eq('mission_id', missionId)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
  if (kind) q = q.eq('kind', kind)
  const { data, error } = await q
  if (error) throw new StudyDbError(error.message)
  return (data ?? []) as MissionArtifact[]
}

export interface ArtifactInput {
  mission_id: string
  kind: MissionArtifactKind
  title: string
  content: MissionArtifact['content']
  topic_id?: string | null
  plan_session_id?: string | null
  status?: MissionArtifactStatus
  created_by?: 'agent' | 'you'
}

export async function createArtifact(
  input: ArtifactInput,
): Promise<MissionArtifact> {
  const db = requireDb()
  const { data, error } = await db
    .from('mission_artifacts')
    .insert({
      mission_id: input.mission_id,
      kind: input.kind,
      title: input.title,
      content: input.content,
      topic_id: input.topic_id ?? null,
      plan_session_id: input.plan_session_id ?? null,
      status: input.status ?? 'ready',
      created_by: input.created_by ?? 'agent',
    })
    .select('*')
    .single()
  if (error || !data) throw new StudyDbError(error?.message ?? 'Could not save the artifact')
  return data as MissionArtifact
}

export async function setArtifactStatus(
  id: string,
  status: MissionArtifactStatus,
): Promise<void> {
  const db = requireDb()
  await db.from('mission_artifacts').update({ status }).eq('id', id)
}

// --- syllabus intake: the agent builds the whole mission ------------------

export interface SyllabusIntakeInput {
  user_id: string
  syllabusText: string
  subjectCatalog: NonNullable<AiRequestContext['subjectCatalog']>
}

export interface SyllabusIntakeResult {
  missionId: string
  title: string
  topicCount: number
  eventCount: number
  unmapped: string[]
}

/** Paste a syllabus → the agent maps it and creates the mission, topics and
 *  calendar dates. No form. */
export async function createMissionFromSyllabus(
  input: SyllabusIntakeInput,
): Promise<SyllabusIntakeResult> {
  const db = requireDb()
  const today = toDayString(new Date())

  const map = await mapSyllabus({
    syllabusText: input.syllabusText,
    subjectCatalog: input.subjectCatalog,
    today,
  })

  const subject = input.subjectCatalog.find((s) => s.id === map.subject_id)
  if (!subject) {
    throw new StudyDbError(
      "The agent couldn't match this to an Atlas subject. Try naming the subject in the text.",
    )
  }
  const validTopics = new Set(subject.topics.map((t) => t.id))
  const topicIds = map.topic_ids.filter((t) => validTopics.has(t))
  if (topicIds.length === 0) {
    throw new StudyDbError(
      "The agent couldn't match any topics. Try listing the topics your exam covers.",
    )
  }

  const examDate =
    /^\d{4}-\d{2}-\d{2}$/.test(map.exam_date) && map.exam_date >= today
      ? map.exam_date
      : toDayString(addDays(today, 21))

  const { data: mission, error } = await db
    .from('study_missions')
    .insert({
      user_id: input.user_id,
      subject_id: subject.id,
      title: map.title || `${subject.name} Exam`,
      exam_date: examDate,
      sessions_per_week: clampInt(map.sessions_per_week, 2, 6, 4),
      minutes_per_session: [20, 30, 45, 60].includes(map.minutes_per_session)
        ? map.minutes_per_session
        : 30,
      syllabus_source: 'freetext',
      status: 'active',
    })
    .select('id')
    .single()
  if (error || !mission) {
    throw new StudyDbError(error?.message ?? 'Could not create the mission')
  }
  const missionId = mission.id as string

  const target = clamp01(map.target_mastery) || TARGET_MASTERY_DEFAULT
  await db.from('mission_topics').insert(
    topicIds.map((topic_id, i) => ({
      mission_id: missionId,
      topic_id,
      priority: topicIds.length - i,
      target_mastery: target,
    })),
  )

  // Every dated item the agent found → the calendar.
  const events = [
    ...map.events
      .filter((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date))
      .map((e) => ({
        user_id: input.user_id,
        mission_id: missionId,
        title: e.title || 'Untitled',
        kind: normalizeEventKind(e.kind),
        event_date: e.date,
      })),
    {
      user_id: input.user_id,
      mission_id: missionId,
      title: `${map.title || subject.name}: exam`,
      kind: 'exam' as CalendarEventKind,
      event_date: examDate,
    },
  ]
  if (events.length) await db.from('calendar_events').insert(events)

  return {
    missionId,
    title: map.title || subject.name,
    topicCount: topicIds.length,
    eventCount: events.length,
    unmapped: map.unmapped,
  }
}

function clampInt(n: number, lo: number, hi: number, fallback: number): number {
  const v = Math.round(Number(n))
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback
}
function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0
}
export function normalizeEventKind(k: string): CalendarEventKind {
  const ok: CalendarEventKind[] = [
    'exam',
    'assignment',
    'quiz',
    'deadline',
    'lecture',
    'other',
  ]
  return (ok as string[]).includes(k) ? (k as CalendarEventKind) : 'deadline'
}

// --- the agent prepares your sessions ahead of time -----------------------

const MISSION_BASE_TIER = 'medium' as const

/** Generate a session's practice items now and cache them, so the student
 *  never waits when they sit down. */
export async function prepareSession(
  missionId: string,
  planSession: Pick<PlanSession, 'id' | 'topic_id' | 'strategy_level' | 'item_count'>,
  ctx: { subjectName: string; topicName: string; level: number },
): Promise<MissionArtifact | null> {
  if (!supabase) return null

  // already prepared?
  const { data: existing } = await supabase
    .from('mission_artifacts')
    .select('id')
    .eq('plan_session_id', planSession.id)
    .eq('kind', 'session_items')
    .maybeSingle()
  if (existing) return null

  const placeholder = await createArtifact({
    mission_id: missionId,
    kind: 'session_items',
    title: `${ctx.topicName}: session ready`,
    content: {},
    topic_id: planSession.topic_id,
    plan_session_id: planSession.id,
    status: 'preparing',
  })

  const difficulty = difficultyForStrategy(
    MISSION_BASE_TIER,
    planSession.strategy_level,
  )
  const items: PreparedItem[] = []
  try {
    for (let i = 0; i < (planSession.item_count || SESSION_ITEM_COUNT); i++) {
      const q = await generateEnemyQuestion({
        subject: ctx.subjectName,
        topic: ctx.topicName,
        level: ctx.level,
        difficulty,
      })
      items.push({
        guidance: q.guidance,
        question: q.question,
        expectedConcept: q.expectedConcept,
        difficulty,
      })
    }
  } catch {
    // partial is fine — the session falls back to live generation for the rest
  }

  const db = requireDb()
  const { data } = await db
    .from('mission_artifacts')
    .update({ content: { items }, status: 'ready' })
    .eq('id', placeholder.id)
    .select('*')
    .single()
  return (data ?? null) as MissionArtifact | null
}

/** The cached items for a plan session, if the agent prepared them. */
export async function fetchPreparedItems(
  planSessionId: string,
): Promise<PreparedItem[] | null> {
  if (!supabase) return null
  const { data } = await supabase
    .from('mission_artifacts')
    .select('content, status')
    .eq('plan_session_id', planSessionId)
    .eq('kind', 'session_items')
    .maybeSingle()
  const items = (data?.content as { items?: PreparedItem[] })?.items
  return data?.status === 'ready' && items?.length ? items : null
}

// --- the agent writes your revision sheets / reports / drafts -------------

export async function generateRevisionSheet(
  missionId: string,
  topicId: string,
  ctx: { subjectName: string; topicName: string; level: number },
  createdBy: 'agent' | 'you' = 'you',
): Promise<MissionArtifact> {
  const text = await writeRevisionSheet(ctx.subjectName, ctx.topicName, ctx.level)
  return createArtifact({
    mission_id: missionId,
    kind: 'revision_sheet',
    title: `${ctx.topicName}: revision sheet`,
    content: { text },
    topic_id: topicId,
    created_by: createdBy,
  })
}

/** Deterministic "what the agent did" facts from the last 7 days. */
export function weeklyFacts(snapshot: MissionSnapshot, events: AgentEvent[]): string[] {
  const weekAgo = toDayString(addDays(new Date(), -7))
  const recent = events.filter((e) => e.created_at.slice(0, 10) >= weekAgo)
  const facts: string[] = []

  const applied = recent.filter((e) => e.applied && e.changes?.length)
  for (const e of applied) {
    for (const c of e.changes as { op?: string; detail?: string }[]) {
      if (c.detail) facts.push(`${c.op ?? 'change'}: ${c.detail}`)
    }
  }

  const doneThisWeek = snapshot.sessions.filter(
    (s) => s.status === 'done' && (s.completed_at ?? '').slice(0, 10) >= weekAgo,
  ).length
  if (doneThisWeek) facts.push(`${doneThisWeek} practice session(s) completed`)

  const missed = snapshot.sessions.filter((s) => s.status === 'missed').length
  if (missed) facts.push(`${missed} session(s) currently missed`)

  const notified = recent.filter((e) => e.notified).length
  if (notified) facts.push(`${notified} decision(s) sent to you`)

  return facts
}

export async function requestProgressReport(
  snapshot: MissionSnapshot,
  events: AgentEvent[],
  subjectName: string,
): Promise<MissionArtifact> {
  const conf = calculatePlanConfidence(
    snapshot.mission,
    snapshot.topics,
    snapshot.mastery,
    new Date(),
  )
  const facts = [
    ...weeklyFacts(snapshot, events),
    ...snapshot.mastery.map(
      (m) =>
        `${m.topic_id}: mastery ${Math.round(m.mastery_score * 100)}% of ${Math.round(
          (snapshot.topics.find((t) => t.topic_id === m.topic_id)?.target_mastery ??
            TARGET_MASTERY_DEFAULT) * 100,
        )}% target`,
    ),
  ]
  const text = await writeProgressReport({
    subject: subjectName,
    reportFacts: facts,
    daysRemaining: conf.days_remaining,
    confidence: conf.confidence,
  })
  return createArtifact({
    mission_id: snapshot.mission.id,
    kind: 'progress_report',
    title: `Progress report: ${toDayString(new Date())}`,
    content: { text },
    created_by: 'you',
  })
}

export async function requestMessageDraft(
  missionId: string,
  input: {
    messageKind: 'extension_request' | 'tutor_update'
    subject: string
    details: string
    studentName?: string
  },
): Promise<MissionArtifact> {
  const d = await draftMessage({ ...input, today: toDayString(new Date()) })
  return createArtifact({
    mission_id: missionId,
    kind: 'message_draft',
    title:
      input.messageKind === 'extension_request'
        ? 'Draft: extension request'
        : 'Draft: tutor update',
    content: { subject: d.subject, body: d.body },
    status: 'draft',
    created_by: 'you',
  })
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

export interface CalendarSession {
  id: string
  missionId: string
  subjectId: string
  topicId: string
  kind: string
  scheduled_date: string
  status: string
}

/** All plan sessions across the user's active missions, for the calendar grid. */
export async function fetchCalendarSessions(
  userId: string,
): Promise<CalendarSession[]> {
  if (!supabase) return []
  const { data: missions } = await supabase
    .from('study_missions')
    .select('id, subject_id')
    .eq('user_id', userId)
    .eq('status', 'active')
  const list = (missions ?? []) as { id: string; subject_id: string }[]
  if (!list.length) return []
  const subjectByMission = new Map(list.map((m) => [m.id, m.subject_id]))

  const { data, error } = await supabase
    .from('plan_sessions')
    .select('id, mission_id, topic_id, kind, scheduled_date, status')
    .in(
      'mission_id',
      list.map((m) => m.id),
    )
    .order('scheduled_date', { ascending: true })
  if (error) throw new StudyDbError(error.message)
  return ((data ?? []) as PlanSession[]).map((s) => ({
    id: s.id,
    missionId: s.mission_id,
    subjectId: subjectByMission.get(s.mission_id) ?? '',
    topicId: s.topic_id,
    kind: s.kind,
    scheduled_date: s.scheduled_date,
    status: s.status,
  }))
}

// --- academic calendar -----------------------------------------------------

export interface CalendarEventInput {
  user_id: string
  title: string
  kind: CalendarEventKind
  event_date: string
  event_time?: string | null
  mission_id?: string | null
  topic_id?: string | null
  notes?: string | null
}

export async function fetchCalendarEvents(
  userId: string,
  range?: { from?: string; to?: string },
): Promise<CalendarEvent[]> {
  if (!supabase) return []
  let q = supabase
    .from('calendar_events')
    .select('*')
    .eq('user_id', userId)
    .order('event_date', { ascending: true })
  if (range?.from) q = q.gte('event_date', range.from)
  if (range?.to) q = q.lte('event_date', range.to)
  const { data, error } = await q
  if (error) throw new StudyDbError(error.message)
  return (data ?? []) as CalendarEvent[]
}

export async function createCalendarEvent(
  input: CalendarEventInput,
): Promise<CalendarEvent> {
  const db = requireDb()
  const { data, error } = await db
    .from('calendar_events')
    .insert({
      user_id: input.user_id,
      title: input.title.trim() || 'Untitled',
      kind: input.kind,
      event_date: input.event_date,
      event_time: input.event_time || null,
      mission_id: input.mission_id ?? null,
      topic_id: input.topic_id ?? null,
      notes: input.notes ?? null,
    })
    .select('*')
    .single()
  if (error || !data) throw new StudyDbError(error?.message ?? 'Could not add the date')
  return data as CalendarEvent
}

export async function createCalendarEvents(
  userId: string,
  items: { title: string; kind: string; date: string }[],
): Promise<CalendarEvent[]> {
  if (items.length === 0) return []
  const db = requireDb()
  const { data, error } = await db
    .from('calendar_events')
    .insert(
      items.map((it) => ({
        user_id: userId,
        title: it.title.trim() || 'Untitled',
        kind: normalizeEventKind(it.kind),
        event_date: it.date,
      })),
    )
    .select('*')
  if (error) throw new StudyDbError(error.message)
  return (data ?? []) as CalendarEvent[]
}

export async function updateCalendarEvent(
  id: string,
  patch: Partial<Pick<CalendarEvent, 'title' | 'kind' | 'event_date' | 'event_time' | 'notes' | 'completed' | 'mission_id' | 'topic_id'>>,
): Promise<void> {
  const db = requireDb()
  const { error } = await db.from('calendar_events').update(patch).eq('id', id)
  if (error) throw new StudyDbError(error.message)
}

export async function deleteCalendarEvent(id: string): Promise<void> {
  const db = requireDb()
  await db.from('calendar_events').delete().eq('id', id)
}

// --- recurring routines --------------------------------------------------

export interface RoutineInput {
  user_id: string
  title: string
  cadence: RoutineCadence
  weekday: number
  /** monthly: which day-of-month to repeat on, as YYYY-MM-DD. Defaults to today. */
  anchor_date?: string
  time_of_day?: string | null
  mission_id?: string | null
}

export async function fetchRoutines(userId: string): Promise<Routine[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('routines')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw new StudyDbError(error.message)
  return (data ?? []) as Routine[]
}

export async function createRoutine(input: RoutineInput): Promise<Routine> {
  const db = requireDb()
  const { data, error } = await db
    .from('routines')
    .insert({
      user_id: input.user_id,
      title: input.title.trim() || 'Recurring task',
      cadence: input.cadence,
      weekday: input.weekday,
      anchor_date: input.anchor_date ?? toDayString(new Date()),
      time_of_day: input.time_of_day || null,
      mission_id: input.mission_id ?? null,
    })
    .select('*')
    .single()
  if (error || !data) throw new StudyDbError(error?.message ?? 'Could not add the routine')
  return data as Routine
}

export async function setRoutineActive(id: string, active: boolean): Promise<void> {
  const db = requireDb()
  await db.from('routines').update({ active }).eq('id', id)
}

export async function deleteRoutine(id: string): Promise<void> {
  const db = requireDb()
  await db.from('routines').delete().eq('id', id)
}

export async function setRoutineOccurrenceStatus(
  id: string,
  status: RoutineOccurrenceStatus,
): Promise<void> {
  const db = requireDb()
  await db
    .from('routine_occurrences')
    .update({
      status,
      completed_at: status === 'done' ? new Date().toISOString() : null,
    })
    .eq('id', id)
}

/**
 * Materialise routine occurrences for the horizon ahead and flag overdue ones
 * as missed. Safe to call repeatedly — inserts are `ignoreDuplicates`.
 */
export async function ensureRoutineOccurrences(
  userId: string,
  horizonDays = 21,
): Promise<RoutineOccurrence[]> {
  if (!supabase) return []
  const today = toDayString(new Date())

  const { data: routines } = await supabase
    .from('routines')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)

  const rows: { routine_id: string; user_id: string; due_date: string }[] = []
  for (const r of (routines ?? []) as Routine[]) {
    for (const due of routineOccurrenceDates(r, today, horizonDays)) {
      rows.push({ routine_id: r.id, user_id: userId, due_date: due })
    }
  }
  if (rows.length) {
    await supabase
      .from('routine_occurrences')
      .upsert(rows, { onConflict: 'routine_id,due_date', ignoreDuplicates: true })
  }

  // Overdue pending → missed.
  await supabase
    .from('routine_occurrences')
    .update({ status: 'missed' })
    .eq('user_id', userId)
    .eq('status', 'pending')
    .lt('due_date', today)

  const { data, error } = await supabase
    .from('routine_occurrences')
    .select('*')
    .eq('user_id', userId)
    .gte('due_date', addDays(today, -21).toISOString().slice(0, 10))
    .lte('due_date', addDays(today, horizonDays).toISOString().slice(0, 10))
    .order('due_date', { ascending: true })
  if (error) throw new StudyDbError(error.message)
  return (data ?? []) as RoutineOccurrence[]
}

// --- the Inbox aggregate ------------------------------------------------

export interface InboxData {
  missions: { id: string; title: string; subject_id: string }[]
  reminderSessions: {
    id: string
    missionId: string
    topicId: string
    kind: string
    scheduled_date: string
  }[]
  events: CalendarEvent[]
  routineOccurrences: RoutineOccurrence[]
  routineTitles: Record<string, string>
  routines: Routine[]
  notifications: StudyNotification[]
  lastDailyDigest: { reason: string | null; created_at: string } | null
}

/** Cheap count for the sidebar badge: unread decisions + overdue/today items. */
export async function fetchInboxCount(userId: string): Promise<number> {
  if (!supabase) return 0
  const today = toDayString(new Date())
  const head = { count: 'exact' as const, head: true }
  const [notif, sessions, events, routines] = await Promise.all([
    supabase.from('notifications').select('id', head).eq('user_id', userId).eq('read', false),
    supabase.from('plan_sessions').select('id', head).eq('status', 'pending').lte('scheduled_date', today),
    supabase.from('calendar_events').select('id', head).eq('user_id', userId).eq('completed', false).lte('event_date', today),
    supabase.from('routine_occurrences').select('id', head).eq('user_id', userId).neq('status', 'done').lte('due_date', today),
  ])
  return (
    (notif.count ?? 0) +
    (sessions.count ?? 0) +
    (events.count ?? 0) +
    (routines.count ?? 0)
  )
}

/** Everything the Inbox needs, in one shot. */
export async function fetchInbox(userId: string): Promise<InboxData> {
  const empty: InboxData = {
    missions: [],
    reminderSessions: [],
    events: [],
    routineOccurrences: [],
    routineTitles: {},
    routines: [],
    notifications: [],
    lastDailyDigest: null,
  }
  if (!supabase) return empty

  const today = toDayString(new Date())
  const horizon = addDays(today, 21).toISOString().slice(0, 10)

  const [missionsRes, eventsRes, notifsRes] = await Promise.all([
    supabase
      .from('study_missions')
      .select('id, subject_id, title')
      .eq('user_id', userId)
      .eq('status', 'active'),
    fetchCalendarEvents(userId, { from: addDays(today, -3).toISOString().slice(0, 10), to: horizon }),
    fetchNotifications(userId, { unreadOnly: true, limit: 30 }),
  ])

  const missions = (missionsRes.data ?? []) as { id: string; subject_id: string; title: string }[]

  let reminderSessions: InboxData['reminderSessions'] = []
  if (missions.length) {
    const { data: sessions } = await supabase
      .from('plan_sessions')
      .select('id, mission_id, topic_id, kind, scheduled_date, status')
      .in('mission_id', missions.map((m) => m.id))
      .eq('status', 'pending')
      .lte('scheduled_date', horizon)
      .order('scheduled_date', { ascending: true })
    reminderSessions = ((sessions ?? []) as PlanSession[]).map((s) => ({
      id: s.id,
      missionId: s.mission_id,
      topicId: s.topic_id, // screens resolve the Atlas display name
      kind: s.kind,
      scheduled_date: s.scheduled_date,
    }))
  }

  const routineOccurrences = await ensureRoutineOccurrences(userId, 21)
  const routines = await fetchRoutines(userId)

  const { data: digest } = await supabase
    .from('agent_events')
    .select('reason, created_at')
    .eq('trigger', 'DAILY')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    missions,
    reminderSessions,
    events: eventsRes,
    routineOccurrences,
    routineTitles: Object.fromEntries(routines.map((r) => [r.id, r.title])),
    routines,
    notifications: notifsRes,
    lastDailyDigest: digest
      ? { reason: digest.reason ?? null, created_at: digest.created_at }
      : null,
  }
}
