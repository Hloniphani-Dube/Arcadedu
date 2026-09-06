import { useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight } from 'lucide-react'

/**
 * Shows an AI challenge with the story flavour kept separate from the problem.
 * The narrative sits in its own collapsible block above a clearly-labelled
 * Question block — readers who want the tale get it, readers who don't can
 * collapse it and go straight to what they must answer.
 */
export function QuestionCard({
  narrative,
  question,
}: {
  narrative?: string
  question: string
}) {
  const [openStory, setOpenStory] = useState(true)

  return (
    <div className="mt-4 space-y-2">
      {narrative?.trim() && (
        <div className="rounded-xl border border-edge bg-panel-2/50 p-3">
          <button
            type="button"
            onClick={() => setOpenStory((v) => !v)}
            className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-mana-bright"
            aria-expanded={openStory}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Story
            {openStory ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
          {openStory && (
            <p className="mt-1.5 whitespace-pre-wrap text-sm italic leading-relaxed text-muted">
              {narrative}
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
