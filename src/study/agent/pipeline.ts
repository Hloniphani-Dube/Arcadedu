// The autonomous tick pipeline (spec §24), shared by /api/agent/tick (one
// mission, user JWT) and /api/agent/daily (every active mission, cron).
//
//   load context → deterministic metrics → invoke Strands → parse decision
//   → deterministic gate → apply approved changes → write agent_event
//   → create notification if allowed
//
// This module owns validation, idempotency, the notification permission, and
// every database write. The model only proposes.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSubject, getTopic } from '../../game/atlas.ts'
import type { MissionSnapshot } from '../types.ts'
import { buildAgentContext } from './context.ts'
import {
  parseDecision,
  DecisionParseError,
  type AgentContext,
} from './contract.ts'
import { validateDecision } from './validator.ts'
import { applyChanges, type AppliedChange } from './apply.ts'

/** Given the compact context, return the model's raw decision object. */
export type DecideFn = (
  context: AgentContext,
  trigger: string,
) => Promise<unknown>

/** Proxy to the closed-action learning AI (/api/ai), for producer ops. */
export type CallAiFn = (
  action: string,
  ctx: Record<string, unknown>,
) => Promise<unknown>

export type TickStatus =
  | 'ok'
  | 'idempotent'
  | 'not_found'
  | 'agent_unavailable'
  | 'invalid_decision'
  | 'apply_failed'
  | 'claim_failed'

export interface TickOutcome {
  status: TickStatus
  http: number
  decision: string | null
  applied: boolean
  rejected_reason: string | null
  confidence: string | null
  notified: boolean
  changes: AppliedChange[]
  notes: string[]
  error?: string
}

export interface RunTickArgs {
  db: SupabaseClient
  missionId: string
  userId: string
  trigger: 'SESSION_COMPLETED' | 'DAILY' | 'MANUAL'
  triggerId: string
  decide: DecideFn
  /** proxy to /api/ai for producer ops; if omitted those ops are skipped */
  callAi?: CallAiFn
  now?: Date
}

const NOTIFY_ACTIONS: Record<string, { label: string; intent: string }[]> = {
  FLAG_FOR_HUMAN: [
    { label: 'Add a session', intent: 'add_session' },
    { label: 'Adjust target', intent: 'adjust_target' },
  ],
  REPLAN: [{ label: 'Open study plan', intent: 'open_plan' }],
}

export async function loadSnapshot(
  db: SupabaseClient,
  missionId: string,
): Promise<MissionSnapshot | null> {
  const [mission, topics, mastery, sessions, logs] = await Promise.all([
    db.from('study_missions').select('*').eq('id', missionId).maybeSingle(),
    db.from('mission_topics').select('*').eq('mission_id', missionId),
    db.from('topic_mastery').select('*').eq('mission_id', missionId),
    db
      .from('plan_sessions')
      .select('*')
      .eq('mission_id', missionId)
      .order('scheduled_date', { ascending: true }),
    db
      .from('session_log')
      .select('*')
      .eq('mission_id', missionId)
      .order('created_at', { ascending: false })
      .limit(20),
  ])
  if (mission.error || !mission.data) return null
  return {
    mission: mission.data,
    topics: topics.data ?? [],
    mastery: mastery.data ?? [],
    sessions: sessions.data ?? [],
    recent_logs: logs.data ?? [],
  } as MissionSnapshot
}

/** A DecideFn that calls the Python Strands function over HTTP. */
export function httpDecide(baseUrl: string, fetchImpl: typeof fetch = fetch): DecideFn {
  return async (context, trigger) => {
    const r = await fetchImpl(`${baseUrl}/api/agent/decide`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ context, trigger }),
    })
    if (!r.ok) throw new Error(`decide ${r.status}: ${(await r.text()).slice(0, 200)}`)
    const j = (await r.json()) as { decision?: unknown }
    return j.decision
  }
}

/** A CallAiFn that hits the closed-action /api/ai endpoint. */
export function httpCallAi(baseUrl: string, fetchImpl: typeof fetch = fetch): CallAiFn {
  return async (action, ctx) => {
    const r = await fetchImpl(`${baseUrl}/api/ai`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, context: ctx }),
    })
    if (!r.ok) throw new Error(`ai ${action} ${r.status}`)
    return r.json()
  }
}

export async function runTick(args: RunTickArgs): Promise<TickOutcome> {
  const { db, missionId, userId, trigger, triggerId, decide } = args
  const now = args.now ?? new Date()

  const empty = {
    changes: [] as AppliedChange[],
    notes: [] as string[],
    notified: false,
  }

  const snapshot = await loadSnapshot(db, missionId)
  if (!snapshot) {
    return { status: 'not_found', http: 404, decision: null, applied: false, rejected_reason: null, confidence: null, ...empty }
  }

  // --- claim the tick (idempotency via agent_events UNIQUE(mission_id, trigger_id)) ---
  const claim = await db
    .from('agent_events')
    .insert({ mission_id: missionId, trigger, trigger_id: triggerId, observations: [], changes: [], applied: false })
    .select('id')
    .single()

  if (claim.error) {
    if (claim.error.code === '23505') {
      const prior = await db
        .from('agent_events')
        .select('decision, applied, confidence, notified, rejected_reason')
        .eq('mission_id', missionId)
        .eq('trigger_id', triggerId)
        .maybeSingle()
      return {
        status: 'idempotent',
        http: 200,
        decision: prior.data?.decision ?? null,
        applied: prior.data?.applied ?? false,
        rejected_reason: prior.data?.rejected_reason ?? null,
        confidence: prior.data?.confidence ?? null,
        notified: prior.data?.notified ?? false,
        changes: [],
        notes: [],
      }
    }
    return { status: 'claim_failed', http: 500, decision: null, applied: false, rejected_reason: claim.error.message, confidence: null, ...empty }
  }
  const eventId = claim.data.id as string

  // The student's wider routine load — academic dates + recurring routines — so
  // the agent can reprioritise around a near deadline on a weak topic.
  const horizonEnd = new Date(now.getTime() + 28 * 86400000)
    .toISOString()
    .slice(0, 10)
  const pastStart = new Date(now.getTime() - 21 * 86400000)
    .toISOString()
    .slice(0, 10)
  const [calRes, occRes] = userId
    ? await Promise.all([
        db
          .from('calendar_events')
          .select('title, kind, event_date, topic_id, completed')
          .eq('user_id', userId)
          .lte('event_date', horizonEnd),
        db
          .from('routine_occurrences')
          .select('due_date, status')
          .eq('user_id', userId)
          .gte('due_date', pastStart),
      ])
    : [{ data: [] }, { data: [] }]

  const context = buildAgentContext({
    snapshot,
    level: 1,
    subjectName: getSubject(snapshot.mission.subject_id)?.name,
    topicName: (id) =>
      getTopic(snapshot.mission.subject_id, id)?.name ??
      getSubject(snapshot.mission.subject_id)?.name ??
      id,
    currentDate: now,
    calendarEvents: (calRes.data ?? []) as {
      title: string
      kind: string
      event_date: string
      topic_id: string | null
      completed: boolean
    }[],
    routineOccurrences: (occRes.data ?? []) as { due_date: string; status: string }[],
  })
  const confidence = context.plan_confidence.confidence

  const finalize = async (fields: Record<string, unknown>): Promise<void> => {
    await db.from('agent_events').update(fields).eq('id', eventId)
  }

  // --- invoke Strands ---
  let decisionRaw: unknown
  try {
    decisionRaw = await decide(context, trigger)
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 300) : 'decide failed'
    await finalize({ decision: null, reason: 'agent unavailable', rejected_reason: msg, confidence })
    return { status: 'agent_unavailable', http: 503, decision: null, applied: false, rejected_reason: msg, confidence, ...empty, error: 'The study agent is unavailable — the plan is unchanged.' }
  }

  // --- parse against the closed contract ---
  let decision
  try {
    decision = parseDecision(decisionRaw)
  } catch (err) {
    const msg = err instanceof DecisionParseError ? err.message : 'unparseable decision'
    await finalize({ decision: null, reason: 'invalid decision', rejected_reason: msg, confidence })
    return { status: 'invalid_decision', http: 502, decision: null, applied: false, rejected_reason: msg, confidence, ...empty, error: 'The agent returned an off-contract decision — the plan is unchanged.' }
  }

  // --- deterministic gate ---
  const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()
  const recentNotif = await db
    .from('notifications')
    .select('id')
    .eq('mission_id', missionId)
    .gt('created_at', dayAgo)
    .limit(1)
  const verdict = validateDecision({
    decision,
    context,
    recentNotificationWithin24h: (recentNotif.data?.length ?? 0) > 0,
  })

  let appliedChanges: AppliedChange[] = []
  if (verdict.approved && verdict.changes.length) {
    try {
      appliedChanges = await applyChanges(
        db,
        missionId,
        verdict.changes,
        context,
        args.callAi,
      )
    } catch (err) {
      const msg = `apply failed: ${err instanceof Error ? err.message : 'db error'}`
      await finalize({
        decision: decision.decision,
        observations: decision.observations,
        reason: decision.reason,
        changes: verdict.changes,
        applied: false,
        rejected_reason: msg,
        confidence,
      })
      return { status: 'apply_failed', http: 502, decision: decision.decision, applied: false, rejected_reason: msg, confidence, ...empty, error: 'Could not apply the plan change.' }
    }
  }

  // --- notification (permission already resolved by the validator) ---
  let notified = false
  if (verdict.notify) {
    const ins = await db.from('notifications').insert({
      user_id: userId,
      mission_id: missionId,
      kind: decision.decision,
      message: decision.reason || 'Your study plan needs a decision.',
      actions: NOTIFY_ACTIONS[decision.decision] ?? [{ label: 'Open study plan', intent: 'open_plan' }],
    })
    notified = !ins.error
  }

  await finalize({
    decision: decision.decision,
    observations: decision.observations,
    reason: decision.reason,
    changes: verdict.approved ? appliedChanges : verdict.changes,
    applied: verdict.approved,
    rejected_reason: verdict.rejected_reason,
    notified,
    confidence,
  })

  return {
    status: 'ok',
    http: 200,
    decision: decision.decision,
    applied: verdict.approved,
    rejected_reason: verdict.rejected_reason,
    confidence,
    notified,
    changes: appliedChanges,
    notes: verdict.notes,
  }
}
