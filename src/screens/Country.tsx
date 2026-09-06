import { useMemo } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, ChevronRight, Lock, Check } from 'lucide-react'
import { getSubject } from '../game/atlas'
import { useApp, selectSubjectUnlocked, selectTopicState } from '../store'
import { Panel } from '../components/ui'

export function Country() {
  const { subjectId } = useParams()
  const app = useApp()
  const subject = getSubject(subjectId)

  const topicStates = useMemo(() => {
    if (!subject) return []
    return subject.topics.map((t, i) => {
      const st = selectTopicState(app, subject.id, t.id)
      const done = st.completed.length >= t.nodes.length
      const started = st.completed.length > 0
      // topics unlock in order: first is open, next opens when the previous is done
      const prevDone =
        i === 0 ||
        selectTopicState(app, subject.id, subject.topics[i - 1].id).completed.length >=
          subject.topics[i - 1].nodes.length
      return { topic: t, done, started, unlocked: prevDone, cleared: st.completed.length }
    })
  }, [app, subject])

  if (!subject) return <Navigate to="/" replace />
  if (!selectSubjectUnlocked(app, subject.id)) return <Navigate to="/" replace />

  const overall =
    topicStates.reduce((a, t) => a + t.cleared, 0) /
    subject.topics.reduce((a, t) => a + t.nodes.length, 0)

  return (
    <div className="mx-auto max-w-3xl">
      <Link to="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Atlas
      </Link>

      <header className="mb-6">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-xl border border-edge bg-panel-2 text-2xl">
            {subject.glyph}
          </span>
          <div>
            <h1 className="title-serif text-3xl">{subject.name}</h1>
            <p className="text-xs uppercase tracking-wide text-muted">{subject.continent}</p>
          </div>
        </div>
        <p className="mt-3 text-sm text-muted">{subject.blurb}</p>
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>Expedition progress</span>
            <span>{Math.round(overall * 100)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full border border-edge bg-void">
            <div className="h-full rounded-full bg-mana" style={{ width: `${Math.round(overall * 100)}%` }} />
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-3">
        {topicStates.map(({ topic, done, started, unlocked, cleared }, i) => (
          <motion.div
            key={topic.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <TopicRow
              subjectId={subject.id}
              topicId={topic.id}
              name={topic.name}
              blurb={topic.blurb}
              total={topic.nodes.length}
              cleared={cleared}
              done={done}
              started={started}
              unlocked={unlocked}
            />
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function TopicRow({
  subjectId,
  topicId,
  name,
  blurb,
  total,
  cleared,
  done,
  started,
  unlocked,
}: {
  subjectId: string
  topicId: string
  name: string
  blurb: string
  total: number
  cleared: number
  done: boolean
  started: boolean
  unlocked: boolean
}) {
  const inner = (
    <Panel
      className={`flex items-center gap-4 p-4 transition ${
        unlocked ? 'hover:border-mana' : 'opacity-60'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-bold">{name}</span>
          {done && <Check className="h-4 w-4 text-heal" />}
          {!unlocked && <Lock className="h-4 w-4 text-muted" />}
        </div>
        <p className="mt-1 truncate text-sm text-muted">{blurb}</p>
        <div className="mt-1 text-xs text-muted">
          {cleared} / {total} challenges cleared
        </div>
      </div>
      {unlocked && (
        <span className="flex items-center gap-1 text-sm font-semibold text-mana-bright">
          {done ? 'Replay' : started ? 'Continue' : 'Start'}
          <ChevronRight className="h-4 w-4" />
        </span>
      )}
    </Panel>
  )

  if (!unlocked) return inner
  return (
    <Link to={`/s/${subjectId}/${topicId}`} className="block">
      {inner}
    </Link>
  )
}
