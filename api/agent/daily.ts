// Arcadedu Study Agent · DAILY tick (spec §25, §26).
//
// Invoked once a day by Vercel Cron (see vercel.json). Walks every active
// mission and runs the shared pipeline with a service-role client. The DAILY
// context surfaces missed sessions, plan confidence and exam-proximity
// crossings (14 / 7 / 3 / 1 days) for the agent to react to.
//
// In the target AWS topology this is an EventBridge Scheduler rule hitting the
// same path; nothing else changes.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { httpDecide, runTick } from '../../src/study/agent/pipeline'
import { routineOccurrenceDates } from '../../src/study/calendar'

export const config = { maxDuration: 300 }

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const CRON_SECRET = process.env.CRON_SECRET ?? ''

interface VercelReq {
  method?: string
  headers: Record<string, string | string[] | undefined>
}
interface VercelRes {
  status: (code: number) => VercelRes
  json: (body: unknown) => void
}

function baseUrl(req: VercelReq): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  const host = String(req.headers['host'] ?? 'localhost:3000')
  const proto = String(req.headers['x-forwarded-proto'] ?? 'http')
  return `${proto}://${host}`
}

export default async function handler(req: VercelReq, res: VercelRes) {
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
  const auth = String(req.headers['authorization'] ?? '')
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not configured' })
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const now = new Date()
  const today = now.toISOString().slice(0, 10)

  await materialiseRoutines(db, today)

  const { data: missions, error } = await db
    .from('study_missions')
    .select('id, user_id, exam_date')
    .eq('status', 'active')
  if (error) return res.status(500).json({ error: error.message })
  const decide = httpDecide(baseUrl(req))
  const results: Record<string, unknown>[] = []

  for (const m of missions ?? []) {
    try {
      const outcome = await runTick({
        db,
        missionId: m.id as string,
        userId: m.user_id as string,
        trigger: 'DAILY',
        triggerId: `DAILY:${today}`,
        decide,
        now,
      })
      results.push({
        mission_id: m.id,
        status: outcome.status,
        decision: outcome.decision,
        applied: outcome.applied,
        notified: outcome.notified,
      })
    } catch (err) {
      results.push({
        mission_id: m.id,
        status: 'error',
        error: err instanceof Error ? err.message : 'tick threw',
      })
    }
  }

  return res.status(200).json({ processed: results.length, date: today, results })
}

/** Fill routine_occurrences for the horizon ahead and flag overdue ones missed. */
async function materialiseRoutines(
  db: SupabaseClient,
  today: string,
): Promise<void> {
  const { data: routines } = await db
    .from('routines')
    .select('id, user_id, weekday, cadence, anchor_date')
    .eq('active', true)

  const rows: { routine_id: string; user_id: string; due_date: string }[] = []
  for (const r of (routines ?? []) as {
    id: string
    user_id: string
    weekday: number
    cadence: 'weekly' | 'biweekly'
    anchor_date: string
  }[]) {
    for (const due of routineOccurrenceDates(r, today, 21)) {
      rows.push({ routine_id: r.id, user_id: r.user_id, due_date: due })
    }
  }
  if (rows.length) {
    await db
      .from('routine_occurrences')
      .upsert(rows, { onConflict: 'routine_id,due_date', ignoreDuplicates: true })
  }
  await db
    .from('routine_occurrences')
    .update({ status: 'missed' })
    .eq('status', 'pending')
    .lt('due_date', today)
}
