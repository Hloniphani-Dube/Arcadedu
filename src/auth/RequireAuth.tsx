import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useApp } from '../store'
import { useAuth } from './auth-context'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, unconfigured } = useAuth()
  const hydrated = useApp((s) => s.hydrated)
  const location = useLocation()

  // No backend configured → let the app run anonymously (local-only progress).
  if (unconfigured) return <>{children}</>

  if (loading || (session && !hydrated)) {
    return (
      <div className="grid min-h-dvh place-items-center text-sm text-muted">
        <span className="animate-pulse">Unrolling the map…</span>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}
