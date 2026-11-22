import { ChevronRight, Flame, Footprints, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { happenedLabel, minutesLabel } from '../lib/when'
import { Card, SectionTitle } from './ui'

const SHOW_FIRST = 5

/** "with Maya", "with Maya and Omar", "with Maya, Omar +2" */
function withWhom(h) {
  if (!h.people_count) return null
  if (h.people_count === 1) return `with ${h.people[0]}`
  if (h.people_count === 2) return `with ${h.people[0]} and ${h.people[1]}`
  return `with ${h.people.slice(0, 2).join(', ')} +${h.people_count - 2}`
}

/** Me: your past Hangs, newest first. Tap one to see how it went. */
export default function HangHistory() {
  const navigate = useNavigate()
  const [items, setItems] = useState(null)
  const [all, setAll] = useState(false)

  useEffect(() => {
    api('/me/history?limit=30')
      .then(setItems)
      .catch(() => setItems([]))
  }, [])

  if (items === null) return <div className="h-32 animate-pulse rounded-3xl bg-surface ring-1 ring-line" aria-label="Loading your Hangs" />

  const shown = all ? items : items.slice(0, SHOW_FIRST)
  return (
    <Card className="pb-2">
      <SectionTitle>Your Hangs</SectionTitle>
      {items.length === 0 ? (
        <p className="pb-2 text-sm text-muted">Your Hangs show up here once they're over, with who you were with.</p>
      ) : (
        <ul className="-mx-1 divide-y divide-line">
          {shown.map((h) => {
            const Icon = h.kind === 'solo' ? Footprints : UsersRound
            const title = h.place_name || h.activity || (h.kind === 'solo' ? 'Solo session' : 'Group Hang')
            const details = [happenedLabel(h.started_at), minutesLabel(h.minutes), withWhom(h)].filter(Boolean).join(' · ')
            return (
              <li key={h.hang_id}>
                <button
                  onClick={() => navigate(`/hang/${h.hang_id}`)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-1 py-2.5 text-left active:bg-chip"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-chip text-brand-ink">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate font-semibold">{title}</span>
                      {h.hot_zone && <Flame className="size-4 shrink-0 text-[#ff3d00]" aria-label="Hot zone" />}
                    </span>
                    <span className="block truncate text-[13px] text-muted">{details}</span>
                  </span>
                  <span className="shrink-0 font-display text-lg font-bold">
                    {h.removed ? '0' : h.points == null ? '...' : `+${h.points}`}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {items.length > SHOW_FIRST && (
        <button onClick={() => setAll((a) => !a)} className="mt-1 flex min-h-11 w-full items-center justify-center text-sm font-semibold text-brand-ink">
          {all ? 'Show less' : `Show all ${items.length}`}
        </button>
      )}
    </Card>
  )
}
