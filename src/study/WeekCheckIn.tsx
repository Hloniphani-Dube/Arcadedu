import { useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { useAuth } from '../auth/auth-context'
import { toDayString } from './dates'
import { mapWeek } from '../lib/ai'
import { createCalendarEvents } from './db'
import { Btn, Panel, Spinner } from '../components/ui'

const INPUT =
  'border-2 border-edge bg-void p-2.5 text-sm outline-none focus:border-mana'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

interface ProposedEvent {
  title: string
  kind: string
  date: string
}

export function WeekCheckIn({ onAdded }: { onAdded?: () => void }) {
  const { user } = useAuth()
  const [text, setText] = useState('')
  const [proposed, setProposed] = useState<ProposedEvent[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justAdded, setJustAdded] = useState(0)

  async function ask() {
    if (!user || text.trim().length < 8) return
    setBusy(true)
    setError(null)
    setJustAdded(0)
    try {
      const r = await mapWeek({ weekText: text.trim(), today: toDayString(new Date()) })
      const events = r.events.filter((e) => DATE_RE.test(e.date) && e.title.trim())
      if (events.length === 0) {
        setError("ARIA couldn't find a clear date in that — try adding one, e.g. \"Friday\" or a date.")
      } else {
        setProposed(events)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ARIA is unavailable right now.')
    } finally {
      setBusy(false)
    }
  }

  function removeItem(idx: number) {
    setProposed((p) => (p ? p.filter((_, i) => i !== idx) : p))
  }

  async function confirm() {
    if (!user || !proposed || proposed.length === 0) return
    setBusy(true)
    setError(null)
    try {
      await createCalendarEvents(user.id, proposed)
      setJustAdded(proposed.length)
      setProposed(null)
      setText('')
      onAdded?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add those to your calendar.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-mana-bright" />
        <span className="text-sm font-bold">What's happening this week?</span>
      </div>
      <p className="text-xs text-muted">
        Tell ARIA about tests, deadlines, appointments or days off — she'll
        turn them into calendar dates for you to review.
      </p>

      {error && (
        <div className="border-2 border-hp/50 bg-hp/10 p-3 text-sm text-hp">
          {error}
        </div>
      )}

      {justAdded > 0 && !proposed && (
        <div className="border-2 border-heal/50 bg-heal/10 p-3 text-sm text-heal">
          Added {justAdded} date{justAdded === 1 ? '' : 's'} to your calendar.
        </div>
      )}

      {proposed ? (
        <>
          <div className="flex flex-col gap-2">
            {proposed.map((e, idx) => (
              <div
                key={`${e.title}-${e.date}-${idx}`}
                className="flex items-center gap-2 border border-edge p-2 text-sm"
              >
                <span className="rounded-md border border-edge px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                  {e.kind}
                </span>
                <span className="flex-1 truncate">{e.title}</span>
                <span className="text-xs text-muted">{e.date}</span>
                <button
                  type="button"
                  onClick={() => removeItem(idx)}
                  aria-label="Remove"
                  className="text-muted hover:text-hp"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Btn
              variant="primary"
              onClick={confirm}
              disabled={busy || proposed.length === 0}
            >
              {busy ? (
                <Spinner label="Adding…" />
              ) : (
                `Add ${proposed.length} to calendar`
              )}
            </Btn>
            <Btn variant="ghost" onClick={() => setProposed(null)} disabled={busy}>
              Start over
            </Btn>
          </div>
        </>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="e.g. Chemistry test Friday, dentist Wednesday 3pm, no school Monday"
            className={`${INPUT} resize-y font-[family-name:var(--font-body)]`}
          />
          <Btn
            variant="primary"
            onClick={ask}
            disabled={busy || text.trim().length < 8}
          >
            {busy ? <Spinner label="ARIA is reading your week…" /> : 'Ask ARIA'}
          </Btn>
        </>
      )}
    </Panel>
  )
}
