import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildReminders,
  deadlineCrossings,
  formatTime,
  routineOccurrenceDates,
  routineScheduleLabel,
  routinesBehind,
  upcomingCalendar,
} from './calendar.ts'

const TODAY = '2026-09-07' // a Monday

describe('routineOccurrenceDates', () => {
  it('weekly: every matching weekday in the horizon', () => {
    // weekday 1 = Monday
    const d = routineOccurrenceDates(
      { weekday: 1, cadence: 'weekly', anchor_date: '2026-09-07' },
      TODAY,
      21,
    )
    assert.deepEqual(d, ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'])
  })

  it('biweekly: every other matching weekday from the anchor', () => {
    const d = routineOccurrenceDates(
      { weekday: 1, cadence: 'biweekly', anchor_date: '2026-09-07' },
      TODAY,
      28,
    )
    assert.deepEqual(d, ['2026-09-07', '2026-09-21', '2026-10-05'])
  })

  it('returns nothing when the weekday never lands in the window', () => {
    const d = routineOccurrenceDates(
      { weekday: 3, cadence: 'weekly', anchor_date: '2026-09-07' },
      TODAY,
      1,
    )
    assert.deepEqual(d, [])
  })

  it('daily: every day in the window regardless of weekday/anchor', () => {
    const d = routineOccurrenceDates(
      { weekday: 0, cadence: 'daily', anchor_date: '2026-09-07' },
      TODAY,
      3,
    )
    assert.deepEqual(d, ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10'])
  })

  it('monthly: the same day-of-month as the anchor', () => {
    const d = routineOccurrenceDates(
      { weekday: 0, cadence: 'monthly', anchor_date: '2026-09-15' },
      TODAY,
      60,
    )
    assert.deepEqual(d, ['2026-09-15', '2026-10-15'])
  })

  it('monthly: clamps a late anchor day to the shorter month', () => {
    // anchor on the 31st; horizon spans Sep (30 days) and Oct (31 days)
    const d = routineOccurrenceDates(
      { weekday: 0, cadence: 'monthly', anchor_date: '2026-08-31' },
      TODAY,
      60,
    )
    assert.deepEqual(d, ['2026-09-30', '2026-10-31'])
  })
})

describe('buildReminders', () => {
  const base = {
    today: TODAY,
    sessions: [
      { id: 's1', missionId: 'm1', topicName: 'Forces', kind: 'practice', scheduled_date: '2026-09-05' }, // overdue
      { id: 's2', missionId: 'm1', topicName: 'Waves', kind: 'practice', scheduled_date: '2026-09-07' }, // today
      { id: 's3', missionId: 'm1', topicName: 'Optics', kind: 'revision', scheduled_date: '2026-09-30' }, // beyond 7d
    ],
    events: [
      { id: 'e1', title: 'Physics assignment', kind: 'assignment' as const, event_date: '2026-09-09', completed: false },
      { id: 'e2', title: 'Done thing', kind: 'deadline' as const, event_date: '2026-09-08', completed: true },
    ],
    routineOccurrences: [{ id: 'r1', title: 'Weekly problem set', due_date: '2026-09-07' }],
  }

  it('merges sessions, events and routines within their windows', () => {
    const r = buildReminders(base)
    const ids = r.map((x) => x.id)
    assert.ok(ids.includes('session:s1'))
    assert.ok(ids.includes('session:s2'))
    assert.ok(!ids.includes('session:s3')) // outside the 7-day session window
    assert.ok(ids.includes('event:e1'))
    assert.ok(!ids.includes('event:e2')) // completed
    assert.ok(ids.includes('routine:r1'))
  })

  it('sorts overdue first, then by date', () => {
    const r = buildReminders(base)
    assert.equal(r[0].id, 'session:s1')
    assert.equal(r[0].when, 'overdue')
    for (let i = 1; i < r.length; i++) {
      const rank = { overdue: 0, today: 1, soon: 2 }
      assert.ok(rank[r[i - 1].when] <= rank[r[i].when])
    }
  })

  it('carries a ref that points at where to act', () => {
    const r = buildReminders(base)
    const session = r.find((x) => x.id === 'session:s2')!
    assert.deepEqual(session.ref, { missionId: 'm1', planSessionId: 's2' })
    const event = r.find((x) => x.id === 'event:e1')!
    assert.deepEqual(event.ref, { eventId: 'e1' })
  })

  it('drops future routine occurrences — only today/overdue surface as items', () => {
    const r = buildReminders({
      ...base,
      routineOccurrences: [
        { id: 'r1', title: 'Weekly problem set', due_date: '2026-09-07' }, // today
        { id: 'r2', title: 'Weekly problem set', due_date: '2026-09-06' }, // overdue
        { id: 'r3', title: 'Weekly problem set', due_date: '2026-09-14' }, // next week — not shown
      ],
    })
    const ids = r.filter((x) => x.source === 'routine').map((x) => x.id)
    assert.deepEqual(ids.sort(), ['routine:r1', 'routine:r2'])
  })

  it('carries the routine time-of-day onto the reminder', () => {
    const r = buildReminders({
      ...base,
      routineOccurrences: [
        { id: 'r1', title: 'Weekly problem set', due_date: '2026-09-07', time_of_day: '18:00' },
      ],
    })
    assert.equal(r.find((x) => x.id === 'routine:r1')!.time, '18:00')
  })
})

describe('formatTime', () => {
  it('formats HH:MM as a 12-hour clock', () => {
    assert.equal(formatTime('18:05'), '6:05 PM')
    assert.equal(formatTime('00:00'), '12:00 AM')
    assert.equal(formatTime('12:00'), '12:00 PM')
    assert.equal(formatTime('09:30'), '9:30 AM')
  })

  it('returns empty for missing/invalid input', () => {
    assert.equal(formatTime(null), '')
    assert.equal(formatTime(undefined), '')
    assert.equal(formatTime(''), '')
  })
})

describe('routineScheduleLabel', () => {
  it('describes cadence and, when set, the time', () => {
    assert.equal(
      routineScheduleLabel({ cadence: 'weekly', weekday: 2, anchor_date: '2026-09-01', time_of_day: '18:00' }),
      'Every Tue at 6:00 PM',
    )
    assert.equal(
      routineScheduleLabel({ cadence: 'daily', weekday: 0, anchor_date: '2026-09-01', time_of_day: null }),
      'Every day',
    )
    assert.equal(
      routineScheduleLabel({ cadence: 'monthly', weekday: 0, anchor_date: '2026-09-03' }),
      'Monthly on the 3rd',
    )
  })
})

describe('deadlineCrossings', () => {
  it('flags events exactly 14 / 7 / 3 / 1 days out', () => {
    const events = [
      { title: 'Exam', kind: 'exam', event_date: '2026-09-14', completed: false }, // 7 days
      { title: 'Quiz', kind: 'quiz', event_date: '2026-09-10', completed: false }, // 3 days
      { title: 'Essay', kind: 'assignment', event_date: '2026-09-12', completed: false }, // 5 days — not a crossing
      { title: 'Old', kind: 'exam', event_date: '2026-09-08', completed: true }, // completed
    ]
    const c = deadlineCrossings(events, TODAY)
    assert.deepEqual(
      c.map((x) => x.days_until).sort((a, b) => a - b),
      [3, 7],
    )
  })
})

describe('upcomingCalendar', () => {
  it('returns future, non-completed events within the horizon, nearest first', () => {
    const events = [
      { title: 'B', kind: 'deadline', event_date: '2026-09-20', topic_id: null, completed: false },
      { title: 'A', kind: 'assignment', event_date: '2026-09-10', topic_id: 'forces', completed: false },
      { title: 'Past', kind: 'quiz', event_date: '2026-09-01', topic_id: null, completed: false },
    ]
    const u = upcomingCalendar(events, TODAY, 28)
    assert.deepEqual(u.map((x) => x.title), ['A', 'B'])
    assert.equal(u[0].topic_id, 'forces')
  })
})

describe('routinesBehind', () => {
  it('counts missed and overdue-pending occurrences in the recent past', () => {
    const occ = [
      { due_date: '2026-09-01', status: 'missed' },
      { due_date: '2026-09-05', status: 'pending' }, // overdue pending
      { due_date: '2026-09-07', status: 'pending' }, // today, not behind
      { due_date: '2026-09-03', status: 'done' },
      { due_date: '2026-07-01', status: 'missed' }, // too old
    ]
    assert.equal(routinesBehind(occ, TODAY), 2)
  })
})
