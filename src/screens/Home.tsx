import { motion } from 'framer-motion'
import { useApp, type View } from '../store'
import { Panel } from '../components/ui'

interface Mode {
  view: View | null
  title: string
  glyph: string
  blurb: string
  ready: boolean
}

const MODES: Mode[] = [
  {
    view: 'learn',
    title: 'Learn',
    glyph: '📖',
    blurb: 'Work a problem with ARIA. Ten fixed actions — no answer machine.',
    ready: true,
  },
  {
    view: 'rpg',
    title: 'RPG',
    glyph: '⚔️',
    blurb: 'Fight through the Algebra Forest. Beat the boss by proving you understand.',
    ready: true,
  },
  {
    view: 'map',
    title: 'World Map',
    glyph: '🗺️',
    blurb: 'See the learning universe and where you stand in it.',
    ready: true,
  },
  {
    view: null,
    title: 'Practice',
    glyph: '🎯',
    blurb: 'Endless adaptive problem sets with hints. Coming next.',
    ready: false,
  },
  {
    view: null,
    title: 'Exam',
    glyph: '⏱️',
    blurb: 'Timed, no assistance, real assessment. Coming next.',
    ready: false,
  },
]

export function Home() {
  const setView = useApp((s) => s.setView)

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 text-center">
        <h1 className="text-3xl font-black tracking-tight">
          Arcade<span className="text-mana-bright">du</span>
        </h1>
        <p className="mt-1 text-sm text-muted">
          An AI learning universe. The AI teaches — it never does the work for you.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {MODES.map((m, i) => (
          <motion.button
            key={m.title}
            type="button"
            disabled={!m.ready}
            onClick={() => m.view && setView(m.view)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="text-left disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Panel className="h-full p-4 transition hover:border-mana">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{m.glyph}</span>
                <span className="text-lg font-bold">{m.title}</span>
                {!m.ready && (
                  <span className="ml-auto rounded-md bg-panel-2 px-2 py-0.5 text-[11px] text-muted">
                    Soon
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-muted">{m.blurb}</p>
            </Panel>
          </motion.button>
        ))}
      </div>
    </div>
  )
}
