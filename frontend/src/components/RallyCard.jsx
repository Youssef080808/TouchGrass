import { CalendarClock, Check, ExternalLink, Flame, Globe2, Handshake, MapPin, UsersRound } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { distanceLabel } from '../lib/geo'
import { BUZZ, haptic } from '../lib/haptics'
import { getPosition } from '../lib/location'
import { mapsUrl, startsLabel } from '../lib/when'
import { Avatar, Button, ErrorText, TeamDot } from './ui'

/** "Maya", "Maya and Omar", "Maya, Omar and 3 more" */
function whoIsIn(going, total) {
  const names = going.map((p) => p.name)
  if (total <= 1) return `${names[0] ?? 'Nobody'} so far`
  if (total === 2) return `${names[0]} and ${names[1]} are in`
  return `${names.slice(0, 2).join(', ')} and ${total - 2} more are in`
}

/**
 * A rally (a Hang planned for later) on Home or Meet. "I'm in" / "Can't make it"; from 30 minutes before the start,
 * "I'm here" checks you in (the app also does it by itself when you arrive). The host can cancel until it starts.
 */
export default function RallyCard({ rally, hot = false, onChange }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const live = rally.status === 'live'
  const canArrive = live || new Date(rally.arrive_from) <= new Date()
  const teamUp = rally.kind === 'team_up'
  const KindIcon = teamUp ? Handshake : rally.visibility === 'open' ? Globe2 : UsersRound

  const act = async (key, fn) => {
    setBusy(key)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }
  const answer = (going) =>
    act(going ? 'in' : 'out', async () => {
      await api(`/rallies/${rally.id}/rsvp`, { method: 'POST', body: { going } })
      haptic(BUZZ.tap)
      onChange?.()
    })
  const arrive = () =>
    act('arrive', async () => {
      const pos = await getPosition()
      const hang = await api(`/rallies/${rally.id}/arrive`, { method: 'POST', body: pos })
      haptic(BUZZ.join)
      navigate(`/hang/${hang.id}`)
    })
  const cancel = () => {
    if (!window.confirm("Cancel this rally? Everyone who's in gets a notification.")) return
    act('cancel', async () => {
      await api(`/rallies/${rally.id}/cancel`, { method: 'POST' })
      onChange?.()
    })
  }

  let actions
  if (rally.my_hang_status === 'in') {
    actions = (
      <Button variant="lime" className="col-span-2 h-11" onClick={() => navigate(`/hang/${rally.hang_id}`)}>
        You're in. Open it
      </Button>
    )
  } else if (rally.my_hang_status === 'left') {
    actions = <p className="col-span-2 text-sm text-muted">You left this Hang.</p>
  } else if (rally.my_going) {
    const second =
      rally.is_host && !live ? (
        <Button variant="danger" className="h-11" loading={busy === 'cancel'} onClick={cancel}>
          Cancel rally
        </Button>
      ) : (
        <Button variant="secondary" className="h-11" loading={busy === 'out'} onClick={() => answer(false)}>
          Can't make it
        </Button>
      )
    actions = (
      <>
        {canArrive ? (
          <Button variant="lime" className="h-11" loading={busy === 'arrive'} onClick={arrive}>
            I'm here
          </Button>
        ) : (
          <span className="flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-lime/30 px-2 text-sm font-semibold text-ink dark:bg-lime/15 dark:text-lime">
            <Check className="size-4" aria-hidden /> You're in
          </span>
        )}
        {second}
      </>
    )
  } else if (rally.my_going === false) {
    actions = (
      <>
        <p className="flex items-center text-sm text-muted">You can't make it.</p>
        <Button variant="secondary" className="h-11" loading={busy === 'in'} onClick={() => answer(true)}>
          I'm in after all
        </Button>
      </>
    )
  } else {
    actions = (
      <>
        <Button className="h-11" loading={busy === 'in'} onClick={() => answer(true)}>
          I'm in
        </Button>
        <Button variant="secondary" className="h-11" loading={busy === 'out'} onClick={() => answer(false)}>
          Can't make it
        </Button>
      </>
    )
  }

  return (
    <div className={`rounded-3xl bg-surface p-4 ring-1 ${live ? 'ring-2 ring-lime' : 'ring-line'}`}>
      <div className="flex items-start gap-3">
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${teamUp ? 'bg-lime text-on-accent' : 'bg-chip text-brand-ink'}`}>
          <KindIcon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-[22px] font-bold leading-tight">{rally.activity || 'Hang'}</h3>
          <p className="mt-0.5 flex items-start gap-1 text-sm leading-snug text-muted">
            <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">
              {rally.place.name}
              {rally.distance_m != null && ` · ${distanceLabel(rally.distance_m)}`}
            </span>
          </p>
        </div>
        {live ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-lime px-2.5 py-1 text-xs font-bold text-on-accent">
            <span className="relative flex size-2" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-on-accent opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-on-accent" />
            </span>
            Live · {rally.here_count} here
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-chip px-2.5 py-1 text-xs font-bold text-ink-soft">
            <CalendarClock className="size-3.5" aria-hidden /> {startsLabel(rally.starts_at)}
          </span>
        )}
      </div>

      {(teamUp || rally.visibility === 'open' || hot) && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {teamUp && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-chip px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
              <TeamDot color={rally.team?.color} className="size-2" /> {rally.team?.name}
              <Handshake className="size-3.5" aria-hidden />
              <TeamDot color={rally.invite_team?.color} className="size-2" /> {rally.invite_team?.name}
            </span>
          )}
          {rally.visibility === 'open' && (
            <span className="inline-flex items-center gap-1 rounded-full bg-chip px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
              <Globe2 className="size-3.5" aria-hidden /> Open to people nearby
            </span>
          )}
          {rally.shares_interest && (
            <span className="inline-flex items-center gap-1 rounded-full bg-lime/30 px-2.5 py-0.5 text-xs font-semibold text-ink dark:bg-lime/15 dark:text-lime">
              You like {rally.activity}
            </span>
          )}
          {hot && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#ff3d00] px-2.5 py-0.5 text-xs font-bold text-white">
              <Flame className="size-3.5" aria-hidden /> Hot zone x2
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2.5">
        <div className="flex -space-x-2">
          {rally.going.slice(0, 4).map((p) => (
            <div key={p.id} className="rounded-full ring-2 ring-surface">
              <Avatar name={p.name} color={p.team?.color} size={28} />
            </div>
          ))}
        </div>
        <p className="min-w-0 flex-1 truncate text-[13px] text-muted">
          <span className="font-semibold text-ink">{whoIsIn(rally.going, rally.going_count)}</span>
        </p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">{actions}</div>
      {error && (
        <div className="mt-2">
          <ErrorText>{error}</ErrorText>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <a href={mapsUrl(rally.place)} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-brand-ink">
          <ExternalLink className="size-3.5" aria-hidden /> Directions
        </a>
        <span className="truncate text-xs text-faint">{rally.is_host ? 'You planned this' : `Planned by ${rally.host.name}`}</span>
      </div>
    </div>
  )
}
