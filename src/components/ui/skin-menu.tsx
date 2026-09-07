import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { Gamepad2, Tv, BookOpen, Landmark, Terminal, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme, type Skin } from '@/theme'

const SKINS: {
  value: Skin
  label: string
  Icon: ComponentType<{ className?: string }>
}[] = [
  { value: 'arcade', label: 'Arcade', Icon: Gamepad2 },
  { value: 'retro', label: 'Retro', Icon: Tv },
  { value: 'library', label: 'Library', Icon: BookOpen },
  { value: 'classical', label: 'Classical', Icon: Landmark },
  { value: 'terminal', label: 'Terminal', Icon: Terminal },
]

export function SkinMenu({ className }: { className?: string }) {
  const skin = useTheme((s) => s.skin)
  const setSkin = useTheme((s) => s.setSkin)

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

  const current = SKINS.find((s) => s.value === skin) ?? SKINS[0]

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
          className="arcade-frame absolute left-0 top-full z-50 mt-1 max-h-72 w-full overflow-y-auto border border-edge bg-panel py-1"
        >
          {SKINS.map((s) => (
            <li key={s.value}>
              <button
                type="button"
                role="option"
                aria-selected={skin === s.value}
                onClick={() => {
                  setSkin(s.value)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] uppercase tracking-wide transition',
                  skin === s.value
                    ? 'bg-panel-2 text-mana-bright'
                    : 'text-muted hover:bg-panel-2 hover:text-ink',
                )}
              >
                <s.Icon className="h-3.5 w-3.5" />
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
