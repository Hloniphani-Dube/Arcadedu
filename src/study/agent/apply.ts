// Applies an already-validated change set to Supabase. Server-side only: the
// caller passes an RLS-scoped client (the requesting user's JWT), so every write
// is still checked against mission ownership.

import type { SupabaseClient } from '@supabase/supabase-js'
import { SESSION_ITEM_COUNT, TARGET_MASTERY_DEFAULT } from '../config.ts'
import { daysBetween } from '../dates.ts'
import { generatePlan } from '../plan.ts'
import type { AgentChange, AgentContext } from './contract.ts'
import { pickInsertDate, weekIndexFrom } from './schedule.ts'

export interface AppliedChange {
  op: string
  detail: string
}

export async function applyChanges(
  db: SupabaseClient,
  missionId: string,
  changes: AgentChange[],
  context: AgentContext,
): Promise<AppliedChange[]> {
  const applied: AppliedChange[] = []
  const from = context.current_date
  const cap = context.mission.sessions_per_week

  // Live per-week count so successive inserts in one tick don't stack up.
  const perWeek = new Map<number, number>()
  for (const s of context.current_plan) {
    if (s.status === 'pending' && daysBetween(from, s.scheduled_date) >= 0) {
      perWeek.set(
        weekIndexFrom(from, s.scheduled_date),
        (perWeek.get(weekIndexFrom(from, s.scheduled_date)) ?? 0) + 1,
      )
    }
  }

  for (const c of changes) {
    switch (c.op) {
      case 'replan': {
        await replan(db, missionId, context)
        applied.push({ op: c.op, detail: 'regenerated pending sessions' })
        break
      }
      case 'set_strategy': {
        await db
          .from('topic_mastery')
          .update({ strategy_level: c.level })
          .eq('mission_id', missionId)
          .eq('topic_id', c.topic)
        await db
          .from('plan_sessions')
          .update({ strategy_level: c.level })
          .eq('mission_id', missionId)
          .eq('topic_id', c.topic)
          .eq('status', 'pending')
        applied.push({ op: c.op, detail: `${c.topic} → ${c.level}` })
        break
      }
      case 'set_priority': {
        await db
          .from('mission_topics')
          .update({ priority: c.priority })
          .eq('mission_id', missionId)
          .eq('topic_id', c.topic)
        applied.push({ op: c.op, detail: `${c.topic} priority ${c.priority}` })
        break
      }
      case 'insert_session': {
        const date = pickInsertDate(
          from,
          context.mission.exam_date,
          perWeek,
          cap,
          c.before,
        )
        perWeek.set(
          weekIndexFrom(from, date),
          (perWeek.get(weekIndexFrom(from, date)) ?? 0) + 1,
        )
        const strategy =
          context.topics.find((t) => t.topic_id === c.topic)?.strategy_level ??
          'NORMAL'
        await db.from('plan_sessions').insert({
          mission_id: missionId,
          topic_id: c.topic,
          scheduled_date: date,
          kind: c.kind,
          strategy_level: strategy,
          item_count: SESSION_ITEM_COUNT,
          status: 'pending',
        })
        applied.push({ op: c.op, detail: `${c.kind} on ${c.topic} at ${date}` })
        break
      }
      case 'drop_session': {
        let id = c.session_id
        if (!id) {
          // Drop the furthest-out pending session for that topic — cheapest to lose.
          const candidates = context.current_plan
            .filter(
              (s) =>
                s.status === 'pending' &&
                s.topic_id === c.topic &&
                (!c.kind || s.kind === c.kind),
            )
            .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))
          id = candidates[0]?.id
        }
        if (id) {
          await db
            .from('plan_sessions')
            .delete()
            .eq('id', id)
            .eq('status', 'pending')
          applied.push({ op: c.op, detail: `dropped ${id}` })
        }
        break
      }
      case 'move_session': {
        await db
          .from('plan_sessions')
          .update({ scheduled_date: c.to_date })
          .eq('id', c.session_id)
          .eq('mission_id', missionId)
          .eq('status', 'pending')
        applied.push({ op: c.op, detail: `${c.session_id} → ${c.to_date}` })
        break
      }
    }
  }

  return applied
}

async function replan(
  db: SupabaseClient,
  missionId: string,
  context: AgentContext,
): Promise<void> {
  const drafts = generatePlan({
    exam_date: context.mission.exam_date,
    sessions_per_week: context.mission.sessions_per_week,
    current_date: new Date(context.current_date),
    topics: context.topics.map((t) => ({
      topic_id: t.topic_id,
      target: t.target_mastery ?? TARGET_MASTERY_DEFAULT,
      mastery: t.mastery,
      strategy_level: t.strategy_level,
      priority: t.priority,
    })),
  })

  await db
    .from('plan_sessions')
    .delete()
    .eq('mission_id', missionId)
    .eq('status', 'pending')

  if (drafts.length) {
    await db.from('plan_sessions').insert(
      drafts.map((d) => ({
        mission_id: missionId,
        topic_id: d.topic_id,
        scheduled_date: d.scheduled_date,
        kind: d.kind,
        strategy_level: d.strategy_level,
        item_count: d.item_count,
        status: 'pending',
      })),
    )
  }
}
