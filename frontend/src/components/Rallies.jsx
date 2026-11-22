import { CalendarClock, Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { useHotZones } from '../hooks/useHotZones'
import { getPosition } from '../lib/location'
import RallyCard from './RallyCard'
import { Button, Card, Rise, SectionTitle } from './ui'

const REFRESH_MS = 60000

/** Home: your team's rallies, Team ups with your team, and ones you're in on (live ones first). */
export default function Rallies({ onPlan, refreshKey = 0 }) {
  const [rallies, setRallies] = useState(null)
  const hot = useHotZones()
  const hotIds = new Set(hot.map((z) => z.hex_id))

  const load = useCallback(() => {
    api('/rallies')
      .then(setRallies)
      .catch(() => setRallies((r) => r ?? []))
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => clearInterval(t)
  }, [load, refreshKey])

  return (
    <section className="pt-2">
      <SectionTitle
        action={
          <button onClick={() => onPlan()} className="inline-flex min-h-11 items-center gap-1 px-1 text-sm font-semibold text-brand-ink">
            <Plus className="size-4" aria-hidden /> Plan one
          </button>
        }
      >
        Rallies
      </SectionTitle>
      {rallies === null && <div className="h-28 animate-pulse rounded-3xl bg-surface ring-1 ring-line" aria-label="Loading rallies" />}
      {rallies?.length === 0 && (
        <Card className="flex items-start gap-3">
          <CalendarClock className="mt-0.5 size-5 shrink-0 text-brand-ink" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Plan a Hang for later</p>
            <p className="mt-0.5 text-sm text-muted">
              Pick a place and a time. Your team says I'm in, gets a reminder 20 minutes before, and is checked in on arrival.
            </p>
            <Button variant="secondary" className="mt-3 h-11 w-full" onClick={() => onPlan()}>
              <Plus className="size-4" aria-hidden /> Plan a rally
            </Button>
          </div>
        </Card>
      )}
      <div className="space-y-3">
        {rallies?.map((r, i) => (
          <Rise key={r.id} i={i}>
            <RallyCard rally={r} hot={hotIds.has(r.hex_id)} onChange={load} />
          </Rise>
        ))}
      </div>
    </section>
  )
}

/** Meet: open rallies from other people nearby, the ones for things you like first. Hidden when there are none. */
export function OpenRallies() {
  const [rallies, setRallies] = useState(null)
  const hot = useHotZones()
  const hotIds = new Set(hot.map((z) => z.hex_id))

  const load = useCallback(async () => {
    try {
      const pos = await getPosition()
      setRallies(await api(`/rallies?scope=open&lat=${pos.lat}&lng=${pos.lng}`))
    } catch {
      setRallies((r) => r ?? [])
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (!rallies?.length) return null
  return (
    <section className="pt-6">
      <SectionTitle>Coming up</SectionTitle>
      <p className="-mt-1 mb-2 text-[13px] text-muted">Open rallies near you. Say you're in and you're checked in when you get there.</p>
      <div className="space-y-3">
        {rallies.map((r, i) => (
          <Rise key={r.id} i={i}>
            <RallyCard rally={r} hot={hotIds.has(r.hex_id)} onChange={load} />
          </Rise>
        ))}
      </div>
    </section>
  )
}
