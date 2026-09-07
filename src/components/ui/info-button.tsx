import { useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Panel } from '../ui'

export function InfoButton({
  title,
  summary,
  children,
}: {
  title: string
  summary: string
  children: ReactNode
}) {
  const [hover, setHover] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <div className="relative inline-block">
      <button
        type="button"
        aria-label={title}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => {
          setOpen(true)
          setHover(false)
        }}
        className="arcade-frame grid h-5 w-5 place-items-center border border-edge bg-panel text-[10px] font-bold text-muted transition hover:border-mana hover:text-mana-bright"
      >
        ?
      </button>

      {hover && !open && (
        <Panel className="absolute right-0 top-full z-40 mt-2 w-56 p-2.5 text-left text-[11px] normal-case tracking-normal text-muted">
          {summary}
        </Panel>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[200] grid place-items-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <Panel className="p-5 text-left normal-case tracking-normal">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-bold">{title}</h3>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                  className="text-muted hover:text-hp"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="text-sm text-muted">{children}</div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  )
}
