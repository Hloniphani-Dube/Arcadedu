import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseDecision, DecisionParseError } from './contract.ts'

const ok = {
  decision: 'ESCALATE_STRATEGY',
  trigger: 'SESSION_COMPLETED',
  observations: ['Momentum flat for 2 sessions', 'Electricity on track'],
  reason: 'Two flat sessions; scaffolding warranted.',
  changes: [
    { op: 'set_strategy', topic: 'momentum', level: 'STRUGGLING' },
    { op: 'insert_session', topic: 'momentum', kind: 'prerequisite_review', before: '2026-09-10' },
    { op: 'drop_session', topic: 'revision_general' },
  ],
  notify: false,
}

describe('parseDecision — happy path', () => {
  it('accepts a well-formed decision and keeps its changes', () => {
    const d = parseDecision(ok)
    assert.equal(d.decision, 'ESCALATE_STRATEGY')
    assert.equal(d.trigger, 'SESSION_COMPLETED')
    assert.equal(d.changes.length, 3)
    assert.equal(d.notify, false)
  })

  it('coerces a non-boolean notify to false and ignores unknown fields', () => {
    const d = parseDecision({ ...ok, notify: 'yes', bogus: 123 })
    assert.equal(d.notify, false)
  })

  it('caps observations at 12', () => {
    const d = parseDecision({ ...ok, observations: Array.from({ length: 40 }, (_, i) => `o${i}`) })
    assert.equal(d.observations.length, 12)
  })

  it('accepts the producer ops', () => {
    const d = parseDecision({
      ...ok,
      decision: 'KEEP',
      changes: [
        { op: 'prepare_session', session_id: 's1' },
        { op: 'write_revision_sheet', topic: 'momentum' },
        { op: 'draft_message', kind: 'extension_request' },
      ],
    })
    assert.equal(d.changes.length, 3)
    assert.equal(d.changes[2].op, 'draft_message')
  })
})

describe('parseDecision — rejections', () => {
  const bad = (raw: unknown) => assert.throws(() => parseDecision(raw), DecisionParseError)

  it('rejects a decision label outside the enum', () => {
    bad({ ...ok, decision: 'SOLVE_THIS' })
  })
  it('rejects an unknown trigger', () => {
    bad({ ...ok, trigger: 'WEBHOOK' })
  })
  it('rejects an unknown change op', () => {
    bad({ ...ok, changes: [{ op: 'delete_mission', topic: 'x' }] })
  })
  it('rejects set_strategy with an invalid level', () => {
    bad({ ...ok, changes: [{ op: 'set_strategy', topic: 'x', level: 'PANIC' }] })
  })
  it('rejects insert_session with a malformed date', () => {
    bad({ ...ok, changes: [{ op: 'insert_session', topic: 'x', kind: 'practice', before: '9 Sept' }] })
  })
  it('rejects move_session without a target date', () => {
    bad({ ...ok, changes: [{ op: 'move_session', session_id: 's1' }] })
  })
  it('rejects drop_session with neither session_id nor topic', () => {
    bad({ ...ok, changes: [{ op: 'drop_session' }] })
  })
  it('rejects draft_message with an unknown kind', () => {
    bad({ ...ok, changes: [{ op: 'draft_message', kind: 'love_letter' }] })
  })
  it('rejects prepare_session without a session_id', () => {
    bad({ ...ok, changes: [{ op: 'prepare_session' }] })
  })
  it('rejects a non-object', () => {
    bad(null)
    bad('KEEP')
  })
})
