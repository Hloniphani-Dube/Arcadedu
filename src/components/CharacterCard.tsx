import { useApp } from '../store'
import { levelProgress, skillRank } from '../game/engine'
import { ALGEBRA_FOREST, LOCKED_WORLDS } from '../game/worlds'
import { Bar, Panel } from './ui'

export function CharacterCard() {
  const profile = useApp((s) => s.profile)
  const { level, into, span } = levelProgress(profile.xp)
  const algebraClears = profile.worldClears[ALGEBRA_FOREST.id] ?? 0

  return (
    <Panel className="p-4">
      <div className="flex items-center gap-3">
        <div className="grid h-12 w-12 place-items-center rounded-xl border border-edge bg-panel-2 text-2xl">
          🧑‍🎓
        </div>
        <div className="min-w-0">
          <div className="truncate font-bold">{profile.name}</div>
          <div className="text-xs text-muted">Scholar · Level {level}</div>
        </div>
      </div>

      <div className="mt-3">
        <Bar value={into} max={span} tone="xp" label="XP to next level" />
      </div>

      <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">
        Subjects
      </div>
      <ul className="mt-2 space-y-1 text-sm">
        <li className="flex justify-between">
          <span>⚔️ Algebra</span>
          <span className="text-mana-bright">{skillRank(algebraClears)}</span>
        </li>
        {LOCKED_WORLDS.map((w) => (
          <li key={w.id} className="flex justify-between text-muted">
            <span>
              {w.glyph} {w.subject}
            </span>
            <span>🔒 Locked</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
