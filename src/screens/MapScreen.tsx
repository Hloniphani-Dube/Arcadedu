import { motion } from 'framer-motion'
import { useApp } from '../store'
import { ALGEBRA_FOREST, LOCKED_WORLDS } from '../game/worlds'
import { skillRank } from '../game/engine'
import { Panel, Btn } from '../components/ui'

export function MapScreen() {
  const setView = useApp((s) => s.setView)
  const clears = useApp((s) => s.profile.worldClears[ALGEBRA_FOREST.id] ?? 0)

  return (
    <div className="mx-auto max-w-4xl">
      <h2 className="mb-1 text-2xl font-black">The Learning Universe</h2>
      <p className="mb-5 text-sm text-muted">
        Each world is a subject. Clear a world&apos;s boss to raise your rank in it.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Panel className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{ALGEBRA_FOREST.glyph}</span>
              <div>
                <div className="font-bold">{ALGEBRA_FOREST.name}</div>
                <div className="text-xs text-muted">{ALGEBRA_FOREST.subject}</div>
              </div>
              <span className="ml-auto rounded-md bg-mana/15 px-2 py-0.5 text-[11px] font-semibold text-mana-bright">
                {skillRank(clears)}
              </span>
            </div>
            <p className="mt-2 text-sm text-muted">{ALGEBRA_FOREST.blurb}</p>
            <div className="mt-3 flex gap-2">
              <Btn variant="primary" onClick={() => setView('rpg')}>
                Enter
              </Btn>
              <Btn onClick={() => setView('learn')}>Study first</Btn>
            </div>
          </Panel>
        </motion.div>

        {LOCKED_WORLDS.map((w, i) => (
          <motion.div
            key={w.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: (i + 1) * 0.04 }}
          >
            <Panel className="p-4 opacity-55">
              <div className="flex items-center gap-2">
                <span className="text-2xl grayscale">{w.glyph}</span>
                <div>
                  <div className="font-bold">{w.name}</div>
                  <div className="text-xs text-muted">{w.subject}</div>
                </div>
                <span className="ml-auto text-xs text-muted">🔒 Locked</span>
              </div>
              <p className="mt-2 text-sm text-muted">
                Opens once more of the universe is built.
              </p>
            </Panel>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
