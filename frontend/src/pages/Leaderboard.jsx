import { Flame, Hexagon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { Avatar, Card, Page, Spinner, TeamDot } from '../components/ui'
import { useUser } from '../user'

export default function Leaderboard() {
  const { user } = useUser()
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('teams')

  useEffect(() => {
    api('/leaderboard').then(setData).catch(() => {})
  }, [])

  return (
    <Page className="bg-canvas">
      <h1 className="pb-4 pt-6 text-2xl font-bold tracking-tight">Leaderboard</h1>
      <div className="mb-4 grid grid-cols-2 rounded-2xl bg-line p-1">
        {['teams', 'players'].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`h-10 rounded-xl text-sm font-semibold capitalize ${tab === t ? 'bg-surface shadow-sm' : 'text-muted'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {!data && <Spinner />}

      {data && tab === 'teams' && (
        <Card className="p-2">
          {data.teams.map((t, i) => (
            <div
              key={t.id}
              className={`flex items-center gap-3 rounded-2xl p-3 ${t.id === user.team?.id ? 'bg-lime/30' : ''}`}
            >
              <span className="w-6 text-center font-bold text-faint">{i + 1}</span>
              <TeamDot color={t.color} className="size-4" />
              <span className="flex-1 font-semibold">{t.name}</span>
              <span className="flex items-center gap-1 text-sm text-muted">
                <Hexagon className="size-4" /> {t.hexes}
              </span>
              <span className="w-16 text-right text-sm font-semibold">{t.points} pts</span>
            </div>
          ))}
        </Card>
      )}

      {data && tab === 'players' && (
        <Card className="p-2">
          {data.players.map((p, i) => (
            <div key={p.id} className={`flex items-center gap-3 rounded-2xl p-3 ${p.id === user.id ? 'bg-lime/30' : ''}`}>
              <span className="w-6 text-center font-bold text-faint">{i + 1}</span>
              <Avatar name={p.name} color={p.team?.color} size={36} />
              <span className="flex-1 font-semibold">{p.name}</span>
              {p.streak > 0 && (
                <span className="flex items-center gap-0.5 text-sm text-orange-500">
                  <Flame className="size-4" /> {p.streak}
                </span>
              )}
              <span className="w-16 text-right text-sm font-semibold">{p.points}</span>
            </div>
          ))}
        </Card>
      )}
    </Page>
  )
}
