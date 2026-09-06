import { supabase } from './supabase'
import type { Profile, SubjectState, TopicState } from '../store'

/*
  Supabase persistence for player progress. Pure IO — no store imports.
  Every writer is a fire-and-forget upsert; callers update the in-memory
  cache optimistically and don't await these. When Supabase isn't configured
  (no env vars) or there's no signed-in user, every function is a safe no-op.
*/

export interface ProgressSnapshot {
  profile: Profile
  subjects: Record<string, SubjectState>
  topics: Record<string, TopicState>
}

const topicKey = (s: string, t: string) => `${s}/${t}`

function warn(scope: string, err: unknown) {
  console.warn(`[progress] ${scope} failed:`, err)
}

/** Read the full progress snapshot for a user. Missing rows → defaults. */
export async function fetchProgress(userId: string): Promise<ProgressSnapshot> {
  const empty: ProgressSnapshot = {
    profile: { name: 'Adventurer', avatar: '🧑‍🎓', xp: 0 },
    subjects: {},
    topics: {},
  }
  if (!supabase) return empty

  try {
    const [{ data: prof }, { data: subs }, { data: tops }] = await Promise.all([
      supabase.from('profiles').select('display_name, avatar, xp').eq('id', userId).maybeSingle(),
      supabase.from('subject_progress').select('subject_id, unlocked, clears').eq('user_id', userId),
      supabase
        .from('topic_progress')
        .select('subject_id, topic_id, completed_nodes, current_node')
        .eq('user_id', userId),
    ])

    const snapshot: ProgressSnapshot = {
      profile: {
        name: prof?.display_name ?? 'Adventurer',
        avatar: prof?.avatar ?? '🧑‍🎓',
        xp: prof?.xp ?? 0,
      },
      subjects: {},
      topics: {},
    }
    for (const r of subs ?? []) {
      snapshot.subjects[r.subject_id] = {
        unlocked: !!r.unlocked,
        clears: r.clears ?? 0,
      }
    }
    for (const r of tops ?? []) {
      snapshot.topics[topicKey(r.subject_id, r.topic_id)] = {
        completed: r.completed_nodes ?? [],
        current: r.current_node ?? null,
      }
    }
    return snapshot
  } catch (err) {
    warn('fetchProgress', err)
    return empty
  }
}

/** Ensure a profiles row exists (the DB trigger normally handles this). */
export async function ensureProfile(userId: string, displayName?: string) {
  if (!supabase) return
  try {
    await supabase
      .from('profiles')
      .upsert({ id: userId, ...(displayName ? { display_name: displayName } : {}) }, { onConflict: 'id', ignoreDuplicates: true })
  } catch (err) {
    warn('ensureProfile', err)
  }
}

export async function persistProfile(
  userId: string | null,
  patch: { display_name?: string; avatar?: string; xp?: number },
) {
  if (!supabase || !userId) return
  try {
    await supabase.from('profiles').upsert({ id: userId, ...patch }, { onConflict: 'id' })
  } catch (err) {
    warn('persistProfile', err)
  }
}

export async function persistSubject(
  userId: string | null,
  subjectId: string,
  patch: { unlocked?: boolean; clears?: number },
) {
  if (!supabase || !userId) return
  try {
    await supabase.from('subject_progress').upsert(
      { user_id: userId, subject_id: subjectId, updated_at: new Date().toISOString(), ...patch },
      { onConflict: 'user_id,subject_id' },
    )
  } catch (err) {
    warn('persistSubject', err)
  }
}

export async function persistTopic(
  userId: string | null,
  subjectId: string,
  topicId: string,
  patch: { completed_nodes?: string[]; current_node?: string | null; completed_at?: string | null },
) {
  if (!supabase || !userId) return
  try {
    await supabase.from('topic_progress').upsert(
      {
        user_id: userId,
        subject_id: subjectId,
        topic_id: topicId,
        updated_at: new Date().toISOString(),
        ...patch,
      },
      { onConflict: 'user_id,subject_id,topic_id' },
    )
  } catch (err) {
    warn('persistTopic', err)
  }
}
