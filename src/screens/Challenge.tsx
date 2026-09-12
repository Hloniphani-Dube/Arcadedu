import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Lightbulb, Wrench, Trophy, RotateCcw, Crown } from 'lucide-react'
import {
  askAria,
  gradeBattleAnswer,
  generateEnemyQuestion,
  generateBossChallenge,
  gradeBossAnswer,
  AiError,
} from '../lib/ai'
import type { GradedAnswer } from '../lib/types'
import { xpReward } from '../game/engine'
import { getSubject, getTopic, getNode } from '../game/atlas'
import {
  useApp,
  selectLevel,
  selectNodeUnlocked,
  selectSubjectProgress,
} from '../store'
import { AriaSpeech, type AriaLine } from '../components/AriaSpeech'
import { QuestionCard } from '../components/QuestionCard'
import { Btn, Panel, Spinner } from '../components/ui'

type Phase = 'loading' | 'answering' | 'result' | 'complete'

let seq = 0

export function Challenge() {
  const { subjectId, topicId, nodeId } = useParams()
  const navigate = useNavigate()

  const level = useApp(selectLevel)
  const app = useApp()
  const addXp = useApp((s) => s.addXp)
  const completeNode = useApp((s) => s.completeNode)
  const recordClear = useApp((s) => s.recordClear)

  const subject = getSubject(subjectId)
  const topic = getTopic(subjectId, topicId)
  const node = getNode(subjectId, topicId, nodeId)
  const isBoss = node?.kind === 'boss'

  const [phase, setPhase] = useState<Phase>('loading')
  const [guidance, setGuidance] = useState('')
  const [question, setQuestion] = useState('')
  const [expectedConcept, setExpectedConcept] = useState('')
  const [answer, setAnswer] = useState('')
  const [grade, setGrade] = useState<GradedAnswer | null>(null)
  const [lines, setLines] = useState<AriaLine[]>([])
  const [busy, setBusy] = useState(false)
  const [assisting, setAssisting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [xpGained, setXpGained] = useState(0)
  const started = useRef(false)

  const pushLine = (prompt: string, text: string) =>
    setLines((p) => [...p, { id: `c${++seq}`, prompt, text }])

  async function loadQuestion() {
    if (!subject || !topic || !node) return
    setPhase('loading')
    setError(null)
    setAnswer('')
    setGrade(null)
    setGuidance('')
    const ctx = { subject: subject.name, topic: topic.name, level }
    try {
      if (node.kind === 'boss') {
        const c = await generateBossChallenge(ctx)
        setGuidance(c.guidance)
        setQuestion(c.question)
        setExpectedConcept(c.expectedConcept)
      } else {
        const q = await generateEnemyQuestion({ ...ctx, difficulty: node.tier })
        setGuidance(q.guidance)
        setQuestion(q.question)
        setExpectedConcept(q.expectedConcept)
      }
      setPhase('answering')
    } catch (err) {
      setError(err instanceof AiError ? err.message : 'Failed to load the challenge')
      setPhase('answering')
    }
  }

  useEffect(() => {
    if (started.current || !node) return
    started.current = true
    void loadQuestion()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node])

  if (!subject || !topic || !node) return <Navigate to="/" replace />
  // Levels run in order — bounce direct links to a not-yet-reached node.
  if (!selectNodeUnlocked(app, subject.id, topic.id, node.id))
    return <Navigate to={`/s/${subject.id}/${topic.id}`} replace />

  const backToPath = `/s/${subject.id}/${topic.id}`

  async function submit() {
    if (!answer.trim() || !subject || !topic || !node) return
    setBusy(true)
    setError(null)
    try {
      const g = isBoss
        ? await gradeBossAnswer({
            subject: subject.name,
            topic: topic.name,
            level,
            question,
            expectedConcept,
            studentAnswer: answer.trim(),
          })
        : await gradeBattleAnswer({
            subject: subject.name,
            topic: topic.name,
            level,
            question,
            expectedConcept,
            studentAnswer: answer.trim(),
          })
      setGrade(g)
      pushLine(g.correct ? 'Result' : 'Not quite', g.feedback)

      const passed = g.correct && g.quality >= (isBoss ? 0.5 : 0.4)
      if (!passed) {
        setPhase('result')
        return
      }

      const gained = xpReward(isBoss ? 'boss' : node.tier, g)
      addXp(gained)
      setXpGained((x) => x + gained)
      completeNode(subject.id, topic.id, node.id)
      if (selectSubjectProgress(useApp.getState(), subject.id) >= 1) {
        recordClear(subject.id)
      }
      setPhase('complete')
    } catch (err) {
      setError(err instanceof AiError ? err.message : 'Grading failed')
    } finally {
      setBusy(false)
    }
  }

  async function assist(kind: 'hint' | 'explain_mistake') {
    if (!subject || !topic) return
    setAssisting(true)
    try {
      const text = await askAria(kind, {
        subject: subject.name,
        topic: topic.name,
        level,
        problem: question,
        studentAnswer: kind === 'explain_mistake' ? answer.trim() : undefined,
      })
      pushLine(kind === 'hint' ? 'Give me a hint' : 'Explain my mistake', text)
    } catch (err) {
      setError(err instanceof AiError ? err.message : 'ARIA is unavailable')
    } finally {
      setAssisting(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[1.1fr_1fr]">
      <div className="flex flex-col gap-4">
        <Link
          to={backToPath}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> {topic.name}
        </Link>

        <Panel className="p-5">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              {subject.name} · {topic.name}
            </span>
            <span className="inline-flex items-center gap-1">
              {isBoss ? (
                <>
                  <Crown className="h-3.5 w-3.5 text-xp" />
                  Mastery challenge
                </>
              ) : (
                <span className="capitalize">{node.tier}</span>
              )}
            </span>
          </div>
          <h1 className="mt-2 text-lg font-bold">{node.title}</h1>

          <AnimatePresence mode="wait">
            {phase === 'loading' && (
              <motion.div key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4">
                <Spinner label="Preparing the challenge…" />
              </motion.div>
            )}

            {phase === 'answering' && (
              <motion.div key="a" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4">
                <QuestionCard lead={guidance} question={question} />
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={4}
                  placeholder="Your answer — show your reasoning."
                  className="mt-3 w-full resize-none rounded-xl border border-edge bg-void p-3 text-sm outline-none focus:border-mana"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Btn variant="primary" onClick={submit} disabled={busy || !answer.trim()}>
                    {busy ? 'Checking…' : 'Submit'}
                  </Btn>
                  <Btn onClick={() => assist('hint')} disabled={assisting || busy}>
                    <span className="flex items-center gap-1.5">
                      <Lightbulb className="h-4 w-4 opacity-70" /> Hint
                    </span>
                  </Btn>
                  {grade && !grade.correct && (
                    <Btn onClick={() => assist('explain_mistake')} disabled={assisting || busy}>
                      <span className="flex items-center gap-1.5">
                        <Wrench className="h-4 w-4 opacity-70" /> Explain my mistake
                      </span>
                    </Btn>
                  )}
                </div>
              </motion.div>
            )}

            {phase === 'result' && grade && (
              <motion.div key="r" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4">
                <div className={`text-sm font-bold ${grade.correct ? 'text-heal' : 'text-hp'}`}>
                  {grade.correct ? 'Close, but not quite enough.' : 'Not there yet.'}
                </div>
                <p className="mt-1 text-sm text-muted">Read ARIA’s note, then try again.</p>
                <Btn variant="primary" className="mt-3" onClick={() => loadQuestion()}>
                  Try again
                </Btn>
              </motion.div>
            )}

            {phase === 'complete' && (
              <motion.div key="c" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="mt-4 text-center">
                <Trophy className="mx-auto h-9 w-9 text-xp" />
                <div className="mt-2 font-bold text-xp">
                  {isBoss ? `${node.title} mastered` : 'Challenge cleared'}
                </div>
                <p className="mt-1 text-sm text-muted">+{xpGained} XP · you explained why it works.</p>
                <div className="mt-3 flex justify-center gap-2">
                  <Btn variant="primary" onClick={() => navigate(backToPath)}>
                    Back to the path
                  </Btn>
                  <Btn onClick={() => navigate(`/s/${subject.id}`)}>{subject.name}</Btn>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {error && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-hp/40 bg-hp/10 p-2 text-sm text-hp">
              <RotateCcw className="h-4 w-4" />
              {error}
            </div>
          )}
        </Panel>
      </div>

      <Panel className="p-4">
        <AriaSpeech
          lines={lines}
          loading={assisting}
          emptyHint="Hints and feedback from ARIA appear here. She won’t hand you the answer."
        />
      </Panel>
    </div>
  )
}
