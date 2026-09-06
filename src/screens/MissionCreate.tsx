import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '../auth/auth-context'
import { SUBJECTS } from '../game/atlas'
import { createMission } from '../study/db'
import { toDayString } from '../study/dates'
import {
  TARGET_MASTERY_DEFAULT,
  SESSION_ITEM_COUNT,
} from '../study/config'
import { Panel, Btn } from '../components/ui'

const WEEK_OPTIONS = [2, 3, 4, 5, 6]
const MINUTE_OPTIONS = [15, 20, 30, 45, 60]

export function MissionCreate() {
  const { user, unconfigured } = useAuth()
  const navigate = useNavigate()

  const [title, setTitle] = useState('')
  const [subjectId, setSubjectId] = useState(SUBJECTS[0]?.id ?? '')
  const [topicIds, setTopicIds] = useState<string[]>([])
  const [examDate, setExamDate] = useState('')
  const [sessionsPerWeek, setSessionsPerWeek] = useState(4)
  const [minutesPerSession, setMinutesPerSession] = useState(30)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const subject = useMemo(
    () => SUBJECTS.find((s) => s.id === subjectId),
    [subjectId],
  )
  const minDate = toDayString(new Date())

  if (unconfigured) return <Navigate to="/missions" replace />

  const toggleTopic = (id: string) =>
    setTopicIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    )

  const changeSubject = (id: string) => {
    setSubjectId(id)
    setTopicIds([])
  }

  const valid =
    !!user &&
    !!subject &&
    topicIds.length > 0 &&
    !!examDate &&
    examDate >= minDate

  async function submit() {
    if (!valid || !user || !subject) return
    setBusy(true)
    setError(null)
    try {
      const id = await createMission({
        user_id: user.id,
        subject_id: subject.id,
        title: title.trim() || `${subject.name} Exam`,
        exam_date: examDate,
        sessions_per_week: sessionsPerWeek,
        minutes_per_session: minutesPerSession,
        topic_ids: topicIds,
        target_mastery: TARGET_MASTERY_DEFAULT,
      })
      navigate(`/missions/${id}/diagnostic`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the mission')
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to="/missions"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Study Missions
      </Link>

      <h1 className="title-serif mb-1 text-3xl">New mission</h1>
      <p className="mb-6 text-sm text-muted">
        Pick the subject and the exact topics your exam covers. A short
        diagnostic follows so the plan starts from where you actually are.
      </p>

      <Panel className="flex flex-col gap-5 p-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Mission name
          </span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={subject ? `${subject.name} Exam` : 'Physics Exam'}
            className="rounded-xl border border-edge bg-void p-2.5 text-sm outline-none focus:border-mana"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Subject
          </span>
          <select
            value={subjectId}
            onChange={(e) => changeSubject(e.target.value)}
            className="rounded-xl border border-edge bg-void p-2.5 text-sm outline-none focus:border-mana"
          >
            {SUBJECTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.continent} · {s.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Topics ({topicIds.length} selected)
          </span>
          <div className="grid gap-2 sm:grid-cols-2">
            {subject?.topics.map((t) => {
              const on = topicIds.includes(t.id)
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTopic(t.id)}
                  className={`rounded-xl border p-3 text-left text-sm transition ${
                    on
                      ? 'border-mana bg-mana/10 text-ink'
                      : 'border-edge bg-void hover:border-mana/60'
                  }`}
                >
                  <span className="font-semibold">{t.name}</span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {t.blurb}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted">
            Exam date
          </span>
          <input
            type="date"
            value={examDate}
            min={minDate}
            onChange={(e) => setExamDate(e.target.value)}
            className="rounded-xl border border-edge bg-void p-2.5 text-sm outline-none focus:border-mana"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Sessions per week
            </span>
            <select
              value={sessionsPerWeek}
              onChange={(e) => setSessionsPerWeek(Number(e.target.value))}
              className="rounded-xl border border-edge bg-void p-2.5 text-sm outline-none focus:border-mana"
            >
              {WEEK_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} sessions
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Minutes per session
            </span>
            <select
              value={minutesPerSession}
              onChange={(e) => setMinutesPerSession(Number(e.target.value))}
              className="rounded-xl border border-edge bg-void p-2.5 text-sm outline-none focus:border-mana"
            >
              {MINUTE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} min
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="text-xs text-muted">
          Target mastery {Math.round(TARGET_MASTERY_DEFAULT * 100)}% ·{' '}
          {SESSION_ITEM_COUNT} practice items per session.
        </p>

        {error && (
          <div className="rounded-lg border border-hp/40 bg-hp/10 p-2 text-sm text-hp">
            {error}
          </div>
        )}

        <Btn variant="primary" onClick={submit} disabled={!valid || busy}>
          {busy ? 'Creating…' : 'Create mission & start diagnostic'}
        </Btn>
      </Panel>
    </div>
  )
}
