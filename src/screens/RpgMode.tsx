import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  askAria,
  gradeBattleAnswer,
  generateEnemyQuestion,
  generateBossChallenge,
  gradeBossAnswer,
  AiError,
} from '../lib/ai'
import type { GradedAnswer } from '../lib/types'
import { ALGEBRA_FOREST } from '../game/worlds'
import {
  PLAYER_MAX_HP,
  playerDamage,
  enemyDamage,
  xpReward,
  isCrit,
} from '../game/engine'
import { useApp, selectLevel } from '../store'
import { AriaSpeech, type AriaLine } from '../components/AriaSpeech'
import { Bar, Btn, Panel, Spinner } from '../components/ui'

const WORLD = ALGEBRA_FOREST
const LADDER = WORLD.ladder
const BOSS_TRIALS = ['solve', 'twist', 'explain'] as const

type Phase =
  | 'intro'
  | 'loading'
  | 'answering'
  | 'result'
  | 'victory'
  | 'defeat'

let seq = 0

export function RpgMode() {
  const level = useApp(selectLevel)
  const addXp = useApp((s) => s.addXp)
  const recordClear = useApp((s) => s.recordClear)
  const setView = useApp((s) => s.setView)

  const [enemyIndex, setEnemyIndex] = useState(0)
  const [enemyHp, setEnemyHp] = useState(LADDER[0].maxHp)
  const [playerHp, setPlayerHp] = useState(PLAYER_MAX_HP)
  const [phase, setPhase] = useState<Phase>('intro')
  const [trial, setTrial] = useState(0) // boss only

  const [question, setQuestion] = useState('')
  const [expectedConcept, setExpectedConcept] = useState('')
  const [answer, setAnswer] = useState('')
  const [grade, setGrade] = useState<GradedAnswer | null>(null)
  const [lines, setLines] = useState<AriaLine[]>([])
  const [busy, setBusy] = useState(false)
  const [assisting, setAssisting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<'crit' | 'hit' | 'hurt' | null>(null)

  const enemy = LADDER[enemyIndex]
  const isBoss = enemyIndex === LADDER.length - 1
  const wrongTries = grade && !grade.correct ? 1 : 0

  function pushLine(prompt: string, text: string) {
    setLines((p) => [...p, { id: `b${++seq}`, prompt, text }])
  }

  async function loadQuestion(nextTrial = trial) {
    setPhase('loading')
    setError(null)
    setAnswer('')
    setGrade(null)
    try {
      if (isBoss) {
        const c = await generateBossChallenge({
          subject: WORLD.subject,
          topic: WORLD.topic,
          level,
          bossPhase: BOSS_TRIALS[nextTrial],
        })
        setQuestion(c.question)
        setExpectedConcept(c.expectedConcept)
      } else {
        const q = await generateEnemyQuestion({
          subject: WORLD.subject,
          topic: WORLD.topic,
          level,
          difficulty: enemy.tier,
        })
        setQuestion(q.question)
        setExpectedConcept(q.expectedConcept)
      }
      setPhase('answering')
    } catch (err) {
      setError(err instanceof AiError ? err.message : 'Failed to load challenge')
      setPhase('intro')
    }
  }

  async function submit() {
    if (!answer.trim()) return
    setBusy(true)
    setError(null)
    try {
      const ctx = {
        subject: WORLD.subject,
        topic: WORLD.topic,
        level,
        question,
        expectedConcept,
        studentAnswer: answer.trim(),
        bossPhase: isBoss ? BOSS_TRIALS[trial] : undefined,
      }
      const g = isBoss ? await gradeBossAnswer(ctx) : await gradeBattleAnswer(ctx)
      setGrade(g)
      pushLine(g.correct ? 'Verdict' : 'The enemy counters', g.feedback)

      const dealt = playerDamage(enemy.tier, g)
      const taken = enemyDamage(enemy.tier, g)
      const newEnemyHp = Math.max(0, enemyHp - dealt)
      const newPlayerHp = Math.max(0, playerHp - taken)
      setEnemyHp(newEnemyHp)
      setPlayerHp(newPlayerHp)
      setFlash(isCrit(enemy.tier, g) ? 'crit' : g.correct ? 'hit' : 'hurt')
      setTimeout(() => setFlash(null), 700)

      if (newPlayerHp <= 0) {
        setPhase('defeat')
        return
      }

      if (isBoss) {
        if (g.correct && g.quality >= 0.5) {
          if (trial >= BOSS_TRIALS.length - 1 || newEnemyHp <= 0) {
            addXp(xpReward('boss', g))
            recordClear(WORLD.id)
            setPhase('victory')
          } else {
            addXp(xpReward('medium', g))
            setTrial(trial + 1)
            setPhase('result')
          }
        } else {
          setPhase('result') // retry same trial
        }
        return
      }

      // regular enemy
      if (g.correct) addXp(xpReward(enemy.tier, g))
      if (newEnemyHp <= 0) {
        if (enemyIndex >= LADDER.length - 1) {
          setPhase('victory')
        } else {
          setPhase('result') // "enemy defeated, advance"
        }
      } else {
        setPhase('result') // same enemy, next question
      }
    } catch (err) {
      setError(err instanceof AiError ? err.message : 'Grading failed')
    } finally {
      setBusy(false)
    }
  }

  async function assist(kind: 'hint' | 'explain_mistake') {
    setAssisting(true)
    try {
      const text = await askAria(kind, {
        subject: WORLD.subject,
        topic: WORLD.topic,
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

  function advanceAfterResult() {
    if (!grade) return
    if (isBoss) {
      loadQuestion(trial)
      return
    }
    if (enemyHp <= 0) {
      const next = enemyIndex + 1
      setEnemyIndex(next)
      setEnemyHp(LADDER[next].maxHp)
      setGrade(null)
      setQuestion('')
      setPhase('intro')
    } else {
      loadQuestion()
    }
  }

  function retryFromDefeat() {
    setPlayerHp(PLAYER_MAX_HP)
    setEnemyHp(enemy.maxHp)
    setGrade(null)
    if (isBoss) setTrial(0)
    setPhase('intro')
  }

  const flashRing =
    flash === 'crit'
      ? 'ring-4 ring-xp'
      : flash === 'hit'
        ? 'ring-2 ring-heal'
        : flash === 'hurt'
          ? 'ring-2 ring-hp'
          : 'ring-0'

  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[1.1fr_1fr]">
      <div className="flex flex-col gap-4">
        {/* Stage */}
        <Panel className={`relative overflow-hidden p-5 transition ${flashRing}`}>
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              {WORLD.glyph} {WORLD.name}
            </span>
            <span>
              {isBoss ? 'BOSS' : `Enemy ${enemyIndex + 1} / ${LADDER.length - 1}`}
            </span>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={enemy.id + phase}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="mt-4 text-center"
            >
              <div className="text-6xl">{enemy.glyph}</div>
              <div className="mt-2 text-lg font-bold">{enemy.name}</div>
              {isBoss && (
                <div className="text-xs text-mana-bright">
                  Trial {Math.min(trial + 1, BOSS_TRIALS.length)} / {BOSS_TRIALS.length} ·{' '}
                  {BOSS_TRIALS[trial]}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="mt-4 space-y-2">
            <Bar value={enemyHp} max={enemy.maxHp} tone="hp" label={`${enemy.name} HP`} />
            <Bar value={playerHp} max={PLAYER_MAX_HP} tone="heal" label="Your HP" />
          </div>
        </Panel>

        {/* Interaction */}
        <Panel className="p-4">
          {phase === 'intro' && (
            <div>
              <p className="text-sm text-muted">{enemy.taunt}</p>
              <Btn variant="primary" className="mt-3" onClick={() => loadQuestion()}>
                {isBoss ? 'Face the boss' : 'Approach'}
              </Btn>
            </div>
          )}

          {phase === 'loading' && <Spinner label="The challenge forms…" />}

          {phase === 'answering' && (
            <div>
              <div className="rounded-xl border border-edge bg-void/60 p-3 text-sm">
                {question}
              </div>
              <textarea
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                rows={3}
                placeholder="Your answer — show reasoning for a stronger hit."
                className="mt-3 w-full resize-none rounded-xl border border-edge bg-void p-3 text-sm outline-none focus:border-mana"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <Btn variant="primary" onClick={submit} disabled={busy || !answer.trim()}>
                  {busy ? 'Resolving…' : isBoss ? 'Answer the trial' : 'Attack'}
                </Btn>
                <Btn onClick={() => assist('hint')} disabled={assisting || busy}>
                  💡 Hint
                </Btn>
                {wrongTries > 0 && (
                  <Btn
                    onClick={() => assist('explain_mistake')}
                    disabled={assisting || busy}
                  >
                    🔧 Explain my mistake
                  </Btn>
                )}
              </div>
            </div>
          )}

          {phase === 'result' && grade && (
            <div>
              <div
                className={`text-sm font-bold ${grade.correct ? 'text-heal' : 'text-hp'}`}
              >
                {grade.correct
                  ? isCrit(enemy.tier, grade)
                    ? 'CRITICAL HIT!'
                    : 'Hit!'
                  : 'Your attack missed.'}
              </div>
              <p className="mt-1 text-sm text-muted">
                {isBoss && grade.correct && grade.quality >= 0.5
                  ? 'The trial accepts your reasoning.'
                  : isBoss
                    ? 'The beast rewrites the problem. Try the trial again.'
                    : enemyHp <= 0
                      ? `${enemy.name} is defeated.`
                      : `${enemy.name} still stands.`}
              </p>
              <Btn variant="primary" className="mt-3" onClick={advanceAfterResult}>
                Continue
              </Btn>
            </div>
          )}

          {phase === 'victory' && (
            <div className="text-center">
              <div className="text-4xl">🏆</div>
              <div className="mt-2 font-bold text-xp">Algebra Forest cleared</div>
              <p className="mt-1 text-sm text-muted">
                You didn&apos;t just answer — you explained why it works.
              </p>
              <div className="mt-3 flex justify-center gap-2">
                <Btn variant="primary" onClick={() => setView('map')}>
                  Return to map
                </Btn>
                <Btn onClick={() => setView('home')}>Home</Btn>
              </div>
            </div>
          )}

          {phase === 'defeat' && (
            <div className="text-center">
              <div className="text-4xl">💀</div>
              <div className="mt-2 font-bold text-hp">You were driven back</div>
              <p className="mt-1 text-sm text-muted">
                Study the concept, then return stronger.
              </p>
              <div className="mt-3 flex justify-center gap-2">
                <Btn variant="primary" onClick={retryFromDefeat}>
                  Heal &amp; retry
                </Btn>
                <Btn onClick={() => setView('learn')}>Go study</Btn>
              </div>
            </div>
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
          emptyHint="ARIA's hints and feedback appear here during the fight."
        />
      </Panel>
    </div>
  )
}
