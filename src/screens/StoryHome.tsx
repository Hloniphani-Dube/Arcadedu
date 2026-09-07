import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookOpen, Check, ChevronRight, Lock } from 'lucide-react'
import { STORY_ONE } from '../game/story'
import {
  useApp,
  selectStoryChapterDone,
  selectStoryChapterUnlocked,
  selectStoryProgress,
  selectTopicState,
  STORY_SUBJECT_ID,
} from '../store'
import { Panel, PageHeader } from '../components/ui'

export function StoryHome() {
  const app = useApp()
  const progress = selectStoryProgress(app)

  return (
    <div>
      <PageHeader icon={<BookOpen className="h-5 w-5" />} title={STORY_ONE.title} />

      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>The tale so far</span>
            <span>{Math.round(progress * 100)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full border border-edge bg-void">
            <div
              className="h-full rounded-full bg-mana"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
        {STORY_ONE.chapters.map((ch, i) => {
          const unlocked = selectStoryChapterUnlocked(app, ch.id)
          const done = selectStoryChapterDone(app, ch.id)
          const cleared = selectTopicState(app, STORY_SUBJECT_ID, ch.id).completed.length
          const started = cleared > 0

          const inner = (
            <Panel
              className={`flex items-center gap-4 p-4 transition ${
                unlocked ? 'hover:border-mana' : 'opacity-60'
              }`}
            >
              <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg border border-edge bg-panel-2 text-sm font-bold text-muted">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold">{ch.title}</span>
                  {done && <Check className="h-4 w-4 text-heal" />}
                  {!unlocked && <Lock className="h-4 w-4 text-muted" />}
                </div>
                <p className="mt-1 truncate text-sm text-muted">{ch.premise}</p>
                <div className="mt-1 text-xs text-muted">
                  {cleared} / {ch.levels.length} levels
                </div>
              </div>
              {unlocked && (
                <span className="flex flex-shrink-0 items-center gap-1 text-sm font-semibold text-mana-bright">
                  {done ? 'Replay' : started ? 'Continue' : 'Begin'}
                  <ChevronRight className="h-4 w-4" />
                </span>
              )}
            </Panel>
          )

          return (
            <motion.div
              key={ch.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              {unlocked ? (
                <Link to={`/story/${ch.id}`} className="block">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </motion.div>
          )
        })}
        </div>
      </div>
    </div>
  )
}
