// Shared contracts between the React app, the game engine, and the AI edge function.
// The set of `LearnAction`s is deliberately closed: the student never free-prompts
// the model, they pick one of these and the server decides what the AI is allowed to do.

export type LearnAction =
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

export type BattleAction =
  | 'generate_enemy_question'
  | 'grade_battle_answer'
  | 'generate_boss_challenge'
  | 'grade_boss_answer'

export type AiAction = LearnAction | BattleAction

export interface AiRequestContext {
  subject: string
  topic: string
  level: number
  /** The problem the student is currently working on (Learn mode). */
  problem?: string
  /** The student's own work / attempt. */
  studentAnswer?: string
  /** Battle: the question the enemy asked. */
  question?: string
  /** Battle: expected concept, passed back for grading. */
  expectedConcept?: string
  /** Difficulty tier for enemy generation. */
  difficulty?: EnemyTier
  /** Boss: which phase of the multi-part challenge. */
  bossPhase?: 'solve' | 'twist' | 'explain'
}

export interface AiRequest {
  action: AiAction
  context: AiRequestContext
}

/** Free-text actions return prose rendered as ARIA speech. */
export interface AiTextResponse {
  kind: 'text'
  text: string
}

export interface EnemyQuestion {
  kind: 'enemy_question'
  question: string
  expectedConcept: string
  difficulty: EnemyTier
}

export interface GradedAnswer {
  kind: 'graded'
  correct: boolean
  /** 0..1 — how complete/rigorous the answer was, drives damage & xp. */
  quality: number
  feedback: string
}

export interface BossChallenge {
  kind: 'boss_challenge'
  phase: 'solve' | 'twist' | 'explain'
  question: string
  expectedConcept: string
}

export type AiResponse =
  | AiTextResponse
  | EnemyQuestion
  | GradedAnswer
  | BossChallenge

export type EnemyTier = 'trivial' | 'easy' | 'medium' | 'hard' | 'boss'

export interface EnemyDef {
  id: string
  name: string
  glyph: string
  tier: EnemyTier
  maxHp: number
  /** Flavor line shown when the enemy appears. */
  taunt: string
}

export interface WorldDef {
  id: string
  name: string
  glyph: string
  subject: string
  topic: string
  blurb: string
  ladder: EnemyDef[]
}
