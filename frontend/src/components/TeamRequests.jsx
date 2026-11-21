import { Hourglass, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useMyTeam } from '../hooks/useMyTeam'
import { Avatar, Button, Card, ErrorText, Rise, SectionTitle } from './ui'

/** One person asking to join your team, with Decline / Accept. */
export function RequestRow({ request: r, busy, onAnswer }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={r.user.name} color={r.user.team?.color ?? '#64748b'} size={40} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{r.user.name}</p>
        <p className="truncate text-sm text-muted">
          {r.user.team ? `On ${r.user.team.name}` : 'No team yet'} · {r.user.points} pts
        </p>
      </div>
      <Button variant="secondary" className="h-10 px-3 text-sm" loading={busy === `decline-${r.id}`} onClick={() => onAnswer(r, false)}>
        Decline
      </Button>
      <Button variant="lime" className="h-10 px-3 text-sm" loading={busy === `accept-${r.id}`} onClick={() => onAnswer(r, true)}>
        Accept
      </Button>
    </div>
  )
}

/**
 * Home screen: join requests for your team (anyone on the team can accept), or, if you're not on a team,
 * a nudge to find one / the team you're waiting on.
 */
export default function TeamRequests() {
  const navigate = useNavigate()
  const { data, apply } = useMyTeam({ poll: 20000 })
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  if (!data) return null

  const answer = async (r, accept) => {
    const action = accept ? 'accept' : 'decline'
    setBusy(`${action}-${r.id}`)
    setError(null)
    try {
      apply(await api(`/join-requests/${r.id}/${action}`, { method: 'POST' }))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  if (data.team && data.requests.length > 0) {
    return (
      <Rise>
        <Card className="ring-2 ring-lime">
          <SectionTitle action={<UserPlus className="size-5 text-muted" aria-hidden />}>Join requests</SectionTitle>
          <p className="-mt-1 mb-3 text-sm text-muted">
            {data.requests.length === 1 ? 'Wants' : 'Want'} to join {data.team.name}. Anyone on the team can accept.
          </p>
          <div className="space-y-3">
            {data.requests.map((r) => (
              <RequestRow key={r.id} request={r} busy={busy} onAnswer={answer} />
            ))}
          </div>
          {error && (
            <div className="mt-3">
              <ErrorText>{error}</ErrorText>
            </div>
          )}
        </Card>
      </Rise>
    )
  }

  if (!data.team) {
    const waiting = data.my_request
    return (
      <Rise>
        <Card className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-chip text-brand-ink">
            {waiting ? <Hourglass className="size-5" aria-hidden /> : <UserPlus className="size-5" aria-hidden />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{waiting ? `Waiting for ${waiting.team.name}` : "You're not on a team yet"}</p>
            <p className="text-sm text-muted">
              {waiting ? 'Anyone on the team can let you in.' : 'Join one so your Hangs claim zones.'}
            </p>
          </div>
          <Button variant="secondary" className="h-10 shrink-0 px-3 text-sm" onClick={() => navigate('/me')}>
            {waiting ? 'Manage' : 'Find a team'}
          </Button>
        </Card>
      </Rise>
    )
  }

  return null
}
