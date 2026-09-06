import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, Target, CalendarClock, ChevronRight } from 'lucide-react'
import { useAuth } from '../auth/auth-context'
import { getSubject } from '../game/atlas'
import { fetchMissions } from '../study/db'
import { daysBetween } from '../study/dates'
import type { StudyMission } from '../study/types'
import { Panel, Btn, Spinner } from '../components/ui'

export function MissionsHome() {
  const { user, unconfigured } = useAuth()
  const [missions, setMissions] = useState<StudyMission[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    let live = true
    fetchMissions(user.id)
      .then((m) => live && setMissions(m))
      .catch((e) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [user])

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="title-serif text-3xl">Study Missions</h1>
          <p className="mt-2 text-sm text-muted">
            Set a goal and a deadline. The agent keeps the plan honest as your
            week changes — and stays quiet unless it needs a decision from you.
          </p>
        </div>
        {!unconfigured && (
          <Link to="/missions/new">
            <Btn variant="primary">
              <span className="flex items-center gap-1.5">
                <Plus className="h-4 w-4" /> New mission
              </span>
            </Btn>
          </Link>
        )}
      </header>

      {unconfigured && (
        <Panel className="p-5 text-sm text-muted">
          Study Missions save your plan and mastery to your account. Sign in to
          create one.
        </Panel>
      )}

      {!unconfigured && error && (
        <Panel className="border-hp/40 p-5 text-sm text-hp">{error}</Panel>
      )}

      {!unconfigured && !error && missions === null && (
        <Panel className="p-5">
          <Spinner label="Loading your missions…" />
        </Panel>
      )}

      {!unconfigured && missions?.length === 0 && (
        <Panel className="flex flex-col items-start gap-3 p-6">
          <span className="grid h-11 w-11 place-items-center rounded-xl border border-edge bg-panel-2 text-mana-bright">
            <Target className="h-5 w-5" />
          </span>
          <div className="font-bold">No missions yet</div>
          <p className="text-sm text-muted">
            Create one from an Atlas subject — pick the topics your exam covers,
            set the date, and run a short diagnostic.
          </p>
          <Link to="/missions/new">
            <Btn variant="primary">Create your first mission</Btn>
          </Link>
        </Panel>
      )}

      <div className="flex flex-col gap-3">
        {missions?.map((m, i) => {
          const subject = getSubject(m.subject_id)
          const days = daysBetween(new Date(), m.exam_date)
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link to={`/missions/${m.id}`} className="block">
                <Panel className="flex items-center gap-4 p-4 transition hover:border-mana">
                  <span className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-xl border border-edge bg-panel-2 text-mana-bright">
                    <Target className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-bold">{m.title}</span>
                      {m.status !== 'active' && (
                        <span className="rounded-md border border-edge px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                          {m.status}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {subject?.name ?? m.subject_id} · exam {m.exam_date} ·{' '}
                      {days > 0 ? `${days} days left` : 'exam passed'}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted" />
                </Panel>
              </Link>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
