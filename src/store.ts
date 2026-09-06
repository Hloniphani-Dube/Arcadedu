import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { levelForXp } from './game/engine'

export type View = 'home' | 'learn' | 'rpg' | 'map'

export interface Profile {
  name: string
  xp: number
  /** worldId -> number of times its boss has been beaten */
  worldClears: Record<string, number>
}

interface AppState {
  view: View
  profile: Profile
  setView: (v: View) => void
  setName: (name: string) => void
  addXp: (amount: number) => number // returns new total
  recordClear: (worldId: string) => void
  resetProfile: () => void
}

const initialProfile: Profile = {
  name: 'Adventurer',
  xp: 0,
  worldClears: {},
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      view: 'home',
      profile: initialProfile,
      setView: (view) => set({ view }),
      setName: (name) =>
        set((s) => ({ profile: { ...s.profile, name: name.trim() || 'Adventurer' } })),
      addXp: (amount) => {
        const next = Math.max(0, get().profile.xp + amount)
        set((s) => ({ profile: { ...s.profile, xp: next } }))
        return next
      },
      recordClear: (worldId) =>
        set((s) => ({
          profile: {
            ...s.profile,
            worldClears: {
              ...s.profile.worldClears,
              [worldId]: (s.profile.worldClears[worldId] ?? 0) + 1,
            },
          },
        })),
      resetProfile: () => set({ profile: initialProfile }),
    }),
    { name: 'arcadedu.profile.v1', partialize: (s) => ({ profile: s.profile }) },
  ),
)

export const selectLevel = (s: AppState) => levelForXp(s.profile.xp)
