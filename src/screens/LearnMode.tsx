import { useState } from 'react'
import { askAria, AiError } from '../lib/ai'
import type { LearnAction } from '../lib/types'
import { ALGEBRA_FOREST } from '../game/worlds'
import { useApp, selectLevel } from '../store'
import { ActionBar } from '../components/ActionBar'
import { AriaSpeech, type AriaLine } from '../components/AriaSpeech'
import { Panel } from '../components/ui'

let seq = 0

export function LearnMode() {
  const level = useApp(selectLevel)
  const [problem, setProblem] = useState('')
  const [work, setWork] = useState('')
  const [lines, setLines] = useState<AriaLine[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: LearnAction, label: string) {
    setLoading(true)
    setError(null)
    try {
      const text = await askAria(action, {
        subject: ALGEBRA_FOREST.subject,
        topic: ALGEBRA_FOREST.topic,
        level,
        problem: problem.trim(),
        studentAnswer: work.trim() || undefined,
      })
      setLines((prev) => [...prev, { id: `l${++seq}`, prompt: label, text }])
    } catch (err) {
      setError(err instanceof AiError ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[1fr_1fr]">
      <div className="flex flex-col gap-4">
        <Panel className="p-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted">
            The problem you&apos;re working on
          </label>
          <textarea
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            rows={3}
            placeholder="e.g. Solve 2x + 5 = 15"
            className="mt-2 w-full resize-none rounded-xl border border-edge bg-void p-3 text-sm outline-none focus:border-mana"
          />

          <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-muted">
            Your work / attempt <span className="normal-case text-muted/70">(optional)</span>
          </label>
          <textarea
            value={work}
            onChange={(e) => setWork(e.target.value)}
            rows={4}
            placeholder="Show what you've tried so ARIA can check it or find your mistake."
            className="mt-2 w-full resize-none rounded-xl border border-edge bg-void p-3 text-sm outline-none focus:border-mana"
          />
        </Panel>

        <Panel className="p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Actions
          </div>
          <ActionBar
            onAction={run}
            disabled={loading}
            hasProblem={problem.trim().length > 0}
            hasAnswer={work.trim().length > 0}
          />
          <p className="mt-3 text-xs text-muted">
            There is no free prompt box. ARIA will guide, hint, and check — she
            won&apos;t hand you the final answer.
          </p>
        </Panel>
      </div>

      <Panel className="p-4">
        {error && (
          <div className="mb-3 rounded-lg border border-hp/40 bg-hp/10 p-2 text-sm text-hp">
            {error}
          </div>
        )}
        <AriaSpeech
          lines={lines}
          loading={loading}
          emptyHint="Type a problem on the left, then pick an action."
        />
      </Panel>
    </div>
  )
}
