import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, toDayString } from './dates'

export type MarkerTone =
  | 'exam'
  | 'assignment'
  | 'quiz'
  | 'deadline'
  | 'lecture'
  | 'session'
  | 'routine'
  | 'other'

export interface DayMarker {
  id: string
  label: string
  tone: MarkerTone
}

const TONE_CHIP: Record<MarkerTone, string> = {
  exam: 'bg-hp/20 text-hp border-hp/40',
  assignment: 'bg-xp/20 text-xp border-xp/40',
  deadline: 'bg-xp/15 text-xp border-xp/30',
  quiz: 'bg-mana/20 text-mana-bright border-mana/40',
  lecture: 'bg-heal/15 text-heal border-heal/30',
  session: 'bg-heal/20 text-heal border-heal/40',
  routine: 'bg-mana/15 text-mana-bright border-mana/30',
  other: 'bg-panel-2 text-muted border-edge',
}

const TONE_DOT: Record<MarkerTone, string> = {
  exam: 'bg-hp',
  assignment: 'bg-xp',
  deadline: 'bg-xp',
  quiz: 'bg-mana',
  lecture: 'bg-heal',
  session: 'bg-heal',
  routine: 'bg-mana',
  other: 'bg-edge',
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DOW_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DOW_MINI = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function monthStep(month: Date, delta: number): Date {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + delta, 1))
}

export function MonthCalendar({
  month,
  onMonthChange,
  markersByDay,
  selectedDay,
  onSelectDay,
  compact = false,
}: {
  month: Date
  onMonthChange?: (next: Date) => void
  markersByDay: Record<string, DayMarker[]>
  selectedDay?: string | null
  onSelectDay?: (day: string) => void
  compact?: boolean
}) {
  const todayIso = toDayString(new Date())
  const y = month.getUTCFullYear()
  const m = month.getUTCMonth()

  const cells = useMemo(() => {
    const first = new Date(Date.UTC(y, m, 1))
    const gridStart = addDays(first, -first.getUTCDay())
    return Array.from({ length: 42 }, (_, i) => {
      const day = addDays(gridStart, i)
      const iso = toDayString(day)
      return {
        iso,
        num: day.getUTCDate(),
        inMonth: day.getUTCMonth() === m,
        isToday: iso === todayIso,
      }
    })
  }, [y, m, todayIso])

  return (
    <div className="arcade-frame rounded-2xl border border-edge bg-panel/80 p-3 backdrop-blur">
      <div className="mb-2 flex items-center justify-between px-1">
        <div className="text-sm font-bold">
          {MONTHS[m]} {y}
        </div>
        {onMonthChange && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => onMonthChange(monthStep(month, -1))}
              className="rounded-md p-1 text-muted hover:bg-panel-2 hover:text-ink"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onMonthChange(new Date(Date.UTC(
                new Date().getUTCFullYear(),
                new Date().getUTCMonth(),
                1,
              )))}
              className="rounded-md px-2 py-1 text-xs text-muted hover:bg-panel-2 hover:text-ink"
            >
              Today
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => onMonthChange(monthStep(month, 1))}
              className="rounded-md p-1 text-muted hover:bg-panel-2 hover:text-ink"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-7 gap-px text-center text-[10px] font-semibold uppercase tracking-wide text-muted">
        {(compact ? DOW_MINI : DOW_FULL).map((d, i) => (
          <div key={i} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-edge bg-edge">
        {cells.map((c) => {
          const markers = markersByDay[c.iso] ?? []
          const selected = selectedDay === c.iso
          return (
            <button
              type="button"
              key={c.iso}
              onClick={() => onSelectDay?.(c.iso)}
              className={[
                'flex flex-col gap-1 bg-void p-1 text-left transition',
                compact ? 'min-h-[38px]' : 'min-h-[88px]',
                c.inMonth ? '' : 'opacity-40',
                onSelectDay ? 'hover:bg-panel-2' : 'cursor-default',
                selected ? 'ring-1 ring-inset ring-mana' : '',
              ].join(' ')}
            >
              <span
                className={[
                  'grid h-5 w-5 place-items-center rounded-full text-[11px]',
                  c.isToday
                    ? 'bg-mana font-bold text-on-accent'
                    : 'text-muted',
                ].join(' ')}
              >
                {c.num}
              </span>

              {compact ? (
                markers.length > 0 && (
                  <span className="flex flex-wrap gap-0.5">
                    {markers.slice(0, 4).map((mk) => (
                      <span
                        key={mk.id}
                        className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[mk.tone]}`}
                      />
                    ))}
                  </span>
                )
              ) : (
                <span className="flex flex-col gap-0.5">
                  {markers.slice(0, 3).map((mk) => (
                    <span
                      key={mk.id}
                      title={mk.label}
                      className={`truncate rounded border px-1 py-0.5 text-[10px] leading-tight ${TONE_CHIP[mk.tone]}`}
                    >
                      {mk.label}
                    </span>
                  ))}
                  {markers.length > 3 && (
                    <span className="px-1 text-[10px] text-muted">
                      +{markers.length - 3} more
                    </span>
                  )}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
