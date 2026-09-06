import { create } from 'zustand'
import { levelForXp } from './game/engine'
import { DEFAULT_UNLOCKED, getSubject, getTopic } from './game/atlas'
import { STORY_ONE, getChapter } from './game/story'
import { DEFAULT_AVATAR } from './components/icons'
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

const DEFAULT_PROFILE: Profile = { name: 'Adventurer', avatar: DEFAULT_AVATAR, xp: 0 }

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
  /** Record a full topic/boss clear for a subject (drives the skill rank). */
  recordClear: (subjectId: string) => void
  /** Story Mode: mark a chapter's level cleared. Persists like a topic. */
  completeStoryLevel: (chapterId: string, levelId: string) => void
}

/** Story Mode reuses the topic tables under this synthetic subject id. */
export const STORY_SUBJECT_ID = STORY_ONE.id

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
    set((s) => ({
      subjects: { ...s.subjects, [subjectId]: { unlocked: true, clears } },
    }))
    void persistSubject(get().userId, subjectId, { unlocked: true, clears })
  },

  completeStoryLevel: (chapterId, levelId) => {
    const chapter = getChapter(chapterId)
    if (!chapter) return
    const key = topicKey(STORY_SUBJECT_ID, chapterId)
    const prev = get().topics[key] ?? {
      completed: [],
      current: chapter.levels[0]?.id ?? null,
    }
    if (prev.completed.includes(levelId)) return

    const completed = [...prev.completed, levelId]
    const idx = chapter.levels.findIndex((l) => l.id === levelId)
    const nextLevel = chapter.levels[idx + 1]?.id ?? null
    const state: TopicState = { completed, current: nextLevel ?? levelId }
    set((s) => ({ topics: { ...s.topics, [key]: state } }))
    void persistTopic(get().userId, STORY_SUBJECT_ID, chapterId, {
      completed_nodes: completed,
      current_node: state.current,
      completed_at: nextLevel ? null : new Date().toISOString(),
    })
  },
}))

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
  // Worlds are never gated; kept as a selector so screen guards stay declarative.
  // (No code path ever persists `unlocked: false`, so this is effectively true.)
  return s.subjects[subjectId]?.unlocked ?? true
}

/**
 * Levels inside a topic run in sequence: a node is playable only once every
 * earlier node in the same topic has been cleared (node 0 is always open, and
 * cleared nodes stay open for replay).
 */
export function selectNodeUnlocked(
  s: AppState,
  subjectId: string,
  topicId: string,
  nodeId: string,
): boolean {
  const topic = getTopic(subjectId, topicId)
  if (!topic) return false
  const idx = topic.nodes.findIndex((n) => n.id === nodeId)
  if (idx <= 0) return idx === 0
  const done = new Set(selectTopicState(s, subjectId, topicId).completed)
  return topic.nodes.slice(0, idx).every((n) => done.has(n.id))
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

// --- Story Mode selectors --------------------------------------------------

const storyChapterCompleted = (s: AppState, chapterId: string): string[] =>
  s.topics[topicKey(STORY_SUBJECT_ID, chapterId)]?.completed ?? []

export function selectStoryChapterDone(s: AppState, chapterId: string): boolean {
  const chapter = getChapter(chapterId)
  if (!chapter) return false
  return storyChapterCompleted(s, chapterId).length >= chapter.levels.length
}

/** Chapter N opens once chapter N-1 is fully cleared. Chapter 1 is always open. */
export function selectStoryChapterUnlocked(s: AppState, chapterId: string): boolean {
  const chapter = getChapter(chapterId)
  if (!chapter) return false
  if (chapter.index === 0) return true
  const prev = STORY_ONE.chapters[chapter.index - 1]
  return selectStoryChapterDone(s, prev.id)
}

/** Levels run in order within a chapter (cleared ones stay open for replay). */
export function selectStoryLevelUnlocked(
  s: AppState,
  chapterId: string,
  levelId: string,
): boolean {
  const chapter = getChapter(chapterId)
  if (!chapter || !selectStoryChapterUnlocked(s, chapterId)) return false
  const idx = chapter.levels.findIndex((l) => l.id === levelId)
  if (idx <= 0) return idx === 0
  const done = new Set(storyChapterCompleted(s, chapterId))
  return chapter.levels.slice(0, idx).every((l) => done.has(l.id))
}

/** 0..1 completion across the whole tale. */
export function selectStoryProgress(s: AppState): number {
  let total = 0
  let done = 0
  for (const ch of STORY_ONE.chapters) {
    total += ch.levels.length
    done += storyChapterCompleted(s, ch.id).length
  }
  return total ? done / total : 0
}
