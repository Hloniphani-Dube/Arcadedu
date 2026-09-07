import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ArrowLeft, Sparkles, PenLine } from 'lucide-react'
import { useAuth } from '../auth/auth-context'
import { SUBJECTS } from '../game/atlas'
import { createMission, createMissionFromSyllabus } from '../study/db'
import { toDayString } from '../study/dates'
import { TARGET_MASTERY_DEFAULT, SESSION_ITEM_COUNT } from '../study/config'
import { Panel, Btn, Spinner } from '../components/ui'

const WEEK_OPTIONS = [2, 3, 4, 5, 6]
const MINUTE_OPTIONS = [15, 20, 30, 45, 60]
const INPUT =
  'border-2 border-edge bg-void p-2.5 text-sm outline-none focus:border-mana'

const CATALOG = SUBJECTS.map((s) => ({
  id: s.id,
  name: s.name,
  topics: s.topics.map((t) => ({ id: t.id, name: t.name })),
}))

const SAMPLE = `PHYS 201 — Mechanics & Waves
Midterm: mechanics (kinematics, forces, momentum) — Oct 14
Final exam: Nov 28, covers everything plus waves and oscillations
Problem set 4 due Oct 21
Lab report: simple harmonic motion — Nov 4`

export function MissionCreate() {
  const { user, unconfigured } = useAuth()
  const navigate = useNavigate()

  const [mode, setMode] = useState<'agent' | 'manual'>('agent')

  // agent mode
  const [syllabus, setSyllabus] = useState('')
  const [agentBusy, setAgentBusy] = useState(false)

  // manual mode
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
    setTopicIds((p) => (p.includes(id) ? p.filter((t) => t !== id) : [...p, id]))

  const manualValid =
    !!user && !!subject && topicIds.length > 0 && !!examDate && examDate >= minDate

  async function buildFromSyllabus() {
    if (!user || syllabus.trim().length < 20) return
    setAgentBusy(true)
    setError(null)
    try {
      const r = await createMissionFromSyllabus({
        user_id: user.id,
        syllabusText: syllabus.trim(),
        subjectCatalog: CATALOG,
      })
      navigate(`/missions/${r.missionId}/diagnostic`, {
        state: {
          builtBy: 'agent',
          summary: `Built "${r.title}" — ${r.topicCount} topic${r.topicCount === 1 ? '' : 's'}, ${r.eventCount} date${r.eventCount === 1 ? '' : 's'} added to your calendar.`,
          unmapped: r.unmapped,
        },
      })
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'The agent could not read that — try “Fill it in” instead.',
      )
      setAgentBusy(false)
    }
  }

  async function submitManual() {
    if (!manualValid || !user || !subject) return
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

      <h1 className="title-serif mb-2">New mission</h1>
      <p className="mb-5 max-w-prose text-sm text-muted">
        Give the agent your syllabus and it builds the whole thing — topics,
        schedule, calendar dates. Or fill it in yourself.
      </p>

      <div className="mb-5 flex gap-2">
        <Btn
          variant={mode === 'agent' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setMode('agent')}
        >
          <Sparkles className="h-3.5 w-3.5" /> Paste a syllabus
        </Btn>
        <Btn
          variant={mode === 'manual' ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setMode('manual')}
        >
          <PenLine className="h-3.5 w-3.5" /> Fill it in
        </Btn>
      </div>

      {error && (
        <Panel className="mb-4 border-hp/50 bg-hp/10 p-3 text-sm text-hp">
          {error}
        </Panel>
      )}

      {mode === 'agent' ? (
        <Panel className="flex flex-col gap-3 p-5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">
            Your syllabus, course outline or assignment brief
          </label>
          <textarea
            value={syllabus}
            onChange={(e) => setSyllabus(e.target.value)}
            rows={12}
            placeholder={SAMPLE}
            className={`${INPUT} resize-y font-[family-name:var(--font-body)]`}
          />
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setSyllabus(SAMPLE)}
              className="text-xs text-mana-bright hover:underline"
            >
              Use the example
            </button>
            <span className="text-xs text-muted">
              {syllabus.trim().length} chars
            </span>
          </div>
          <Btn
            variant="primary"
            onClick={buildFromSyllabus}
            disabled={agentBusy || syllabus.trim().length < 20}
          >
            {agentBusy ? (
              <Spinner label="The agent is building your mission…" />
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Let the agent build it
              </>
            )}
          </Btn>
          <p className="text-xs text-muted">
            The agent maps your text onto Atlas topics, picks a cadence, and adds
            every dated item to your calendar. You review the plan after a short
            diagnostic. It never sees or does your actual coursework.
          </p>
        </Panel>
      ) : (
        <Panel className="flex flex-col gap-5 p-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Mission name
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={subject ? `${subject.name} Exam` : 'Physics Exam'}
              className={INPUT}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">
              Subject
            </span>
            <select
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value)
                setTopicIds([])
              }}
              className={INPUT}
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
                    className={`border-2 p-3 text-left text-sm transition ${
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
              className={INPUT}
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
                className={INPUT}
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
                className={INPUT}
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

          <Btn
            variant="primary"
            onClick={submitManual}
            disabled={!manualValid || busy}
          >
            {busy ? 'Creating…' : 'Create mission & start diagnostic'}
          </Btn>
        </Panel>
      )}
    </div>
  )
}
