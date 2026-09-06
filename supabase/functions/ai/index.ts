// Arcadedu AI edge function.
//
// This is the ONLY place the Gemini key lives. The browser sends a closed
// `action` plus structured `context`; this function decides what the model is
// allowed to do for that action and never exposes a raw prompt channel.
//
// Local dev:   supabase functions serve --env-file supabase/.env.local
// Deploy:      supabase functions deploy ai --no-verify-jwt
// Secret:      supabase secrets set GEMINI_API_KEY=...

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.6-flash'
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
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })

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
        maxOutputTokens: 700,
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
  const text: string | undefined =
    data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text)
      .join('') ?? undefined
  if (!text) throw new Error('Gemini returned no text')
  return text.trim()
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
"question" must be solvable in a few lines and contain no solution.
"expectedConcept" is one sentence naming the correct approach / answer the grader should look for.`,
    S.obj(
      { question: S.str, expectedConcept: S.str, difficulty: S.str },
      ['question', 'expectedConcept'],
    ),
  )
  const o = JSON.parse(text)
  return {
    kind: 'enemy_question',
    question: String(o.question ?? ''),
    expectedConcept: String(o.expectedConcept ?? ''),
    difficulty: c.difficulty ?? 'medium',
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
Return "question" (no solution) and "expectedConcept" (one sentence the grader uses).`,
    S.obj({ question: S.str, expectedConcept: S.str }, ['question', 'expectedConcept']),
  )
  const o = JSON.parse(text)
  return {
    kind: 'boss_challenge',
    phase,
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
  const o = JSON.parse(text)
  return {
    kind: 'graded',
    correct: Boolean(o.correct),
    quality: clamp01(o.quality),
    feedback: String(o.feedback ?? ''),
  }
}

// --- entrypoint ------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405)
  if (!GEMINI_API_KEY) {
    return jsonResponse({ error: 'GEMINI_API_KEY is not set on the function' }, 500)
  }

  let body: { action?: string; context?: Ctx }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const action = body.action ?? ''
  const context = (body.context ?? {}) as Ctx
  if (!context.subject || !context.topic) {
    return jsonResponse({ error: 'context.subject and context.topic are required' }, 400)
  }

  try {
    if (isLearnAction(action)) {
      return jsonResponse(await handleLearn(action, context))
    }
    switch (action) {
      case 'generate_enemy_question':
        return jsonResponse(await handleEnemyQuestion(context))
      case 'generate_boss_challenge':
        return jsonResponse(await handleBossChallenge(context))
      case 'grade_battle_answer':
        return jsonResponse(await handleGrade(context, false))
      case 'grade_boss_answer':
        return jsonResponse(await handleGrade(context, true))
      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400)
    }
  } catch (err) {
    console.error(err)
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'AI call failed' },
      502,
    )
  }
})
