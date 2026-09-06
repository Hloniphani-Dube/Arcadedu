import React, { useState, createContext, useContext } from 'react'
import { NavLink } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Links {
  label: string
  href: string
  icon: React.ReactNode
  /** exact-match active (used for the index route) */
  end?: boolean
}

interface SidebarContextProps {
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  animate: boolean
}

const SidebarContext = createContext<SidebarContextProps | undefined>(undefined)

export const useSidebar = () => {
  const context = useContext(SidebarContext)
  if (!context) throw new Error('useSidebar must be used within a SidebarProvider')
  return context
}

export const SidebarProvider = ({
  children,
  open: openProp,
  setOpen: setOpenProp,
  animate = true,
}: {
  children: React.ReactNode
  open?: boolean
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>
  animate?: boolean
}) => {
  const [openState, setOpenState] = useState(false)
  const open = openProp !== undefined ? openProp : openState
  const setOpen = setOpenProp !== undefined ? setOpenProp : setOpenState

  return (
    <SidebarContext.Provider value={{ open, setOpen, animate }}>
      {children}
    </SidebarContext.Provider>
  )
}

export const Sidebar = ({
  children,
  open,
  setOpen,
  animate,
}: {
  children: React.ReactNode
  open?: boolean
  setOpen?: React.Dispatch<React.SetStateAction<boolean>>
  animate?: boolean
}) => (
  <SidebarProvider open={open} setOpen={setOpen} animate={animate}>
    {children}
  </SidebarProvider>
)

export const SidebarBody = (props: React.ComponentProps<typeof motion.div>) => (
  <>
    <DesktopSidebar {...props} />
    <MobileSidebar {...(props as React.ComponentProps<'div'>)} />
  </>
)

export const DesktopSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<typeof motion.div>) => {
  const { open, setOpen, animate } = useSidebar()
  return (
    <motion.div
      className={cn(
        'sticky top-0 h-dvh w-[300px] flex-shrink-0 border-r-2 border-edge bg-panel px-4 py-4 hidden md:flex md:flex-col',
        className,
      )}
      animate={{ width: animate ? (open ? '300px' : '68px') : '300px' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      {...props}
    >
      {children}
    </motion.div>
  )
}

export const MobileSidebar = ({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>) => {
  const { open, setOpen } = useSidebar()
  return (
    <div
      className={cn(
        'flex h-14 w-full flex-row items-center justify-between border-b border-edge bg-panel px-4 py-3 md:hidden',
      )}
      {...props}
    >
      <span className="text-lg font-black tracking-tight">
        Arcad<span className="text-mana-bright">edu</span>
      </span>
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setOpen(!open)}
        className="text-ink"
      >
        <Menu className="h-6 w-6" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ x: '-100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '-100%', opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className={cn(
              'fixed inset-0 z-[100] flex h-full w-full flex-col justify-between bg-void p-8',
              className,
            )}
          >
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(!open)}
              className="absolute right-8 top-8 z-50 text-ink"
            >
              <X className="h-6 w-6" />
            </button>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export const SidebarLink = ({
  link,
  className,
  onClick,
}: {
  link: Links
  className?: string
  onClick?: () => void
}) => {
  const { open, animate } = useSidebar()
  const label = (
    <motion.span
      animate={{
        display: animate ? (open ? 'inline-block' : 'none') : 'inline-block',
        opacity: animate ? (open ? 1 : 0) : 1,
      }}
      className="!m-0 inline-block whitespace-pre !p-0 text-sm transition duration-150 group-hover/sidebar:translate-x-1"
    >
      {link.label}
    </motion.span>
  )

  const base =
    'flex items-center justify-start gap-3 group/sidebar rounded-lg px-2 py-2 transition'

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(base, 'w-full text-muted hover:text-ink', className)}>
        {link.icon}
        {label}
      </button>
    )
  }

  return (
    <NavLink
      to={link.href}
      end={link.end}
      onClick={onClick}
      className={({ isActive }) =>
        cn(
          base,
          isActive ? 'bg-panel-2 text-mana-bright' : 'text-muted hover:text-ink',
          className,
        )
      }
    >
      {link.icon}
      {label}
    </NavLink>
  )
}
