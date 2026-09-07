// The deterministic gate.
//
// The Strands agent proposes a decision; this decides whether it is legal. It is
// all-or-nothing for changes (spec §35: "do not partially apply"), and it owns
// the notification permission entirely — the model's `notify: true` is only ever
// a request.

import { FLAT_SESSIONS_FOR_ESCALATION } from '../config.ts'
import { daysBetween } from '../dates.ts'
import { strategyStepIsLegal } from '../strategy.ts'
import type { AgentChange, AgentContext, AgentDecisionJson } from './contract.ts'
import { pickInsertDate, weekIndexFrom } from './schedule.ts'

export interface ValidatorInput {
  decision: AgentDecisionJson
  context: AgentContext
  /** Has a proactive notification for this mission gone out in the last 24h? */
  recentNotificationWithin24h: boolean
}

export interface ValidatorResult {
  approved: boolean
  rejected_reason: string | null
  /** decision.changes when approved, [] otherwise */
  changes: AgentChange[]
  notify: boolean
  /** telemetry: 'notify_suppressed' | 'notify_rate_limited' */
  notes: string[]
}

const ESCALATING_DECISIONS = new Set(['ESCALATE_STRATEGY', 'INSERT_REMEDIATION'])

export function validateDecision(input: ValidatorInput): ValidatorResult {
  const { decision, context } = input
  const notes: string[] = []
  const reject = (reason: string): ValidatorResult => ({
    approved: false,
    rejected_reason: reason,
    changes: [],
    ...resolveNotify(),
  })

  // --- Rule 6 & 7 — notification permission (independent of the changes) ---
  function resolveNotify(): { notify: boolean; notes: string[] } {
    if (!decision.notify) return { notify: false, notes }
    const conf = context.plan_confidence
    const allowed =
      conf.confidence === 'OFF_TRACK' ||
      (context.days_remaining <= 3 &&
        conf.weak_topics.length > 0 &&
        context.missed_sessions >= 2)
    if (!allowed) {
      notes.push('notify_suppressed')
      return { notify: false, notes }
    }
    if (input.recentNotificationWithin24h) {
      notes.push('notify_rate_limited')
      return { notify: false, notes }
    }
    return { notify: true, notes }
  }

  const topicById = new Map(context.topics.map((t) => [t.topic_id, t]))
  const sessionById = new Map(context.current_plan.map((s) => [s.id, s]))
  const missionTopics = new Set(context.topics.map((t) => t.topic_id))

  // --- Rule 5 — mission-topic boundary (whole-decision reject) ---
  for (const c of decision.changes) {
    const topic =
      'topic' in c && c.topic
        ? c.topic
        : 'session_id' in c && c.session_id
          ? sessionById.get(c.session_id)?.topic_id
          : undefined
    if ((('topic' in c && c.topic) || ('session_id' in c && c.session_id)) && !topic) {
      return reject(`change references unknown session ${('session_id' in c && c.session_id) || ''}`)
    }
    if (topic && !missionTopics.has(topic)) {
      return reject(`change references topic "${topic}" which is not part of the mission`)
    }
  }

  // --- Rule 3 — one strategy rung per tick ---
  for (const c of decision.changes) {
    if (c.op !== 'set_strategy') continue
    const current = topicById.get(c.topic)?.strategy_level ?? 'NORMAL'
    if (!strategyStepIsLegal(current, c.level)) {
      return reject(`strategy jump ${current} → ${c.level} exceeds one level`)
    }
  }

  // --- Rule 8 — producer ops (the agent doing admin work for the student) ---
  const revSheets = decision.changes.filter((c) => c.op === 'write_revision_sheet')
  if (revSheets.length > 2) {
    return reject('too many revision sheets in one tick (max 2)')
  }
  const drafts = decision.changes.filter((c) => c.op === 'draft_message')
  if (drafts.length > 0) {
    const near =
      context.plan_confidence.confidence === 'OFF_TRACK' ||
      context.days_remaining <= 3 ||
      context.deadline_crossings.some((d) => d.days_until <= 3)
    if (!near || drafts.length > 1) {
      return reject(
        'draft_message is only allowed once, when the plan is OFF_TRACK or a deadline is within 3 days',
      )
    }
  }

  // --- Rule 4 — escalation threshold ---
  if (ESCALATING_DECISIONS.has(decision.decision)) {
    const maxFlat = Math.max(
      0,
      ...context.topics.map((t) => t.consecutive_flat_sessions),
    )
    if (maxFlat < FLAT_SESSIONS_FOR_ESCALATION) {
      return reject(
        `premature ${decision.decision}: max consecutive_flat_sessions = ${maxFlat}, need ${FLAT_SESSIONS_FOR_ESCALATION}`,
      )
    }
  }

  // --- Rule 2 — date boundaries on any explicit date ---
  const { current_date, mission } = context
  for (const c of decision.changes) {
    const dates: string[] = []
    if (c.op === 'insert_session' && c.before) dates.push(c.before)
    if (c.op === 'move_session') dates.push(c.to_date)
    for (const d of dates) {
      if (daysBetween(current_date, d) < 0) {
        return reject(`change date ${d} is before today (${current_date})`)
      }
      if (daysBetween(d, mission.exam_date) < 0) {
        return reject(`change date ${d} is after the exam (${mission.exam_date})`)
      }
    }
  }

  // --- Rule 1 — weekly session cap, checked against the simulated plan ---
  if (!simulateWithinWeeklyCap(decision.changes, context)) {
    return reject(
      `change would exceed ${mission.sessions_per_week} sessions in a week`,
    )
  }

  return { approved: true, rejected_reason: null, changes: decision.changes, ...resolveNotify() }
}

/** Apply the change deltas to a per-week pending-session count and check the cap. */
function simulateWithinWeeklyCap(
  changes: AgentChange[],
  context: AgentContext,
): boolean {
  // `replan` regenerates deterministically within the cap — nothing to check.
  if (changes.some((c) => c.op === 'replan')) return true

  const from = context.current_date
  const cap = context.mission.sessions_per_week
  const perWeek = new Map<number, number>()
  const bump = (day: string, delta: number) => {
    if (daysBetween(from, day) < 0) return
    const w = weekIndexFrom(from, day)
    perWeek.set(w, (perWeek.get(w) ?? 0) + delta)
  }

  for (const s of context.current_plan) {
    if (s.status === 'pending') bump(s.scheduled_date, 1)
  }

  const sessionById = new Map(context.current_plan.map((s) => [s.id, s]))
  for (const c of changes) {
    if (c.op === 'insert_session') {
      bump(
        pickInsertDate(from, context.mission.exam_date, perWeek, cap, c.before),
        1,
      )
    } else if (c.op === 'drop_session') {
      const target = c.session_id
        ? sessionById.get(c.session_id)
        : context.current_plan.find(
            (s) =>
              s.status === 'pending' &&
              s.topic_id === c.topic &&
              (!c.kind || s.kind === c.kind),
          )
      if (target?.status === 'pending') bump(target.scheduled_date, -1)
    } else if (c.op === 'move_session') {
      const target = sessionById.get(c.session_id)
      if (target?.status === 'pending') {
        bump(target.scheduled_date, -1)
        bump(c.to_date, 1)
      }
    }
  }

  for (const count of perWeek.values()) if (count > cap) return false
  return true
}
