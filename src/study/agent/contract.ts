// The agent decision contract.
//
// The Strands agent returns exactly this JSON — nothing freer. Every decision
// label and every change operation is a closed enum; anything else is rejected
// before it can touch the database.

import type {
  AgentDecision,
  AgentTrigger,
  PlanConfidence,
  PlanSessionKind,
  StrategyLevel,
} from '../types.ts'

export const AGENT_DECISIONS: AgentDecision[] = [
  'KEEP',
  'REPRIORITIZE',
  'REDISTRIBUTE',
  'ADVANCE_DIFFICULTY',
  'ESCALATE_STRATEGY',
  'DE_ESCALATE_STRATEGY',
  'INSERT_REMEDIATION',
  'REPLAN',
  'FLAG_FOR_HUMAN',
]

export const CHANGE_OPS = [
  'set_strategy',
  'set_priority',
  'insert_session',
  'drop_session',
  'move_session',
  'replan',
] as const
export type ChangeOpName = (typeof CHANGE_OPS)[number]

export interface SetStrategyChange {
  op: 'set_strategy'
  topic: string
  level: StrategyLevel
}
export interface SetPriorityChange {
  op: 'set_priority'
  topic: string
  priority: number
}
export interface InsertSessionChange {
  op: 'insert_session'
  topic: string
  kind: PlanSessionKind
  /** schedule on/before this YYYY-MM-DD */
  before?: string
}
export interface DropSessionChange {
  op: 'drop_session'
  /** identify the pending session by id, or by topic (+optional kind) */
  session_id?: string
  topic?: string
  kind?: PlanSessionKind
}
export interface MoveSessionChange {
  op: 'move_session'
  session_id: string
  to_date: string // YYYY-MM-DD
}
export interface ReplanChange {
  op: 'replan'
}

export type AgentChange =
  | SetStrategyChange
  | SetPriorityChange
  | InsertSessionChange
  | DropSessionChange
  | MoveSessionChange
  | ReplanChange

export interface AgentDecisionJson {
  decision: AgentDecision
  trigger: AgentTrigger
  observations: string[]
  reason: string
  changes: AgentChange[]
  notify: boolean
}

// --- strict parsing ----------------------------------------------------------

export class DecisionParseError extends Error {}

const STRATEGY_LEVELS: StrategyLevel[] = ['NORMAL', 'STRUGGLING', 'PERSISTENT']
const SESSION_KINDS: PlanSessionKind[] = [
  'practice',
  'diagnostic',
  'prerequisite_review',
  'revision',
]
const TRIGGERS: AgentTrigger[] = ['SESSION_COMPLETED', 'DAILY', 'MANUAL']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function str(v: unknown, field: string): string {
  if (typeof v !== 'string' || !v.trim()) {
    throw new DecisionParseError(`"${field}" must be a non-empty string`)
  }
  return v
}

function parseChange(raw: unknown, i: number): AgentChange {
  if (!raw || typeof raw !== 'object') {
    throw new DecisionParseError(`changes[${i}] is not an object`)
  }
  const c = raw as Record<string, unknown>
  const rawOp = c.op
  if (typeof rawOp !== 'string' || !CHANGE_OPS.includes(rawOp as ChangeOpName)) {
    throw new DecisionParseError(`changes[${i}].op "${String(rawOp)}" is not allowed`)
  }
  const op = rawOp as ChangeOpName
  switch (op) {
    case 'set_strategy': {
      const level = c.level
      if (typeof level !== 'string' || !STRATEGY_LEVELS.includes(level as StrategyLevel)) {
        throw new DecisionParseError(`changes[${i}].level is invalid`)
      }
      return { op, topic: str(c.topic, `changes[${i}].topic`), level: level as StrategyLevel }
    }
    case 'set_priority': {
      const priority = Number(c.priority)
      if (!Number.isFinite(priority)) {
        throw new DecisionParseError(`changes[${i}].priority must be a number`)
      }
      return { op, topic: str(c.topic, `changes[${i}].topic`), priority: Math.round(priority) }
    }
    case 'insert_session': {
      const kind = c.kind
      if (typeof kind !== 'string' || !SESSION_KINDS.includes(kind as PlanSessionKind)) {
        throw new DecisionParseError(`changes[${i}].kind is invalid`)
      }
      if (c.before !== undefined && (typeof c.before !== 'string' || !DATE_RE.test(c.before))) {
        throw new DecisionParseError(`changes[${i}].before must be YYYY-MM-DD`)
      }
      return {
        op,
        topic: str(c.topic, `changes[${i}].topic`),
        kind: kind as PlanSessionKind,
        before: c.before as string | undefined,
      }
    }
    case 'drop_session': {
      if (c.session_id === undefined && c.topic === undefined) {
        throw new DecisionParseError(`changes[${i}] needs session_id or topic`)
      }
      if (c.kind !== undefined && !SESSION_KINDS.includes(c.kind as PlanSessionKind)) {
        throw new DecisionParseError(`changes[${i}].kind is invalid`)
      }
      return {
        op,
        session_id: c.session_id as string | undefined,
        topic: c.topic as string | undefined,
        kind: c.kind as PlanSessionKind | undefined,
      }
    }
    case 'move_session': {
      if (typeof c.to_date !== 'string' || !DATE_RE.test(c.to_date)) {
        throw new DecisionParseError(`changes[${i}].to_date must be YYYY-MM-DD`)
      }
      return {
        op,
        session_id: str(c.session_id, `changes[${i}].session_id`),
        to_date: c.to_date,
      }
    }
    case 'replan':
      return { op }
  }
}

/** Parse and shape-check an untrusted decision object. Throws on anything off-contract. */
export function parseDecision(raw: unknown): AgentDecisionJson {
  if (!raw || typeof raw !== 'object') {
    throw new DecisionParseError('decision is not an object')
  }
  const d = raw as Record<string, unknown>

  if (typeof d.decision !== 'string' || !AGENT_DECISIONS.includes(d.decision as AgentDecision)) {
    throw new DecisionParseError(`decision "${String(d.decision)}" is not in the enum`)
  }
  if (typeof d.trigger !== 'string' || !TRIGGERS.includes(d.trigger as AgentTrigger)) {
    throw new DecisionParseError(`trigger "${String(d.trigger)}" is not in the enum`)
  }
  const observations = Array.isArray(d.observations)
    ? d.observations.filter((x): x is string => typeof x === 'string').slice(0, 12)
    : []
  const changesRaw = Array.isArray(d.changes) ? d.changes : []
  const changes = changesRaw.map((c, i) => parseChange(c, i))

  return {
    decision: d.decision as AgentDecision,
    trigger: d.trigger as AgentTrigger,
    observations,
    reason: typeof d.reason === 'string' ? d.reason.slice(0, 500) : '',
    changes,
    notify: d.notify === true,
  }
}

export interface AgentContext {
  current_date: string
  mission: {
    id: string
    title: string
    subject_id: string
    exam_date: string
    sessions_per_week: number
    minutes_per_session: number
    status: string
  }
  student_model: { level: number }
  topics: {
    topic_id: string
    name: string
    priority: number
    target_mastery: number
    mastery: number
    quality_avg: number
    attempts: number
    strategy_level: StrategyLevel
    consecutive_flat_sessions: number
  }[]
  current_plan: {
    id: string
    topic_id: string
    scheduled_date: string
    kind: PlanSessionKind
    strategy_level: StrategyLevel
    status: string
  }[]
  recent_sessions: {
    topic_id: string
    created_at: string
    items: number
    correct: number
    mastery_before: number
    mastery_after: number
  }[]
  missed_sessions: number
  days_remaining: number
  exam_proximity_crossing: number | null
  /** upcoming academic dates the student put on their calendar (spec: routine load) */
  calendar: {
    title: string
    kind: string
    days_until: number
    topic_id: string | null
  }[]
  /** calendar dates sitting exactly on a 14 / 7 / 3 / 1-day milestone today */
  deadline_crossings: { title: string; kind: string; days_until: number }[]
  /** recurring routines the student has fallen behind on */
  routines_behind: number
  plan_confidence: {
    confidence: PlanConfidence
    days_remaining: number
    required_sessions: number
    available_sessions: number
    ratio: number
    weak_topics: { topic_id: string; mastery: number; target: number; gap: number }[]
  }
}
