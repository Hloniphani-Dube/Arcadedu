import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, Sparkles } from 'lucide-react'
import { useAuth } from '../auth/auth-context'
import { useApp } from '../store'
import { SUBJECTS } from '../game/atlas'
import { createMissionFromSyllabus } from '../study/db'
import { Btn, Panel, Spinner } from '../components/ui'
import { Avatar } from '../components/icons'
import { AvatarPicker } from '../components/AvatarPicker'

const CATALOG = SUBJECTS.map((s) => ({
  id: s.id,
  name: s.name,
  topics: s.topics.map((t) => ({ id: t.id, name: t.name })),
}))

const SAMPLE = `PHYS 201 — Mechanics & Waves
Midterm: mechanics (kinematics, forces, momentum) — Oct 14
Final exam: Nov 28, covers everything plus waves and oscillations`

const INPUT =
  'border-2 border-edge bg-void p-2.5 text-sm outline-none focus:border-mana'

export function Onboarding() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const profile = useApp((s) => s.profile)
  const setName = useApp((s) => s.setName)
  const setAvatar = useApp((s) => s.setAvatar)
  const completeOnboarding = useApp((s) => s.completeOnboarding)

  const [step, setStep] = useState<'profile' | 'syllabus'>('profile')
  const [syllabus, setSyllabus] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function buildPlan() {
    if (!user || syllabus.trim().length < 20) return
    setBusy(true)
    setError(null)
    try {
      const r = await createMissionFromSyllabus({
        user_id: user.id,
        syllabusText: syllabus.trim(),
        subjectCatalog: CATALOG,
      })
      completeOnboarding()
      navigate(`/missions/${r.missionId}/diagnostic`, {
        state: {
          builtBy: 'agent',
          summary: `Built "${r.title}" — ${r.topicCount} topic${r.topicCount === 1 ? '' : 's'}, ${r.eventCount} date${r.eventCount === 1 ? '' : 's'} added to your calendar.`,
          unmapped: r.unmapped,
        },
      })
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'ARIA could not read that — try skipping for now and add a mission later.',
      )
      setBusy(false)
    }
  }

  function skip() {
    completeOnboarding()
    navigate('/', { replace: true })
  }

  return (
    <div className="bg-grid grid min-h-dvh place-items-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        {step === 'profile' ? (
          <>
            <div className="mb-6 text-center">
              <h1 className="title-serif">
                Let&apos;s get <span className="text-mana-bright">ARIA</span> ready
                for your week.
              </h1>
              <p className="mt-2 text-sm text-muted">
                A name and a look — you can change these anytime.
              </p>
            </div>

            <Panel className="flex flex-col gap-5 p-5">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  What should ARIA call you?
                </span>
                <input
                  value={profile.name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className={INPUT}
                  autoFocus
                />
              </label>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Avatar
                </span>
                <div className="flex items-center gap-4">
                  <Avatar
                    value={profile.avatar}
                    className="h-16 w-16 flex-shrink-0 rounded-2xl border border-edge"
                  />
                  <AvatarPicker value={profile.avatar} onChange={setAvatar} />
                </div>
              </div>

              <Btn variant="primary" onClick={() => setStep('syllabus')}>
                Continue <ArrowRight className="h-4 w-4" />
              </Btn>
            </Panel>
          </>
        ) : (
          <>
            <div className="mb-6 text-center">
              <h1 className="title-serif">What are you preparing for?</h1>
              <p className="mt-2 text-sm text-muted">
                Paste a syllabus, outline or assignment brief and ARIA builds
                your first study plan. Or skip — you can do this later from
                Missions.
              </p>
            </div>

            {error && (
              <Panel className="mb-4 border-hp/50 bg-hp/10 p-3 text-sm text-hp">
                {error}
              </Panel>
            )}

            <Panel className="flex flex-col gap-3 p-5">
              <textarea
                value={syllabus}
                onChange={(e) => setSyllabus(e.target.value)}
                rows={10}
                placeholder={SAMPLE}
                className={`${INPUT} resize-y font-[family-name:var(--font-body)]`}
              />
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setSyllabus(SAMPLE)}
                  className="text-xs text-mana-bright hover:underline"
                >
                  Use the example
                </button>
                <span className="text-xs text-muted">
                  {syllabus.trim().length} chars
                </span>
              </div>
              <Btn
                variant="primary"
                onClick={buildPlan}
                disabled={busy || syllabus.trim().length < 20}
              >
                {busy ? (
                  <Spinner label="ARIA is building your plan…" />
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Let ARIA build my plan
                  </>
                )}
              </Btn>
              <button
                type="button"
                onClick={skip}
                disabled={busy}
                className="text-center text-xs text-muted hover:text-ink disabled:opacity-50"
              >
                Skip for now
              </button>
            </Panel>
          </>
        )}
      </motion.div>
    </div>
  )
}
