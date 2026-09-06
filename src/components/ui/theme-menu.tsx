import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { Sun, Moon, Monitor, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme, type ThemeMode } from '@/theme'

const MODES: { value: ThemeMode; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
]

export function ThemeMenu({ className }: { className?: string }) {
  const skin = useTheme((s) => s.skin)
  const mode = useTheme((s) => s.mode)
  const setSkin = useTheme((s) => s.setSkin)
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
    <div ref={rootRef} className={cn('flex flex-wrap items-center gap-2', className)}>
      {/* Skin toggle */}
      <div className="arcade-frame flex overflow-hidden rounded-lg border border-edge bg-panel text-xs">
        {(['normal', 'arcade'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSkin(s)}
            className={cn(
              'px-2.5 py-1.5 capitalize transition',
              skin === s
                ? 'bg-mana text-white'
                : 'text-muted hover:text-ink',
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Colour-mode dropdown */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="arcade-frame flex items-center gap-2 rounded-lg border border-edge bg-panel px-3 py-1.5 text-xs font-semibold transition hover:border-mana"
        >
          <current.Icon className="h-3.5 w-3.5" />
          <span>{current.label}</span>
          <ChevronDown aria-hidden className="h-3.5 w-3.5 text-muted" />
        </button>

        {open && (
          <ul
            role="listbox"
            className="arcade-frame absolute right-0 z-50 mt-1 w-36 overflow-hidden rounded-lg border border-edge bg-panel py-1 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.8)]"
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
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition',
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
    </div>
  )
}
