// Arcadedu Study Agent · single-mission tick (SESSION_COMPLETED / MANUAL).
//
// Authenticates the caller with their Supabase JWT so every read and write is
// RLS-scoped to them, then runs the shared pipeline. The deterministic gate,
// idempotency and notification limits all live in ../../src/study/agent/pipeline.

import { createClient } from '@supabase/supabase-js'
import { httpCallAi, httpDecide, runTick } from '../../src/study/agent/pipeline'

export const config = { maxDuration: 60 }

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? ''

const TRIGGERS = new Set(['SESSION_COMPLETED', 'MANUAL'])

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface VercelReq {
  method?: string
  body?: unknown
  headers: Record<string, string | string[] | undefined>
}
interface VercelRes {
  status: (code: number) => VercelRes
  json: (body: unknown) => void
  setHeader: (name: string, value: string) => void
  end: (body?: string) => void
}

function baseUrl(req: VercelReq): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  const host = String(req.headers['host'] ?? 'localhost:3000')
  const proto = String(req.headers['x-forwarded-proto'] ?? 'http')
  return `${proto}://${host}`
}

export default async function handler(req: VercelReq, res: VercelRes) {
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v)
  if (req.method === 'OPTIONS') return res.status(200).end('ok')
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Supabase env vars are not configured' })
  }

  const authHeader = String(req.headers['authorization'] ?? '')
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return res.status(401).json({ error: 'Missing bearer token' })
  }

  let body: { mission_id?: string; trigger?: string; trigger_id?: string }
  try {
    const raw = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    body = (raw ?? {}) as typeof body
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' })
  }

  const missionId = body.mission_id
  const trigger = body.trigger ?? ''
  if (!missionId) return res.status(400).json({ error: 'mission_id is required' })
  if (!TRIGGERS.has(trigger)) {
    return res.status(400).json({ error: `unsupported trigger: ${trigger}` })
  }

  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const triggerId =
    body.trigger_id ??
    (trigger === 'MANUAL'
      ? `MANUAL:${Math.floor(now.getTime() / 180000)}` // 3-minute coalescing
      : `SESSION_COMPLETED:${today}`)

  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData, error: userErr } = await db.auth.getUser()
  if (userErr || !userData?.user) {
    return res.status(401).json({ error: 'Invalid session' })
  }

  const outcome = await runTick({
    db,
    missionId,
    userId: userData.user.id,
    trigger: trigger as 'SESSION_COMPLETED' | 'MANUAL',
    triggerId,
    decide: httpDecide(baseUrl(req)),
    callAi: httpCallAi(baseUrl(req)),
    now,
  })

  return res.status(outcome.http).json({
    success: outcome.status === 'ok' || outcome.status === 'idempotent',
    idempotent: outcome.status === 'idempotent' || undefined,
    decision: outcome.decision,
    applied: outcome.applied,
    rejected_reason: outcome.rejected_reason,
    confidence: outcome.confidence,
    notified: outcome.notified,
    changes: outcome.changes,
    notes: outcome.notes,
    retryable: outcome.status === 'agent_unavailable' || undefined,
    error: outcome.error,
  })
}
