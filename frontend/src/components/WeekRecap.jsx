import { Handshake, Hexagon, Smartphone, TrendingDown, TrendingUp, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { hoursLabel } from '../lib/when'
import { Card, SectionTitle } from './ui'

function Stat({ icon: Icon, value, label, main = false }) {
  return (
    <div className={`rounded-2xl p-3 ${main ? 'bg-lime text-on-accent' : 'bg-chip'}`}>
      <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${main ? '' : 'text-muted'}`}>
        <Icon className="size-4" aria-hidden /> {label}
      </span>
      <span className="mt-1.5 block font-display text-[28px] font-bold leading-none">{value}</span>
    </div>
  )
}

/** Me: this week so far (Monday to now): time with friends, new people, zones your team holds, phones-down time. */
export default function WeekRecap() {
  const [r, setR] = useState(null)

  useEffect(() => {
    api('/me/recap').then(setR).catch(() => {})
  }, [])

  if (!r) return <div className="h-48 animate-pulse rounded-3xl bg-surface ring-1 ring-line" aria-label="Loading your week" />

  const change = r.change_hours
  return (
    <Card>
      <SectionTitle action={<span className="text-[13px] font-semibold text-muted">Since Monday</span>}>Your week offline</SectionTitle>
      {r.hangs === 0 ? (
        <p className="text-sm text-muted">
          No Hangs yet this week. Plan a rally on Home and get your team out. Every Sunday evening you'll get your week in a
          notification.
        </p>
      ) : (
        <>
          <p className="-mt-1 mb-3 text-[13px] text-muted">
            {r.hangs} {r.hangs === 1 ? 'Hang' : 'Hangs'} · {r.points} points{r.top_place ? ` · mostly at ${r.top_place}` : ''}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Stat main icon={UsersRound} value={hoursLabel(r.hours_together)} label="with friends" />
            <Stat icon={Handshake} value={r.new_people} label={r.new_people === 1 ? 'new person' : 'new people'} />
            <Stat icon={Hexagon} value={r.zones} label={r.zones === 1 ? 'zone held' : 'zones held'} />
            <Stat icon={Smartphone} value={hoursLabel(r.phones_down_hours)} label="phones down" />
          </div>
          {change !== 0 && (
            <p
              className={`mt-3 flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold ${
                change > 0 ? 'bg-lime/30 text-ink dark:bg-lime/15 dark:text-lime' : 'bg-chip text-ink-soft'
              }`}
            >
              {change > 0 ? <TrendingUp className="size-4 shrink-0" aria-hidden /> : <TrendingDown className="size-4 shrink-0" aria-hidden />}
              {hoursLabel(Math.abs(change))} {change > 0 ? 'more' : 'less'} with friends than last week
            </p>
          )}
        </>
      )}
    </Card>
  )
}
