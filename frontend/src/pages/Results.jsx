import { CloudRain, Dumbbell, Flag, Flame, Hexagon, Map as MapIcon, MapPinOff, Shield, Smartphone, Sparkles, Timer, Users } from 'lucide-react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import LiquidText from '../components/LiquidText'
import GlassFold from '../components/GlassFold'
import { Avatar, Button, Card, Rise, SectionTitle, TeamDot } from '../components/ui'
import { celebrate } from '../lib/confetti'
import { BUZZ, haptic } from '../lib/haptics'

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

/** What happened to the Hang's zone: captured, defended, lost to another team, or still someone else's. */
export function zoneOutcome(hang, myTeamId) {
  const after = hang.hex_owner
  if (!after) return null
  const before = hang.hex_owner_before
  const flipped = after.id !== before?.id
  const mine = after.id === myTeamId
  const place = hang.place_name || 'this zone'
  if (flipped && mine) return { kind: 'captured', flipped, mine, title: 'Zone captured!', text: `${after.name} took ${place}.` }
  if (mine) return { kind: 'defended', flipped, mine, title: 'Zone defended', text: `${after.name} still hold ${place}.` }
  if (flipped) return { kind: 'taken', flipped, mine, title: `${after.name} took it`, text: `${place} changed hands.` }
  return { kind: 'held', flipped, mine, title: `${after.name} hold this zone`, text: 'Hang here again to take it.' }
}

const OUTCOME_ICONS = { captured: Flag, defended: Shield, taken: Hexagon, held: Hexagon }

/** Shown when a Hang has ended: your points breakdown and who holds the zone now. */
export default function Results({ hang, me }) {
  const navigate = useNavigate()
  const b = me?.breakdown
  const points = me?.points_earned ?? 0
  const zone = zoneOutcome(hang, me?.team?.id)
  const ZoneIcon = zone ? OUTCOME_ICONS[zone.kind] : Hexagon

  const seeMap = () =>
    navigate('/map', {
      replace: true,
      state: zone && {
        capture: {
          hex: hang.hex_id,
          flipped: zone.flipped,
          mine: zone.mine,
          from: hang.hex_owner_before?.color ?? null,
          to: hang.hex_owner.color,
          title: zone.title,
          text: zone.text,
        },
      },
    })

  useEffect(() => {
    if (points > 0) {
      const t = setTimeout(() => {
        celebrate()
        haptic(BUZZ.join)
      }, 350)
      return () => clearTimeout(t)
    }
    return undefined
  }, [points])

  const ranked = [...hang.members].sort((x, y) => (y.points_earned ?? 0) - (x.points_earned ?? 0))

  return (
    <div className="min-h-dvh bg-canvas pb-10">
      <header className="pt-safe relative overflow-hidden rounded-b-[36px] bg-brand px-5 pb-12 text-center text-white">
        {/* Celebration background: blue folded glass, so the lime score stands out */}
        <GlassFold color1="#1e3cc8" color2="#06081e" color3="#96d7ff" speed={0.6} scale={1.2} className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-0 bg-[#0b1d3a]/35" aria-hidden />
        <div className="relative">
        <p className="pt-10 font-display text-lg font-bold uppercase tracking-[0.3em] text-white/50">Hang over</p>
        <p className="mt-2 font-display text-[96px] font-extrabold leading-none text-lime drop-shadow-[0_4px_24px_rgba(0,0,0,0.45)] motion-safe:animate-pop">
          <LiquidText fill={points > 0 ? 0.8 : 0.12} delay={350}>+{points}</LiquidText>
        </p>
        <p className="mt-1 text-[15px] text-white/70">points{hang.place_name ? ` at ${hang.place_name}` : ''}</p>
        {points === 0 && !b?.capped && (
          <p className="mx-auto mt-4 max-w-[300px] rounded-2xl bg-white/10 px-4 py-3 text-[15px] text-white/85">
            {b?.solo_at_home
              ? "Nobody joined, so this counted as a solo session. Solo time only counts away from home: set your home spot in Profile, or start at a suggested place."
              : b?.too_short
                ? 'Hangs need at least 10 minutes to earn points. Stay a little longer next time!'
                : 'Stay out a little longer next time and bring a friend for a bonus.'}
          </p>
        )}
        {hang.end_reason === 'no_checkins' && (
          <p className="mx-auto mt-3 max-w-[300px] text-[13px] text-white/60">
            This Hang ended by itself: nobody opened the app for 3 hours, so time counts up to the last check-in.
          </p>
        )}
        </div>
      </header>

      <div className="relative -mt-6 space-y-4 px-4">
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
                <MapPinOff className="size-4 shrink-0" aria-hidden /> You went home, so your time stopped when you left.
              </p>
            )}
            {b.capped && <p className="mt-3 text-sm text-muted">You hit today's points limit. Come back tomorrow!</p>}
          </Card>
        )}

        {zone && (
          <Rise i={3}>
            <div
              className={`flex items-center gap-3 rounded-3xl p-4 ${
                zone.kind === 'captured' ? 'bg-lime text-on-accent shadow-lg shadow-lime/30' : 'bg-surface ring-1 ring-line'
              }`}
            >
              <div
                className="flex size-12 shrink-0 items-center justify-center rounded-2xl"
                style={{ backgroundColor: zone.kind === 'captured' ? '#0b1d3a' : `${hang.hex_owner.color}26` }}
              >
                <ZoneIcon
                  className={`size-6 ${zone.kind === 'captured' ? 'motion-safe:animate-pop' : ''}`}
                  style={{ color: zone.kind === 'captured' ? '#bef264' : hang.hex_owner.color, fill: zone.kind === 'captured' ? '#bef264' : `${hang.hex_owner.color}55` }}
                  aria-hidden
                />
              </div>
              <div className="min-w-0">
                <p className="font-display text-[22px] font-bold uppercase leading-none">{zone.title}</p>
                <p className={`mt-1 text-[15px] ${zone.kind === 'captured' ? '' : 'text-muted'}`}>{zone.text}</p>
              </div>
            </div>
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
          <Button variant="lime" onClick={seeMap}>
            <MapIcon className="size-5" aria-hidden /> See the map
          </Button>
        </div>
      </div>
    </div>
  )
}
