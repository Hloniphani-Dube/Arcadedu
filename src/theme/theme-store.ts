import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Visual language. */
export type Skin = 'normal' | 'arcade'
/** Colour mode preference; 'system' follows the OS. */
export type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeState {
  skin: Skin
  mode: ThemeMode
  setSkin: (skin: Skin) => void
  setMode: (mode: ThemeMode) => void
  toggleSkin: () => void
}

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      skin: 'normal',
      mode: 'system',
      setSkin: (skin) => set({ skin }),
      setMode: (mode) => set({ mode }),
      toggleSkin: () => set({ skin: get().skin === 'arcade' ? 'normal' : 'arcade' }),
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
