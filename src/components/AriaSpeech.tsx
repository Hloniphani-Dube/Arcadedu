import { motion } from 'framer-motion'
import { Spinner } from './ui'

export interface AriaLine {
  id: string
  /** What the student asked for (the action label), shown as a chip. */
  prompt: string
  text: string
}

export function AriaSpeech({
  lines,
  loading,
  emptyHint,
}: {
  lines: AriaLine[]
  loading?: boolean
  emptyHint?: string
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="text-2xl">🧙‍♀️</span>
        <div>
          <div className="font-bold text-mana-bright">ARIA</div>
          <div className="text-xs text-muted">Your learning companion</div>
        </div>
      </div>

      {lines.length === 0 && !loading && (
        <p className="text-sm text-muted">{emptyHint ?? 'Pick an action to begin.'}</p>
      )}

      <div className="flex flex-col gap-3">
        {lines.map((line) => (
          <motion.div
            key={line.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-edge bg-void/60 p-3"
          >
            <div className="mb-1 inline-block rounded-md bg-mana/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-mana-bright">
              {line.prompt}
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
              {line.text}
            </p>
          </motion.div>
        ))}
        {loading && (
          <div className="rounded-xl border border-edge bg-void/60 p-3">
            <Spinner />
          </div>
        )}
      </div>
    </div>
  )
}
