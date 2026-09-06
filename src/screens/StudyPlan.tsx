import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  CalendarClock,
  Check,
  CircleDashed,
  RefreshCw,
  Sparkles,
  Stethoscope,
  X,
} from 'lucide-react'
import { useAuth } from '../auth/auth-context'
import { getSubject, getTopic } from '../game/atlas'
import {
  fetchMissionSnapshot,
  fetchNotifications,
  markMissedSessions,
  markNotificationRead,
  regeneratePlan,
} from '../study/db'
import { runAgentTick } from '../study/agent'
import { calculatePlanConfidence } from '../study/confidence'
import { daysBetween } from '../study/dates'
import type {
  MissionSnapshot,
  PlanSession,
  StudyNotification,
} from '../study/types'
import { ConfidenceBadge, MasteryBar, StrategyPill } from '../study/ui'
import { SESSION_KIND_LABEL } from '../study/labels'
import { AgentActivity } from '../study/AgentActivity'
import { NotificationCard } from '../study/NotificationCard'
import { Panel, Btn, Spinner } from '../components/ui'

export function StudyPlan() {
  const { missionId } = useParams()
  const { user } = useAuth()
  const [snap, setSnap] = useState<MissionSnapshot | null>(null)
  const [notes, setNotes] = useState<StudyNotification[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [agentBusy, setAgentBusy] = useState(false)
  const [agentMsg, setAgentMsg] = useState<string | null>(null)
  const [activityKey, setActivityKey] = useState(0)

  const load = useCallback(async () => {
    if (!missionId) return
    try {
      await markMissedSessions(missionId)
      const s = await fetchMissionSnapshot(missionId)
      if (!s) {
        setError('Mission not found')
        return
      }
      setSnap(s)
      if (user) {
        const n = await fetchNotifications(user.id, { unreadOnly: true })
        setNotes(n.filter((x) => x.mission_id === missionId))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the plan')
    }
  }, [missionId, user])

  const loadedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!missionId || loadedFor.current === missionId) return
    loadedFor.current = missionId
    void load()
  }, [missionId, load])

  if (error) {
    return (
      <div className="mx-auto max-w-3xl">
        <Panel className="border-hp/40 p-5 text-sm text-hp">{error}</Panel>
      </div>
    )
  }
  if (!snap) {
    return (
      <div className="mx-auto max-w-3xl">
        <Panel className="p-5">
          <Spinner label="Loading the plan…" />
        </Panel>
      </div>
    )
  }

  const { mission, topics, mastery, sessions } = snap
  const subject = getSubject(mission.subject_id)
  const diagnosed = mastery.length > 0
  const conf = calculatePlanConfidence(mission, topics, mastery, new Date())
  const masteryByTopic = new Map(mastery.map((m) => [m.topic_id, m]))
  const pending = sessions.filter((s) => s.status === 'pending')
  const nextSession = pending[0]

  async function rebuild() {
    if (!snap) return
    setBusy(true)
    try {
      await regeneratePlan(snap)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not rebuild the plan')
    } finally {
      setBusy(false)
    }
  }

  async function replanNow() {
    if (!snap) return
    setAgentBusy(true)
    setAgentMsg(null)
    const r = await runAgentTick(snap.mission.id, 'MANUAL')
    setAgentBusy(false)
    setActivityKey((k) => k + 1)
    if (!r.success) {
      setAgentMsg(r.error ?? 'The agent could not run — the plan is unchanged.')
      return
    }
    setAgentMsg(
      r.applied
        ? `Agent: ${r.decision} — plan updated.`
        : r.rejected_reason
          ? `Agent: ${r.decision} rejected (${r.rejected_reason}).`
          : `Agent: ${r.decision} — no change needed.`,
    )
    await load()
  }

  async function onNoteAction(note: StudyNotification, intent: string) {
    if (intent === 'add_session' && snap) {
      try {
        await regeneratePlan(snap)
      } catch {
        /* best effort */
      }
    }
    await markNotificationRead(note.id)
    setNotes((prev) => prev.filter((n) => n.id !== note.id))
    await load()
  }

  async function dismissNote(note: StudyNotification) {
    await markNotificationRead(note.id)
    setNotes((prev) => prev.filter((n) => n.id !== note.id))
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to="/missions"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Study Missions
      </Link>

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="title-serif text-3xl">{mission.title}</h1>
          {diagnosed && <ConfidenceBadge confidence={conf.confidence} />}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-sm text-muted">
          <CalendarClock className="h-4 w-4" />
          {subject?.name ?? mission.subject_id} · exam {mission.exam_date} ·{' '}
          {conf.days_remaining} days left
        </div>
      </header>

      {notes.length > 0 && (
        <div className="mb-6 flex flex-col gap-3">
          {notes.map((n) => (
            <NotificationCard
              key={n.id}
              notification={n}
              onAction={(intent) => void onNoteAction(n, intent)}
              onDismiss={() => void dismissNote(n)}
            />
          ))}
        </div>
      )}

      {!diagnosed && (
        <Panel className="mb-6 flex flex-col items-start gap-3 p-5">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-edge bg-panel-2 text-mana-bright">
            <Stethoscope className="h-5 w-5" />
          </span>
          <div className="font-bold">Run the diagnostic</div>
          <p className="text-sm text-muted">
            The plan needs a starting point. Answer two quick questions per topic
            and the agent will draft your schedule.
          </p>
          <Link to={`/missions/${mission.id}/diagnostic`}>
            <Btn variant="primary">Start diagnostic</Btn>
          </Link>
        </Panel>
      )}

      {diagnosed && (
        <>
          <Panel className="mb-6 grid grid-cols-3 gap-4 p-5 text-center">
            <Stat label="Days remaining" value={conf.days_remaining} />
            <Stat label="Sessions needed" value={conf.required_sessions} />
            <Stat label="Sessions available" value={conf.available_sessions} />
          </Panel>

          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
              Topics
            </h2>
            <div className="flex gap-2">
              <Btn onClick={replanNow} disabled={agentBusy || busy}>
                <span className="flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 opacity-70" />
                  {agentBusy ? 'Agent working…' : 'Re-plan now'}
                </span>
              </Btn>
              <Btn onClick={rebuild} disabled={busy || agentBusy}>
                <span className="flex items-center gap-1.5">
                  <RefreshCw className="h-4 w-4 opacity-70" />
                  {busy ? 'Rebuilding…' : 'Rebuild plan'}
                </span>
              </Btn>
            </div>
          </div>
          {agentMsg && (
            <p className="mb-4 text-xs text-muted">{agentMsg}</p>
          )}

          <div className="mb-8 grid gap-3 sm:grid-cols-2">
            {topics.map((mt) => {
              const tm = masteryByTopic.get(mt.topic_id)
              const topic = getTopic(mission.subject_id, mt.topic_id)
              const upcoming = pending.find((s) => s.topic_id === mt.topic_id)
              return (
                <Panel key={mt.id} className="flex flex-col gap-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">
                      {topic?.name ?? mt.topic_id}
                    </span>
                    {tm && <StrategyPill level={tm.strategy_level} />}
                  </div>
                  <MasteryBar value={tm?.mastery_score ?? 0} />
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>
                      {tm?.consecutive_flat_sessions
                        ? `${tm.consecutive_flat_sessions} flat session${
                            tm.consecutive_flat_sessions > 1 ? 's' : ''
                          }`
                        : 'Progressing'}
                    </span>
                    <span>
                      {upcoming
                        ? `Next: ${SESSION_KIND_LABEL[upcoming.kind]}`
                        : 'No session queued'}
                    </span>
                  </div>
                </Panel>
              )
            })}
          </div>

          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
              Schedule
            </h2>
            {nextSession && (
              <Link to={`/missions/${mission.id}/s/${nextSession.id}`}>
                <Btn variant="primary">Practice next</Btn>
              </Link>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {sessions.length === 0 && (
              <Panel className="p-4 text-sm text-muted">
                No sessions scheduled. Use “Rebuild plan”.
              </Panel>
            )}
            {sessions.map((s, i) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.02, 0.3) }}
              >
                <SessionRow
                  missionId={mission.id}
                  subjectId={mission.subject_id}
                  session={s}
                />
              </motion.div>
            ))}
          </div>

          <div className="mt-8">
            <AgentActivity missionId={mission.id} refreshKey={activityKey} />
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-2xl font-black text-ink">{value}</div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
    </div>
  )
}

function SessionRow({
  missionId,
  subjectId,
  session,
}: {
  missionId: string
  subjectId: string
  session: PlanSession
}) {
  const topic = getTopic(subjectId, session.topic_id)
  const days = daysBetween(new Date(), session.scheduled_date)
  const when =
    days === 0
      ? 'Today'
      : days === 1
        ? 'Tomorrow'
        : days > 1
          ? `In ${days} days`
          : `${-days} day${days === -1 ? '' : 's'} ago`

  const icon =
    session.status === 'done' ? (
      <Check className="h-4 w-4 text-heal" />
    ) : session.status === 'missed' ? (
      <X className="h-4 w-4 text-hp" />
    ) : (
      <CircleDashed className="h-4 w-4 text-muted" />
    )

  const body = (
    <Panel
      className={`flex items-center gap-3 p-3 ${
        session.status === 'pending' ? 'transition hover:border-mana' : 'opacity-80'
      }`}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-semibold">
          {topic?.name ?? session.topic_id}
          <span className="rounded-md border border-edge px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
            {SESSION_KIND_LABEL[session.kind]}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-muted">
          {session.scheduled_date} · {when} · {session.item_count} items
        </div>
      </div>
    </Panel>
  )

  if (session.status === 'pending') {
    return (
      <Link to={`/missions/${missionId}/s/${session.id}`} className="block">
        {body}
      </Link>
    )
  }
  return body
}
