import { useState } from 'react'
import { askAria, AiError } from '../lib/ai'
import type { LearnAction } from '../lib/types'
import { SUBJECTS } from '../game/atlas'
import { useApp, selectLevel } from '../store'
import { GraduationCap } from 'lucide-react'
import { ActionBar } from '../components/ActionBar'
import { AriaSpeech, type AriaLine } from '../components/AriaSpeech'
import { Panel, PageHeader } from '../components/ui'

let seq = 0

export function LearnMode() {
  const level = useApp(selectLevel)
  const [subjectId, setSubjectId] = useState(SUBJECTS[0].id)
  const subject = SUBJECTS.find((s) => s.id === subjectId) ?? SUBJECTS[0]
  const [topicId, setTopicId] = useState(subject.topics[0].id)
  const topic = subject.topics.find((t) => t.id === topicId) ?? subject.topics[0]

  const [problem, setProblem] = useState('')
  const [work, setWork] = useState('')
  const [lines, setLines] = useState<AriaLine[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function pickSubject(id: string) {
    setSubjectId(id)
    const s = SUBJECTS.find((x) => x.id === id)
    if (s) setTopicId(s.topics[0].id)
  }

  async function run(action: LearnAction, label: string) {
    setLoading(true)
    setError(null)
    try {
      const text = await askAria(action, {
        subject: subject.name,
        topic: topic.name,
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
    <div>
      <PageHeader
        icon={<GraduationCap className="h-5 w-5" />}
        title="Study Hall"
        subtitle="Work a problem with ARIA. Ten fixed actions — no answer machine."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="flex flex-col gap-4">
          <Panel className="p-4">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
                Subject
                <select
                  value={subjectId}
                  onChange={(e) => pickSubject(e.target.value)}
                  className="rounded-lg border border-edge bg-void px-2 py-2 text-sm normal-case text-ink outline-none focus:border-mana"
                >
                  {SUBJECTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
                Topic
                <select
                  value={topicId}
                  onChange={(e) => setTopicId(e.target.value)}
                  className="rounded-lg border border-edge bg-void px-2 py-2 text-sm normal-case text-ink outline-none focus:border-mana"
                >
                  {subject.topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Panel>

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
            emptyHint="Pick a subject, type a problem, then choose an action."
          />
        </Panel>
      </div>
    </div>
  )
}
