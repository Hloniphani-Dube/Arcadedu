import type { ComponentType } from 'react'
import {
  BookOpen,
  Brain,
  ListOrdered,
  Lightbulb,
  Search,
  Scissors,
  FileText,
  Dices,
  Check,
  Wrench,
} from 'lucide-react'
import type { LearnAction } from '../lib/types'
import { Btn } from './ui'

interface ActionMeta {
  action: LearnAction
  label: string
  Icon: ComponentType<{ className?: string }>
  /** actions that need the student's own work filled in */
  needsAnswer?: boolean
}

// The whole point of the product: this list is the entire surface area the
// student has. No free-text prompt box anywhere.
const LEARN_ACTIONS: ActionMeta[] = [
  { action: 'explain', label: 'Explain this', Icon: BookOpen },
  { action: 'understand', label: 'Help me understand', Icon: Brain },
  { action: 'steps', label: 'Show me the steps', Icon: ListOrdered },
  { action: 'hint', label: 'Give me a hint', Icon: Lightbulb },
  { action: 'example', label: 'Give me an example', Icon: Search },
  { action: 'simplify', label: 'Simplify this', Icon: Scissors },
  { action: 'summarize', label: 'Summarize', Icon: FileText },
  { action: 'similar_problem', label: 'Give me a similar problem', Icon: Dices },
  { action: 'check_answer', label: 'Check my answer', Icon: Check, needsAnswer: true },
  { action: 'explain_mistake', label: 'Explain my mistake', Icon: Wrench, needsAnswer: true },
]

export function ActionBar({
  onAction,
  disabled,
  hasProblem,
  hasAnswer,
}: {
  onAction: (a: LearnAction, label: string) => void
  disabled?: boolean
  hasProblem: boolean
  hasAnswer: boolean
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {LEARN_ACTIONS.map((m) => {
        const blocked =
          disabled || !hasProblem || (m.needsAnswer && !hasAnswer)
        return (
          <Btn
            key={m.action}
            onClick={() => onAction(m.action, m.label)}
            disabled={blocked}
            title={
              !hasProblem
                ? 'Type the problem you are working on first'
                : m.needsAnswer && !hasAnswer
                  ? 'Fill in "your work" first'
                  : m.label
            }
          >
            <span className="flex items-center gap-1.5">
              <m.Icon className="h-4 w-4 flex-shrink-0 opacity-70" />
              {m.label}
            </span>
          </Btn>
        )
      })}
    </div>
  )
}
