import { Flag, Map as MapIcon, PhoneOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Avatar, Button, Card, TeamDot } from '../components/ui'

function Row({ label, value, highlight }) {
  return (
    <div className="flex items-center justify-between py-2 text-[15px]">
      <span className="text-slate-500">{label}</span>
      <span className={`font-semibold ${highlight ? 'text-grass' : ''}`}>{value}</span>
    </div>
  )
}

/** Shown when a Hang has ended: your points breakdown and who holds the zone now. */
export default function Results({ hang, me }) {
  const navigate = useNavigate()
  const b = me?.breakdown

  return (
    <div className="min-h-dvh bg-canvas pb-10">
      <header className="pt-safe bg-forest px-5 pb-10 text-center text-white">
        <p className="pt-10 text-sm uppercase tracking-[0.2em] text-white/50">Hang over</p>
        <p className="mt-3 text-7xl font-black text-lime">+{me?.points_earned ?? 0}</p>
        <p className="mt-1 text-white/70">points{hang.place_name ? ` at ${hang.place_name}` : ''}</p>
      </header>

      <div className="-mt-5 space-y-4 px-4">
        {b && (
          <Card>
            <h2 className="font-semibold">How you scored</h2>
            <div className="mt-2 divide-y divide-black/5">
              <Row label="Phone-down minutes" value={b.minutes} />
              <Row label="Party bonus" value={`x${b.party_multiplier}`} highlight={b.party_multiplier > 1} />
              <Row label="Streak bonus" value={`x${b.streak_multiplier}`} highlight={b.streak_multiplier > 1} />
              {b.active_multiplier > 1 && <Row label="Active place" value={`x${b.active_multiplier}`} highlight />}
              {b.weather_multiplier > 1 && <Row label="Braved the weather" value={`x${b.weather_multiplier}`} highlight />}
              {b.new_place_bonus > 0 && <Row label="New place" value={`+${b.new_place_bonus}`} highlight />}
            </div>
            {b.picked_up_phone && (
              <p className="mt-3 flex items-center gap-2 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">
                <PhoneOff className="size-4" /> You picked up your phone, so no party bonus this time.
              </p>
            )}
            {b.capped && <p className="mt-3 text-sm text-slate-500">You hit today's points limit. Come back tomorrow!</p>}
          </Card>
        )}

        {hang.hex_owner && (
          <Card className="flex items-center gap-3">
            <div className="rounded-2xl p-2.5" style={{ backgroundColor: `${hang.hex_owner.color}22` }}>
              <Flag className="size-5" style={{ color: hang.hex_owner.color }} />
            </div>
            <p className="text-[15px]">
              <span className="font-semibold">{hang.hex_owner.name}</span> holds this zone now.
            </p>
          </Card>
        )}

        {hang.members.length > 1 && (
          <Card>
            <h2 className="mb-3 font-semibold">Everyone</h2>
            <ul className="space-y-3">
              {[...hang.members]
                .sort((x, y) => (y.points_earned ?? 0) - (x.points_earned ?? 0))
                .map((m) => (
                  <li key={m.user_id} className="flex items-center gap-3">
                    <Avatar name={m.name} color={m.team?.color} size={36} />
                    <span className="flex-1 font-medium">{m.name}</span>
                    <TeamDot color={m.team?.color} />
                    <span className="w-14 text-right font-semibold">+{m.points_earned ?? 0}</span>
                  </li>
                ))}
            </ul>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => navigate('/', { replace: true })}>
            Home
          </Button>
          <Button onClick={() => navigate('/map', { replace: true })}>
            <MapIcon className="size-5" /> See the map
          </Button>
        </div>
      </div>
    </div>
  )
}
