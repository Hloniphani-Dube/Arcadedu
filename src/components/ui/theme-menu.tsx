import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { Sun, Moon, Monitor, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme, type ThemeMode } from '@/theme'

const MODES: {
  value: ThemeMode
  label: string
  Icon: ComponentType<{ className?: string }>
}[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
]

export function ThemeMenu({ className }: { className?: string }) {
  const mode = useTheme((s) => s.mode)
  const setMode = useTheme((s) => s.setMode)

  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = MODES.find((m) => m.value === mode) ?? MODES[2]

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="arcade-frame flex w-full items-center gap-2 border border-edge bg-panel px-3 py-2 text-[11px] font-semibold uppercase tracking-wide transition hover:border-mana"
      >
        <current.Icon className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">{current.label}</span>
        <ChevronDown aria-hidden className="h-3.5 w-3.5 text-muted" />
      </button>

      {open && (
        <ul
          role="listbox"
          className="arcade-frame absolute bottom-full left-0 z-50 mb-1 w-full border border-edge bg-panel py-1"
        >
          {MODES.map((m) => (
            <li key={m.value}>
              <button
                type="button"
                role="option"
                aria-selected={mode === m.value}
                onClick={() => {
                  setMode(m.value)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] uppercase tracking-wide transition',
                  mode === m.value
                    ? 'bg-panel-2 text-mana-bright'
                    : 'text-muted hover:bg-panel-2 hover:text-ink',
                )}
              >
                <m.Icon className="h-3.5 w-3.5" />
                {m.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
