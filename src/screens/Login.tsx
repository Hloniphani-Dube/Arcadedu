import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail, Compass, ArrowRight, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/auth-context'
import { Btn, Panel } from '../components/ui'

const REDIRECT = typeof window !== 'undefined' ? window.location.origin : undefined

export function Login() {
  const { session, loading, unconfigured } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!loading && session) return <Navigate to="/" replace />

  async function magicLink(e?: React.FormEvent) {
    e?.preventDefault()
    if (!supabase || !email.trim()) return
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: REDIRECT },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div className="bg-grid grid min-h-dvh place-items-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div className="mb-6 text-center">
          <span className="arcade-frame mx-auto mb-4 grid h-12 w-12 place-items-center border-2 border-edge bg-mana text-white">
            <Compass className="h-6 w-6" />
          </span>
          <h1 className="title-serif">
            Arcad<span className="text-xp">edu</span>
          </h1>
          <p className="mt-2 text-sm text-muted">
            Sign in to chart your progress across the atlas.
          </p>
        </div>

        <Panel className="p-5">
          {unconfigured ? (
            <p className="text-sm text-muted">
              Supabase isn&apos;t configured yet. Add <code>VITE_SUPABASE_URL</code> and{' '}
              <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code>, then restart
              the dev server. Until then the app runs in local mode with no saved progress.
            </p>
          ) : sent ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <CheckCircle2 className="h-8 w-8 text-heal" />
              <p className="text-sm font-semibold">Check your inbox</p>
              <p className="text-sm text-muted">
                We sent a sign-in link to <span className="text-ink">{email}</span>.
              </p>
              <button
                type="button"
                onClick={() => setSent(false)}
                className="mt-1 text-xs text-mana-bright hover:underline"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={magicLink} className="flex flex-col gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                Email
              </label>
              <div className="flex items-center gap-2 border-2 border-edge bg-void px-3 focus-within:border-mana">
                <Mail className="h-4 w-4 text-muted" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full bg-transparent py-2.5 text-sm outline-none"
                />
              </div>
              <Btn
                type="submit"
                variant="primary"
                className="mt-1 w-full"
                disabled={busy}
              >
                {busy ? 'Sending…' : 'Send me a sign-in link'}
                <ArrowRight className="h-4 w-4" />
              </Btn>
            </form>
          )}

          {error && (
            <div className="mt-3 rounded-lg border border-hp/40 bg-hp/10 p-2 text-sm text-hp">
              {error}
            </div>
          )}
        </Panel>
      </motion.div>
    </div>
  )
}
