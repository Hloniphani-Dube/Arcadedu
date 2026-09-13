import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  CalendarClock,
  Check,
  CircleDashed,
  FileText,
  Mail,
  RefreshCw,
  ScrollText,
  Sparkles,
  Stethoscope,
  X,
} from 'lucide-react'
import { useAuth } from '../auth/auth-context'
import { getSubject, getTopic } from '../game/atlas'
import { useApp, selectLevel } from '../store'
import {
  fetchAgentEvents,
  fetchArtifacts,
  fetchMissionSnapshot,
  fetchNotifications,
  generateRevisionSheet,
  markMissedSessions,
  markNotificationRead,
  prepareSession,
  regeneratePlan,
  requestMessageDraft,
  requestProgressReport,
  setArtifactStatus,
  weeklyFacts,
} from '../study/db'
import { runAgentTick } from '../study/agent'
import { calculatePlanConfidence } from '../study/confidence'
import { daysBetween } from '../study/dates'
import type {
  MissionArtifact,
  MissionSnapshot,
  PlanSession,
  StudyNotification,
} from '../study/types'
import { ConfidenceBadge, MasteryBar, StrategyPill } from '../study/ui'
import { SESSION_KIND_LABEL } from '../study/labels'
import { AgentActivity } from '../study/AgentActivity'
import { ArtifactCard } from '../study/ArtifactCard'
import { NotificationCard } from '../study/NotificationCard'
import {
  Panel,
  Btn,
  Spinner,
  SectionTitle,
  Stat,
  Chip,
  EmptyState,
} from '../components/ui'

export function StudyPlan() {
  const { missionId } = useParams()
  const { user } = useAuth()
  const playerLevel = useApp(selectLevel)
  const [snap, setSnap] = useState<MissionSnapshot | null>(null)
  const [notes, setNotes] = useState<StudyNotification[]>([])
  const [artifacts, setArtifacts] = useState<MissionArtifact[]>([])
  const [brief, setBrief] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [agentBusy, setAgentBusy] = useState(false)
  const [agentMsg, setAgentMsg] = useState<string | null>(null)
  const [working, setWorking] = useState<string | null>(null)
  const [activityKey, setActivityKey] = useState(0)

  const load = useCallback(async () => {
    if (!missionId) return
    try {
      await markMissedSessions(missionId)
      const [s, arts, events] = await Promise.all([
        fetchMissionSnapshot(missionId),
        fetchArtifacts(missionId),
        fetchAgentEvents(missionId, 30),
      ])
      if (!s) {
        setError('Mission not found')
        return
      }
      setSnap(s)
      setArtifacts(arts)
      setBrief(weeklyFacts(s, events))
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

  // The agent prepares the next session's items ahead of time (run once).
  const preppedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!snap) return
    const next = snap.sessions.find((s) => s.status === 'pending')
    if (!next || preppedFor.current === next.id) return
    if (artifacts.some((a) => a.plan_session_id === next.id)) {
      preppedFor.current = next.id
      return
    }
    preppedFor.current = next.id
    const topic = getTopic(snap.mission.subject_id, next.topic_id)
    void prepareSession(snap.mission.id, next, {
      subjectName: getSubject(snap.mission.subject_id)?.name ?? snap.mission.subject_id,
      topicName: topic?.name ?? next.topic_id,
      level: playerLevel,
    }).then((a) => {
      if (a) setArtifacts((prev) => [a, ...prev])
    })
  }, [snap, artifacts, playerLevel])

  if (error) {
    return <Panel className="border-hp/40 p-5 text-sm text-hp">{error}</Panel>
  }
  if (!snap) {
    return (
      <Panel className="p-5">
        <Spinner label="Loading the plan…" />
      </Panel>
    )
  }

  const { mission, topics, mastery, sessions } = snap
  const subject = getSubject(mission.subject_id)
  const subjectName = subject?.name ?? mission.subject_id
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
      setAgentMsg(r.error ?? 'The agent could not run. The plan is unchanged.')
      return
    }
    setAgentMsg(
      r.applied
        ? `Agent: ${r.decision}, plan updated.`
        : r.rejected_reason
          ? `Agent: ${r.decision} rejected (${r.rejected_reason}).`
          : `Agent: ${r.decision}, no change needed.`,
    )
    await load()
  }

  async function makeRevisionSheet(topicId: string) {
    if (!snap) return
    setWorking(`rev:${topicId}`)
    try {
      await generateRevisionSheet(
        snap.mission.id,
        topicId,
        {
          subjectName,
          topicName: getTopic(mission.subject_id, topicId)?.name ?? topicId,
          level: playerLevel,
        },
        'you',
      )
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not write the sheet')
    } finally {
      setWorking(null)
    }
  }

  async function makeProgressReport() {
    if (!snap) return
    setWorking('report')
    try {
      const events = await fetchAgentEvents(snap.mission.id, 30)
      await requestProgressReport(snap, events, subjectName)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not write the report')
    } finally {
      setWorking(null)
    }
  }

  async function makeEmailDraft() {
    if (!snap) return
    const details = window.prompt(
      'What should the email say? A sentence or two in your own words. The agent will phrase it, not invent anything.',
    )
    if (!details?.trim()) return
    setWorking('email')
    try {
      await requestMessageDraft(snap.mission.id, {
        messageKind: 'extension_request',
        subject: subjectName,
        details: details.trim(),
        studentName: user?.email?.split('@')[0],
      })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not draft the message')
    } finally {
      setWorking(null)
    }
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

  async function setArtifact(id: string, status: 'ready' | 'archived') {
    await setArtifactStatus(id, status)
    setArtifacts((prev) =>
      status === 'archived'
        ? prev.filter((a) => a.id !== id)
        : prev.map((a) => (a.id === id ? { ...a, status } : a)),
    )
  }

  return (
    <div>
      <Link
        to="/missions"
        className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Study Missions
      </Link>

      <header className="bg-grid -mx-4 mb-6 border-b-2 border-edge px-4 pb-6 pt-4 md:-mx-8 md:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="title-serif">{mission.title}</h1>
          {diagnosed && <ConfidenceBadge confidence={conf.confidence} />}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-sm text-muted">
          <CalendarClock className="h-4 w-4" />
          {subjectName} · exam {mission.exam_date} · {conf.days_remaining} days left
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
        <EmptyState
          icon={<Stethoscope className="h-5 w-5" />}
          title="Run the diagnostic"
          action={
            <Link to={`/missions/${mission.id}/diagnostic`}>
              <Btn variant="primary">Start diagnostic</Btn>
            </Link>
          }
        >
          The plan needs a starting point. Answer two quick questions per topic
          and the agent will draft your schedule.
        </EmptyState>
      )}

      {diagnosed && (
        <>
          {brief.length > 0 && (
            <Panel className="mb-6 border-mana/40 bg-mana/5 p-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-mana-bright">
                <Sparkles className="h-3.5 w-3.5" /> What the agent did lately
              </div>
              <ul className="list-disc pl-5 text-sm text-muted">
                {brief.slice(0, 6).map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel className="mb-6 grid grid-cols-3 gap-4 p-5">
            <Stat label="Days remaining" value={conf.days_remaining} />
            <Stat label="Sessions needed" value={conf.required_sessions} tone="mana" />
            <Stat
              label="Sessions available"
              value={conf.available_sessions}
              tone="heal"
            />
          </Panel>

          <SectionTitle
            actions={
              <>
                <Btn
                  variant="accent"
                  size="sm"
                  onClick={replanNow}
                  disabled={agentBusy || busy}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {agentBusy ? 'Agent working…' : 'Re-plan now'}
                </Btn>
                <Btn size="sm" onClick={rebuild} disabled={busy || agentBusy}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  {busy ? 'Rebuilding…' : 'Rebuild'}
                </Btn>
              </>
            }
          >
            Topics
          </SectionTitle>
          {agentMsg && <p className="-mt-1 mb-4 text-xs text-muted">{agentMsg}</p>}

          <div className="mb-8 grid gap-3 sm:grid-cols-2">
            {topics.map((mt) => {
              const tm = masteryByTopic.get(mt.topic_id)
              const topic = getTopic(mission.subject_id, mt.topic_id)
              const upcoming = pending.find((s) => s.topic_id === mt.topic_id)
              return (
                <Panel key={mt.id} className="flex flex-col gap-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">{topic?.name ?? mt.topic_id}</span>
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
                  <Btn
                    size="sm"
                    onClick={() => void makeRevisionSheet(mt.topic_id)}
                    disabled={working === `rev:${mt.topic_id}`}
                  >
                    <ScrollText className="h-3.5 w-3.5" />
                    {working === `rev:${mt.topic_id}`
                      ? 'Writing…'
                      : 'Revision sheet'}
                  </Btn>
                </Panel>
              )
            })}
          </div>

          {artifacts.length > 0 && (
            <>
              <SectionTitle>Prepared for you</SectionTitle>
              <div className="mb-8 flex flex-col gap-3">
                {artifacts.map((a) => (
                  <ArtifactCard
                    key={a.id}
                    artifact={a}
                    onApprove={
                      a.status === 'draft'
                        ? () => void setArtifact(a.id, 'ready')
                        : undefined
                    }
                    onArchive={() => void setArtifact(a.id, 'archived')}
                  />
                ))}
              </div>
            </>
          )}

          <SectionTitle
            actions={
              <>
                <Btn
                  size="sm"
                  onClick={makeProgressReport}
                  disabled={working === 'report'}
                >
                  <FileText className="h-3.5 w-3.5" />
                  {working === 'report' ? 'Writing…' : 'Progress report'}
                </Btn>
                <Btn
                  size="sm"
                  onClick={makeEmailDraft}
                  disabled={working === 'email'}
                >
                  <Mail className="h-3.5 w-3.5" />
                  {working === 'email' ? 'Drafting…' : 'Draft an email'}
                </Btn>
              </>
            }
          >
            Ask the agent to write
          </SectionTitle>
          <p className="-mt-1 mb-6 text-xs text-muted">
            The agent drafts; you review and send. Nothing leaves without you.
          </p>

          <SectionTitle
            actions={
              nextSession && (
                <Link to={`/missions/${mission.id}/s/${nextSession.id}`}>
                  <Btn variant="primary" size="sm">
                    Practice next
                  </Btn>
                </Link>
              )
            }
          >
            Schedule
          </SectionTitle>

          <div className="flex flex-col gap-2">
            {sessions.length === 0 && (
              <Panel className="p-4 text-sm text-muted">
                No sessions scheduled. Use “Rebuild”.
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
                  prepared={artifacts.some(
                    (a) => a.plan_session_id === s.id && a.status === 'ready',
                  )}
                />
              </motion.div>
            ))}
          </div>

          <div className="mt-10">
            <AgentActivity missionId={mission.id} refreshKey={activityKey} />
          </div>
        </>
      )}
    </div>
  )
}

function SessionRow({
  missionId,
  subjectId,
  session,
  prepared,
}: {
  missionId: string
  subjectId: string
  session: PlanSession
  prepared?: boolean
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
      interactive={session.status === 'pending'}
      className={`flex items-center gap-3 p-3 ${session.status === 'pending' ? '' : 'opacity-75'}`}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {topic?.name ?? session.topic_id}
          <Chip>{SESSION_KIND_LABEL[session.kind]}</Chip>
          {prepared && session.status === 'pending' && (
            <Chip tone="heal">Ready</Chip>
          )}
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
