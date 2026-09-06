import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { daysBetween } from './dates.ts'
import { generatePlan, scheduleSlots, type PlanTopicInput } from './plan.ts'

const NOW = new Date('2026-09-06')
const EXAM = '2026-10-04' // 28 days out

const topic = (
  id: string,
  mastery: number,
  strategy_level: PlanTopicInput['strategy_level'] = 'NORMAL',
): PlanTopicInput => ({ topic_id: id, mastery, target: 0.75, strategy_level })

describe('scheduleSlots', () => {
  it('never exceeds sessions_per_week within any fixed week', () => {
    const slots = scheduleSlots(EXAM, 4, NOW)
    const perWeek = new Map<number, number>()
    for (const day of slots) {
      const w = Math.floor(daysBetween(NOW, day) / 7)
      perWeek.set(w, (perWeek.get(w) ?? 0) + 1)
    }
    for (const count of perWeek.values()) assert.ok(count <= 4)
  })

  it('stays inside [today, exam_date]', () => {
    for (const day of scheduleSlots(EXAM, 4, NOW)) {
      assert.ok(daysBetween(NOW, day) >= 0)
      assert.ok(daysBetween(day, EXAM) >= 0)
    }
  })

  it('is empty when the exam is today or past', () => {
    assert.deepEqual(scheduleSlots('2026-09-06', 4, NOW), [])
    assert.deepEqual(scheduleSlots('2026-09-01', 4, NOW), [])
  })
})

describe('generatePlan', () => {
  const topics = [
    topic('mechanics', 0.62),
    topic('waves', 0.71),
    topic('electricity', 0.68),
    topic('magnetism', 0.35), // clearly the weakest
  ]
  const plan = () =>
    generatePlan({
      exam_date: EXAM,
      sessions_per_week: 4,
      topics,
      current_date: NOW,
    })

  it('covers every mission topic at least once when slots allow', () => {
    const covered = new Set(plan().map((s) => s.topic_id))
    for (const t of topics) assert.ok(covered.has(t.topic_id))
  })

  it('gives the weakest topic the most sessions', () => {
    const p = plan()
    const count = (id: string) => p.filter((s) => s.topic_id === id).length
    const weakest = count('magnetism')
    for (const id of ['mechanics', 'waves', 'electricity']) {
      assert.ok(weakest >= count(id))
    }
    assert.ok(weakest > count('waves'))
  })

  it('produces chronologically sorted sessions in range', () => {
    const dates = plan().map((s) => s.scheduled_date)
    assert.deepEqual([...dates].sort(), dates)
    for (const d of dates) {
      assert.ok(daysBetween(NOW, d) >= 0)
      assert.ok(daysBetween(d, EXAM) >= 0)
    }
  })

  it('marks sessions in the final 3 days as revision', () => {
    const p = plan()
    const revision = p.filter((s) => s.kind === 'revision')
    assert.ok(revision.length > 0)
    for (const s of revision) assert.ok(daysBetween(s.scheduled_date, EXAM) <= 3)
    for (const s of p.filter((s) => s.kind === 'practice'))
      assert.ok(daysBetween(s.scheduled_date, EXAM) > 3)
  })

  it('carries the topic strategy level and honours item_count', () => {
    const p = generatePlan({
      exam_date: EXAM,
      sessions_per_week: 4,
      topics: [topic('magnetism', 0.35, 'STRUGGLING')],
      current_date: NOW,
      item_count: 6,
    })
    assert.ok(p.length > 0)
    for (const s of p) {
      assert.equal(s.strategy_level, 'STRUGGLING')
      assert.equal(s.item_count, 6)
    }
  })

  it('returns nothing when the exam has passed', () => {
    assert.deepEqual(
      generatePlan({
        exam_date: '2026-09-01',
        sessions_per_week: 4,
        topics,
        current_date: NOW,
      }),
      [],
    )
  })
})
