import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Lock, Check, MapPin } from 'lucide-react'
import {
  SUBJECTS,
  CONTINENTS,
  ATLAS_VIEWBOX,
  getSubject,
  type Subject,
} from '../game/atlas'
import {
  useApp,
  selectSubjectUnlocked,
  selectSubjectProgress,
} from '../store'
import { Panel } from '../components/ui'

const MIN_SCALE = 0.7
const MAX_SCALE = 2.6

export function Atlas() {
  const navigate = useNavigate()
  const app = useApp()

  const [hovered, setHovered] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  // recompute against live state
  const stateOf = (s: Subject) => {
    const unlocked = selectSubjectUnlocked(app, s.id)
    const progress = selectSubjectProgress(app, s.id)
    return { unlocked, progress, done: progress >= 1 }
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    setView((v) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * (e.deltaY < 0 ? 1.12 : 0.9)))
      return { ...v, scale: next }
    })
  }

  function onPointerDown(e: React.PointerEvent) {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return
    const dx = e.clientX - drag.current.x
    const dy = e.clientY - drag.current.y
    setView((v) => ({ ...v, x: drag.current!.vx + dx, y: drag.current!.vy + dy }))
  }
  function onPointerUp() {
    drag.current = null
  }

  function openSubject(s: Subject) {
    const { unlocked } = stateOf(s)
    if (!unlocked) {
      const req = getSubject(s.requires)
      setNotice(`${s.name} unlocks when you clear ${req?.name ?? 'its prerequisite'}.`)
      window.setTimeout(() => setNotice(null), 2600)
      return
    }
    navigate(`/s/${s.id}`)
  }

  const hoverSubject = SUBJECTS.find((s) => s.id === hovered)

  return (
    <div>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="title-serif text-3xl">The Learning Atlas</h1>
          <p className="mt-1 text-sm text-muted">
            Every country is a subject. Sail to one to begin its expedition.
          </p>
        </div>
        <div className="text-xs text-muted">drag to pan · scroll to zoom</div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <Panel className="relative overflow-hidden p-0">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${ATLAS_VIEWBOX.w} ${ATLAS_VIEWBOX.h}`}
            className="block h-[62vh] w-full cursor-grab touch-none select-none active:cursor-grabbing"
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <defs>
              <radialGradient id="sea" cx="50%" cy="40%" r="75%">
                <stop offset="0%" stopColor="var(--color-panel-2)" />
                <stop offset="100%" stopColor="var(--color-void)" />
              </radialGradient>
              <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="6" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <rect
              x={-500}
              y={-500}
              width={ATLAS_VIEWBOX.w + 1000}
              height={ATLAS_VIEWBOX.h + 1000}
              fill="url(#sea)"
            />

            <g transform={`translate(${view.x} ${view.y}) scale(${view.scale})`}>
              {/* latitude/longitude hint lines */}
              {Array.from({ length: 7 }).map((_, i) => (
                <line
                  key={`h${i}`}
                  x1={0}
                  x2={ATLAS_VIEWBOX.w}
                  y1={(i + 1) * (ATLAS_VIEWBOX.h / 8)}
                  y2={(i + 1) * (ATLAS_VIEWBOX.h / 8)}
                  stroke="var(--color-edge)"
                  strokeOpacity={0.35}
                  strokeDasharray="2 8"
                />
              ))}
              {Array.from({ length: 9 }).map((_, i) => (
                <line
                  key={`v${i}`}
                  y1={0}
                  y2={ATLAS_VIEWBOX.h}
                  x1={(i + 1) * (ATLAS_VIEWBOX.w / 10)}
                  x2={(i + 1) * (ATLAS_VIEWBOX.w / 10)}
                  stroke="var(--color-edge)"
                  strokeOpacity={0.35}
                  strokeDasharray="2 8"
                />
              ))}

              {CONTINENTS.map((c) => (
                <text
                  key={c.id}
                  x={c.label[0]}
                  y={c.label[1]}
                  textAnchor="middle"
                  className="title-serif"
                  fill="var(--color-muted)"
                  fontSize={17}
                  letterSpacing={4}
                  opacity={0.65}
                >
                  {c.name.toUpperCase()}
                </text>
              ))}

              {SUBJECTS.map((s) => {
                const { unlocked, progress, done } = stateOf(s)
                const isHover = hovered === s.id
                const fill = !unlocked
                  ? 'var(--color-panel-2)'
                  : done
                    ? 'var(--color-heal)'
                    : progress > 0
                      ? 'var(--color-mana)'
                      : 'var(--color-panel)'
                return (
                  <g
                    key={s.id}
                    onClick={() => openSubject(s)}
                    onMouseEnter={() => setHovered(s.id)}
                    onMouseLeave={() => setHovered(null)}
                    className="cursor-pointer"
                    role="button"
                    aria-label={`${s.name}${unlocked ? '' : ' (locked)'}`}
                  >
                    <path
                      d={s.region}
                      fill={fill}
                      fillOpacity={unlocked ? (progress > 0 ? 0.28 : 0.9) : 0.5}
                      stroke={unlocked ? 'var(--color-mana-bright)' : 'var(--color-edge)'}
                      strokeWidth={isHover ? 3 : 1.6}
                      strokeDasharray={unlocked ? undefined : '6 5'}
                      filter={isHover && unlocked ? 'url(#glow)' : undefined}
                      style={{ transition: 'stroke-width .15s ease' }}
                    />
                    <text
                      x={s.center[0]}
                      y={s.center[1]}
                      textAnchor="middle"
                      className="title-serif"
                      fill="var(--color-ink)"
                      fontSize={16}
                      fontWeight={600}
                    >
                      {s.name}
                    </text>
                    {!unlocked && (
                      <g transform={`translate(${s.center[0] - 8} ${s.center[1] + 10})`}>
                        <Lock width={16} height={16} color="var(--color-muted)" />
                      </g>
                    )}
                    {done && (
                      <g transform={`translate(${s.center[0] - 8} ${s.center[1] + 10})`}>
                        <Check width={16} height={16} color="var(--color-on-accent)" />
                      </g>
                    )}
                  </g>
                )
              })}
            </g>
          </svg>

          {notice && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-lg border border-edge bg-panel px-3 py-1.5 text-xs shadow-lg"
            >
              {notice}
            </motion.div>
          )}
        </Panel>

        <div className="flex flex-col gap-3">
          <Panel className="p-4">
            {hoverSubject ? (
              <HoverCard subject={hoverSubject} state={stateOf(hoverSubject)} />
            ) : (
              <p className="text-sm text-muted">
                Hover a region to preview it. Locked regions show what unlocks them.
              </p>
            )}
          </Panel>

          <Panel className="p-4 text-xs">
            <div className="mb-2 font-semibold uppercase tracking-wide text-muted">Legend</div>
            <LegendRow swatch="var(--color-panel)" label="Ready to explore" />
            <LegendRow swatch="var(--color-mana)" label="In progress" faded />
            <LegendRow swatch="var(--color-heal)" label="Completed" />
            <LegendRow swatch="var(--color-panel-2)" label="Locked" dashed />
          </Panel>
        </div>
      </div>
    </div>
  )
}

function HoverCard({
  subject,
  state,
}: {
  subject: Subject
  state: { unlocked: boolean; progress: number; done: boolean }
}) {
  const req = getSubject(subject.requires)
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-xl">{subject.glyph}</span>
        <div>
          <div className="font-bold">{subject.name}</div>
          <div className="text-xs text-muted">{subject.continent}</div>
        </div>
        {state.done && <Check className="ml-auto h-4 w-4 text-heal" />}
      </div>
      <p className="mt-2 text-sm text-muted">{subject.blurb}</p>
      {state.unlocked ? (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>Progress</span>
            <span>{Math.round(state.progress * 100)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full border border-edge bg-void">
            <div
              className="h-full rounded-full bg-mana"
              style={{ width: `${Math.round(state.progress * 100)}%` }}
            />
          </div>
          <div className="mt-2 flex items-center gap-1 text-xs text-mana-bright">
            <MapPin className="h-3.5 w-3.5" /> Click the region to enter
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          <Lock className="h-3.5 w-3.5" />
          Unlocks after clearing {req?.name ?? 'its prerequisite'}
        </div>
      )}
    </div>
  )
}

function LegendRow({
  swatch,
  label,
  faded,
  dashed,
}: {
  swatch: string
  label: string
  faded?: boolean
  dashed?: boolean
}) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span
        className="h-3 w-4 rounded-sm border"
        style={{
          background: swatch,
          opacity: faded ? 0.35 : 1,
          borderStyle: dashed ? 'dashed' : 'solid',
          borderColor: 'var(--color-edge)',
        }}
      />
      <span className="text-muted">{label}</span>
    </div>
  )
}
