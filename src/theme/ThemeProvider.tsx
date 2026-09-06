import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { resolveMode, useTheme } from './theme-store'

/**
 * Applies the theme to <html> as data-attributes:
 *   data-skin  = "arcade"   (always — Arcadedu is arcade-only)
 *   data-theme = "light" | "dark"   ("system" is resolved live)
 * All colour/skin CSS in index.css keys off these.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const mode = useTheme((s) => s.mode)

  useEffect(() => {
    const root = document.documentElement
    root.dataset.skin = 'arcade'

    const apply = () => {
      root.dataset.theme = resolveMode(mode)
    }
    apply()

    if (mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [mode])

  return <>{children}</>
}
