import { supabase } from './supabase'
import type {
  AiAction,
  BattleAction,
  AiRequestContext,
  AiResponse,
  BossChallenge,
  DraftMessageResult,
  EnemyQuestion,
  GradedAnswer,
  StoryQuestion,
  SyllabusMap,
  WeekMap,
} from './types'

// Where the closed-action AI endpoint lives. On Vercel this is the bundled
// serverless function at `/api/ai` (set VITE_AI_ENDPOINT=/api/ai). When it is
// not set we fall back to the Supabase Edge Function via supabase-js.
const AI_ENDPOINT = import.meta.env.VITE_AI_ENDPOINT as string | undefined

export class AiError extends Error {}

// The AI function returns 503 when Gemini itself is overloaded (and 429/502/504
// for other transient hiccups). These are worth another try after a short wait.
const RETRYABLE_STATUS = new Set([429, 502, 503, 504])
const MAX_RETRIES = 2

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function postWithRetry(url: string, body: unknown): Promise<Response> {
  let res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  for (let attempt = 1; attempt <= MAX_RETRIES && RETRYABLE_STATUS.has(res.status); attempt++) {
    await sleep(1500 * attempt) // 1.5s, then 3s
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }
  return res
}

export async function callAi(
  action: AiAction,
  context: AiRequestContext,
): Promise<AiResponse> {
  const body = { action, context }

  try {
    // An explicit endpoint always wins (Vercel `/api/ai`, or a local serve URL).
    if (AI_ENDPOINT) {
      const res = await postWithRetry(AI_ENDPOINT, body)
      if (!res.ok) {
        if (RETRYABLE_STATUS.has(res.status)) {
          throw new AiError('The AI is busy right now — give it a moment and try again.')
        }
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

export async function generateStoryQuestion(
  context: AiRequestContext,
): Promise<StoryQuestion> {
  const r = await callAi('generate_story_question', context)
  if (r.kind !== 'story_question') throw new AiError(`Expected story_question, got ${r.kind}`)
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

// --- agent producer actions -----------------------------------------------

const BLANK = { subject: '', topic: '', level: 1 }

export async function mapSyllabus(input: {
  syllabusText: string
  subjectCatalog: AiRequestContext['subjectCatalog']
  today: string
}): Promise<SyllabusMap> {
  const r = await callAi('map_syllabus', { ...BLANK, ...input })
  if (r.kind !== 'syllabus_map') throw new AiError(`Expected syllabus_map, got ${r.kind}`)
  return r
}

export async function mapWeek(input: {
  weekText: string
  today: string
}): Promise<WeekMap> {
  const r = await callAi('map_week', { ...BLANK, ...input })
  if (r.kind !== 'week_map') throw new AiError(`Expected week_map, got ${r.kind}`)
  return r
}

export async function writeRevisionSheet(
  subject: string,
  topic: string,
  level: number,
): Promise<string> {
  const r = await callAi('write_revision_sheet', { subject, topic, level })
  if (r.kind !== 'text') throw new AiError(`Expected text, got ${r.kind}`)
  return r.text
}

export async function writeProgressReport(input: {
  subject: string
  reportFacts: string[]
  daysRemaining: number
  confidence: string
}): Promise<string> {
  const r = await callAi('write_progress_report', { ...BLANK, ...input })
  if (r.kind !== 'text') throw new AiError(`Expected text, got ${r.kind}`)
  return r.text
}

export async function draftMessage(input: {
  messageKind: 'extension_request' | 'tutor_update'
  subject: string
  details: string
  studentName?: string
  today: string
}): Promise<DraftMessageResult> {
  const r = await callAi('draft_message', { ...BLANK, ...input })
  if (r.kind !== 'draft_message') throw new AiError(`Expected draft_message, got ${r.kind}`)
  return r
}
