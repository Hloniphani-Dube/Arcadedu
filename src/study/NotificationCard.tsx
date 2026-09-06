import { AlertTriangle } from 'lucide-react'
import type { StudyNotification } from './types'
import { Panel, Btn } from '../components/ui'

/** In-app only. The agent asks for a human decision here rather than guessing. */
export function NotificationCard({
  notification,
  onAction,
  onDismiss,
}: {
  notification: StudyNotification
  onAction: (intent: string) => void
  onDismiss: () => void
}) {
  return (
    <Panel className="border-hp/40 bg-hp/5 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg border border-hp/40 bg-hp/10 text-hp">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink">{notification.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {notification.actions?.map((a) => (
              <Btn
                key={a.intent}
                variant="primary"
                onClick={() => onAction(a.intent)}
              >
                {a.label}
              </Btn>
            ))}
            <Btn onClick={onDismiss}>Dismiss</Btn>
          </div>
        </div>
      </div>
    </Panel>
  )
}
