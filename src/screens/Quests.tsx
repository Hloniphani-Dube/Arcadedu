import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Swords, ChevronRight, Compass } from 'lucide-react'
import { SUBJECTS } from '../game/atlas'
import { useApp, selectSubjectUnlocked, selectTopicState } from '../store'
import { Panel, Btn } from '../components/ui'

interface Quest {
  subjectId: string
  subjectName: string
  glyph: string
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
        glyph: s.glyph,
        topicId: t.id,
        topicName: t.name,
        cleared: st.completed.length,
        total: t.nodes.length,
        nextTitle: next?.title ?? '',
      })
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="title-serif mb-1 text-3xl">Active Expeditions</h1>
      <p className="mb-5 text-sm text-muted">Topics you&apos;ve started but not yet finished.</p>

      {active.length === 0 ? (
        <Panel className="flex flex-col items-center gap-3 p-8 text-center">
          <Compass className="h-8 w-8 text-muted" />
          <p className="text-sm text-muted">
            No expeditions underway. Open the atlas and set out.
          </p>
          <Link to="/">
            <Btn variant="primary">Go to the Atlas</Btn>
          </Link>
        </Panel>
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
                <Panel className="flex items-center gap-4 p-4 transition hover:border-mana">
                  <span className="text-2xl">{q.glyph}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">
                      {q.subjectName} · {q.topicName}
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {q.cleared}/{q.total} cleared · next: {q.nextTitle}
                    </div>
                  </div>
                  <span className="flex items-center gap-1 text-sm font-semibold text-mana-bright">
                    <Swords className="h-4 w-4" />
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </Panel>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
