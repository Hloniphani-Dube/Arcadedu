import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SettingsState {
  /** Portrait images in Story Mode. Off = text-only stops. */
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
