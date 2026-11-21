import { Crown, Flame, Hexagon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { useNavigate } from 'react-router-dom'
import { LogoMark } from '../components/Logo'
import { Avatar, Button, Card, Page, Rise, Spinner } from '../components/ui'
import { useUser } from '../user'

const PODIUM = [
  { place: 2, height: 'h-20', medal: '#cbd5e1' },
  { place: 1, height: 'h-28', medal: '#facc15' },
  { place: 3, height: 'h-14', medal: '#f59e0b' },
]

/** Top three on blocks: 2nd, 1st, 3rd from left to right. */
function Podium({ items, label, isMe }) {
  if (items.length < 3) return null
  return (
    <div className="bg-hex mb-4 rounded-[28px] bg-brand px-4 pb-0 pt-5 text-white">
      <div className="grid grid-cols-3 items-end gap-2">
        {PODIUM.map(({ place, height, medal }, i) => {
          const item = items[place - 1]
          return (
            <Rise key={place} i={i} className="flex flex-col items-center">
              {place === 1 && <Crown className="mb-1 size-6 text-yellow-300" aria-hidden />}
              <Avatar name={item.name} color={item.team?.color ?? item.color} size={place === 1 ? 56 : 46} ring={isMe(item)} />
              <p className="mt-2 w-full truncate text-center text-sm font-semibold">{item.name}</p>
              <p className="font-display text-lg font-bold leading-tight text-lime">{label(item)}</p>
              <div className={`mt-2 flex w-full items-start justify-center rounded-t-2xl bg-white/12 pt-2 ${height}`}>
                <span className="font-display text-3xl font-extrabold" style={{ color: medal }}>{place}</span>
              </div>
            </Rise>
          )
        })}
      </div>
    </div>
  )
}

export default function Leaderboard() {
  const { user } = useUser()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('teams')

  useEffect(() => {
    api('/leaderboard').then(setData).catch(() => {})
  }, [])

  const isTeams = tab === 'teams'
  const rows = data ? (isTeams ? data.teams : data.players) : []
  const isMe = (r) => (isTeams ? r.id === user.team?.id : r.id === user.id)

  return (
    <Page className="bg-canvas">
      <h1 className="pb-4 pt-6 font-display text-[40px] font-extrabold uppercase leading-none tracking-tight">Leaderboard</h1>
      <div className="mb-4 grid grid-cols-2 rounded-2xl bg-chip p-1" role="tablist">
        {['teams', 'players'].map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`h-11 rounded-xl font-display text-lg font-bold uppercase tracking-wide transition ${
              tab === t ? 'bg-surface text-ink shadow-sm' : 'text-muted'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {!data && <Spinner />}

      {data && rows.length === 0 && (
        <Card className="text-center motion-safe:animate-rise">
          <LogoMark size={56} className="mx-auto" />
          <p className="mt-3 font-display text-[26px] font-extrabold uppercase leading-none">Nobody on the board yet</p>
          <p className="mt-1.5 text-[15px] text-muted">The first Hang puts you at number one.</p>
          <Button variant="lime" className="mt-4 w-full" onClick={() => navigate('/')}>
            Start a Hang
          </Button>
        </Card>
      )}

      {data && rows.length > 0 && (
        <div key={tab}>
          <Podium items={rows} isMe={isMe} label={(r) => (isTeams ? `${r.hexes} zones` : `${r.points} pts`)} />
          <Card className="p-2">
            {rows.map((r, i) => (
              <Rise
                key={r.id}
                i={i}
                className={`flex min-h-14 items-center gap-3 rounded-2xl px-3 py-2 ${isMe(r) ? 'bg-lime/30 dark:bg-lime/15' : ''}`}
              >
                <span className="w-6 text-center font-display text-xl font-bold text-faint">{i + 1}</span>
                {isTeams ? (
                  <span className="flex size-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${r.color}26` }}>
                    <Hexagon className="size-5" style={{ color: r.color, fill: r.color }} aria-hidden />
                  </span>
                ) : (
                  <Avatar name={r.name} color={r.team?.color} size={36} />
                )}
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {r.name}
                  {isMe(r) && <span className="ml-1.5 text-sm font-normal text-muted">{isTeams ? '(your team)' : '(you)'}</span>}
                </span>
                {isTeams ? (
                  <span className="flex items-center gap-1 text-sm text-muted">
                    <Hexagon className="size-4" aria-hidden /> {r.hexes}
                  </span>
                ) : (
                  r.streak > 0 && (
                    <span className="flex items-center gap-0.5 text-sm font-semibold text-orange-500">
                      <Flame className="size-4" aria-hidden /> {r.streak}
                    </span>
                  )
                )}
                <span className="w-16 text-right font-display text-lg font-bold">{r.points}</span>
              </Rise>
            ))}
          </Card>
        </div>
      )}
    </Page>
  )
}
