import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { AgentContext, AgentDecisionJson } from './contract.ts'
import { validateDecision } from './validator.ts'

const TODAY = '2026-09-06'
const EXAM = '2026-10-04'

function ctx(over: Partial<AgentContext> = {}): AgentContext {
  const base: AgentContext = {
    current_date: TODAY,
    mission: {
      id: 'm1',
      title: 'Physics Exam',
      subject_id: 'physics',
      subject_name: 'Physics',
      exam_date: EXAM,
      sessions_per_week: 4,
      minutes_per_session: 30,
      status: 'active',
    },
    student_model: { level: 3 },
    topics: [
      mkTopic('kinematics', { mastery: 0.6 }),
      mkTopic('forces', { mastery: 0.5, consecutive_flat_sessions: 0 }),
    ],
    current_plan: [],
    recent_sessions: [],
    missed_sessions: 0,
    days_remaining: 28,
    exam_proximity_crossing: null,
    calendar: [],
    deadline_crossings: [],
    routines_behind: 0,
    plan_confidence: {
      confidence: 'ON_TRACK',
      days_remaining: 28,
      required_sessions: 6,
      available_sessions: 16,
      ratio: 2.6,
      weak_topics: [],
    },
  }
  return { ...base, ...over }
}

function mkTopic(
  topic_id: string,
  over: Partial<AgentContext['topics'][number]> = {},
): AgentContext['topics'][number] {
  return {
    topic_id,
    name: topic_id,
    priority: 1,
    target_mastery: 0.75,
    mastery: 0.5,
    quality_avg: 0.5,
    attempts: 8,
    strategy_level: 'NORMAL',
    consecutive_flat_sessions: 0,
    ...over,
  }
}

function pending(id: string, topic_id: string, scheduled_date: string): AgentContext['current_plan'][number] {
  return { id, topic_id, scheduled_date, kind: 'practice', strategy_level: 'NORMAL', status: 'pending' }
}

function decision(over: Partial<AgentDecisionJson> = {}): AgentDecisionJson {
  return {
    decision: 'KEEP',
    trigger: 'MANUAL',
    observations: [],
    reason: 'test',
    changes: [],
    notify: false,
    ...over,
  }
}

describe('validateDecision — approvals', () => {
  it('KEEP with no changes is approved', () => {
    const r = validateDecision({ decision: decision(), context: ctx(), recentNotificationWithin24h: false })
    assert.equal(r.approved, true)
    assert.deepEqual(r.changes, [])
    assert.equal(r.notify, false)
  })

  it('a one-rung strategy escalation with 2 flat sessions is approved', () => {
    const r = validateDecision({
      decision: decision({
        decision: 'ESCALATE_STRATEGY',
        changes: [{ op: 'set_strategy', topic: 'forces', level: 'STRUGGLING' }],
      }),
      context: ctx({ topics: [mkTopic('kinematics'), mkTopic('forces', { consecutive_flat_sessions: 2 })] }),
      recentNotificationWithin24h: false,
    })
    assert.equal(r.approved, true, r.rejected_reason ?? '')
  })
})

describe('Rule 1 — weekly session cap', () => {
  const fullWeek = ctx({
    current_plan: [
      pending('s1', 'kinematics', '2026-09-07'),
      pending('s2', 'forces', '2026-09-08'),
      pending('s3', 'kinematics', '2026-09-09'),
      pending('s4', 'forces', '2026-09-10'),
    ],
  })

  it('rejects an insert that would make a 5th session in a capped week', () => {
    const r = validateDecision({
      decision: decision({
        decision: 'INSERT_REMEDIATION',
        changes: [{ op: 'insert_session', topic: 'forces', kind: 'prerequisite_review', before: '2026-09-11' }],
      }),
      context: { ...fullWeek, topics: [mkTopic('kinematics'), mkTopic('forces', { consecutive_flat_sessions: 2 })] },
      recentNotificationWithin24h: false,
    })
    assert.equal(r.approved, false)
    assert.match(r.rejected_reason ?? '', /week/)
  })

  it('allows the same insert when a later week has room', () => {
    const r = validateDecision({
      decision: decision({
        decision: 'INSERT_REMEDIATION',
        changes: [{ op: 'insert_session', topic: 'forces', kind: 'prerequisite_review' }],
      }),
      context: { ...fullWeek, topics: [mkTopic('kinematics'), mkTopic('forces', { consecutive_flat_sessions: 2 })] },
      recentNotificationWithin24h: false,
    })
    assert.equal(r.approved, true, r.rejected_reason ?? '')
  })
})

describe('Rule 2 — date boundaries', () => {
  it('rejects moving a session before today', () => {
    const c = ctx({ current_plan: [pending('s1', 'forces', '2026-09-20')] })
    const r = validateDecision({
      decision: decision({ decision: 'REDISTRIBUTE', changes: [{ op: 'move_session', session_id: 's1', to_date: '2026-09-01' }] }),
      context: c,
      recentNotificationWithin24h: false,
    })
    assert.equal(r.approved, false)
    assert.match(r.rejected_reason ?? '', /before today/)
  })

  it('rejects inserting after the exam', () => {
    const r = validateDecision({
      decision: decision({ changes: [{ op: 'insert_session', topic: 'forces', kind: 'revision', before: '2026-10-20' }] }),
      context: ctx(),
      recentNotificationWithin24h: false,
    })
    assert.equal(r.approved, false)
    assert.match(r.rejected_reason ?? '', /after the exam/)
  })
})

describe('Rule 3 — one strategy rung per tick', () => {
  it('rejects NORMAL → PERSISTENT in a single tick', () => {
    const r = validateDecision({
      decision: decision({
        decision: 'ESCALATE_STRATEGY',
        changes: [{ op: 'set_strategy', topic: 'forces', level: 'PERSISTENT' }],
      }),
      context: ctx({ topics: [mkTopic('kinematics'), mkTopic('forces', { consecutive_flat_sessions: 3 })] }),
      recentNotificationWithin24h: false,
    })
    assert.equal(r.approved, false)
    assert.match(r.rejected_reason ?? '', /one level/)
  })
})

describe('Rule 4 — escalation threshold', () => {
  it('rejects ESCALATE_STRATEGY with only 1 flat session', () => {
    const r = validateDecision({
      decision: decision({
        decision: 'ESCALATE_STRATEGY',
        changes: [{ op: 'set_strategy', topic: 'forces', level: 'STRUGGLING' }],
      }),
      context: ctx({ topics: [mkTopic('kinematics'), mkTopic('forces', { consecutive_flat_sessions: 1 })] }),
      recentNotificationWithin24h: false,
    })
    assert.equal(r.approved, false)
    assert.match(r.rejected_reason ?? '', /consecutive_flat_sessions = 1/)
  })

  it('rejects INSERT_REMEDIATION when no topic is flat enough', () => {
    const r = validateDecision({
      decision: decision({
        decision: 'INSERT_REMEDIATION',
        changes: [{ op: 'insert_session', topic: 'forces', kind: 'prerequisite_review' }],
      }),
      context: ctx(),
      recentNotificationWithin24h: false,
    })
    assert.equal(r.approved, false)
  })
})

describe('Rule 5 — mission-topic boundary', () => {
  it('rejects the whole decision if a change names a non-mission topic', () => {
    const r = validateDecision({
      decision: decision({
        decision: 'REPRIORITIZE',
        changes: [
          { op: 'set_priority', topic: 'forces', priority: 5 },
          { op: 'set_priority', topic: 'thermodynamics', priority: 5 },
        ],
      }),
      context: ctx(),
      recentNotificationWithin24h: false,
    })
    assert.equal(r.approved, false)
    assert.deepEqual(r.changes, [])
    assert.match(r.rejected_reason ?? '', /not part of the mission/)
  })

  it('rejects a change that points at an unknown session id', () => {
    const r = validateDecision({
      decision: decision({ decision: 'REDISTRIBUTE', changes: [{ op: 'move_session', session_id: 'ghost', to_date: '2026-09-20' }] }),
      context: ctx(),
      recentNotificationWithin24h: false,
    })
    assert.equal(r.approved, false)
  })
})

describe('Rule 8 — producer ops', () => {
  it('rejects draft_message when the plan is ON_TRACK and no deadline is near', () => {
    const r = validateDecision({
      decision: decision({
        decision: 'KEEP',
        changes: [{ op: 'draft_message', kind: 'extension_request' }],
      }),
      context: ctx(),
      recentNotificationWithin24h: false,
    })
    assert.equal(r.approved, false)
    assert.match(r.rejected_reason ?? '', /draft_message/)
  })

  it('allows one draft_message when the plan is OFF_TRACK', () => {
    const r = validateDecision({
      decision: decision({
        decision: 'FLAG_FOR_HUMAN',
        changes: [{ op: 'draft_message', kind: 'extension_request' }],
      }),
      context: ctx({
        plan_confidence: {
          confidence: 'OFF_TRACK',
          days_remaining: 5,
          required_sessions: 12,
          available_sessions: 4,
          ratio: 0.33,
          weak_topics: [{ topic_id: 'forces', mastery: 0.4, target: 0.75, gap: 0.35 }],
        },
      }),
      recentNotificationWithin24h: false,
    })
    assert.equal(r.approved, true, r.rejected_reason ?? '')
  })

  it('rejects more than two revision sheets in one tick', () => {
    const r = validateDecision({
      decision: decision({
        decision: 'KEEP',
        changes: [
          { op: 'write_revision_sheet', topic: 'kinematics' },
          { op: 'write_revision_sheet', topic: 'forces' },
          { op: 'write_revision_sheet', topic: 'kinematics' },
        ],
      }),
      context: ctx(),
      recentNotificationWithin24h: false,
    })
    assert.equal(r.approved, false)
  })

  it('approves prepare_session for a real pending session', () => {
    const r = validateDecision({
      decision: decision({
        decision: 'KEEP',
        changes: [{ op: 'prepare_session', session_id: 's1' }],
      }),
      context: ctx({ current_plan: [pending('s1', 'forces', '2026-09-08')] }),
      recentNotificationWithin24h: false,
    })
    assert.equal(r.approved, true, r.rejected_reason ?? '')
  })
})

describe('Rules 6 & 7 — notification permission', () => {
  it('suppresses notify when the plan is ON_TRACK', () => {
    const r = validateDecision({
      decision: decision({ decision: 'KEEP', notify: true }),
      context: ctx(),
      recentNotificationWithin24h: false,
    })
    assert.equal(r.notify, false)
    assert.ok(r.notes.includes('notify_suppressed'))
  })

  it('allows notify when the plan is OFF_TRACK', () => {
    const r = validateDecision({
      decision: decision({ decision: 'FLAG_FOR_HUMAN', notify: true }),
      context: ctx({
        plan_confidence: {
          confidence: 'OFF_TRACK',
          days_remaining: 3,
          required_sessions: 12,
          available_sessions: 4,
          ratio: 0.33,
          weak_topics: [{ topic_id: 'forces', mastery: 0.4, target: 0.75, gap: 0.35 }],
        },
      }),
      recentNotificationWithin24h: false,
    })
    assert.equal(r.notify, true)
  })

  it('rate-limits a second notification within 24h', () => {
    const offTrack = ctx({
      plan_confidence: {
        confidence: 'OFF_TRACK',
        days_remaining: 3,
        required_sessions: 12,
        available_sessions: 4,
        ratio: 0.33,
        weak_topics: [{ topic_id: 'forces', mastery: 0.4, target: 0.75, gap: 0.35 }],
      },
    })
    const r = validateDecision({
      decision: decision({ decision: 'FLAG_FOR_HUMAN', notify: true }),
      context: offTrack,
      recentNotificationWithin24h: true,
    })
    assert.equal(r.notify, false)
    assert.ok(r.notes.includes('notify_rate_limited'))
  })

  it('allows notify via the exam-proximity combo (<=3d, weak topic, >=2 missed)', () => {
    const r = validateDecision({
      decision: decision({ decision: 'FLAG_FOR_HUMAN', notify: true }),
      context: ctx({
        days_remaining: 2,
        missed_sessions: 3,
        plan_confidence: {
          confidence: 'AT_RISK',
          days_remaining: 2,
          required_sessions: 6,
          available_sessions: 5,
          ratio: 0.9,
          weak_topics: [{ topic_id: 'forces', mastery: 0.55, target: 0.75, gap: 0.2 }],
        },
      }),
      recentNotificationWithin24h: false,
    })
    assert.equal(r.notify, true)
  })
})
