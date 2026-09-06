import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { resolveMode, useTheme } from './theme-store'

/**
 * Applies the current theme to <html> as data-attributes:
 *   data-skin  = "normal" | "arcade"
 *   data-theme = "light"  | "dark"   (system is resolved live)
 * All colour/skin CSS in index.css keys off these, so no context plumbing is needed.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const skin = useTheme((s) => s.skin)
  const mode = useTheme((s) => s.mode)

  useEffect(() => {
    const root = document.documentElement
    root.dataset.skin = skin

    const apply = () => {
      root.dataset.theme = resolveMode(mode)
    }
    apply()

    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [skin, mode])

  return <>{children}</>
}
