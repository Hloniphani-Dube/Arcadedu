import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Lightbulb, RotateCcw, Trophy } from 'lucide-react'
import { askAria, generateStoryQuestion, gradeBattleAnswer, AiError } from '../lib/ai'
import type { GradedAnswer } from '../lib/types'
import { xpReward } from '../game/engine'
import { STORY_ONE, getChapter, getStoryLevel } from '../game/story'
import { useApp, selectLevel, selectStoryLevelUnlocked } from '../store'
import { AriaSpeech, type AriaLine } from '../components/AriaSpeech'
import { QuestionCard } from '../components/QuestionCard'
import { Btn, Panel, Spinner } from '../components/ui'

type Phase = 'loading' | 'answering' | 'result' | 'complete'
let seq = 0

export function StoryChallenge() {
  const { chapterId, levelId } = useParams()
  const navigate = useNavigate()

  const level = useApp(selectLevel)
  const app = useApp()
  const addXp = useApp((s) => s.addXp)
  const completeStoryLevel = useApp((s) => s.completeStoryLevel)

  const chapter = getChapter(chapterId)
  const lvl = getStoryLevel(chapterId, levelId)

  const [phase, setPhase] = useState<Phase>('loading')
  const [narrative, setNarrative] = useState('')
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
    setLines((p) => [...p, { id: `s${++seq}`, prompt, text }])

  async function loadQuestion() {
    if (!chapter || !lvl) return
    setPhase('loading')
    setError(null)
    setAnswer('')
    setGrade(null)
    setNarrative('')
    try {
      const q = await generateStoryQuestion({
        subject: 'Story Mode',
        topic: chapter.title,
        chapter: chapter.title,
        level,
        difficulty: lvl.tier,
      })
      setNarrative(q.narrative)
      setQuestion(q.question)
      setExpectedConcept(q.expectedConcept)
      setPhase('answering')
    } catch (err) {
      setError(err instanceof AiError ? err.message : 'Failed to load this stop')
      setPhase('answering')
    }
  }

  useEffect(() => {
    if (started.current || !lvl) return
    started.current = true
    void loadQuestion()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lvl])

  if (!chapter || !lvl) return <Navigate to="/story" replace />
  if (!selectStoryLevelUnlocked(app, chapter.id, lvl.id))
    return <Navigate to={`/story/${chapter.id}`} replace />

  const backToChapter = `/story/${chapter.id}`
  const levelIdx = chapter.levels.findIndex((l) => l.id === lvl.id)
  const nextLevel = chapter.levels[levelIdx + 1]
  const nextChapter = STORY_ONE.chapters[chapter.index + 1]

  async function submit() {
    if (!answer.trim() || !chapter || !lvl) return
    setBusy(true)
    setError(null)
    try {
      const g = await gradeBattleAnswer({
        subject: 'Story Mode',
        topic: chapter.title,
        level,
        question,
        expectedConcept,
        studentAnswer: answer.trim(),
      })
      setGrade(g)
      pushLine(g.correct ? 'Result' : 'Not quite', g.feedback)

      if (!(g.correct && g.quality >= 0.35)) {
        setPhase('result')
        return
      }

      const gained = xpReward(lvl.tier, g)
      addXp(gained)
      setXpGained((x) => x + gained)
      completeStoryLevel(chapter.id, lvl.id)
      setPhase('complete')
    } catch (err) {
      setError(err instanceof AiError ? err.message : 'Grading failed')
    } finally {
      setBusy(false)
    }
  }

  async function hint() {
    if (!chapter) return
    setAssisting(true)
    try {
      const text = await askAria('hint', {
        subject: 'Story Mode',
        topic: chapter.title,
        level,
        problem: question,
      })
      pushLine('Give me a hint', text)
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
          to={backToChapter}
          className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> {chapter.title}
        </Link>

        <Panel className="p-5">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              Story I · Chapter {chapter.index + 1} · {chapter.title}
            </span>
            <span className="capitalize">{lvl.tier}</span>
          </div>
          <h1 className="mt-3 text-lg font-bold">{lvl.title}</h1>

          <AnimatePresence mode="wait">
            {phase === 'loading' && (
              <motion.div key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4">
                <Spinner label="The next stop takes shape…" />
              </motion.div>
            )}

            {phase === 'answering' && (
              <motion.div key="a" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4">
                <QuestionCard kind="story" lead={narrative} question={question} />
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  rows={4}
                  placeholder="Your answer, a short reason helps."
                  className="mt-3 w-full resize-none rounded-xl border border-edge bg-void p-3 text-sm outline-none focus:border-mana"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  <Btn variant="primary" onClick={submit} disabled={busy || !answer.trim()}>
                    {busy ? 'Checking…' : 'Submit'}
                  </Btn>
                  <Btn onClick={hint} disabled={assisting || busy}>
                    <span className="flex items-center gap-1.5">
                      <Lightbulb className="h-4 w-4 opacity-70" /> Hint
                    </span>
                  </Btn>
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
                <div className="mt-2 font-bold text-xp">{lvl.title} cleared</div>
                <p className="mt-1 text-sm text-muted">+{xpGained} XP</p>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {nextLevel ? (
                    <Btn variant="primary" onClick={() => navigate(`/story/${chapter.id}/${nextLevel.id}`)}>
                      Next level
                    </Btn>
                  ) : nextChapter ? (
                    <Btn variant="primary" onClick={() => navigate(`/story/${nextChapter.id}`)}>
                      Chapter {nextChapter.index + 1}: {nextChapter.title}
                    </Btn>
                  ) : (
                    <Btn variant="primary" onClick={() => navigate('/story')}>
                      Story’s end. Back to the tale
                    </Btn>
                  )}
                  <Btn onClick={() => navigate(backToChapter)}>Back to chapter</Btn>
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
          emptyHint="Stuck? Ask ARIA for a nudge. She won’t just tell you the answer."
        />
      </Panel>
    </div>
  )
}
