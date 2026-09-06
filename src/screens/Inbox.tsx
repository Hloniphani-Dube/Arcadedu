import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  BookOpen,
  CalendarClock,
  CheckCircle2,
  Inbox as InboxIcon,
  Repeat,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '../auth/auth-context'
import { getTopic } from '../game/atlas'
import {
  MonthCalendar,
  type DayMarker,
  type MarkerTone,
} from '../study/MonthCalendar'
import {
  fetchInbox,
  markNotificationRead,
  regeneratePlan,
  fetchMissionSnapshot,
  setRoutineOccurrenceStatus,
  updateCalendarEvent,
  type InboxData,
} from '../study/db'
import { buildReminders } from '../study/calendar'
import { toDayString, daysBetween } from '../study/dates'
import type { Reminder, StudyNotification } from '../study/types'
import { NotificationCard } from '../study/NotificationCard'
import {
  Panel,
  Btn,
  Spinner,
  PageHeader,
  SectionTitle,
  EmptyState,
} from '../components/ui'

function group(reminders: Reminder[]) {
  return {
    overdue: reminders.filter((r) => r.when === 'overdue'),
    today: reminders.filter((r) => r.when === 'today'),
    soon: reminders.filter((r) => r.when === 'soon'),
  }
}

const SOURCE_ICON = {
  session: BookOpen,
  event: CalendarClock,
  routine: Repeat,
} as const

const firstOfMonth = (d = new Date()) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))

export function Inbox() {
  const { user, unconfigured } = useAuth()
  const navigate = useNavigate()
  const today = toDayString(new Date())
  const [data, setData] = useState<InboxData | null>(null)
  const [month, setMonth] = useState(() => firstOfMonth())
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!user) return
    try {
      setData(await fetchInbox(user.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your inbox')
    }
  }, [user])

  const markersByDay = useMemo(() => {
    const map: Record<string, DayMarker[]> = {}
    if (!data) return map
    const subById = new Map(data.missions.map((m) => [m.id, m.subject_id]))
    const push = (day: string, mk: DayMarker) => {
      ;(map[day] ??= []).push(mk)
    }
    for (const e of data.events) {
      if (e.completed) continue
      push(e.event_date, { id: `e${e.id}`, label: e.title, tone: e.kind as MarkerTone })
    }
    for (const s of data.reminderSessions) {
      push(s.scheduled_date, {
        id: `s${s.id}`,
        label: getTopic(subById.get(s.missionId), s.topicId)?.name ?? s.topicId,
        tone: 'session',
      })
    }
    return map
  }, [data])

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
          The inbox needs a signed-in account.
        </Panel>
      </div>
    )
  }
  if (!data && !error) {
    return (
      <div className="mx-auto max-w-2xl">
        <Panel className="p-5">
          <Spinner label="Gathering what's on your plate…" />
        </Panel>
      </div>
    )
  }
  if (error) {
    return (
      <div className="mx-auto max-w-2xl">
        <Panel className="border-hp/40 p-5 text-sm text-hp">{error}</Panel>
      </div>
    )
  }

  const inbox = data!
  const missionById = new Map(inbox.missions.map((m) => [m.id, m]))

  const reminders = buildReminders({
    today,
    sessions: inbox.reminderSessions.map((s) => {
      const m = missionById.get(s.missionId)
      return {
        id: s.id,
        missionId: s.missionId,
        topicName:
          getTopic(m?.subject_id, s.topicId)?.name ?? s.topicId,
        kind: s.kind,
        scheduled_date: s.scheduled_date,
      }
    }),
    events: inbox.events,
    routineOccurrences: inbox.routineOccurrences
      .filter((o) => o.status !== 'done')
      .map((o) => ({
        id: o.id,
        title: inbox.routineTitles[o.routine_id] ?? 'Recurring task',
        due_date: o.due_date,
      })),
  })
  const groups = group(reminders)

  async function completeReminder(r: Reminder) {
    if (r.ref.eventId) await updateCalendarEvent(r.ref.eventId, { completed: true })
    else if (r.ref.routineOccurrenceId)
      await setRoutineOccurrenceStatus(r.ref.routineOccurrenceId, 'done')
    await load()
  }

  async function onNoteAction(n: StudyNotification, intent: string) {
    if (intent === 'add_session' && n.mission_id) {
      const snap = await fetchMissionSnapshot(n.mission_id)
      if (snap) {
        try {
          await regeneratePlan(snap)
        } catch {
          /* best effort */
        }
      }
    }
    await markNotificationRead(n.id)
    await load()
  }

  async function dismissNote(n: StudyNotification) {
    await markNotificationRead(n.id)
    await load()
  }

  const digest = inbox.lastDailyDigest
  const nothing =
    reminders.length === 0 && inbox.notifications.length === 0

  return (
    <div>
      <PageHeader
        icon={<InboxIcon className="h-5 w-5" />}
        title="Inbox"
        subtitle="What's on your plate, and the few things the agent needs you to decide."
      />

      {digest && (
        <Panel className="mb-6 flex items-start gap-3 border-mana/40 bg-mana/5 p-4">
          <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-mana-bright" />
          <div className="min-w-0 text-sm">
            <span className="font-bold text-mana-bright">AGENT</span>{' '}
            <span className="text-muted">
              ·{' '}
              {daysBetween(digest.created_at.slice(0, 10), today) === 0
                ? 'today'
                : digest.created_at.slice(0, 10)}
            </span>
            <p className="mt-1 text-ink">
              {digest.reason || 'Reviewed your plan — nothing needs you.'}
            </p>
          </div>
        </Panel>
      )}

      <section className="mb-8">
        <SectionTitle
          actions={
            <Link
              to="/calendar"
              className="text-xs font-semibold text-mana-bright hover:underline"
            >
              Open calendar
            </Link>
          }
        >
          This month
        </SectionTitle>
        <MonthCalendar
          compact
          month={month}
          onMonthChange={setMonth}
          markersByDay={markersByDay}
          onSelectDay={() => navigate('/calendar')}
        />
      </section>

      {inbox.notifications.length > 0 && (
        <section className="mb-8">
          <SectionTitle className="[&>h2]:text-hp">Needs you</SectionTitle>
          <div className="flex flex-col gap-3">
            {inbox.notifications.map((n) => (
              <NotificationCard
                key={n.id}
                notification={n}
                onAction={(intent) => void onNoteAction(n, intent)}
                onDismiss={() => void dismissNote(n)}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle>On your plate</SectionTitle>

        {nothing && (
          <EmptyState
            icon={<CheckCircle2 className="h-5 w-5 text-heal" />}
            title="You're all caught up"
          >
            The agent is watching your plan and calendar in the background. It
            will surface here only when something needs doing or deciding.
          </EmptyState>
        )}

        <ReminderGroup label="Overdue" tone="text-hp" items={groups.overdue} onComplete={completeReminder} />
        <ReminderGroup label="Today" tone="text-ink" items={groups.today} onComplete={completeReminder} />
        <ReminderGroup label="This week" tone="text-muted" items={groups.soon} onComplete={completeReminder} />
      </section>
    </div>
  )
}

function ReminderGroup({
  label,
  tone,
  items,
  onComplete,
}: {
  label: string
  tone: string
  items: Reminder[]
  onComplete: (r: Reminder) => void | Promise<void>
}) {
  if (items.length === 0) return null
  return (
    <div className="mb-5">
      <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${tone}`}>
        {label} · {items.length}
      </div>
      <div className="flex flex-col gap-2">
        {items.map((r, i) => {
          const Icon = SOURCE_ICON[r.source]
          return (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
            >
              <Panel className="flex items-center gap-3 p-3">
                <Icon className="h-4 w-4 flex-shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{r.title}</div>
                  <div className="text-xs text-muted">
                    {r.detail} · {r.date}
                  </div>
                </div>
                {r.source === 'session' && r.ref.missionId && r.ref.planSessionId ? (
                  <Link
                    to={`/missions/${r.ref.missionId}/s/${r.ref.planSessionId}`}
                  >
                    <Btn variant="primary" size="sm">
                      Start
                    </Btn>
                  </Link>
                ) : (
                  <Btn size="sm" onClick={() => void onComplete(r)}>
                    Mark done
                  </Btn>
                )}
              </Panel>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
