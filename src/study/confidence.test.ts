import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { calculatePlanConfidence, planConfidence } from './confidence.ts'
import { closeTo } from './testkit.ts'

const at = (topic_id: string, mastery: number, target = 0.75) => ({
  topic_id,
  mastery,
  target,
})

describe('planConfidence', () => {
  it('ON_TRACK: lots of runway, small gaps', () => {
    const r = planConfidence({
      exam_date: '2026-10-06',
      sessions_per_week: 4,
      current_date: new Date('2026-09-06'),
      topics: [at('a', 0.65), at('b', 0.65)],
    })
    assert.equal(r.days_remaining, 30)
    assert.equal(r.available_sessions, 17) // floor(30/7 * 4)
    assert.equal(r.required_sessions, 4) // 2 * ceil(0.10 / 0.08)
    assert.equal(r.confidence, 'ON_TRACK')
    assert.deepEqual(
      r.weak_topics.map((t) => t.topic_id),
      ['a', 'b'],
    )
  })

  it('AT_RISK: available ≈ required', () => {
    const r = planConfidence({
      exam_date: '2026-09-20',
      sessions_per_week: 4,
      current_date: new Date('2026-09-06'),
      topics: [at('a', 0.43), at('b', 0.43)],
    })
    assert.equal(r.available_sessions, 8) // floor(14/7 * 4)
    assert.equal(r.required_sessions, 8) // 2 * ceil(0.32 / 0.08)
    closeTo(r.ratio, 1)
    assert.equal(r.confidence, 'AT_RISK')
  })

  it('OFF_TRACK: not enough sessions left', () => {
    const r = planConfidence({
      exam_date: '2026-09-13',
      sessions_per_week: 3,
      current_date: new Date('2026-09-06'),
      topics: [at('a', 0.35), at('b', 0.35)],
    })
    assert.equal(r.available_sessions, 3) // floor(7/7 * 3)
    assert.equal(r.required_sessions, 10) // 2 * ceil(0.40 / 0.08)
    assert.equal(r.confidence, 'OFF_TRACK')
  })

  it('emergency rule: <=2 days and a topic under 0.50 forces OFF_TRACK', () => {
    const r = planConfidence({
      exam_date: '2026-09-08',
      sessions_per_week: 20,
      current_date: new Date('2026-09-06'),
      topics: [at('strong', 0.85), at('weak', 0.45)],
    })
    assert.equal(r.days_remaining, 2)
    assert.ok(r.ratio >= 1.15) // ratio alone would clear ON_TRACK...
    assert.equal(r.confidence, 'OFF_TRACK') // ...but the override wins
  })

  it('does not fire the emergency rule when every topic is >= 0.50', () => {
    const r = planConfidence({
      exam_date: '2026-09-08',
      sessions_per_week: 20,
      current_date: new Date('2026-09-06'),
      topics: [at('a', 0.72), at('b', 0.68)],
    })
    assert.equal(r.confidence, 'ON_TRACK')
  })

  it('past exam date clamps days_remaining to 0', () => {
    const r = planConfidence({
      exam_date: '2026-09-01',
      sessions_per_week: 4,
      current_date: new Date('2026-09-06'),
      topics: [at('a', 0.4)],
    })
    assert.equal(r.days_remaining, 0)
    assert.equal(r.available_sessions, 0)
    assert.equal(r.confidence, 'OFF_TRACK')
  })

  it('no gaps → required 0, ratio favours ON_TRACK', () => {
    const r = planConfidence({
      exam_date: '2026-10-06',
      sessions_per_week: 4,
      current_date: new Date('2026-09-06'),
      topics: [at('a', 0.8), at('b', 0.9)],
    })
    assert.equal(r.required_sessions, 0)
    assert.equal(r.weak_topics.length, 0)
    assert.equal(r.confidence, 'ON_TRACK')
  })
})

describe('calculatePlanConfidence (row-type adapter)', () => {
  it('joins mission topics to mastery rows by topic_id', () => {
    const r = calculatePlanConfidence(
      { exam_date: '2026-10-06', sessions_per_week: 4 },
      [
        { topic_id: 'a', target_mastery: 0.75 },
        { topic_id: 'b', target_mastery: 0.75 },
      ],
      [{ topic_id: 'a', mastery_score: 0.65 }], // 'b' has no mastery row yet → 0
      new Date('2026-09-06'),
    )
    assert.equal(r.weak_topics.find((t) => t.topic_id === 'b')?.mastery, 0)
    closeTo(r.weak_topics.find((t) => t.topic_id === 'b')!.gap, 0.75)
  })
})
