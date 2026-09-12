import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Target, Trophy } from 'lucide-react'
import {
  askAria,
  generateEnemyQuestion,
  gradeBattleAnswer,
  AiError,
} from '../lib/ai'
import { getSubject, getTopic } from '../game/atlas'
import { useApp, selectLevel } from '../store'
import {
  fetchMissionSnapshot,
  fetchPreparedItems,
  recordMissionSession,
} from '../study/db'
import { runAgentTick } from '../study/agent'
import { SESSION_ITEM_COUNT, TARGET_MASTERY_DEFAULT } from '../study/config'
import { difficultyForStrategy, STRATEGY_PLAN } from '../study/strategy'
import type {
  GradedItem,
  MasteryUpdate,
  MissionSnapshot,
  PlanSession,
  PreparedItem,
} from '../study/types'
import { QuestionCard } from '../components/QuestionCard'
import { AriaSpeech, type AriaLine } from '../components/AriaSpeech'
import { MasteryBar, StrategyPill } from '../study/ui'
import { Panel, Btn, Spinner, Chip } from '../components/ui'

type Phase = 'boot' | 'loading' | 'answering' | 'checked' | 'saving' | 'done' | 'error'

/** The base difficulty a NORMAL mission item sits at; strategy shifts it down. */
const MISSION_BASE_TIER = 'medium' as const

let seq = 0

export function MissionSession() {
  const { missionId, planSessionId } = useParams()
  const navigate = useNavigate()
  const level = useApp(selectLevel)

  const [snap, setSnap] = useState<MissionSnapshot | null>(null)
  const [planSession, setPlanSession] = useState<PlanSession | null>(null)
  const [phase, setPhase] = useState<Phase>('boot')
  const [error, setError] = useState<string | null>(null)

  const [idx, setIdx] = useState(0)
  const [guidance, setGuidance] = useState('')
  const [question, setQuestion] = useState('')
  const [expectedConcept, setExpectedConcept] = useState('')
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState<{ correct: boolean; text: string } | null>(
    null,
  )
  const [lines, setLines] = useState<AriaLine[]>([])
  const [assisting, setAssisting] = useState(false)
  const [result, setResult] = useState<MasteryUpdate | null>(null)
  const [prepared, setPrepared] = useState(false)
  const items = useRef<GradedItem[]>([])
  const preItems = useRef<PreparedItem[] | null>(null)
  const loadingFor = useRef<number | null>(null)

  const subject = getSubject(snap?.mission.subject_id)
  const topic = planSession
    ? getTopic(snap?.mission.subject_id, planSession.topic_id)
    : undefined
  const strategy = planSession?.strategy_level ?? 'NORMAL'
  const itemCount = planSession?.item_count ?? SESSION_ITEM_COUNT
  const difficulty = useMemo(
    () => difficultyForStrategy(MISSION_BASE_TIER, strategy),
    [strategy],
  )

  const pushLine = (prompt: string, text: string) =>
    setLines((p) => [...p, { id: `m${++seq}`, prompt, text }])

  useEffect(() => {
    if (!missionId || !planSessionId) return
    let live = true
    Promise.all([
      fetchMissionSnapshot(missionId),
      fetchPreparedItems(planSessionId),
    ])
      .then(([s, prep]) => {
        if (!live) return
        const ps = s?.sessions.find((x) => x.id === planSessionId) ?? null
        if (!s || !ps) {
          setError('Session not found')
          setPhase('error')
          return
        }
        items.current = []
        preItems.current = prep
        setPrepared(!!prep)
        setSnap(s)
        setPlanSession(ps)
      })
      .catch((e) => {
        if (!live) return
        setError(e.message)
        setPhase('error')
      })
    return () => {
      live = false
    }
  }, [missionId, planSessionId])

  async function loadItem(which: number) {
    if (!subject || !topic || loadingFor.current === which) return
    loadingFor.current = which
    setPhase('loading')
    setError(null)
    setAnswer('')
    setFeedback(null)
    setGuidance('')
    try {
      // Scaffolding first when the topic is on a harder strategy level.
      for (const action of STRATEGY_PLAN[strategy].scaffold) {
        const text = await askAria(action, {
          subject: subject.name,
          topic: topic.name,
          level,
        })
        pushLine(action, text)
      }
      // Use the item the agent prepared earlier if there is one — instant.
      const pre = preItems.current?.[which]
      const q =
        pre ??
        (await generateEnemyQuestion({
          subject: subject.name,
          topic: topic.name,
          level,
          difficulty,
        }))
      setGuidance(q.guidance)
      setQuestion(q.question)
      setExpectedConcept(q.expectedConcept)
      setPhase('answering')
    } catch (e) {
      setError(e instanceof AiError ? e.message : 'Could not load the item')
      setPhase('answering')
    } finally {
      loadingFor.current = null
    }
  }

  const started = useRef(false)
  useEffect(() => {
    if (started.current || !snap || !planSession) return
    started.current = true
    void loadItem(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, planSession])

  if (phase === 'error') {
    return (
      <div className="mx-auto max-w-xl">
        <Panel className="border-hp/40 p-5 text-sm text-hp">
          {error ?? 'Something went wrong.'}
        </Panel>
      </div>
    )
  }
  if (planSession && planSession.status !== 'pending' && phase === 'boot') {
    return <Navigate to={`/missions/${missionId}`} replace />
  }

  async function submit() {
    if (!answer.trim() || !subject || !topic) return
    setPhase('checked')
    setError(null)
    try {
      const g = await gradeBattleAnswer({
        subject: subject.name,
        topic: topic.name,
        level,
        question,
        expectedConcept,
        studentAnswer: answer.trim(),
      })
      items.current.push({ correct: g.correct, quality: g.quality })
      setFeedback({ correct: g.correct, text: g.feedback })
      pushLine(g.correct ? 'Result' : 'Not quite', g.feedback)
    } catch (e) {
      setError(e instanceof AiError ? e.message : 'Grading failed')
      setPhase('answering')
    }
  }

  async function assist() {
    if (!subject || !topic) return
    setAssisting(true)
    try {
      const text = await askAria('hint', {
        subject: subject.name,
        topic: topic.name,
        level,
        problem: question,
      })
      pushLine('Give me a hint', text)
    } catch (e) {
      setError(e instanceof AiError ? e.message : 'ARIA is unavailable')
    } finally {
      setAssisting(false)
    }
  }

  async function next() {
    const n = idx + 1
    if (n < itemCount) {
      setIdx(n)
      await loadItem(n)
      return
    }
    if (!snap || !planSession) return
    setPhase('saving')
    try {
      const upd = await recordMissionSession({
        missionId: snap.mission.id,
        planSessionId: planSession.id,
        topicId: planSession.topic_id,
        targetMastery:
          snap.topics.find((t) => t.topic_id === planSession.topic_id)
            ?.target_mastery ?? TARGET_MASTERY_DEFAULT,
        items: items.current,
      })
      setResult(upd)
      setPhase('done')
      // Autonomous loop: let the agent react to the new mastery state. Best
      // effort — the session is already saved, so failures are swallowed.
      void runAgentTick(
        snap.mission.id,
        'SESSION_COMPLETED',
        `SESSION_COMPLETED:${planSession.id}`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the session')
      setPhase('checked')
    }
  }

  const done = phase === 'done' && result

  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[1.1fr_1fr]">
      <div className="flex flex-col gap-4">
        <button
          onClick={() => navigate(`/missions/${missionId}`)}
          className="inline-flex items-center gap-1.5 self-start text-sm text-muted hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> Study Plan
        </button>

        <Panel className="p-5">
          <div className="flex items-center justify-between text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-mana-bright" />
              {topic?.name ?? planSession?.topic_id}
            </span>
            <span className="flex items-center gap-2">
              {prepared && <Chip tone="heal">Prepped</Chip>}
              <StrategyPill level={strategy} />
              <span className="capitalize">{difficulty}</span>
            </span>
          </div>

          {!done && (
            <div className="mt-2">
              <div className="mb-1 flex justify-between text-xs text-muted">
                <span>
                  Item {Math.min(idx + 1, itemCount)} of {itemCount}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full border border-edge bg-void">
                <div
                  className="h-full rounded-full bg-mana transition-all"
                  style={{ width: `${(idx / itemCount) * 100}%` }}
                />
              </div>
            </div>
          )}

          {(phase === 'loading' || phase === 'boot') && (
            <div className="mt-4">
              <Spinner label="The item forms…" />
            </div>
          )}
          {phase === 'saving' && (
            <div className="mt-4">
              <Spinner label="Updating mastery…" />
            </div>
          )}

          {(phase === 'answering' || phase === 'checked') && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-2"
            >
              <QuestionCard lead={guidance} question={question} />
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={4}
                disabled={phase === 'checked'}
                placeholder="Your answer — show your reasoning."
                className="mt-3 w-full resize-none rounded-xl border border-edge bg-void p-3 text-sm outline-none focus:border-mana disabled:opacity-60"
              />
              {phase === 'answering' && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Btn
                    variant="primary"
                    onClick={submit}
                    disabled={!answer.trim()}
                  >
                    Submit
                  </Btn>
                  <Btn onClick={assist} disabled={assisting}>
                    Hint
                  </Btn>
                </div>
              )}
              {phase === 'checked' && feedback && (
                <div className="mt-3">
                  <div
                    className={`text-sm font-bold ${
                      feedback.correct ? 'text-heal' : 'text-hp'
                    }`}
                  >
                    {feedback.correct ? 'That holds up.' : 'Not there yet.'}
                  </div>
                  <Btn variant="primary" className="mt-3" onClick={next}>
                    {idx + 1 < itemCount ? 'Next item' : 'Finish session'}
                  </Btn>
                </div>
              )}
              {phase === 'checked' && !feedback && (
                <div className="mt-3">
                  <Spinner label="Checking…" />
                </div>
              )}
            </motion.div>
          )}

          {done && result && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mt-4 text-center"
            >
              <Trophy className="mx-auto h-9 w-9 text-xp" />
              <div className="mt-2 font-bold text-xp">Session complete</div>
              <p className="mt-1 text-sm text-muted">
                {result.correct}/{result.items} correct ·{' '}
                {result.flat
                  ? 'mastery held roughly flat'
                  : 'mastery moved forward'}
              </p>
              <div className="mx-auto mt-4 max-w-xs">
                <MasteryBar value={result.mastery_after} />
                <div className="mt-1 text-xs text-muted">
                  {Math.round(result.mastery_before * 100)}% →{' '}
                  {Math.round(result.mastery_after * 100)}%
                </div>
              </div>
              <div className="mt-4 flex justify-center gap-2">
                <Btn
                  variant="primary"
                  onClick={() => navigate(`/missions/${missionId}`)}
                >
                  Back to plan
                </Btn>
              </div>
            </motion.div>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-hp/40 bg-hp/10 p-2 text-sm text-hp">
              {error}
            </div>
          )}
        </Panel>
      </div>

      <Panel className="p-4">
        <AriaSpeech
          lines={lines}
          loading={assisting}
          emptyHint="Scaffolding, hints and feedback appear here. ARIA won’t hand you the answer."
        />
      </Panel>
    </div>
  )
}
