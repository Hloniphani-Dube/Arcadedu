import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { fetchProgress, ensureProfile } from '../lib/progress'
import { useApp } from '../store'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  // Configured → wait for the initial session check; unconfigured → nothing to wait for.
  const [loading, setLoading] = useState<boolean>(() => !!supabase)
  const hydrate = useApp((s) => s.hydrate)
  const resetLocal = useApp((s) => s.resetLocal)

  const unconfigured = !supabase

  useEffect(() => {
    if (!supabase) {
      // No backend: run the app locally with an anonymous in-memory profile.
      hydrate(null, null)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => sub.subscription.unsubscribe()
  }, [hydrate])

  // Hydrate / clear the progress cache as the user signs in and out.
  useEffect(() => {
    let cancelled = false
    const uid = session?.user?.id ?? null
    if (!uid) {
      if (supabase) resetLocal()
      return
    }
    ensureProfile(uid, session?.user?.user_metadata?.full_name)
    fetchProgress(uid).then((snap) => {
      if (!cancelled) hydrate(uid, snap)
    })
    return () => {
      cancelled = true
    }
  }, [session, hydrate, resetLocal])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      unconfigured,
      signOut: async () => {
        await supabase?.auth.signOut()
        resetLocal()
      },
    }),
    [session, loading, unconfigured, resetLocal],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
