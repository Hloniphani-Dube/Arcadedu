import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Visual language / design skin. */
export type Skin = 'arcade' | 'retro' | 'library' | 'classical' | 'terminal'
/** Colour mode preference; 'system' follows the OS. Only matters when
 *  colorTheme is 'default' — it's what a skin's own palette uses. */
export type ThemeMode = 'light' | 'dark' | 'system'
/** Optional palette override, independent of skin. 'default' defers to the
 *  active skin's own light/dark palette (today's behaviour). */
export type ColorTheme =
  | 'default'
  | 'light'
  | 'dark'
  | 'forest-cream'
  | 'lavender-sky'
  | 'deep-ocean'
  | 'vintage'
  | 'teal-mist'
  | 'plum-cream'
  | 'ocean-breeze'
  | 'midnight-rose'
  | 'sage-garden'
  | 'cocoa-paper'

interface ThemeState {
  skin: Skin
  mode: ThemeMode
  colorTheme: ColorTheme
  setSkin: (skin: Skin) => void
  setMode: (mode: ThemeMode) => void
  setColorTheme: (colorTheme: ColorTheme) => void
}

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      skin: 'arcade',
      mode: 'system',
      colorTheme: 'default',
      setSkin: (skin) => set({ skin }),
      setMode: (mode) => set({ mode }),
      setColorTheme: (colorTheme) => set({ colorTheme }),
    }),
    { name: 'arcadedu.theme.v1' },
  ),
)

/** Resolve 'system' to a concrete mode using the current OS setting. */
export function resolveMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** The structural light/dark signal (`data-theme`): a non-default color
 *  theme drives it directly (dark→dark, everything else→light, since every
 *  named theme is light-appearing); 'default' falls back to `mode`. */
export function resolveDataTheme(colorTheme: ColorTheme, mode: ThemeMode): 'light' | 'dark' {
  if (colorTheme === 'default') return resolveMode(mode)
  return colorTheme === 'dark' ? 'dark' : 'light'
}
