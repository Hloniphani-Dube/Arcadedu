import { useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight, Compass } from 'lucide-react'

const LABEL = {
  story: { text: 'Story', icon: BookOpen },
  guide: { text: 'How to approach it', icon: Compass },
}

/**
 * Shows an AI challenge with its lead-in kept separate from the problem.
 * In "story" mode (Story Mode only) the lead-in is narrative flavour; in
 * "guide" mode (everywhere else) it's a short, direct pointer to the method —
 * readers get oriented, then see clearly what they must answer.
 */
export function QuestionCard({
  kind = 'guide',
  lead,
  question,
}: {
  kind?: 'story' | 'guide'
  lead?: string
  question: string
}) {
  const [open, setOpen] = useState(true)
  const { text, icon: Icon } = LABEL[kind]

  return (
    <div className="mt-4 space-y-2">
      {lead?.trim() && (
        <div className="rounded-xl border border-edge bg-panel-2/50 p-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-mana-bright"
            aria-expanded={open}
          >
            <Icon className="h-3.5 w-3.5" />
            {text}
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
          {open && (
            <p
              className={`mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-muted ${kind === 'story' ? 'italic' : ''}`}
            >
              {lead}
            </p>
          )}
        </div>
      )}

      <div className="rounded-xl border border-mana/40 bg-void/60 p-3">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-mana-bright">
          Question
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{question}</p>
      </div>
    </div>
  )
}
