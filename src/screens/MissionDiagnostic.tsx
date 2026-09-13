import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Sparkles, Stethoscope } from 'lucide-react'
import { generateEnemyQuestion, gradeBattleAnswer, AiError } from '../lib/ai'
import { getSubject, getTopic } from '../game/atlas'
import { useApp, selectLevel } from '../store'
import {
  fetchMissionSnapshot,
  seedDiagnosticAndPlan,
  type DiagnosticResult,
} from '../study/db'
import { DIAGNOSTIC_ITEMS_PER_TOPIC } from '../study/config'
import type { GradedItem, MissionSnapshot } from '../study/types'
import { QuestionCard } from '../components/QuestionCard'
import { Panel, Btn, Spinner } from '../components/ui'

type Phase = 'boot' | 'loading' | 'answering' | 'checked' | 'seeding' | 'error'

interface QueueItem {
  topicId: string
  topicName: string
}

export function MissionDiagnostic() {
  const { missionId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const level = useApp(selectLevel)
  const built = (location.state ?? null) as
    | { builtBy?: string; summary?: string; unmapped?: string[] }
    | null

  const [snapshot, setSnapshot] = useState<MissionSnapshot | null>(null)
  const [phase, setPhase] = useState<Phase>('boot')
  const [error, setError] = useState<string | null>(null)

  const [qi, setQi] = useState(0)
  const [guidance, setGuidance] = useState('')
  const [question, setQuestion] = useState('')
  const [expectedConcept, setExpectedConcept] = useState('')
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState<{ correct: boolean; text: string } | null>(
    null,
  )
  const results = useRef<DiagnosticResult[]>([])
  const loadingFor = useRef<number | null>(null)

  const subject = getSubject(snapshot?.mission.subject_id)

  const queue = useMemo<QueueItem[]>(() => {
    if (!snapshot || !subject) return []
    const out: QueueItem[] = []
    for (const mt of snapshot.topics) {
      const topic = getTopic(subject.id, mt.topic_id)
      for (let k = 0; k < DIAGNOSTIC_ITEMS_PER_TOPIC; k++) {
        out.push({ topicId: mt.topic_id, topicName: topic?.name ?? mt.topic_id })
      }
    }
    return out
  }, [snapshot, subject])

  // Load the mission; bounce if the diagnostic is already done.
  useEffect(() => {
    if (!missionId) return
    let live = true
    fetchMissionSnapshot(missionId)
      .then((s) => {
        if (!live) return
        if (!s) {
          setError('Mission not found')
          setPhase('error')
          return
        }
        results.current = []
        setSnapshot(s)
      })
      .catch((e) => {
        if (!live) return
        setError(e.message)
        setPhase('error')
      })
    return () => {
      live = false
    }
  }, [missionId])

  const alreadySeeded =
    !!snapshot && snapshot.mastery.length >= snapshot.topics.length &&
    snapshot.topics.length > 0

  async function loadQuestion(index: number) {
    if (!subject || !queue[index] || loadingFor.current === index) return
    loadingFor.current = index
    setPhase('loading')
    setError(null)
    setAnswer('')
    setFeedback(null)
    setGuidance('')
    try {
      const q = await generateEnemyQuestion({
        subject: subject.name,
        topic: queue[index].topicName,
        level,
        difficulty: 'easy',
      })
      setGuidance(q.guidance)
      setQuestion(q.question)
      setExpectedConcept(q.expectedConcept)
      setPhase('answering')
    } catch (e) {
      setError(e instanceof AiError ? e.message : 'Could not load the question')
      setPhase('answering')
    } finally {
      loadingFor.current = null
    }
  }

  // Kick off the first question once the mission is loaded (run-once).
  const started = useRef(false)
  useEffect(() => {
    if (started.current || !snapshot || alreadySeeded || !queue.length) return
    started.current = true
    void loadQuestion(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, queue.length])

  if (phase === 'error') {
    return (
      <div className="mx-auto max-w-xl">
        <Panel className="border-hp/40 p-5 text-sm text-hp">
          {error ?? 'Something went wrong.'}
        </Panel>
      </div>
    )
  }
  if (alreadySeeded && missionId) {
    return <Navigate to={`/missions/${missionId}`} replace />
  }

  const current = queue[qi]

  async function submit() {
    if (!answer.trim() || !subject || !current) return
    setPhase('checked')
    setError(null)
    try {
      const g = await gradeBattleAnswer({
        subject: subject.name,
        topic: current.topicName,
        level,
        question,
        expectedConcept,
        studentAnswer: answer.trim(),
      })
      const item: GradedItem = { correct: g.correct, quality: g.quality }
      const bucket = results.current.find((r) => r.topic_id === current.topicId)
      if (bucket) bucket.items.push(item)
      else results.current.push({ topic_id: current.topicId, items: [item] })
      setFeedback({ correct: g.correct, text: g.feedback })
    } catch (e) {
      setError(e instanceof AiError ? e.message : 'Grading failed')
      setPhase('answering')
    }
  }

  async function next() {
    const nextIndex = qi + 1
    if (nextIndex < queue.length) {
      setQi(nextIndex)
      await loadQuestion(nextIndex)
      return
    }
    // Done — seed mastery + build the first plan.
    if (!snapshot) return
    setPhase('seeding')
    try {
      await seedDiagnosticAndPlan(snapshot, results.current)
      navigate(`/missions/${snapshot.mission.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the diagnostic')
      setPhase('checked')
    }
  }

  const progress = queue.length ? Math.round((qi / queue.length) * 100) : 0

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-4 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl border border-edge bg-panel-2 text-mana-bright">
          <Stethoscope className="h-5 w-5" />
        </span>
        <div>
          <h1 className="title-serif text-2xl">Diagnostic</h1>
          <p className="text-xs text-muted">
            {snapshot?.mission.title} · {DIAGNOSTIC_ITEMS_PER_TOPIC} questions per
            topic
          </p>
        </div>
      </header>

      {built?.builtBy === 'agent' && built.summary && (
        <Panel className="mb-4 flex items-start gap-3 border-mana/40 bg-mana/5 p-4">
          <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-mana-bright" />
          <div className="text-sm">
            <span className="font-bold text-mana-bright">ARIA</span>
            <p className="mt-1 text-ink">{built.summary}</p>
            {built.unmapped && built.unmapped.length > 0 && (
              <p className="mt-1 text-xs text-muted">
                Couldn't place: {built.unmapped.join(', ')}. Add these by hand
                from the Calendar if you need them.
              </p>
            )}
          </div>
        </Panel>
      )}

      <div className="mb-4">
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>
            Question {Math.min(qi + 1, queue.length)} of {queue.length}
          </span>
          <span>{current?.topicName}</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full border border-edge bg-void">
          <div
            className="h-full rounded-full bg-mana transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <Panel className="p-5">
        {(phase === 'loading' || phase === 'boot') && (
          <Spinner label="Preparing the question…" />
        )}
        {phase === 'seeding' && (
          <Spinner label="Scoring your diagnostic and drafting the plan…" />
        )}

        {(phase === 'answering' || phase === 'checked') && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <QuestionCard lead={guidance} question={question} />

            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={4}
              disabled={phase === 'checked'}
              placeholder="Your answer, show your reasoning."
              className="mt-3 w-full resize-none rounded-xl border border-edge bg-void p-3 text-sm outline-none focus:border-mana disabled:opacity-60"
            />

            {phase === 'answering' && (
              <Btn
                variant="primary"
                className="mt-3"
                onClick={submit}
                disabled={!answer.trim()}
              >
                Submit answer
              </Btn>
            )}

            {phase === 'checked' && feedback && (
              <div className="mt-3">
                <div
                  className={`text-sm font-bold ${
                    feedback.correct ? 'text-heal' : 'text-hp'
                  }`}
                >
                  {feedback.correct ? 'Correct' : 'Not quite'}
                </div>
                <p className="mt-1 text-sm text-muted">{feedback.text}</p>
                <Btn variant="primary" className="mt-3" onClick={next}>
                  {qi + 1 < queue.length ? 'Next question' : 'Finish diagnostic'}
                </Btn>
              </div>
            )}

            {phase === 'checked' && !feedback && (
              <div className="mt-3 flex items-center gap-2 text-sm text-muted">
                <Spinner label="Checking…" />
              </div>
            )}
          </motion.div>
        )}

        {error && (
          <div className="mt-3 rounded-lg border border-hp/40 bg-hp/10 p-2 text-sm text-hp">
            {error}
          </div>
        )}
      </Panel>

      <p className="mt-3 text-xs text-muted">
        The AI writes and scores these questions. It never sees a mastery number:
        that is computed here from whether you were right and how sound your
        reasoning was.
      </p>
    </div>
  )
}
