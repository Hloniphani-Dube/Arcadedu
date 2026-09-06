import type { LearnAction } from '../lib/types'
import { Btn } from './ui'

interface ActionMeta {
  action: LearnAction
  label: string
  icon: string
  /** actions that need the student's own work filled in */
  needsAnswer?: boolean
}

// The whole point of the product: this list is the entire surface area the
// student has. No free-text prompt box anywhere.
const LEARN_ACTIONS: ActionMeta[] = [
  { action: 'explain', label: 'Explain this', icon: '📘' },
  { action: 'understand', label: 'Help me understand', icon: '🧠' },
  { action: 'steps', label: 'Show me the steps', icon: '🪜' },
  { action: 'hint', label: 'Give me a hint', icon: '💡' },
  { action: 'example', label: 'Give me an example', icon: '🔎' },
  { action: 'simplify', label: 'Simplify this', icon: '✂️' },
  { action: 'summarize', label: 'Summarize', icon: '📝' },
  { action: 'similar_problem', label: 'Give me a similar problem', icon: '🎲' },
  { action: 'check_answer', label: 'Check my answer', icon: '✅', needsAnswer: true },
  { action: 'explain_mistake', label: 'Explain my mistake', icon: '🔧', needsAnswer: true },
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
            <span className="mr-1">{m.icon}</span>
            {m.label}
          </Btn>
        )
      })}
    </div>
  )
}
