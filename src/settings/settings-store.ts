import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  /** Enemy portraits + HP bars during battles. Off = text-only battles. */
  showRpgHud: boolean
  setShowRpgHud: (show: boolean) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      showRpgHud: true,
      setShowRpgHud: (show) => set({ showRpgHud: show }),
    }),
    { name: 'arcadedu.settings.v1' },
  ),
)
