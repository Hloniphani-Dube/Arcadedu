import { useMemo } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, Check, Crown, Lock, Star } from 'lucide-react'
import { getSubject, getTopic, type AtlasNode } from '../game/atlas'
import { useApp, selectSubjectUnlocked, selectTopicState } from '../store'
import { SubjectIcon } from '../components/icons'
import { Panel } from '../components/ui'

const COLS = 3
const CELL_W = 210
const CELL_H = 150
const PAD = 70

function layout(count: number) {
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / COLS)
    const inRow = i % COLS
    const leftToRight = row % 2 === 0
    const col = leftToRight ? inRow : COLS - 1 - inRow
    pts.push({ x: PAD + col * CELL_W, y: PAD + row * CELL_H })
  }
  return pts
}

function trail(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return ''
  let d = `M ${pts[0].x} ${pts[0].y}`
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]
    const prev = pts[i - 1]
    const mx = (prev.x + p.x) / 2
    d += ` Q ${mx} ${prev.y}, ${mx} ${(prev.y + p.y) / 2} T ${p.x} ${p.y}`
  }
  return d
}

export function LevelPath() {
  const { subjectId, topicId } = useParams()
  const navigate = useNavigate()
  const app = useApp()
  const reduce = useReducedMotion()

  const subject = getSubject(subjectId)
  const topic = getTopic(subjectId, topicId)

  const model = useMemo(() => {
    if (!subject || !topic) return null
    const st = selectTopicState(app, subject.id, topic.id)
    const completed = new Set(st.completed)
    let currentIndex = topic.nodes.findIndex((n) => !completed.has(n.id))
    if (currentIndex === -1) currentIndex = topic.nodes.length // all done
    const pts = layout(topic.nodes.length)
    return { st, completed, currentIndex, pts }
  }, [app, subject, topic])

  if (!subject || !topic) return <Navigate to="/" replace />
  if (!selectSubjectUnlocked(app, subject.id)) return <Navigate to="/" replace />
  if (!model) return null

  const { completed, currentIndex, pts } = model
  const rows = Math.ceil(topic.nodes.length / COLS)
  const height = PAD * 2 + (rows - 1) * CELL_H
  const width = PAD * 2 + (COLS - 1) * CELL_W
  const allDone = currentIndex >= topic.nodes.length
  const avatarAt = pts[Math.min(currentIndex, topic.nodes.length - 1)]

  function nodeState(i: number, n: AtlasNode) {
    if (completed.has(n.id)) return 'done' as const
    if (i === currentIndex) return 'current' as const
    return 'locked' as const
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to={`/s/${subject.id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> {subject.name}
      </Link>

      <header className="mb-4">
        <h1 className="title-serif text-3xl">{topic.name}</h1>
        <p className="mt-1 text-sm text-muted">{topic.blurb}</p>
      </header>

      <Panel className="overflow-x-auto p-4">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="mx-auto block h-auto w-full max-w-xl"
          role="list"
          aria-label={`${topic.name} challenge path`}
        >
          <path
            d={trail(pts)}
            fill="none"
            stroke="var(--color-edge)"
            strokeWidth={6}
            strokeDasharray="1 14"
            strokeLinecap="round"
          />
          <path
            d={trail(pts.slice(0, Math.max(1, Math.min(currentIndex + 1, pts.length))))}
            fill="none"
            stroke="var(--color-mana)"
            strokeWidth={6}
            strokeLinecap="round"
            opacity={0.5}
          />

          {topic.nodes.map((n, i) => {
            const s = nodeState(i, n)
            const p = pts[i]
            const isBoss = n.kind === 'boss'
            const r = isBoss ? 30 : 24
            const clickable = s === 'current'
            return (
              <g
                key={n.id}
                role="listitem"
                aria-label={`${n.title}, ${s}`}
                transform={`translate(${p.x} ${p.y})`}
                className={clickable ? 'cursor-pointer' : ''}
                onClick={
                  clickable
                    ? () => navigate(`/play/${subject.id}/${topic.id}/${n.id}`)
                    : undefined
                }
              >
                {s === 'current' && !reduce && (
                  <circle r={r + 8} fill="none" stroke="var(--color-mana)" strokeWidth={2}>
                    <animate attributeName="r" values={`${r + 4};${r + 12};${r + 4}`} dur="1.8s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.8;0.1;0.8" dur="1.8s" repeatCount="indefinite" />
                  </circle>
                )}
                <circle
                  r={r}
                  fill={
                    s === 'done'
                      ? 'var(--color-heal)'
                      : s === 'current'
                        ? 'var(--color-mana)'
                        : 'var(--color-panel-2)'
                  }
                  stroke={isBoss ? 'var(--color-xp)' : 'var(--color-edge)'}
                  strokeWidth={isBoss ? 3 : 1.5}
                />
                <g transform="translate(-9 -9)" color="var(--color-on-accent)">
                  {s === 'done' ? (
                    <Check width={18} height={18} />
                  ) : s === 'locked' ? (
                    <Lock width={18} height={18} color="var(--color-muted)" />
                  ) : isBoss ? (
                    <Crown width={18} height={18} />
                  ) : (
                    <Star width={18} height={18} />
                  )}
                </g>
                <text
                  y={r + 16}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--color-muted)"
                >
                  {n.title}
                </text>
              </g>
            )
          })}

          {/* the traveller */}
          <motion.g
            initial={false}
            animate={{ x: avatarAt.x, y: avatarAt.y - (allDone ? 0 : 2) }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 16 }}
          >
            <g transform="translate(-11 -46)" className="text-mana-bright">
              <SubjectIcon id={subject.id} className="h-[22px] w-[22px]" />
            </g>
          </motion.g>
        </svg>
      </Panel>

      <div className="mt-4 text-center text-sm text-muted">
        {allDone ? (
          <span className="inline-flex items-center gap-1.5 text-heal">
            <Check className="h-4 w-4" /> Topic complete. Every challenge cleared.
          </span>
        ) : (
          <>
            Next up:{' '}
            <button
              type="button"
              className="font-semibold text-mana-bright hover:underline"
              onClick={() =>
                navigate(`/play/${subject.id}/${topic.id}/${topic.nodes[currentIndex].id}`)
              }
            >
              {topic.nodes[currentIndex].title}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
