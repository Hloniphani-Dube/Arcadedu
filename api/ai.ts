// Arcadedu AI serverless function (Vercel).
//
// This is the ONLY place the Gemini key lives. The browser sends a closed
// `action` plus structured `context`; this function decides what the model is
// allowed to do for that action and never exposes a raw prompt channel.
//
// Runs on the Vercel Node.js runtime. Gemini 3.x "thinking" calls can take
// 20-40s, so we run as a Serverless (not Edge) function and raise maxDuration —
// Edge would cap us at ~25s and 504 (FUNCTION_INVOCATION_TIMEOUT).
//
// Env vars (Vercel Project Settings → Environment Variables):
//   GEMINI_API_KEY   required — key from https://aistudio.google.com/apikey
//   GEMINI_MODEL     optional — defaults to gemini-3.6-flash
//
// The equivalent Supabase Edge Function in supabase/functions/ai/ is now legacy;
// the deployed app calls this one via VITE_AI_ENDPOINT=/api/ai.

export const config = { maxDuration: 60 }

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? ''
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.6-flash'
const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type LearnAction =
  | 'explain'
  | 'summarize'
  | 'hint'
  | 'understand'
  | 'steps'
  | 'check_answer'
  | 'explain_mistake'
  | 'example'
  | 'simplify'
  | 'similar_problem'

interface Ctx {
  subject: string
  topic: string
  level: number
  problem?: string
  studentAnswer?: string
  question?: string
  expectedConcept?: string
  difficulty?: string
  bossPhase?: 'solve' | 'twist' | 'explain'
  chapter?: string
}


// --- prompt registry: the guardrails --------------------------------------

const PREAMBLE = (c: Ctx) =>
  `You are ARIA, a patient learning companion inside a study game.
The student is roughly level ${c.level}, studying ${c.subject} — ${c.topic}.
Write plain text (no markdown headings), 2–5 sentences, warm and encouraging.`

const LEARN_RULES: Record<LearnAction, string> = {
  explain:
    'Explain the concept this problem tests so the student can approach it themselves. Do NOT solve their specific problem.',
  summarize:
    'Give a short summary of the single key idea at play. Do NOT solve the problem.',
  hint:
    'Give EXACTLY ONE small nudge toward the next step — never a second hint, never the method in full, never the answer.',
  understand:
    'Help the student see what the problem is really asking. End with one guiding question back to them. Do NOT solve it.',
  steps:
    'List, in order, the general steps for this KIND of problem. Keep it abstract or use a DIFFERENT example — do not run the steps on their actual numbers.',
  check_answer:
    "Compare the student's attempt to the correct result. Say clearly whether it is right or wrong and briefly why. Here you MAY state the correct answer.",
  explain_mistake:
    "Identify the specific conceptual error in the student's work and explain why it is wrong. Do NOT give the corrected final answer — let them fix it.",
  example:
    'Give ONE fully worked example of a similar but different problem, start to finish.',
  simplify:
    'Restate the problem and the idea it tests in the simplest possible language, as if to a younger student.',
  similar_problem:
    'Produce ONE new practice problem of similar type and difficulty. Problem statement only — no solution, no hints.',
}

const isLearnAction = (a: string): a is LearnAction => a in LEARN_RULES

// --- gemini plumbing -----------------------------------------------------

async function gemini(
  system: string,
  user: string,
  schema?: Record<string, unknown>,
): Promise<string> {
  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature: schema ? 0.7 : 0.6,
        // Gemini 3.x spends "thinking" tokens from this same budget, so keep it
        // generous or structured replies get truncated mid-JSON.
        maxOutputTokens: 4096,
        ...(schema
          ? { responseMimeType: 'application/json', responseSchema: schema }
          : {}),
      },
    }),
  })

  if (!res.ok) {
    throw new Error(`Gemini ${res.status}: ${await res.text()}`)
  }
  const data = await res.json()
  const cand = data?.candidates?.[0]
  const text: string | undefined =
    cand?.content?.parts?.map((p: { text?: string }) => p.text).join('') ??
    undefined
  if (!text) {
    throw new Error(
      `Gemini returned no text (finishReason: ${cand?.finishReason ?? 'unknown'})`,
    )
  }
  if (cand?.finishReason === 'MAX_TOKENS') {
    throw new Error('Gemini response hit the token limit before completing')
  }
  return text.trim()
}

// The model usually honours responseMimeType, but can still wrap JSON in ```json
// fences or add stray prose. Parse leniently.
function parseModelJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text)
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
    const body = (fenced ? fenced[1] : text).trim()
    const start = body.indexOf('{')
    const end = body.lastIndexOf('}')
    if (start !== -1 && end > start) {
      return JSON.parse(body.slice(start, end + 1))
    }
    throw new Error(`Model did not return valid JSON: ${text.slice(0, 200)}`)
  }
}

const clamp01 = (n: unknown) =>
  typeof n === 'number' && isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5

// Gemini `responseSchema` expects the OpenAPI subset with UPPERCASE type enums.
const S = {
  str: { type: 'STRING' },
  num: { type: 'NUMBER' },
  bool: { type: 'BOOLEAN' },
  obj: (
    properties: Record<string, unknown>,
    required: string[],
  ) => ({ type: 'OBJECT', properties, required }),
}

// --- action handlers ---------------------------------------------------------

async function handleLearn(action: LearnAction, c: Ctx) {
  const user = [
    c.problem ? `Problem the student is working on:\n${c.problem}` : '',
    c.studentAnswer ? `The student's own work / attempt:\n${c.studentAnswer}` : '',
    `\nAction: ${action}. ${LEARN_RULES[action]}`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const text = await gemini(PREAMBLE(c), user)
  return { kind: 'text', text }
}

async function handleEnemyQuestion(c: Ctx) {
  const text = await gemini(
    `${PREAMBLE(c)}\nYou are generating a battle challenge for the game.`,
    `Create ONE ${c.difficulty ?? 'medium'} question that tests UNDERSTANDING (not recall) of ${c.topic}.
Return JSON with these fields kept strictly separate:
- "narrative": ONE short sentence of game flavour introducing the ${c.difficulty ?? 'medium'} foe / scene. No numbers, no part of the problem here.
- "question": the actual problem, self-contained, solvable in a few lines, NO solution and NO story wording.
- "expectedConcept": one sentence naming the correct approach / answer the grader should look for.`,
    S.obj(
      { narrative: S.str, question: S.str, expectedConcept: S.str, difficulty: S.str },
      ['narrative', 'question', 'expectedConcept'],
    ),
  )
  const o = parseModelJson(text)
  return {
    kind: 'enemy_question',
    narrative: String(o.narrative ?? ''),
    question: String(o.question ?? ''),
    expectedConcept: String(o.expectedConcept ?? ''),
    difficulty: c.difficulty ?? 'medium',
  }
}

async function handleStoryQuestion(c: Ctx) {
  const region = c.chapter ?? c.topic
  const text = await gemini(
    `You are the Narrator of "Story I: The Long Way Round", a travelling tale in a learning game.
The player is passing through a region called "${region}". Keep the world whimsical and consistent.
Write plain text, no markdown headings.`,
    `This is a ${c.difficulty ?? 'easy'} brain-teaser stop on the journey. It is GENERAL KNOWLEDGE or
lateral thinking — NOT school subject material. Good kinds: counting, geography, calendars/time,
wordplay, simple logic, "how many…", pattern / "what comes next", well-known facts and superlatives.
It must be solvable by a thoughtful person with no special study.

Return JSON with these fields kept strictly separate:
- "narrative": 1–2 sentences of story flavour that fit the region "${region}". No question in here.
- "question": ONE self-contained puzzle. Put the WHOLE puzzle here and nothing else. No solution.
- "expectedConcept": one sentence stating the correct answer / key insight the grader checks for.`,
    S.obj(
      { narrative: S.str, question: S.str, expectedConcept: S.str },
      ['narrative', 'question', 'expectedConcept'],
    ),
  )
  const o = parseModelJson(text)
  return {
    kind: 'story_question',
    narrative: String(o.narrative ?? ''),
    question: String(o.question ?? ''),
    expectedConcept: String(o.expectedConcept ?? ''),
  }
}

const BOSS_PHASE_BRIEF: Record<NonNullable<Ctx['bossPhase']>, string> = {
  solve: 'A multi-step problem on the topic that requires genuine method, not a one-liner.',
  twist:
    'Assume the student already solved a base problem. Now change one condition (e.g. "what if x is negative?", "what if the coefficient were 0?") and ask them to work through the consequence.',
  explain:
    'Ask the student to explain WHY a particular method or result works — testing conceptual understanding, not computation.',
}

async function handleBossChallenge(c: Ctx) {
  const phase = c.bossPhase ?? 'solve'
  const text = await gemini(
    `${PREAMBLE(c)}\nYou are the boss of the ${c.subject} world, testing mastery.`,
    `Boss trial phase: ${phase}. ${BOSS_PHASE_BRIEF[phase]}
Return JSON with these fields kept strictly separate:
- "narrative": ONE short sentence of boss-fight flavour for this trial. No part of the problem here.
- "question": the actual trial problem, self-contained, NO solution and NO story wording.
- "expectedConcept": one sentence the grader uses.`,
    S.obj(
      { narrative: S.str, question: S.str, expectedConcept: S.str },
      ['narrative', 'question', 'expectedConcept'],
    ),
  )
  const o = parseModelJson(text)
  return {
    kind: 'boss_challenge',
    phase,
    narrative: String(o.narrative ?? ''),
    question: String(o.question ?? ''),
    expectedConcept: String(o.expectedConcept ?? ''),
  }
}

async function handleGrade(c: Ctx, boss: boolean) {
  const strictness = boss
    ? 'Grade strictly — this is a mastery trial. Weak or hand-wavy reasoning is not "correct".'
    : 'Grade fairly for a practice battle.'
  const phaseNote =
    boss && c.bossPhase === 'explain'
      ? 'This phase is about explanation quality: reward a clear, correct "why", penalise restating the steps without reasoning.'
      : ''

  const text = await gemini(
    `${PREAMBLE(c)}\nYou are grading the student's answer for the game engine. ${strictness} ${phaseNote}`,
    `Question:\n${c.question ?? ''}

What a correct answer needs (expectedConcept):
${c.expectedConcept ?? '(not provided — judge on merits)'}

The student's answer:
${c.studentAnswer ?? '(blank)'}

Return JSON:
- correct: boolean — is the answer essentially right?
- quality: number 0..1 — completeness and rigour of the reasoning shown
- feedback: 1–3 sentences. If wrong, point at what to reconsider WITHOUT giving the full solution. If right, confirm briefly why.`,
    S.obj(
      { correct: S.bool, quality: S.num, feedback: S.str },
      ['correct', 'quality', 'feedback'],
    ),
  )
  const o = parseModelJson(text)
  return {
    kind: 'graded',
    correct: Boolean(o.correct),
    quality: clamp01(o.quality),
    feedback: String(o.feedback ?? ''),
  }
}

// --- entrypoint ------------------------------------------------------------

// Minimal structural types for the Vercel Node request/response (avoids a
// dependency on @vercel/node; the function bundle isn't type-checked here).
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

export default async function handler(req: VercelReq, res: VercelRes) {
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v)

  if (req.method === 'OPTIONS') return res.status(200).end('ok')
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not set on the function' })
  }

  let body: { action?: string; context?: Ctx } | null
  try {
    const raw = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    body = raw && typeof raw === 'object' ? (raw as { action?: string; context?: Ctx }) : null
  } catch {
    body = null
  }
  if (!body) {
    return res.status(400).json({ error: 'Invalid JSON body' })
  }

  const action = body.action ?? ''
  const context = (body.context ?? {}) as Ctx
  if (!context.subject || !context.topic) {
    return res.status(400).json({ error: 'context.subject and context.topic are required' })
  }

  try {
    if (isLearnAction(action)) {
      return res.status(200).json(await handleLearn(action, context))
    }
    switch (action) {
      case 'generate_enemy_question':
        return res.status(200).json(await handleEnemyQuestion(context))
      case 'generate_story_question':
        return res.status(200).json(await handleStoryQuestion(context))
      case 'generate_boss_challenge':
        return res.status(200).json(await handleBossChallenge(context))
      case 'grade_battle_answer':
        return res.status(200).json(await handleGrade(context, false))
      case 'grade_boss_answer':
        return res.status(200).json(await handleGrade(context, true))
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` })
    }
  } catch (err) {
    console.error(err)
    return res
      .status(502)
      .json({ error: err instanceof Error ? err.message : 'AI call failed' })
  }
}
