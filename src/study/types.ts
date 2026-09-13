// Shared contracts for the Study Mission / Study Agent layer.
//
// Row types mirror supabase/migrations/0002_study_missions.sql. Derived shapes
// (plan confidence, session results) are computed by the deterministic engine in
// this folder — never by the LLM.

export type SyllabusSource = 'atlas' | 'freetext'
export type MissionStatus = 'active' | 'completed' | 'paused' | 'archived'
export type StrategyLevel = 'NORMAL' | 'STRUGGLING' | 'PERSISTENT'
export type PlanSessionKind =
  | 'practice'
  | 'diagnostic'
  | 'prerequisite_review'
  | 'revision'
export type PlanSessionStatus = 'pending' | 'done' | 'missed'
export type PlanConfidence = 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK'

export type AgentTrigger = 'SESSION_COMPLETED' | 'DAILY' | 'MANUAL'

export type AgentDecision =
  | 'KEEP'
  | 'REPRIORITIZE'
  | 'REDISTRIBUTE'
  | 'ADVANCE_DIFFICULTY'
  | 'ESCALATE_STRATEGY'
  | 'DE_ESCALATE_STRATEGY'
  | 'INSERT_REMEDIATION'
  | 'REPLAN'
  | 'FLAG_FOR_HUMAN'

export interface StudyMission {
  id: string
  user_id: string
  subject_id: string
  title: string
  exam_date: string // YYYY-MM-DD
  sessions_per_week: number
  minutes_per_session: number
  syllabus_source: SyllabusSource
  status: MissionStatus
  created_at: string
  updated_at: string
}

export interface MissionTopic {
  id: string
  mission_id: string
  topic_id: string
  priority: number
  target_mastery: number
  created_at: string
}

export interface TopicMastery {
  id: string
  mission_id: string
  topic_id: string
  attempts: number
  correct: number
  quality_avg: number
  mastery_score: number
  strategy_level: StrategyLevel
  consecutive_flat_sessions: number
  last_attempt_at: string | null
  created_at: string
  updated_at: string
}

export interface PlanSession {
  id: string
  mission_id: string
  topic_id: string
  scheduled_date: string // YYYY-MM-DD
  kind: PlanSessionKind
  strategy_level: StrategyLevel
  item_count: number
  status: PlanSessionStatus
  completed_at: string | null
  created_at: string
  updated_at: string
}

export interface SessionLog {
  id: string
  mission_id: string
  plan_session_id: string | null
  topic_id: string
  items: number
  correct: number
  quality_avg: number
  mastery_before: number
  mastery_after: number
  created_at: string
}

export interface AgentEvent {
  id: string
  mission_id: string
  trigger: AgentTrigger
  trigger_id: string | null
  decision: AgentDecision | null
  observations: string[]
  reason: string | null
  changes: unknown[]
  applied: boolean
  rejected_reason: string | null
  notified: boolean
  confidence: PlanConfidence | null
  created_at: string
}

export type CalendarEventKind =
  | 'exam'
  | 'assignment'
  | 'quiz'
  | 'deadline'
  | 'lecture'
  | 'other'

export interface CalendarEvent {
  id: string
  user_id: string
  mission_id: string | null
  topic_id: string | null
  title: string
  kind: CalendarEventKind
  event_date: string // YYYY-MM-DD
  event_time: string | null // HH:MM, 24-hour
  notes: string | null
  completed: boolean
  created_at: string
  updated_at: string
}

export type RoutineCadence = 'daily' | 'weekly' | 'biweekly' | 'monthly'

export interface Routine {
  id: string
  user_id: string
  mission_id: string | null
  title: string
  cadence: RoutineCadence
  weekday: number // 0 = Sunday
  anchor_date: string // YYYY-MM-DD
  time_of_day: string | null // HH:MM, 24-hour
  active: boolean
  created_at: string
  updated_at: string
}

export type RoutineOccurrenceStatus = 'pending' | 'done' | 'missed'

export interface RoutineOccurrence {
  id: string
  routine_id: string
  user_id: string
  due_date: string // YYYY-MM-DD
  status: RoutineOccurrenceStatus
  completed_at: string | null
  created_at: string
}

export type MissionArtifactKind =
  | 'session_items'
  | 'revision_sheet'
  | 'progress_report'
  | 'message_draft'
  | 'weekly_brief'

export type MissionArtifactStatus = 'preparing' | 'ready' | 'draft' | 'archived'

export interface PreparedItem {
  guidance: string
  question: string
  expectedConcept: string
  difficulty: string
}

export interface MissionArtifact {
  id: string
  mission_id: string
  topic_id: string | null
  plan_session_id: string | null
  kind: MissionArtifactKind
  title: string
  /** shape depends on kind: {text} | {items: PreparedItem[]} | {subject, body} */
  content: {
    text?: string
    items?: PreparedItem[]
    subject?: string
    body?: string
  }
  status: MissionArtifactStatus
  created_by: 'agent' | 'you'
  created_at: string
  updated_at: string
}

/** A single "on your plate" item, computed live from sessions + events + routines. */
export interface Reminder {
  id: string
  source: 'session' | 'event' | 'routine'
  kind: string
  title: string
  detail?: string
  date: string // YYYY-MM-DD
  time?: string | null // HH:MM, 24-hour — when the user set one
  when: 'overdue' | 'today' | 'soon'
  /** where "act on this" leads */
  ref: {
    missionId?: string
    planSessionId?: string
    eventId?: string
    routineOccurrenceId?: string
  }
}

export interface StudyNotification {
  id: string
  user_id: string
  mission_id: string | null
  kind: string
  message: string
  actions: NotificationAction[]
  read: boolean
  created_at: string
}

export interface NotificationAction {
  label: string
  /** Client-interpreted intent, e.g. 'add_session' | 'adjust_target' | 'open_plan'. */
  intent: string
}

// --- derived / computed shapes ---------------------------------------------

/** One graded item inside a mission session, in the shape the mastery engine needs. */
export interface GradedItem {
  correct: boolean
  quality: number // 0..1 from /api/ai
}

export interface MasteryUpdate {
  mastery_before: number
  mastery_after: number
  quality_avg: number
  items: number
  correct: number
  /** Did this session move the needle? (delta >= FLAT_DELTA or already at target) */
  flat: boolean
  consecutive_flat_sessions: number
}

export interface WeakTopic {
  topic_id: string
  mastery: number
  target: number
  gap: number
}

export interface PlanConfidenceResult {
  confidence: PlanConfidence
  days_remaining: number
  required_sessions: number
  available_sessions: number
  ratio: number
  weak_topics: WeakTopic[]
}

/** A mission plus everything the Study Plan screen and the agent tick need. */
export interface MissionSnapshot {
  mission: StudyMission
  topics: MissionTopic[]
  mastery: TopicMastery[]
  sessions: PlanSession[]
  recent_logs: SessionLog[]
}
