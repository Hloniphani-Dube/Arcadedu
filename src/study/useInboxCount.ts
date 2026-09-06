import { useEffect, useState } from 'react'
import { useAuth } from '../auth/auth-context'
import { fetchInboxCount } from './db'

/** Sidebar badge: unread decisions + overdue/today items. Polls quietly. */
export function useInboxCount(): number {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!userId) return
    let live = true
    const tick = () => {
      void fetchInboxCount(userId)
        .then((n) => {
          if (live) setCount(n)
        })
        .catch(() => {})
    }
    tick()
    const id = setInterval(tick, 60_000)
    return () => {
      live = false
      clearInterval(id)
    }
  }, [userId])

  return count
}
