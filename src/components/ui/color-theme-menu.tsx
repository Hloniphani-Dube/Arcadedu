import { useEffect, useRef, useState } from 'react'
import { Palette, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme, type ColorTheme } from '@/theme'

const THEMES: { value: ColorTheme; label: string; swatch: [string, string] }[] = [
  { value: 'default', label: 'Default', swatch: ['#6c5cff', '#caf95f'] },
  { value: 'light', label: 'Light', swatch: ['#ffffff', '#000000'] },
  { value: 'dark', label: 'Dark', swatch: ['#000000', '#ffffff'] },
  { value: 'forest-cream', label: 'Forest Cream', swatch: ['#283618', '#FEFAE0'] },
  { value: 'lavender-sky', label: 'Lavender Sky', swatch: ['#CDB4DB', '#BDE0FE'] },
  { value: 'deep-ocean', label: 'Deep Ocean', swatch: ['#264653', '#E9C46A'] },
  { value: 'vintage', label: 'Vintage', swatch: ['#3D405B', '#F2CC8F'] },
  { value: 'teal-mist', label: 'Teal Mist', swatch: ['#006D77', '#EDF6F9'] },
  { value: 'plum-cream', label: 'Plum Cream', swatch: ['#6D597A', '#F7EDE2'] },
  { value: 'ocean-breeze', label: 'Ocean Breeze', swatch: ['#1D3557', '#A8DADC'] },
  { value: 'midnight-rose', label: 'Midnight Rose', swatch: ['#4A4E69', '#F2E9E4'] },
  { value: 'sage-garden', label: 'Sage Garden', swatch: ['#386641', '#F2E8CF'] },
  { value: 'cocoa-paper', label: 'Cocoa Paper', swatch: ['#7F5539', '#EDE0D4'] },
]

function Swatch({ colors }: { colors: [string, string] }) {
  return (
    <span className="flex h-3.5 w-3.5 flex-shrink-0 overflow-hidden border border-edge">
      <span className="h-full w-1/2" style={{ background: colors[0] }} />
      <span className="h-full w-1/2" style={{ background: colors[1] }} />
    </span>
  )
}

export function ColorThemeMenu({ className }: { className?: string }) {
  const colorTheme = useTheme((s) => s.colorTheme)
  const setColorTheme = useTheme((s) => s.setColorTheme)

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

  const current = THEMES.find((t) => t.value === colorTheme) ?? THEMES[0]

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="arcade-frame flex w-full items-center gap-2 border border-edge bg-panel px-3 py-2 text-[11px] font-semibold uppercase tracking-wide transition hover:border-mana"
      >
        <Palette className="h-3.5 w-3.5" />
        <span className="flex-1 truncate text-left">{current.label}</span>
        <Swatch colors={current.swatch} />
        <ChevronDown aria-hidden className="h-3.5 w-3.5 text-muted" />
      </button>

      {open && (
        <ul
          role="listbox"
          className="arcade-frame absolute bottom-full left-0 z-50 mb-1 max-h-72 w-full overflow-y-auto border border-edge bg-panel py-1"
        >
          {THEMES.map((t) => (
            <li key={t.value}>
              <button
                type="button"
                role="option"
                aria-selected={colorTheme === t.value}
                onClick={() => {
                  setColorTheme(t.value)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] uppercase tracking-wide transition',
                  colorTheme === t.value
                    ? 'bg-panel-2 text-mana-bright'
                    : 'text-muted hover:bg-panel-2 hover:text-ink',
                )}
              >
                <Swatch colors={t.swatch} />
                {t.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
