import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useApp } from '../store'
import { useAuth } from './auth-context'

export function RequireOnboarded({ children }: { children: ReactNode }) {
  const { unconfigured } = useAuth()
  const onboarded = useApp((s) => s.profile.onboarded)

  // No backend configured → local-only progress, nothing to onboard into.
  if (unconfigured) return <>{children}</>

  if (!onboarded) return <Navigate to="/onboarding" replace />

  return <>{children}</>
}
