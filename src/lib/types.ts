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
  | 'generate_story_question'

/** The Study Agent's producer actions — admin work around learning, never the
 *  learning itself: extract, assemble, phrase. */
export type AgentProducerAction =
  | 'map_syllabus'
  | 'map_week'
  | 'write_revision_sheet'
  | 'write_progress_report'
  | 'draft_message'

export type AiAction = LearnAction | BattleAction | AgentProducerAction

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
  /** Story Mode: the chapter's title/theme, used to flavour the brain-teaser. */
  chapter?: string

  // --- agent producer actions ---
  syllabusText?: string
  subjectCatalog?: {
    id: string
    name: string
    topics: { id: string; name: string }[]
  }[]
  /** map_week: free text describing what's coming up this week. */
  weekText?: string
  today?: string
  reportFacts?: string[]
  daysRemaining?: number
  confidence?: string
  messageKind?: 'extension_request' | 'tutor_update'
  details?: string
  studentName?: string
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
  /** Story flavour that sets the scene — kept apart from the problem itself. */
  narrative: string
  question: string
  expectedConcept: string
  difficulty: EnemyTier
}

export interface StoryQuestion {
  kind: 'story_question'
  /** Chapter flavour for this stop on the journey. */
  narrative: string
  question: string
  expectedConcept: string
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
  /** Story flavour for the trial — kept apart from the problem itself. */
  narrative: string
  question: string
  expectedConcept: string
}

export interface SyllabusMap {
  kind: 'syllabus_map'
  subject_id: string
  title: string
  topic_ids: string[]
  exam_date: string
  sessions_per_week: number
  minutes_per_session: number
  target_mastery: number
  events: { title: string; kind: string; date: string }[]
  unmapped: string[]
}

export interface DraftMessageResult {
  kind: 'draft_message'
  subject: string
  body: string
}

export interface WeekMap {
  kind: 'week_map'
  events: { title: string; kind: string; date: string }[]
}

export type AiResponse =
  | AiTextResponse
  | EnemyQuestion
  | StoryQuestion
  | GradedAnswer
  | BossChallenge
  | SyllabusMap
  | DraftMessageResult
  | WeekMap

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
