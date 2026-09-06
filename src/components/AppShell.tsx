import { useState } from 'react'
import { Outlet, Link } from 'react-router-dom'
import {
  Globe2,
  GraduationCap,
  BookOpen,
  Swords,
  Target,
  CalendarDays,
  Inbox as InboxIcon,
  User,
  LogOut,
} from 'lucide-react'
import { Sidebar, SidebarBody, SidebarLink } from './ui/sidebar'
import { ThemeMenu } from './ui/theme-menu'
import { Avatar } from './icons'
import { useAuth } from '../auth/auth-context'
import { useApp } from '../store'
import { useInboxCount } from '../study/useInboxCount'

const icon = 'h-5 w-5 flex-shrink-0'

export function AppShell() {
  const [open, setOpen] = useState(false)
  const { user, signOut, unconfigured } = useAuth()
  const profile = useApp((s) => s.profile)
  const inboxCount = useInboxCount()

  const name = profile.name || user?.email?.split('@')[0] || 'Adventurer'

  const inboxIcon = (
    <span className="relative flex-shrink-0">
      <InboxIcon className={icon} />
      {inboxCount > 0 && (
        <span className="absolute -right-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-hp px-1 text-[10px] font-bold leading-none text-on-accent">
          {inboxCount > 9 ? '9+' : inboxCount}
        </span>
      )}
    </span>
  )

  const links = [
    { label: 'Atlas', href: '/', icon: <Globe2 className={icon} />, end: true },
    { label: 'Inbox', href: '/inbox', icon: inboxIcon },
    { label: 'Calendar', href: '/calendar', icon: <CalendarDays className={icon} /> },
    { label: 'Missions', href: '/missions', icon: <Target className={icon} /> },
    { label: 'Learn', href: '/learn', icon: <GraduationCap className={icon} /> },
    { label: 'Story', href: '/story', icon: <BookOpen className={icon} /> },
    { label: 'Quests', href: '/quests', icon: <Swords className={icon} /> },
    { label: 'Profile', href: '/profile', icon: <User className={icon} /> },
  ]

  return (
    <div className="flex min-h-dvh w-full flex-col md:flex-row">
      <Sidebar open={open} setOpen={setOpen}>
        <SidebarBody className="justify-between gap-6">
          <div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
            <Link
              to="/"
              className="relative z-20 flex items-center gap-2 py-1 text-lg font-black tracking-tight"
            >
              <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-mana text-on-accent">
                <Globe2 className="h-4 w-4" />
              </span>
              {open && (
                <span className="whitespace-pre">
                  Arcad<span className="text-mana-bright">edu</span>
                </span>
              )}
            </Link>

            <nav className="mt-8 flex flex-col gap-1">
              {links.map((link) => (
                <SidebarLink key={link.href} link={link} />
              ))}
            </nav>
          </div>

          <div className="flex flex-col gap-3">
            {open && <ThemeMenu />}
            <div className="flex items-center gap-3 rounded-lg px-2 py-2">
              <Avatar
                value={profile.avatar}
                className="h-8 w-8 flex-shrink-0 rounded-full border border-edge"
              />
              {open && (
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{name}</div>
                  <div className="truncate text-xs text-muted">
                    {unconfigured ? 'Local mode' : (user?.email ?? 'Signed in')}
                  </div>
                </div>
              )}
            </div>
            {!unconfigured && (
              <SidebarLink
                link={{ label: 'Sign out', href: '#', icon: <LogOut className="h-5 w-5 flex-shrink-0" /> }}
                onClick={() => void signOut()}
              />
            )}
          </div>
        </SidebarBody>
      </Sidebar>

      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
