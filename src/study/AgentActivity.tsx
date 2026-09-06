import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Activity, Check, X, Bell } from 'lucide-react'
import { fetchAgentEvents } from './db'
import type { AgentEvent } from './types'
import { Panel } from '../components/ui'

function timeOf(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`
}

/** The agent's own log — telemetry, not chat. Latest ~50 ticks. */
export function AgentActivity({
  missionId,
  refreshKey = 0,
}: {
  missionId: string
  refreshKey?: number
}) {
  const [events, setEvents] = useState<AgentEvent[] | null>(null)
  const lastKey = useRef<string | null>(null)

  useEffect(() => {
    const key = `${missionId}:${refreshKey}`
    if (lastKey.current === key) return
    lastKey.current = key
    let live = true
    fetchAgentEvents(missionId, 50)
      .then((e) => live && setEvents(e))
      .catch(() => live && setEvents([]))
    return () => {
      live = false
    }
  }, [missionId, refreshKey])

  if (!events) return null
  if (events.length === 0) {
    return (
      <Panel className="p-4 text-sm text-muted">
        <div className="mb-1 flex items-center gap-1.5 font-semibold text-ink">
          <Activity className="h-4 w-4" /> Agent activity
        </div>
        Nothing yet. The agent logs a line every time it evaluates this mission.
      </Panel>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted">
        <Activity className="h-4 w-4" /> Agent activity
      </div>
      {events.map((e, i) => {
        const rejected = !e.applied && !!e.rejected_reason
        return (
          <motion.div
            key={e.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.02, 0.3) }}
          >
            <Panel className="p-3 text-sm">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{timeOf(e.created_at)}</span>
                <span className="flex items-center gap-2">
                  {e.confidence && (
                    <span className="uppercase tracking-wide">{e.confidence}</span>
                  )}
                  {e.notified && (
                    <span className="inline-flex items-center gap-1 text-xp">
                      <Bell className="h-3 w-3" /> notified
                    </span>
                  )}
                  {rejected ? (
                    <span className="inline-flex items-center gap-1 text-hp">
                      <X className="h-3 w-3" /> rejected
                    </span>
                  ) : e.applied ? (
                    <span className="inline-flex items-center gap-1 text-heal">
                      <Check className="h-3 w-3" /> applied
                    </span>
                  ) : (
                    <span>no change</span>
                  )}
                </span>
              </div>

              <div className="mt-1 font-semibold">
                {e.decision ?? 'no decision'}{' '}
                <span className="font-normal text-muted">· {e.trigger}</span>
              </div>

              {e.observations?.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-muted">
                  {e.observations.map((o, k) => (
                    <li key={k}>{o}</li>
                  ))}
                </ul>
              )}
              {e.reason && <p className="mt-1 text-muted">{e.reason}</p>}
              {rejected && (
                <p className="mt-1 text-hp">Rejected: {e.rejected_reason}</p>
              )}
            </Panel>
          </motion.div>
        )
      })}
    </div>
  )
}
