import { useState, type ReactNode } from 'react'
import { Outlet, Link, NavLink } from 'react-router-dom'
import {
  Globe2,
  GraduationCap,
  BookOpen,
  Swords,
  Target,
  CalendarDays,
  Inbox as InboxIcon,
  Settings as SettingsIcon,
  LogOut,
} from 'lucide-react'
import { Sidebar, SidebarBody } from './ui/sidebar'
import { Avatar } from './icons'
import { useAuth } from '../auth/auth-context'
import { useApp, selectLevel } from '../store'
import { useInboxCount } from '../study/useInboxCount'

const IC = 'h-4 w-4 flex-shrink-0'

const GROUPS: {
  heading: string
  links: { label: string; href: string; icon: ReactNode; end?: boolean; key?: string }[]
}[] = [
  {
    heading: 'Learn',
    links: [
      { label: 'Atlas', href: '/', icon: <Globe2 className={IC} />, end: true },
      { label: 'Missions', href: '/missions', icon: <Target className={IC} /> },
      { label: 'Study Hall', href: '/learn', icon: <GraduationCap className={IC} /> },
      { label: 'Story', href: '/story', icon: <BookOpen className={IC} /> },
    ],
  },
  {
    heading: 'Today',
    links: [
      { label: 'Inbox', href: '/inbox', icon: <InboxIcon className={IC} />, key: 'inbox' },
      { label: 'Calendar', href: '/calendar', icon: <CalendarDays className={IC} /> },
      { label: 'Quests', href: '/quests', icon: <Swords className={IC} /> },
    ],
  },
]

function Row({
  link,
  badge,
  open,
}: {
  link: { label: string; href: string; icon: ReactNode; end?: boolean }
  badge?: number
  open: boolean
}) {
  return (
    <NavLink
      to={link.href}
      end={link.end}
      className={({ isActive }) =>
        [
          'group flex items-center gap-3 border-l-2 px-3 py-2 text-sm transition',
          open ? '' : 'justify-center',
          isActive
            ? 'border-mana bg-panel-2 text-ink'
            : 'border-transparent text-muted hover:border-edge hover:text-ink',
        ].join(' ')
      }
    >
      {link.icon}
      {open && <span className="min-w-0 flex-1 truncate">{link.label}</span>}
      {open && badge != null && badge > 0 && (
        <span className="grid h-4 min-w-4 flex-shrink-0 place-items-center bg-hp px-1 text-[10px] font-bold text-white">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </NavLink>
  )
}

export function AppShell() {
  // `open` drives both the desktop rail (hover to expand, mirrors the
  // sidebar's own onMouseEnter/onMouseLeave) and the mobile drawer.
  const [open, setOpen] = useState(false)
  const { user, signOut, unconfigured } = useAuth()
  const profile = useApp((s) => s.profile)
  const level = useApp(selectLevel)
  const inboxCount = useInboxCount()

  const name = profile.name || user?.email?.split('@')[0] || 'Adventurer'

  return (
    <div className="flex min-h-dvh w-full flex-col md:flex-row">
      <Sidebar open={open} setOpen={setOpen}>
        <SidebarBody className="justify-between gap-6 border-r-2">
          <div className="flex flex-1 flex-col overflow-x-hidden overflow-y-auto">
            <Link
              to="/"
              className={`flex items-center px-2 py-1 text-base font-black tracking-tight ${open ? 'gap-2' : 'justify-center'}`}
            >
              {open && (
                <span className="arcade-face whitespace-nowrap text-[0.8rem]">
                  Arcad<span className="text-xp">edu</span>
                </span>
              )}
            </Link>

            <nav className="mt-6 flex flex-col gap-5">
              {GROUPS.map((g) => (
                <div key={g.heading}>
                  {open && (
                    <div className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted/70">
                      {g.heading}
                    </div>
                  )}
                  <div className="flex flex-col">
                    {g.links.map((l) => (
                      <Row
                        key={l.href}
                        link={l}
                        badge={l.key === 'inbox' ? inboxCount : undefined}
                        open={open}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </div>

          <div className="flex flex-col gap-2">
            <Row
              link={{ label: 'Settings', href: '/settings', icon: <SettingsIcon className={IC} /> }}
              open={open}
            />
            <Link
              to="/profile"
              className={`arcade-frame flex items-center border border-edge bg-panel p-2 transition hover:border-mana ${open ? 'gap-3' : 'justify-center'}`}
            >
              <Avatar
                value={profile.avatar}
                className={`flex-shrink-0 border border-edge transition-all duration-150 ${open ? 'h-9 w-9' : 'h-6 w-6'}`}
              />
              {open && (
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{name}</div>
                  <div className="truncate text-[11px] text-muted">
                    {unconfigured ? 'Local mode' : `Level ${level}`}
                  </div>
                </div>
              )}
            </Link>
            {!unconfigured && (
              <button
                type="button"
                onClick={() => void signOut()}
                className={`flex items-center px-3 py-2 text-sm text-muted transition hover:text-hp ${open ? 'gap-3' : 'justify-center'}`}
              >
                <LogOut className={IC} />
                {open && <span className="whitespace-nowrap">Sign out</span>}
              </button>
            )}
          </div>
        </SidebarBody>
      </Sidebar>

      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
