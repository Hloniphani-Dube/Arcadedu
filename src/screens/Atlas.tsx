import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, MapPin, ChevronRight, Compass, Sparkles } from 'lucide-react'
import {
  SUBJECTS,
  CONTINENTS,
  ATLAS_VIEWBOX,
  type Subject,
} from '../game/atlas'
import { levelProgress } from '../game/engine'
import {
  useApp,
  selectSubjectProgress,
  selectTopicState,
} from '../store'
import { useAuth } from '../auth/auth-context'
import { useInboxCount } from '../study/useInboxCount'
import { SubjectIcon } from '../components/icons'
import { Panel, PageHeader, SectionTitle, Stat, Bar } from '../components/ui'

const MIN_SCALE = 0.7
const MAX_SCALE = 2.6

export function Atlas() {
  const navigate = useNavigate()
  const app = useApp()
  const { user } = useAuth()
  const inboxCount = useInboxCount()

  const [hovered, setHovered] = useState<string | null>(null)
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const name = app.profile.name || user?.email?.split('@')[0] || 'Adventurer'
  const lvl = levelProgress(app.profile.xp)

  const inProgress = useMemo(() => {
    const out: {
      subjectId: string
      subjectName: string
      topicId: string
      topicName: string
      cleared: number
      total: number
      next: string
    }[] = []
    for (const s of SUBJECTS) {
      for (const t of s.topics) {
        const st = selectTopicState(app, s.id, t.id)
        if (st.completed.length === 0 || st.completed.length >= t.nodes.length) continue
        out.push({
          subjectId: s.id,
          subjectName: s.name,
          topicId: t.id,
          topicName: t.name,
          cleared: st.completed.length,
          total: t.nodes.length,
          next: t.nodes.find((n) => !st.completed.includes(n.id))?.title ?? '',
        })
      }
    }
    return out.slice(0, 3)
  }, [app])

  const stateOf = (s: Subject) => {
    const progress = selectSubjectProgress(app, s.id)
    return { progress, done: progress >= 1 }
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    setView((v) => ({
      ...v,
      scale: Math.min(
        MAX_SCALE,
        Math.max(MIN_SCALE, v.scale * (e.deltaY < 0 ? 1.12 : 0.9)),
      ),
    }))
  }
  function onPointerDown(e: React.PointerEvent) {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return
    setView((v) => ({
      ...v,
      x: drag.current!.vx + (e.clientX - drag.current!.x),
      y: drag.current!.vy + (e.clientY - drag.current!.y),
    }))
  }
  function onPointerUp() {
    drag.current = null
  }

  const hoverSubject = SUBJECTS.find((s) => s.id === hovered)

  return (
    <div>
      <PageHeader
        icon={<Compass className="h-5 w-5" />}
        title={`Welcome back, ${name}`}
        subtitle="Pick up where you left off, or set out for a new region."
      />

      <Panel className="mb-6 grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
        <Stat label={`Level ${lvl.level}`} value={app.profile.xp} tone="xp" hint="total XP" />
        <div className="col-span-1 sm:col-span-1">
          <div className="text-xs uppercase tracking-wide text-muted">
            To level {lvl.level + 1}
          </div>
          <div className="mt-2">
            <Bar value={lvl.pct} tone="xp" showValue={false} segments={16} />
          </div>
          <div className="mt-1 text-[11px] text-muted">
            {lvl.into} / {lvl.span} XP
          </div>
        </div>
        <Stat
          label="In progress"
          value={inProgress.length}
          tone="mana"
          hint="topics"
        />
        <Link to="/inbox" className="block">
          <Stat
            label="Inbox"
            value={inboxCount}
            tone={inboxCount > 0 ? 'hp' : 'ink'}
            hint="items waiting"
          />
        </Link>
      </Panel>

      <section className="mb-8">
        <Link to="/calendar" className="block">
          <Panel interactive className="flex items-center gap-3 p-4">
            <span className="grid h-9 w-9 flex-shrink-0 place-items-center border border-edge bg-panel-2 text-mana-bright">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold">What's happening this week?</div>
              <div className="text-[11px] text-muted">
                Tell ARIA about tests, deadlines or days off — she'll add them
                to your calendar.
              </div>
            </div>
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted" />
          </Panel>
        </Link>
      </section>

      {inProgress.length > 0 && (
        <section className="mb-8">
          <SectionTitle>Jump back in</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            {inProgress.map((q) => (
              <Link
                key={`${q.subjectId}/${q.topicId}`}
                to={`/s/${q.subjectId}/${q.topicId}`}
              >
                <Panel interactive className="flex h-full flex-col gap-2 p-4">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 flex-shrink-0 place-items-center border border-edge bg-panel-2 text-mana-bright">
                      <SubjectIcon id={q.subjectId} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold">{q.topicName}</div>
                      <div className="text-[11px] text-muted">{q.subjectName}</div>
                    </div>
                  </div>
                  <Bar value={q.cleared} max={q.total} tone="mana" showValue={false} segments={12} />
                  <div className="mt-auto flex items-center justify-between text-[11px] text-muted">
                    <span>{q.cleared}/{q.total} cleared</span>
                    <span className="flex items-center gap-0.5 text-mana-bright">
                      Continue <ChevronRight className="h-3 w-3" />
                    </span>
                  </div>
                </Panel>
              </Link>
            ))}
          </div>
        </section>
      )}

      <SectionTitle
        actions={
          <span className="text-[11px] normal-case tracking-normal text-muted">
            drag to pan · scroll to zoom
          </span>
        }
      >
        Explore the Atlas
      </SectionTitle>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <Panel className="relative overflow-hidden p-0">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${ATLAS_VIEWBOX.w} ${ATLAS_VIEWBOX.h}`}
            className="block h-[58vh] w-full cursor-grab touch-none select-none active:cursor-grabbing"
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
                  fill="var(--color-muted)"
                  fontSize={13}
                  letterSpacing={3}
                  opacity={0.6}
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {c.name.toUpperCase()}
                </text>
              ))}

              {SUBJECTS.map((s) => {
                const { progress, done } = stateOf(s)
                const isHover = hovered === s.id
                const fill = done
                  ? 'var(--color-heal)'
                  : progress > 0
                    ? 'var(--color-mana)'
                    : 'var(--color-panel)'
                return (
                  <g
                    key={s.id}
                    onClick={() => navigate(`/s/${s.id}`)}
                    onMouseEnter={() => setHovered(s.id)}
                    onMouseLeave={() => setHovered(null)}
                    className="cursor-pointer"
                    role="button"
                    aria-label={s.name}
                  >
                    <path
                      d={s.region}
                      fill={fill}
                      fillOpacity={progress > 0 ? 0.3 : 0.9}
                      stroke="var(--color-mana-bright)"
                      strokeWidth={isHover ? 3 : 1.6}
                      filter={isHover ? 'url(#glow)' : undefined}
                      style={{ transition: 'stroke-width .15s ease' }}
                    />
                    <text
                      x={s.center[0]}
                      y={s.center[1]}
                      textAnchor="middle"
                      fill="var(--color-ink)"
                      fontSize={12}
                      style={{ fontFamily: 'var(--font-display)' }}
                    >
                      {s.name}
                    </text>
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
        </Panel>

        <div className="flex flex-col gap-3">
          <Panel className="p-4">
            {hoverSubject ? (
              <HoverCard subject={hoverSubject} state={stateOf(hoverSubject)} />
            ) : (
              <p className="text-sm text-muted">
                Hover a region to preview it. Every world is open — sail wherever
                you like.
              </p>
            )}
          </Panel>

          <Panel className="p-4 text-xs">
            <div className="mb-2 font-bold uppercase tracking-[0.15em] text-muted">
              Legend
            </div>
            <LegendRow swatch="var(--color-panel)" label="Ready to explore" />
            <LegendRow swatch="var(--color-mana)" label="In progress" faded />
            <LegendRow swatch="var(--color-heal)" label="Completed" />
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
  state: { progress: number; done: boolean }
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center border border-edge bg-panel-2 text-mana-bright">
          <SubjectIcon id={subject.id} className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="truncate font-bold">{subject.name}</div>
          <div className="text-xs text-muted">{subject.continent}</div>
        </div>
        {state.done && <Check className="ml-auto h-4 w-4 text-heal" />}
      </div>
      <p className="mt-2 text-sm text-muted">{subject.blurb}</p>
      <div className="mt-3">
        <Bar value={Math.round(state.progress * 100)} tone="mana" segments={16} />
        <div className="mt-2 flex items-center gap-1 text-xs text-mana-bright">
          <MapPin className="h-3.5 w-3.5" /> Click the region to enter
        </div>
      </div>
    </div>
  )
}

function LegendRow({
  swatch,
  label,
  faded,
}: {
  swatch: string
  label: string
  faded?: boolean
}) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span
        className="h-3 w-4 border border-edge"
        style={{ background: swatch, opacity: faded ? 0.4 : 1 }}
      />
      <span className="text-muted">{label}</span>
    </div>
  )
}
