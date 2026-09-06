// Frontend entry to the autonomous loop. Best-effort: a failed tick never breaks
// the flow that triggered it (the session is already saved). The deterministic
// gate on the server decides what actually happens.

import { supabase } from '../lib/supabase'
import type { AgentTrigger } from './types'

const AGENT_ENDPOINT =
  (import.meta.env.VITE_AGENT_ENDPOINT as string | undefined) ?? '/api/agent/tick'

export interface AgentTickResult {
  success: boolean
  decision: string | null
  applied: boolean
  rejected_reason?: string | null
  confidence: string | null
  notified: boolean
  idempotent?: boolean
  error?: string
}

export async function runAgentTick(
  missionId: string,
  trigger: AgentTrigger,
  triggerId?: string,
): Promise<AgentTickResult> {
  const fail = (error: string): AgentTickResult => ({
    success: false,
    decision: null,
    applied: false,
    confidence: null,
    notified: false,
    error,
  })

  if (!supabase) return fail('not signed in')

  let token: string | undefined
  try {
    const { data } = await supabase.auth.getSession()
    token = data.session?.access_token
  } catch {
    return fail('no session')
  }
  if (!token) return fail('no session')

  try {
    const res = await fetch(AGENT_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ mission_id: missionId, trigger, trigger_id: triggerId }),
    })
    const json = (await res.json().catch(() => ({}))) as Partial<AgentTickResult>
    if (!res.ok) return fail(json.error ?? `agent tick ${res.status}`)
    return {
      success: json.success ?? true,
      decision: json.decision ?? null,
      applied: json.applied ?? false,
      rejected_reason: json.rejected_reason ?? null,
      confidence: json.confidence ?? null,
      notified: json.notified ?? false,
      idempotent: json.idempotent,
    }
  } catch (err) {
    return fail(err instanceof Error ? err.message : 'agent unreachable')
  }
}
