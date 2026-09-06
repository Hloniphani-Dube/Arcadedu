import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronRight, Lock, Trash2, Upload } from 'lucide-react'
import { SUBJECTS } from '../game/atlas'
import { levelProgress, skillRank } from '../game/engine'
import {
  useApp,
  selectSubjectUnlocked,
  selectSubjectProgress,
} from '../store'
import { useAuth } from '../auth/auth-context'
import { Bar, Btn, Panel, PageHeader, SectionTitle } from '../components/ui'
import { Avatar, AVATAR_ICONS, DEFAULT_AVATAR, SubjectIcon } from '../components/icons'
import { fileToAvatarDataUrl } from '../lib/image'

export function Profile() {
  const app = useApp()
  const profile = app.profile
  const setName = useApp((s) => s.setName)
  const setAvatar = useApp((s) => s.setAvatar)
  const { user, unconfigured } = useAuth()

  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const { level, into, span } = levelProgress(profile.xp)
  const hasPhoto = profile.avatar.startsWith('data:') || profile.avatar.startsWith('http')

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    if (!file) return
    setUploadError(null)
    try {
      setAvatar(await fileToAvatarDataUrl(file))
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Could not read that image.')
    }
  }

  return (
    <div>
      <PageHeader title="Traveller" subtitle="Your name, look and progress." />

      <Panel className="p-5">
        <div className="flex items-center gap-4">
          <Avatar
            value={profile.avatar}
            className="h-16 w-16 rounded-2xl border border-edge"
          />
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

        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Avatar
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(AVATAR_ICONS).map(([key, Icon]) => {
              const value = `icon:${key}`
              const active = profile.avatar === value
              return (
                <button
                  key={key}
                  type="button"
                  aria-label={key}
                  onClick={() => setAvatar(value)}
                  className={`grid h-9 w-9 place-items-center rounded-lg border transition ${
                    active
                      ? 'border-mana bg-mana/15 text-mana-bright'
                      : 'border-edge text-muted hover:border-mana hover:text-ink'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              )
            })}

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onFile}
              className="hidden"
            />
            <Btn onClick={() => fileRef.current?.click()} className="ml-1">
              <span className="flex items-center gap-1.5">
                <Upload className="h-4 w-4 opacity-70" />
                {hasPhoto ? 'Change photo' : 'Upload photo'}
              </span>
            </Btn>
            {hasPhoto && (
              <Btn variant="danger" onClick={() => setAvatar(DEFAULT_AVATAR)}>
                <span className="flex items-center gap-1.5">
                  <Trash2 className="h-4 w-4" /> Remove
                </span>
              </Btn>
            )}
          </div>
          {uploadError && (
            <p className="mt-2 text-xs text-hp">{uploadError}</p>
          )}
        </div>

        <div className="mt-5">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
            Level {level}
          </div>
          <Bar value={into} max={span} tone="xp" label="XP to next level" />
        </div>
      </Panel>

      <div className="mt-8">
        <SectionTitle>Subjects</SectionTitle>
      </div>
      <div className="flex flex-col gap-2">
        {SUBJECTS.map((s) => {
          const unlocked = selectSubjectUnlocked(app, s.id)
          const progress = selectSubjectProgress(app, s.id)
          const clears = app.subjects[s.id]?.clears ?? 0
          const row = (
            <Panel className={`flex items-center gap-3 p-3 ${unlocked ? '' : 'opacity-60'}`}>
              <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg border border-edge bg-panel-2 text-mana-bright">
                <SubjectIcon id={s.id} className="h-4 w-4" />
              </span>
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
