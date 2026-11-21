import { HeartHandshake, RefreshCw, Send, UsersRound } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import OpenHangCard from '../components/OpenHangCard'
import { Avatar, Button, Card, ErrorText, Page, Rise, SectionTitle, TeamDot } from '../components/ui'
import { getPosition } from '../lib/location'

const REFRESH_MS = 30000

function hoursLabel(h) {
  if (h < 1) return `${Math.max(Math.round(h * 60), 1)} min together`
  return `${h % 1 === 0 ? h : h.toFixed(1)} h together`
}

/** Someone you've hung out with: hours together and how far to the next friendship level. */
function PersonRow({ p }) {
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const hangAgain = async () => {
    setBusy(true)
    try {
      await api(`/meet/people/${p.user.id}/hang-again`, { method: 'POST' })
      setSent(true)
    } catch {
      // offline: they can tap again
    } finally {
      setBusy(false)
    }
  }
  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <Avatar name={p.user.name} color={p.user.team?.color} size={40} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-semibold">
            <span className="truncate">{p.user.name}</span>
            {p.user.team && <TeamDot color={p.user.team.color} className="size-2" />}
          </p>
          <p className="text-[13px] text-muted">
            {hoursLabel(p.hours)} · <span className="font-semibold text-ink-soft">{p.level}</span>
          </p>
        </div>
        <button
          onClick={hangAgain}
          disabled={sent || busy}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-chip px-3 text-sm font-semibold text-ink-soft active:bg-line disabled:opacity-70"
        >
          <Send className="size-4" aria-hidden /> {sent ? 'Sent' : 'Hang again'}
        </button>
      </div>
      {p.next_level && (
        <div className="ml-[52px] mt-2">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-chip"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(p.progress * 100)}
            aria-label={`Progress to ${p.next_level}`}
          >
            <div className="h-full rounded-full bg-lime" style={{ width: `${Math.max(p.progress * 100, 3)}%` }} />
          </div>
          <p className="mt-1 text-xs text-faint">
            {p.hours_to_next} h more to {p.next_level.toLowerCase()}
            {p.shared_interests.length > 0 && ` · You both like ${p.shared_interests.join(', ')}`}
          </p>
        </div>
      )}
    </li>
  )
}

/** Meet: open Hangs near you (people who share your interests first), and the people you've met. */
export default function Meet() {
  const navigate = useNavigate()
  const [hangs, setHangs] = useState(null)
  const [people, setPeople] = useState(null)
  const [error, setError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const loadHangs = useCallback(async () => {
    setRefreshing(true)
    try {
      const pos = await getPosition()
      setHangs(await api(`/meet/open-hangs?lat=${pos.lat}&lng=${pos.lng}`))
      setError(null)
    } catch (e) {
      setError(e.message)
      setHangs((h) => h ?? [])
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadHangs()
    api('/meet/people').then(setPeople).catch(() => setPeople([]))
    const t = setInterval(loadHangs, REFRESH_MS)
    return () => clearInterval(t)
  }, [loadHangs])

  return (
    <Page className="bg-canvas">
      <h1 className="pb-1 pt-6 font-display text-[40px] font-extrabold uppercase leading-none tracking-tight">Meet</h1>
      <p className="pb-5 text-[15px] text-muted">Open Hangs near you, and the people you've met.</p>

      <section>
        <SectionTitle
          action={
            <button
              aria-label="Refresh"
              onClick={loadHangs}
              className="flex size-11 items-center justify-center rounded-full bg-surface ring-1 ring-line active:bg-chip"
            >
              <RefreshCw className={`size-4 text-ink-soft ${refreshing ? 'motion-safe:animate-spin' : ''}`} aria-hidden />
            </button>
          }
        >
          Out now
        </SectionTitle>
        {error && <ErrorText>{error}</ErrorText>}
        {hangs === null && (
          <div className="space-y-3" aria-label="Loading open Hangs">
            {[0, 1].map((i) => (
              <div key={i} className="h-44 animate-pulse rounded-3xl bg-surface ring-1 ring-line" />
            ))}
          </div>
        )}
        {hangs?.length === 0 && (
          <Card className="text-center">
            <UsersRound className="mx-auto size-9 text-faint" aria-hidden />
            <p className="mt-2 font-display text-[22px] font-bold uppercase leading-none">Nothing open nearby</p>
            <p className="mt-1.5 text-sm text-muted">
              Start an open Hang from Home. People nearby who like the same things will see it.
            </p>
            <Button variant="lime" className="mt-4 w-full" onClick={() => navigate('/')}>
              Start one
            </Button>
          </Card>
        )}
        <div className="space-y-3">
          {hangs?.map((h, i) => (
            <Rise key={h.id} i={i}>
              <OpenHangCard hang={h} onChange={loadHangs} />
            </Rise>
          ))}
        </div>
      </section>

      <section className="pt-6">
        <SectionTitle>Your people</SectionTitle>
        <p className="-mt-1 mb-2 flex items-start gap-2 text-[13px] text-muted">
          <HeartHandshake className="mt-0.5 size-4 shrink-0 text-brand-ink" aria-hidden />
          About 50 hours together makes a casual friend, 90 a friend, and 200 a close friend.
        </p>
        {people === null && <div className="h-24 animate-pulse rounded-3xl bg-surface ring-1 ring-line" />}
        {people?.length === 0 && (
          <Card className="text-sm text-muted">After your first Hang, the people you met show up here, with your hours together.</Card>
        )}
        {people?.length > 0 && (
          <Card className="py-1">
            <ul className="divide-y divide-line">
              {people.map((p) => (
                <PersonRow key={p.user.id} p={p} />
              ))}
            </ul>
          </Card>
        )}
      </section>
    </Page>
  )
}
