import { Link, Navigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Check, Flag, Lock, Star } from 'lucide-react'
import { getChapter } from '../game/story'
import {
  useApp,
  selectStoryChapterUnlocked,
  selectStoryLevelUnlocked,
  selectTopicState,
  STORY_SUBJECT_ID,
} from '../store'
import { Panel } from '../components/ui'

export function StoryChapter() {
  const { chapterId } = useParams()
  const app = useApp()
  const chapter = getChapter(chapterId)

  if (!chapter) return <Navigate to="/story" replace />
  if (!selectStoryChapterUnlocked(app, chapter.id))
    return <Navigate to="/story" replace />

  const completed = new Set(
    selectTopicState(app, STORY_SUBJECT_ID, chapter.id).completed,
  )
  const allDone = completed.size >= chapter.levels.length

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to="/story"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Story I
      </Link>

      <header className="mb-6">
        <p className="text-xs uppercase tracking-wide text-muted">
          Chapter {chapter.index + 1} of 12
        </p>
        <h1 className="title-serif text-3xl">{chapter.title}</h1>
        <p className="mt-2 text-sm italic text-muted">{chapter.premise}</p>
      </header>

      <div className="flex flex-col gap-2">
        {chapter.levels.map((lvl, i) => {
          const isDone = completed.has(lvl.id)
          const unlocked = selectStoryLevelUnlocked(app, chapter.id, lvl.id)
          const isLast = i === chapter.levels.length - 1

          const row = (
            <Panel
              className={`flex items-center gap-4 p-4 transition ${
                unlocked ? 'hover:border-mana' : 'opacity-60'
              }`}
            >
              <span
                className={`grid h-9 w-9 flex-shrink-0 place-items-center rounded-full border ${
                  isDone
                    ? 'border-heal bg-heal/15 text-heal'
                    : unlocked
                      ? 'border-mana bg-mana/15 text-mana-bright'
                      : 'border-edge bg-panel-2 text-muted'
                }`}
              >
                {isDone ? (
                  <Check className="h-4 w-4" />
                ) : !unlocked ? (
                  <Lock className="h-4 w-4" />
                ) : isLast ? (
                  <Flag className="h-4 w-4" />
                ) : (
                  <Star className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{lvl.title}</div>
                <div className="mt-0.5 text-xs capitalize text-muted">
                  {lvl.tier} · level {i + 1}
                </div>
              </div>
              {unlocked && (
                <span className="text-sm font-semibold text-mana-bright">
                  {isDone ? 'Replay' : 'Play'}
                </span>
              )}
            </Panel>
          )

          return (
            <motion.div
              key={lvl.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              {unlocked ? (
                <Link to={`/story/${chapter.id}/${lvl.id}`} className="block">
                  {row}
                </Link>
              ) : (
                row
              )}
            </motion.div>
          )
        })}
      </div>

      {allDone && (
        <p className="mt-4 text-center text-sm text-heal">
          <Check className="mr-1 inline h-4 w-4" />
          Chapter complete. The next one is open.
        </p>
      )}
    </div>
  )
}
