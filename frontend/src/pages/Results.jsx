import { CloudRain, Dumbbell, Flame, Hexagon, Map as MapIcon, MapPinOff, Smartphone, Sparkles, Timer, Users } from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CountUp } from '../components/AnimatedNumber'
import { Avatar, Button, Card, Rise, SectionTitle, TeamDot } from '../components/ui'
import { celebrate } from '../lib/confetti'

function Tile({ icon, label, value, on, i }) {
  return (
    <Rise i={i}>
      <div className={`flex h-full flex-col justify-between rounded-2xl p-3 ${on ? 'bg-lime text-on-accent' : 'bg-chip text-ink'}`}>
        <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${on ? '' : 'text-muted'}`}>
          {icon} {label}
        </span>
        <span className="mt-2 font-display text-[28px] font-bold leading-none">{value}</span>
      </div>
    </Rise>
  )
}

/** Shown when a Hang has ended: your points breakdown and who holds the zone now. */
export default function Results({ hang, me }) {
  const navigate = useNavigate()
  const b = me?.breakdown
  const points = me?.points_earned ?? 0

  useEffect(() => {
    if (points > 0) {
      const t = setTimeout(celebrate, 350)
      return () => clearTimeout(t)
    }
    return undefined
  }, [points])

  const ranked = [...hang.members].sort((x, y) => (y.points_earned ?? 0) - (x.points_earned ?? 0))

  return (
    <div className="min-h-dvh bg-canvas pb-10">
      <header className="pt-safe bg-hex rounded-b-[36px] bg-brand px-5 pb-12 text-center text-white">
        <p className="pt-10 font-display text-lg font-bold uppercase tracking-[0.3em] text-white/50">Hang over</p>
        <p className="mt-2 font-display text-[96px] font-extrabold leading-none text-lime motion-safe:animate-pop">
          +<CountUp to={points} />
        </p>
        <p className="mt-1 text-[15px] text-white/70">points{hang.place_name ? ` at ${hang.place_name}` : ''}</p>
      </header>

      <div className="-mt-6 space-y-4 px-4">
        {b && (
          <Card className="shadow-lg shadow-black/5">
            <SectionTitle>How you scored</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <Tile i={0} icon={<Timer className="size-4" aria-hidden />} label="Minutes" value={b.minutes} />
              <Tile i={1} icon={<Users className="size-4" aria-hidden />} label="Party" value={`x${b.party_multiplier}`} on={b.party_multiplier > 1} />
              <Tile
                i={2}
                icon={<Smartphone className="size-4 rotate-180" aria-hidden />}
                label={`Phones down ${Math.round(b.phones_down_share * 100)}%`}
                value={`x${b.phones_down_multiplier}`}
                on={b.phones_down_multiplier > 1}
              />
              <Tile i={3} icon={<Flame className="size-4" aria-hidden />} label="Streak" value={`x${b.streak_multiplier}`} on={b.streak_multiplier > 1} />
              {b.active_multiplier > 1 && <Tile i={4} icon={<Dumbbell className="size-4" aria-hidden />} label="Active place" value={`x${b.active_multiplier}`} on />}
              {b.weather_multiplier > 1 && <Tile i={5} icon={<CloudRain className="size-4" aria-hidden />} label="Braved weather" value={`x${b.weather_multiplier}`} on />}
              {b.new_place_bonus > 0 && <Tile i={6} icon={<Sparkles className="size-4" aria-hidden />} label="New place" value={`+${b.new_place_bonus}`} on />}
            </div>
            {b.left_area && (
              <p className="mt-3 flex items-center gap-2 rounded-2xl bg-danger-soft px-3 py-2 text-sm text-danger">
                <MapPinOff className="size-4 shrink-0" aria-hidden /> You left the Hang area, so your time stopped when you left.
              </p>
            )}
            {b.capped && <p className="mt-3 text-sm text-muted">You hit today's points limit. Come back tomorrow!</p>}
          </Card>
        )}

        {hang.hex_owner && (
          <Rise i={3}>
            <Card className="flex items-center gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: `${hang.hex_owner.color}26` }}>
                <Hexagon className="size-6" style={{ color: hang.hex_owner.color, fill: `${hang.hex_owner.color}55` }} aria-hidden />
              </div>
              <p className="text-[15px]">
                <span className="font-semibold">{hang.hex_owner.name}</span> holds this zone now.
              </p>
            </Card>
          </Rise>
        )}

        {hang.members.length > 1 && (
          <Rise i={4}>
            <Card>
              <SectionTitle>Everyone</SectionTitle>
              <ul className="space-y-3">
                {ranked.map((m, i) => (
                  <li key={m.user_id} className="flex items-center gap-3">
                    <span className="w-5 text-center font-display text-lg font-bold text-faint">{i + 1}</span>
                    <Avatar name={m.name} color={m.team?.color} size={36} />
                    <span className="flex-1 truncate font-semibold">{m.name}</span>
                    <TeamDot color={m.team?.color} />
                    <span className="w-14 text-right font-display text-xl font-bold">+{m.points_earned ?? 0}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </Rise>
        )}

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <Button variant="secondary" onClick={() => navigate('/', { replace: true })}>
            Home
          </Button>
          <Button variant="lime" onClick={() => navigate('/map', { replace: true })}>
            <MapIcon className="size-5" aria-hidden /> See the map
          </Button>
        </div>
      </div>
    </div>
  )
}
