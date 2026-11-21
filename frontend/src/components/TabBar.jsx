// Adapted from 21st.dev "Bottom Nav Bar" by arunachalam (https://21st.dev/r/arunachalam/bottom-nav-bar).
// Floating pill tab bar: the active tab shows its label with a spring animation.
import { House, Map as MapIcon, Trophy, UserRound, UsersRound } from 'lucide-react'
import { motion } from 'motion/react'
import { NavLink } from 'react-router-dom'
import { cn } from '../lib/cn'

const TABS = [
  { to: '/', label: 'Home', Icon: House },
  { to: '/meet', label: 'Meet', Icon: UsersRound },
  { to: '/map', label: 'Map', Icon: MapIcon },
  { to: '/ranks', label: 'Ranks', Icon: Trophy },
  { to: '/me', label: 'Me', Icon: UserRound },
]

const LABEL_WIDTH = 52

export default function TabBar() {
  return (
    <motion.nav
      initial={{ scale: 0.9, opacity: 0, y: 12 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      aria-label="Main"
      className="fixed inset-x-0 z-[1000] mx-auto flex h-[60px] w-fit items-center gap-1 rounded-full border border-line bg-surface/95 p-2 shadow-xl shadow-black/10 backdrop-blur dark:shadow-black/40"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) + 14px)' }}
    >
      {TABS.map(({ to, label, Icon }) => (
        <NavLink key={to} to={to} end={to === '/'} aria-label={label} className="rounded-full">
          {({ isActive }) => (
            <motion.span
              whileTap={{ scale: 0.94 }}
              className={cn(
                'relative flex h-11 min-w-11 items-center justify-center rounded-full px-3 transition-colors duration-200',
                isActive ? 'bg-brand text-white dark:bg-lime dark:text-on-accent' : 'text-muted hover:bg-chip',
              )}
            >
              <Icon size={22} strokeWidth={isActive ? 2.4 : 2} aria-hidden />
              <motion.span
                initial={false}
                animate={{
                  width: isActive ? LABEL_WIDTH : 0,
                  opacity: isActive ? 1 : 0,
                  marginLeft: isActive ? 8 : 0,
                }}
                transition={{
                  width: { type: 'spring', stiffness: 350, damping: 32 },
                  opacity: { duration: 0.19 },
                  marginLeft: { duration: 0.19 },
                }}
                className="flex items-center overflow-hidden"
              >
                <span className="whitespace-nowrap font-display text-[15px] font-bold uppercase tracking-wide">{label}</span>
              </motion.span>
            </motion.span>
          )}
        </NavLink>
      ))}
    </motion.nav>
  )
}
