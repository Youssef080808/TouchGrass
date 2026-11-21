import { House, Map as MapIcon, Trophy, UserRound } from 'lucide-react'
import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/', label: 'Home', Icon: House },
  { to: '/map', label: 'Map', Icon: MapIcon },
  { to: '/ranks', label: 'Ranks', Icon: Trophy },
  { to: '/me', label: 'Me', Icon: UserRound },
]

export default function TabBar() {
  return (
    <nav className="pb-safe fixed bottom-0 left-1/2 z-[1000] w-full max-w-[440px] -translate-x-1/2 border-t border-black/5 bg-white/95 backdrop-blur">
      <div className="grid h-16 grid-cols-4">
        {TABS.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                isActive ? 'text-forest' : 'text-slate-400'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="size-6" strokeWidth={isActive ? 2.4 : 1.8} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
