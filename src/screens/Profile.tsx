import { Link } from 'react-router-dom'
import { Check, ChevronRight, Lock } from 'lucide-react'
import { SUBJECTS } from '../game/atlas'
import { levelProgress, skillRank } from '../game/engine'
import {
  useApp,
  selectSubjectUnlocked,
  selectSubjectProgress,
} from '../store'
import { useAuth } from '../auth/auth-context'
import { Bar, Panel } from '../components/ui'

const AVATARS = ['🧑‍🎓', '🧭', '🗺️', '⚓', '🦉', '🐉', '🛡️', '🔭']

export function Profile() {
  const app = useApp()
  const profile = app.profile
  const setName = useApp((s) => s.setName)
  const setAvatar = useApp((s) => s.setAvatar)
  const { user, unconfigured } = useAuth()

  const { level, into, span } = levelProgress(profile.xp)

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="title-serif mb-4 text-3xl">Traveller</h1>

      <Panel className="p-5">
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 place-items-center rounded-2xl border border-edge bg-panel-2 text-3xl">
            {profile.avatar}
          </span>
          <div className="flex-1">
            <input
              value={profile.name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Display name"
              className="w-full rounded-lg border border-edge bg-void px-3 py-2 text-sm font-semibold outline-none focus:border-mana"
            />
            <div className="mt-1 text-xs text-muted">
              {unconfigured ? 'Local mode — progress is not saved' : (user?.email ?? 'Signed in')}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAvatar(a)}
              className={`grid h-9 w-9 place-items-center rounded-lg border text-lg transition ${
                profile.avatar === a
                  ? 'border-mana bg-mana/15'
                  : 'border-edge hover:border-mana'
              }`}
            >
              {a}
            </button>
          ))}
        </div>

        <div className="mt-5">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Level {level}
          </div>
          <Bar value={into} max={span} tone="xp" label="XP to next level" />
        </div>
      </Panel>

      <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">
        Subjects
      </div>
      <div className="mt-2 flex flex-col gap-2">
        {SUBJECTS.map((s) => {
          const unlocked = selectSubjectUnlocked(app, s.id)
          const progress = selectSubjectProgress(app, s.id)
          const clears = app.subjects[s.id]?.clears ?? 0
          const row = (
            <Panel className={`flex items-center gap-3 p-3 ${unlocked ? '' : 'opacity-60'}`}>
              <span className="text-xl">{s.glyph}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {s.name}
                  {progress >= 1 && <Check className="h-3.5 w-3.5 text-heal" />}
                  {!unlocked && <Lock className="h-3.5 w-3.5 text-muted" />}
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-void">
                  <div className="h-full rounded-full bg-mana" style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
              </div>
              <span className="text-xs text-mana-bright">{unlocked ? skillRank(clears) : 'Locked'}</span>
              {unlocked && <ChevronRight className="h-4 w-4 text-muted" />}
            </Panel>
          )
          return unlocked ? (
            <Link key={s.id} to={`/s/${s.id}`} className="block">
              {row}
            </Link>
          ) : (
            <div key={s.id}>{row}</div>
          )
        })}
      </div>
    </div>
  )
}
