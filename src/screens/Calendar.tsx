import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  CalendarDays,
  Check,
  Plus,
  Repeat,
  Trash2,
} from 'lucide-react'
import { useAuth } from '../auth/auth-context'
import {
  createCalendarEvent,
  createRoutine,
  deleteCalendarEvent,
  deleteRoutine,
  fetchCalendarEvents,
  fetchRoutines,
  setRoutineActive,
  updateCalendarEvent,
} from '../study/db'
import { daysBetween, toDayString } from '../study/dates'
import type {
  CalendarEvent,
  CalendarEventKind,
  Routine,
  RoutineCadence,
} from '../study/types'
import { Panel, Btn } from '../components/ui'

const KIND_OPTIONS: { value: CalendarEventKind; label: string }[] = [
  { value: 'exam', label: 'Exam' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'lecture', label: 'Lecture' },
  { value: 'other', label: 'Other' },
]
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function relative(today: string, date: string): string {
  const d = daysBetween(today, date)
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} ago`
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  if (d < 14) return `In ${d} days`
  return `In ${Math.round(d / 7)} weeks`
}

export function Calendar() {
  const { user, unconfigured } = useAuth()
  const today = toDayString(new Date())

  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [routines, setRoutines] = useState<Routine[]>([])
  const [error, setError] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<CalendarEventKind>('exam')
  const [date, setDate] = useState('')
  const [busy, setBusy] = useState(false)

  const [rTitle, setRTitle] = useState('')
  const [rCadence, setRCadence] = useState<RoutineCadence>('weekly')
  const [rWeekday, setRWeekday] = useState(1)

  const load = useCallback(async () => {
    if (!user) return
    try {
      const [e, r] = await Promise.all([
        fetchCalendarEvents(user.id),
        fetchRoutines(user.id),
      ])
      setEvents(e)
      setRoutines(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your calendar')
    }
  }, [user])

  const loadedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!user || loadedFor.current === user.id) return
    loadedFor.current = user.id
    void load()
  }, [user, load])

  if (unconfigured) {
    return (
      <div className="mx-auto max-w-2xl">
        <Panel className="p-5 text-sm text-muted">
          The academic calendar saves to your account. Sign in to use it.
        </Panel>
      </div>
    )
  }

  async function addEvent() {
    if (!user || !title.trim() || !date) return
    setBusy(true)
    setError(null)
    try {
      await createCalendarEvent({ user_id: user.id, title, kind, event_date: date })
      setTitle('')
      setDate('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the date')
    } finally {
      setBusy(false)
    }
  }

  async function addRoutine() {
    if (!user || !rTitle.trim()) return
    setBusy(true)
    try {
      await createRoutine({
        user_id: user.id,
        title: rTitle,
        cadence: rCadence,
        weekday: rWeekday,
      })
      setRTitle('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the routine')
    } finally {
      setBusy(false)
    }
  }

  const upcoming = events
    .filter((e) => daysBetween(today, e.event_date) >= -14)
    .sort((a, b) => a.event_date.localeCompare(b.event_date))

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-5 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-edge bg-panel-2 text-mana-bright">
          <CalendarDays className="h-5 w-5" />
        </span>
        <div>
          <h1 className="title-serif text-3xl">Academic Calendar</h1>
          <p className="text-xs text-muted">
            Your exams, deadlines and recurring work. The agent watches these and
            adjusts your plan around them.
          </p>
        </div>
      </header>

      {error && (
        <Panel className="mb-4 border-hp/40 p-3 text-sm text-hp">{error}</Panel>
      )}

      <Panel className="mb-6 p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Add a date
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Physics paper 2"
            className="flex-1 rounded-lg border border-edge bg-void p-2 text-sm outline-none focus:border-mana"
          />
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as CalendarEventKind)}
            className="rounded-lg border border-edge bg-void p-2 text-sm outline-none focus:border-mana"
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={date}
            min={today}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-edge bg-void p-2 text-sm outline-none focus:border-mana"
          />
          <Btn variant="primary" onClick={addEvent} disabled={busy || !title.trim() || !date}>
            <span className="flex items-center gap-1.5">
              <Plus className="h-4 w-4" /> Add
            </span>
          </Btn>
        </div>
      </Panel>

      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">
        Upcoming
      </h2>
      <div className="mb-8 flex flex-col gap-2">
        {upcoming.length === 0 && (
          <Panel className="p-4 text-sm text-muted">
            Nothing on the calendar yet.
          </Panel>
        )}
        {upcoming.map((e, i) => (
          <motion.div
            key={e.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.03, 0.3) }}
          >
            <Panel
              className={`flex items-center gap-3 p-3 ${e.completed ? 'opacity-50' : ''}`}
            >
              <span className="rounded-md border border-edge px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                {e.kind}
              </span>
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-semibold ${e.completed ? 'line-through' : ''}`}>
                  {e.title}
                </div>
                <div className="text-xs text-muted">
                  {e.event_date} · {relative(today, e.event_date)}
                </div>
              </div>
              <button
                title={e.completed ? 'Mark not done' : 'Mark done'}
                onClick={() =>
                  void updateCalendarEvent(e.id, { completed: !e.completed }).then(load)
                }
                className="text-muted hover:text-heal"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                title="Delete"
                onClick={() => void deleteCalendarEvent(e.id).then(load)}
                className="text-muted hover:text-hp"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </Panel>
          </motion.div>
        ))}
      </div>

      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted">
        <Repeat className="h-4 w-4" /> Recurring
      </h2>

      <Panel className="mb-3 p-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={rTitle}
            onChange={(e) => setRTitle(e.target.value)}
            placeholder="e.g. Weekly problem set"
            className="flex-1 rounded-lg border border-edge bg-void p-2 text-sm outline-none focus:border-mana"
          />
          <select
            value={rCadence}
            onChange={(e) => setRCadence(e.target.value as RoutineCadence)}
            className="rounded-lg border border-edge bg-void p-2 text-sm outline-none focus:border-mana"
          >
            <option value="weekly">Weekly</option>
            <option value="biweekly">Every 2 weeks</option>
          </select>
          <select
            value={rWeekday}
            onChange={(e) => setRWeekday(Number(e.target.value))}
            className="rounded-lg border border-edge bg-void p-2 text-sm outline-none focus:border-mana"
          >
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>
                {d}
              </option>
            ))}
          </select>
          <Btn variant="primary" onClick={addRoutine} disabled={busy || !rTitle.trim()}>
            <span className="flex items-center gap-1.5">
              <Plus className="h-4 w-4" /> Add
            </span>
          </Btn>
        </div>
      </Panel>

      <div className="flex flex-col gap-2">
        {routines.map((r) => (
          <Panel
            key={r.id}
            className={`flex items-center gap-3 p-3 ${r.active ? '' : 'opacity-50'}`}
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{r.title}</div>
              <div className="text-xs text-muted">
                {r.cadence === 'weekly' ? 'Every' : 'Every other'}{' '}
                {WEEKDAYS[r.weekday]}
              </div>
            </div>
            <button
              onClick={() => void setRoutineActive(r.id, !r.active).then(load)}
              className="text-xs text-muted hover:text-ink"
            >
              {r.active ? 'Pause' : 'Resume'}
            </button>
            <button
              title="Delete"
              onClick={() => void deleteRoutine(r.id).then(load)}
              className="text-muted hover:text-hp"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </Panel>
        ))}
      </div>
    </div>
  )
}
