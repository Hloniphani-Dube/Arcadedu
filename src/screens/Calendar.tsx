import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CalendarDays, Plus, Repeat, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/auth-context'
import { getTopic } from '../game/atlas'
import {
  createCalendarEvent,
  createRoutine,
  deleteCalendarEvent,
  deleteRoutine,
  fetchCalendarEvents,
  fetchCalendarSessions,
  fetchRoutines,
  setRoutineActive,
  updateCalendarEvent,
  type CalendarSession,
} from '../study/db'
import { daysBetween, toDayString } from '../study/dates'
import {
  MonthCalendar,
  type DayMarker,
  type MarkerTone,
} from '../study/MonthCalendar'
import { SESSION_KIND_LABEL } from '../study/labels'
import { WeekCheckIn } from '../study/WeekCheckIn'
import type {
  CalendarEvent,
  CalendarEventKind,
  Routine,
  RoutineCadence,
} from '../study/types'
import { Panel, Btn, PageHeader, SectionTitle } from '../components/ui'

const KIND_OPTIONS: { value: CalendarEventKind; label: string }[] = [
  { value: 'exam', label: 'Exam' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'deadline', label: 'Deadline' },
  { value: 'lecture', label: 'Lecture' },
  { value: 'other', label: 'Other' },
]
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const firstOfMonth = (d = new Date()) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))

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
  const [sessions, setSessions] = useState<CalendarSession[]>([])
  const [routines, setRoutines] = useState<Routine[]>([])
  const [error, setError] = useState<string | null>(null)

  const [month, setMonth] = useState(() => firstOfMonth())
  const [selectedDay, setSelectedDay] = useState(today)

  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<CalendarEventKind>('exam')
  const [busy, setBusy] = useState(false)

  const [rTitle, setRTitle] = useState('')
  const [rCadence, setRCadence] = useState<RoutineCadence>('weekly')
  const [rWeekday, setRWeekday] = useState(1)

  const load = useCallback(async () => {
    if (!user) return
    try {
      const [e, s, r] = await Promise.all([
        fetchCalendarEvents(user.id),
        fetchCalendarSessions(user.id),
        fetchRoutines(user.id),
      ])
      setEvents(e)
      setSessions(s)
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

  const markersByDay = useMemo(() => {
    const map: Record<string, DayMarker[]> = {}
    const push = (day: string, marker: DayMarker) => {
      ;(map[day] ??= []).push(marker)
    }
    for (const e of events) {
      if (e.completed) continue
      push(e.event_date, {
        id: `e${e.id}`,
        label: e.title,
        tone: e.kind as MarkerTone,
      })
    }
    for (const s of sessions) {
      if (s.status === 'missed') continue
      push(s.scheduled_date, {
        id: `s${s.id}`,
        label:
          getTopic(s.subjectId, s.topicId)?.name ?? s.topicId,
        tone: 'session',
      })
    }
    return map
  }, [events, sessions])

  if (unconfigured) {
    return (
      <div className="mx-auto max-w-3xl">
        <Panel className="p-5 text-sm text-muted">
          The academic calendar saves to your account. Sign in to use it.
        </Panel>
      </div>
    )
  }

  async function addEvent(onDate: string) {
    if (!user || !title.trim() || !onDate) return
    setBusy(true)
    setError(null)
    try {
      await createCalendarEvent({
        user_id: user.id,
        title,
        kind,
        event_date: onDate,
      })
      setTitle('')
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

  const dayEvents = events
    .filter((e) => e.event_date === selectedDay)
    .sort((a, b) => a.title.localeCompare(b.title))
  const daySessions = sessions.filter((s) => s.scheduled_date === selectedDay)

  return (
    <div>
      <PageHeader icon={<CalendarDays className="h-5 w-5" />} title="Academic Calendar" />

      {error && (
        <Panel className="mb-4 border-hp/40 p-3 text-sm text-hp">{error}</Panel>
      )}

      <div className="mb-6">
        <WeekCheckIn onAdded={load} />
      </div>

      <div className="mb-4">
        <MonthCalendar
          month={month}
          onMonthChange={setMonth}
          markersByDay={markersByDay}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
        />
      </div>

      {/* selected day agenda */}
      <Panel className="mb-6 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-bold">
            {selectedDay === today ? 'Today' : selectedDay}{' '}
            <span className="font-normal text-muted">
              · {relative(today, selectedDay)}
            </span>
          </div>
        </div>

        {dayEvents.length === 0 && daySessions.length === 0 && (
          <p className="text-sm text-muted">Nothing on this day.</p>
        )}

        <div className="flex flex-col gap-2">
          {daySessions.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-lg border border-heal/30 bg-heal/5 p-2 text-sm"
            >
              <span className="rounded-md border border-heal/40 bg-heal/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-heal">
                {SESSION_KIND_LABEL[s.kind as keyof typeof SESSION_KIND_LABEL] ?? s.kind}
              </span>
              <span className="flex-1 truncate">
                {getTopic(s.subjectId, s.topicId)?.name ?? s.topicId}
              </span>
              {s.status === 'pending' && (
                <Link
                  to={`/missions/${s.missionId}/s/${s.id}`}
                  className="text-xs font-semibold text-mana-bright hover:underline"
                >
                  Start
                </Link>
              )}
            </div>
          ))}
          {dayEvents.map((e) => (
            <div
              key={e.id}
              className={`flex items-center gap-2 rounded-lg border border-edge p-2 text-sm ${e.completed ? 'opacity-50' : ''}`}
            >
              <span className="rounded-md border border-edge px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                {e.kind}
              </span>
              <span className={`flex-1 truncate ${e.completed ? 'line-through' : ''}`}>
                {e.title}
              </span>
              <button
                onClick={() =>
                  void updateCalendarEvent(e.id, { completed: !e.completed }).then(load)
                }
                className="text-xs text-muted hover:text-heal"
              >
                {e.completed ? 'Undo' : 'Done'}
              </button>
              <button
                onClick={() => void deleteCalendarEvent(e.id).then(load)}
                className="text-muted hover:text-hp"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-2 border-t border-edge pt-4 sm:flex-row">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a date — e.g. Physics paper 2"
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
          <Btn
            variant="primary"
            onClick={() => void addEvent(selectedDay)}
            disabled={busy || !title.trim()}
          >
            <span className="flex items-center gap-1.5">
              <Plus className="h-4 w-4" /> Add
            </span>
          </Btn>
        </div>
      </Panel>

      <SectionTitle>
        <span className="flex items-center gap-1.5">
          <Repeat className="h-4 w-4" /> Recurring
        </span>
      </SectionTitle>

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
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Panel
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
                onClick={() => void deleteRoutine(r.id).then(load)}
                className="text-muted hover:text-hp"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </Panel>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
