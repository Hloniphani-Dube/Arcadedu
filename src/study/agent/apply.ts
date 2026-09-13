// Applies an already-validated change set to Supabase. Server-side only: the
// caller passes an RLS-scoped client (the requesting user's JWT), so every write
// is still checked against mission ownership.

import type { SupabaseClient } from '@supabase/supabase-js'
import { SESSION_ITEM_COUNT, TARGET_MASTERY_DEFAULT } from '../config.ts'
import { daysBetween } from '../dates.ts'
import { generatePlan } from '../plan.ts'
import { difficultyForStrategy } from '../strategy.ts'
import type { AgentChange, AgentContext } from './contract.ts'
import type { CallAiFn } from './pipeline.ts'
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
  callAi?: CallAiFn,
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

      // --- producer ops: the agent does admin work FOR the student ---

      case 'prepare_session': {
        if (!callAi) break
        const s = context.current_plan.find((x) => x.id === c.session_id)
        if (!s || s.status !== 'pending') break
        const { data: dupe } = await db
          .from('mission_artifacts')
          .select('id')
          .eq('plan_session_id', s.id)
          .eq('kind', 'session_items')
          .maybeSingle()
        if (dupe) break
        const topicName =
          context.topics.find((t) => t.topic_id === s.topic_id)?.name ??
          s.topic_id
        const difficulty = difficultyForStrategy('medium', s.strategy_level)
        const items: unknown[] = []
        for (let i = 0; i < SESSION_ITEM_COUNT; i++) {
          try {
            const q = (await callAi('generate_enemy_question', {
              subject: context.mission.subject_name,
              topic: topicName,
              level: context.student_model.level,
              difficulty,
            })) as {
              guidance?: string
              question?: string
              expectedConcept?: string
            }
            if (q?.question) {
              items.push({
                guidance: q.guidance ?? '',
                question: q.question,
                expectedConcept: q.expectedConcept ?? '',
                difficulty,
              })
            }
          } catch {
            break
          }
        }
        await db.from('mission_artifacts').insert({
          mission_id: missionId,
          topic_id: s.topic_id,
          plan_session_id: s.id,
          kind: 'session_items',
          title: `${topicName}: session ready`,
          content: { items },
          status: items.length ? 'ready' : 'archived',
        })
        applied.push({ op: c.op, detail: `${items.length} items for ${topicName}` })
        break
      }

      case 'write_revision_sheet': {
        if (!callAi) break
        const topicName =
          context.topics.find((t) => t.topic_id === c.topic)?.name ?? c.topic
        const r = (await callAi('write_revision_sheet', {
          subject: context.mission.subject_name,
          topic: topicName,
          level: context.student_model.level,
        })) as { text?: string }
        if (r?.text) {
          await db.from('mission_artifacts').insert({
            mission_id: missionId,
            topic_id: c.topic,
            kind: 'revision_sheet',
            title: `${topicName}: revision sheet`,
            content: { text: r.text },
            status: 'ready',
          })
          applied.push({ op: c.op, detail: `revision sheet for ${topicName}` })
        }
        break
      }

      case 'draft_message': {
        if (!callAi) break
        const weak = context.plan_confidence.weak_topics
          .map((w) => w.topic_id)
          .slice(0, 3)
          .join(', ')
        const d = (await callAi('draft_message', {
          messageKind: c.kind,
          subject: context.mission.subject_name,
          details: `The study plan is ${context.plan_confidence.confidence} with ${context.days_remaining} days to the exam.${weak ? ` Topics still below target: ${weak}.` : ''}`,
          today: context.current_date,
        })) as { subject?: string; body?: string }
        if (d?.body) {
          await db.from('mission_artifacts').insert({
            mission_id: missionId,
            kind: 'message_draft',
            title:
              c.kind === 'extension_request'
                ? 'Draft: extension request'
                : 'Draft: tutor update',
            content: { subject: d.subject ?? '', body: d.body },
            status: 'draft',
          })
          applied.push({ op: c.op, detail: `drafted ${c.kind}` })
        }
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
