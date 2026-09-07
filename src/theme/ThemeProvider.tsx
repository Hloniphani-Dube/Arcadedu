import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { resolveDataTheme, useTheme } from './theme-store'

/**
 * Applies the theme to <html> as data-attributes:
 *   data-skin        = "arcade" | "retro" | "library" | "classical" | "terminal"
 *   data-color-theme = "default" | "light" | "dark" | <10 named palettes>
 *   data-theme        = "light" | "dark"  — structural signal, derived from
 *                        colorTheme when it's non-default, else from `mode`
 *                        ("system" resolved live)
 * All colour/skin CSS in index.css keys off these.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const skin = useTheme((s) => s.skin)
  const mode = useTheme((s) => s.mode)
  const colorTheme = useTheme((s) => s.colorTheme)

  useEffect(() => {
    document.documentElement.dataset.skin = skin
  }, [skin])

  useEffect(() => {
    document.documentElement.dataset.colorTheme = colorTheme
  }, [colorTheme])

  useEffect(() => {
    const root = document.documentElement

    const apply = () => {
      root.dataset.theme = resolveDataTheme(colorTheme, mode)
    }
    apply()

    if (colorTheme !== 'default' || mode !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [mode, colorTheme])

  return <>{children}</>
}
