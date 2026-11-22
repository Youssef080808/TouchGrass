import { ExternalLink, Hourglass, MapPin, ShieldCheck, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { distanceLabel } from '../lib/geo'
import { BUZZ, haptic } from '../lib/haptics'
import { getPosition } from '../lib/location'
import ReportButton from './ReportButton'
import { Avatar, Button, ErrorText } from './ui'

/**
 * An open Hang near you (Meet and Home). "I'm coming" tells the host; "I'm here" checks you in yourself
 * once you're within 100 m, so nobody has to stop a game to scan you.
 */
/** One short AI line per open Hang on why you might like it ({} when the server has no AI key). */
export function useWhyLines(hangs) {
  const ids = (hangs || []).slice(0, 6).map((h) => h.id).join(',')
  const [lines, setLines] = useState({})
  useEffect(() => {
    if (!ids) return undefined
    let live = true
    api(`/meet/why?ids=${ids}`)
      .then((d) => live && setLines(d || {}))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [ids])
  return lines
}

export default function OpenHangCard({ hang, onChange, why }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const status = hang.my_status
  const approve = hang.join_mode === 'approve'
  const full = hang.spots_left === 0

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
  const coming = () =>
    act('rsvp', async () => {
      await api(`/hangs/${hang.id}/rsvp`, { method: 'POST' })
      haptic(BUZZ.tap)
      onChange?.()
    })
  const cancel = () =>
    act('cancel', async () => {
      await api(`/hangs/${hang.id}/rsvp`, { method: 'DELETE' })
      onChange?.()
    })
  const arrive = () =>
    act('arrive', async () => {
      const pos = await getPosition()
      const h = await api(`/hangs/${hang.id}/arrive`, { method: 'POST', body: pos })
      haptic(BUZZ.join)
      navigate(`/hang/${h.id}`)
    })

  let actions
  if (status === 'member') {
    actions = (
      <Button variant="lime" className="col-span-2 h-11" onClick={() => navigate(`/hang/${hang.id}`)}>
        You're in. Open it
      </Button>
    )
  } else if (status === 'going') {
    actions = (
      <>
        <Button variant="lime" className="h-11" loading={busy === 'arrive'} onClick={arrive}>
          I'm here
        </Button>
        <Button variant="secondary" className="h-11" loading={busy === 'cancel'} onClick={cancel}>
          Can't make it
        </Button>
      </>
    )
  } else if (status === 'pending') {
    actions = (
      <>
        <span className="flex h-11 items-center justify-center gap-1.5 rounded-2xl bg-chip px-2 text-center text-sm font-semibold text-ink-soft">
          <Hourglass className="size-4 shrink-0" aria-hidden /> Asked {hang.host.name}
        </span>
        <Button variant="secondary" className="h-11" loading={busy === 'cancel'} onClick={cancel}>
          Cancel
        </Button>
      </>
    )
  } else if (status === 'declined') {
    actions = <p className="col-span-2 text-sm text-muted">Not this time. Try another one nearby.</p>
  } else if (full) {
    actions = <p className="col-span-2 rounded-2xl bg-chip px-3 py-2.5 text-center text-sm font-semibold text-muted">Full right now</p>
  } else {
    actions = (
      <>
        <Button className={`h-11 ${hang.in_reach && !approve ? '' : 'col-span-2'}`} loading={busy === 'rsvp'} onClick={coming}>
          {approve ? 'Ask to join' : "I'm coming"}
        </Button>
        {hang.in_reach && !approve && (
          <Button variant="lime" className="h-11" loading={busy === 'arrive'} onClick={arrive}>
            I'm here
          </Button>
        )}
      </>
    )
  }

  return (
    <div className="rounded-3xl bg-surface p-4 ring-1 ring-line">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-[22px] font-bold leading-tight">{hang.activity || 'Hanging out'}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">
              {hang.place_name || `${hang.host.name}'s spot`} · {distanceLabel(hang.distance_m)}
            </span>
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-chip px-2.5 py-1 text-xs font-bold text-ink-soft">
          {hang.here_count}
          {hang.max_size ? `/${hang.max_size}` : ''} here
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2.5">
        <div className="flex -space-x-2">
          {hang.people.slice(0, 4).map((p, i) => (
            <div key={i} className="rounded-full ring-2 ring-surface">
              <Avatar name={p.name} color={p.team?.color} size={28} />
            </div>
          ))}
        </div>
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-muted">
          {hang.sharing_count > 0 ? (
            <>
              <span className="font-semibold text-ink">
                {hang.sharing_count} {hang.sharing_count === 1 ? 'person shares' : 'people share'} your interests
              </span>
              {hang.shared_interests.length > 0 && ` · ${hang.shared_interests.join(', ')}`}
            </>
          ) : (
            `Hosted by ${hang.host.name}`
          )}
        </p>
      </div>

      {why && (
        <p className="mt-2 flex items-start gap-1.5 rounded-2xl bg-lime/15 px-3 py-2 text-[13px] font-medium leading-snug text-ink">
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-brand-ink" aria-hidden />
          <span>{why}</span>
        </p>
      )}

      {approve && (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-chip px-2.5 py-0.5 text-xs font-semibold text-ink-soft">
          <ShieldCheck className="size-3.5" aria-hidden /> {hang.host.name} approves each person
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">{actions}</div>
      {error && (
        <div className="mt-2">
          <ErrorText>{error}</ErrorText>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between">
        {hang.maps_url ? (
          <a href={hang.maps_url} target="_blank" rel="noreferrer" className="inline-flex min-h-8 items-center gap-1 text-xs font-semibold text-brand-ink">
            <ExternalLink className="size-3.5" aria-hidden /> Directions
          </a>
        ) : (
          <span className="text-xs text-faint">{approve ? "Exact spot shown once you're accepted" : ''}</span>
        )}
        <ReportButton userId={hang.host.id} hangId={hang.id} name={hang.host.name} />
      </div>
    </div>
  )
}
