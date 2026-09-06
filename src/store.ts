import { create } from 'zustand'
import { levelForXp } from './game/engine'
import { DEFAULT_UNLOCKED, SUBJECTS, getSubject, getTopic } from './game/atlas'
import {
  persistProfile,
  persistSubject,
  persistTopic,
  type ProgressSnapshot,
} from './lib/progress'

export interface Profile {
  name: string
  avatar: string
  xp: number
}

export interface SubjectState {
  unlocked: boolean
  clears: number
}

export interface TopicState {
  /** node ids the player has cleared */
  completed: string[]
  /** node id the player is currently on (next to play) */
  current: string | null
}

const DEFAULT_PROFILE: Profile = { name: 'Adventurer', avatar: '🧑‍🎓', xp: 0 }

function defaultSubjects(): Record<string, SubjectState> {
  const out: Record<string, SubjectState> = {}
  for (const id of DEFAULT_UNLOCKED) out[id] = { unlocked: true, clears: 0 }
  return out
}

const topicKey = (s: string, t: string) => `${s}/${t}`

interface AppState {
  userId: string | null
  hydrated: boolean
  profile: Profile
  subjects: Record<string, SubjectState>
  topics: Record<string, TopicState>

  hydrate: (userId: string | null, snap: ProgressSnapshot | null) => void
  resetLocal: () => void

  setName: (name: string) => void
  setAvatar: (avatar: string) => void
  addXp: (amount: number) => number

  /** Mark a node cleared and advance `current` to the next node. */
  completeNode: (subjectId: string, topicId: string, nodeId: string) => void
  /** Record a full topic/boss clear for a subject and unlock any dependants. */
  recordClear: (subjectId: string) => void
}

export const useApp = create<AppState>()((set, get) => ({
  userId: null,
  hydrated: false,
  profile: DEFAULT_PROFILE,
  subjects: defaultSubjects(),
  topics: {},

  hydrate: (userId, snap) =>
    set(() => ({
      userId,
      hydrated: true,
      profile: snap?.profile ?? DEFAULT_PROFILE,
      subjects: { ...defaultSubjects(), ...(snap?.subjects ?? {}) },
      topics: snap?.topics ?? {},
    })),

  resetLocal: () =>
    set({
      userId: null,
      hydrated: false,
      profile: DEFAULT_PROFILE,
      subjects: defaultSubjects(),
      topics: {},
    }),

  setName: (name) => {
    const clean = name.trim() || 'Adventurer'
    set((s) => ({ profile: { ...s.profile, name: clean } }))
    void persistProfile(get().userId, { display_name: clean })
  },

  setAvatar: (avatar) => {
    set((s) => ({ profile: { ...s.profile, avatar } }))
    void persistProfile(get().userId, { avatar })
  },

  addXp: (amount) => {
    const next = Math.max(0, get().profile.xp + amount)
    set((s) => ({ profile: { ...s.profile, xp: next } }))
    void persistProfile(get().userId, { xp: next })
    return next
  },

  completeNode: (subjectId, topicId, nodeId) => {
    const topic = getTopic(subjectId, topicId)
    if (!topic) return
    const key = topicKey(subjectId, topicId)
    const prev = get().topics[key] ?? { completed: [], current: topic.nodes[0]?.id ?? null }
    if (prev.completed.includes(nodeId)) return

    const completed = [...prev.completed, nodeId]
    const idx = topic.nodes.findIndex((n) => n.id === nodeId)
    const nextNode = topic.nodes[idx + 1]?.id ?? null
    const state: TopicState = {
      completed,
      current: nextNode ?? nodeId,
    }
    set((s) => ({ topics: { ...s.topics, [key]: state } }))
    void persistTopic(get().userId, subjectId, topicId, {
      completed_nodes: completed,
      current_node: state.current,
      completed_at: nextNode ? null : new Date().toISOString(),
    })
  },

  recordClear: (subjectId) => {
    const cur = get().subjects[subjectId] ?? { unlocked: true, clears: 0 }
    const clears = cur.clears + 1
    const patch: Record<string, SubjectState> = {
      [subjectId]: { unlocked: true, clears },
    }
    // unlock any subject that was waiting on this one
    for (const s of getUnlockTargets(subjectId)) {
      if (!get().subjects[s]?.unlocked) patch[s] = { unlocked: true, clears: 0 }
    }
    set((s) => ({ subjects: { ...s.subjects, ...patch } }))
    const uid = get().userId
    void persistSubject(uid, subjectId, { unlocked: true, clears })
    for (const [id, st] of Object.entries(patch)) {
      if (id !== subjectId) void persistSubject(uid, id, { unlocked: st.unlocked, clears: st.clears })
    }
  },
}))

/** ids of subjects whose `requires` points at `subjectId`. */
function getUnlockTargets(subjectId: string): string[] {
  return SUBJECTS.filter((s) => s.requires === subjectId).map((s) => s.id)
}

// --- selectors ---------------------------------------------------------------

export const selectLevel = (s: AppState) => levelForXp(s.profile.xp)

export function selectTopicState(
  s: AppState,
  subjectId: string,
  topicId: string,
): TopicState {
  const topic = getTopic(subjectId, topicId)
  return (
    s.topics[topicKey(subjectId, topicId)] ?? {
      completed: [],
      current: topic?.nodes[0]?.id ?? null,
    }
  )
}

export function selectSubjectUnlocked(s: AppState, subjectId: string): boolean {
  return s.subjects[subjectId]?.unlocked ?? !getSubject(subjectId)?.requires
}

/** 0..1 completion across all of a subject's topic nodes. */
export function selectSubjectProgress(s: AppState, subjectId: string): number {
  const subject = getSubject(subjectId)
  if (!subject) return 0
  let total = 0
  let done = 0
  for (const t of subject.topics) {
    total += t.nodes.length
    done += (s.topics[topicKey(subjectId, t.id)]?.completed.length ?? 0)
  }
  return total ? done / total : 0
}
