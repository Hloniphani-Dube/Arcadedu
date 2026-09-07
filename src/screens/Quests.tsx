import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Swords, ChevronRight, Compass } from 'lucide-react'
import { SUBJECTS } from '../game/atlas'
import { useApp, selectSubjectUnlocked, selectTopicState } from '../store'
import { Panel, Btn, PageHeader, EmptyState, Bar } from '../components/ui'
import { SubjectIcon } from '../components/icons'

interface Quest {
  subjectId: string
  subjectName: string
  topicId: string
  topicName: string
  cleared: number
  total: number
  nextTitle: string
}

export function Quests() {
  const app = useApp()

  const active: Quest[] = []
  for (const s of SUBJECTS) {
    if (!selectSubjectUnlocked(app, s.id)) continue
    for (const t of s.topics) {
      const st = selectTopicState(app, s.id, t.id)
      if (st.completed.length === 0 || st.completed.length >= t.nodes.length) continue
      const next = t.nodes.find((n) => !st.completed.includes(n.id))
      active.push({
        subjectId: s.id,
        subjectName: s.name,
        topicId: t.id,
        topicName: t.name,
        cleared: st.completed.length,
        total: t.nodes.length,
        nextTitle: next?.title ?? '',
      })
    }
  }

  return (
    <div>
      <PageHeader icon={<Swords className="h-5 w-5" />} title="Active Expeditions" />

      {active.length === 0 ? (
        <EmptyState
          icon={<Compass className="h-5 w-5" />}
          title="No expeditions underway"
          action={
            <Link to="/">
              <Btn variant="primary">Go to the Atlas</Btn>
            </Link>
          }
        >
          Open the atlas and set out.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {active.map((q, i) => (
            <motion.div
              key={`${q.subjectId}/${q.topicId}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link to={`/s/${q.subjectId}/${q.topicId}`} className="block">
                <Panel interactive className="flex items-center gap-4 p-4">
                  <span className="grid h-9 w-9 flex-shrink-0 place-items-center border border-edge bg-panel-2 text-mana-bright">
                    <SubjectIcon id={q.subjectId} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">
                      {q.subjectName} · {q.topicName}
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      next: {q.nextTitle}
                    </div>
                    <div className="mt-2 max-w-[220px]">
                      <Bar
                        value={q.cleared}
                        max={q.total}
                        tone="mana"
                        showValue={false}
                        segments={12}
                      />
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-mana-bright" />
                </Panel>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
