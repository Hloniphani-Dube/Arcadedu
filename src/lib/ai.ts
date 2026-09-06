import { supabase } from './supabase'
import type {
  AiAction,
  BattleAction,
  AiRequestContext,
  AiResponse,
  BossChallenge,
  EnemyQuestion,
  GradedAnswer,
} from './types'

// Where the closed-action AI endpoint lives. On Vercel this is the bundled
// serverless function at `/api/ai` (set VITE_AI_ENDPOINT=/api/ai). When it is
// not set we fall back to the Supabase Edge Function via supabase-js.
const AI_ENDPOINT = import.meta.env.VITE_AI_ENDPOINT as string | undefined

export class AiError extends Error {}

export async function callAi(
  action: AiAction,
  context: AiRequestContext,
): Promise<AiResponse> {
  const body = { action, context }

  try {
    // An explicit endpoint always wins (Vercel `/api/ai`, or a local serve URL).
    if (AI_ENDPOINT) {
      const res = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        throw new AiError(`AI function returned ${res.status}: ${await res.text()}`)
      }
      return (await res.json()) as AiResponse
    }

    if (supabase) {
      const { data, error } = await supabase.functions.invoke<AiResponse>('ai', {
        body,
      })
      if (error) throw new AiError(error.message)
      if (!data) throw new AiError('Empty response from AI function')
      return data
    }

    throw new AiError('No AI endpoint configured (set VITE_AI_ENDPOINT)')
  } catch (err) {
    if (err instanceof AiError) throw err
    throw new AiError(
      err instanceof Error ? err.message : 'Could not reach the AI function',
    )
  }
}

// Narrow helpers so callers get typed results per action.

export async function askAria(
  action: Exclude<AiAction, BattleAction>,
  context: AiRequestContext,
): Promise<string> {
  const r = await callAi(action, context)
  if (r.kind !== 'text') throw new AiError(`Expected text, got ${r.kind}`)
  return r.text
}

export async function generateEnemyQuestion(
  context: AiRequestContext,
): Promise<EnemyQuestion> {
  const r = await callAi('generate_enemy_question', context)
  if (r.kind !== 'enemy_question') throw new AiError(`Expected enemy_question, got ${r.kind}`)
  return r
}

export async function gradeBattleAnswer(
  context: AiRequestContext,
): Promise<GradedAnswer> {
  const r = await callAi('grade_battle_answer', context)
  if (r.kind !== 'graded') throw new AiError(`Expected graded, got ${r.kind}`)
  return r
}

export async function generateBossChallenge(
  context: AiRequestContext,
): Promise<BossChallenge> {
  const r = await callAi('generate_boss_challenge', context)
  if (r.kind !== 'boss_challenge') throw new AiError(`Expected boss_challenge, got ${r.kind}`)
  return r
}

export async function gradeBossAnswer(
  context: AiRequestContext,
): Promise<GradedAnswer> {
  const r = await callAi('grade_boss_answer', context)
  if (r.kind !== 'graded') throw new AiError(`Expected graded, got ${r.kind}`)
  return r
}
