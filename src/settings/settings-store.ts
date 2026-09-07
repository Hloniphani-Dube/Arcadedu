import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  /** Show pixel-art enemy portraits during battles. */
  showEnemyArt: boolean
  setShowEnemyArt: (show: boolean) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      showEnemyArt: true,
      setShowEnemyArt: (show) => set({ showEnemyArt: show }),
    }),
    { name: 'arcadedu.settings.v1' },
  ),
)
