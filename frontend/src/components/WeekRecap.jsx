import { Handshake, Hexagon, Smartphone, TrendingDown, TrendingUp, UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { hoursLabel } from '../lib/when'
import { Card, SectionTitle } from './ui'
import WarpCarousel from './WarpCarousel'

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

const short = (h) => (h >= 10 ? Math.round(h) : Math.round(h * 10) / 10)

// Turfed colours: navy into lime, blue, violet and orange (a few colours are spread over the card's mesh)
const LOOK = {
  friends: { mesh: ['#06142b', '#0b1d3a', '#123a2c', '#2f6f2a', '#7fbf3f', '#bef264', '#efffc9'], numeral: ['#e9ffc2', '#bef264'], accent: '#d9f99d', glow: '#bef264' },
  people: { mesh: ['#04101f', '#0b1d3a', '#0f3563', '#1d6fb0', '#38bdf8', '#bae6fd'], numeral: ['#bae6fd', '#ffffff'], accent: '#7dd3fc', glow: '#38bdf8' },
  zones: { mesh: ['#0d0820', '#1e1450', '#3b2390', '#6d4bd8', '#a78bfa', '#ede9fe'], numeral: ['#ddd6fe', '#ffffff'], accent: '#c4b5fd', glow: '#a78bfa' },
  phones: { mesh: ['#1a0707', '#3d1010', '#7a2614', '#d9561c', '#fb923c', '#ffedd5'], numeral: ['#fff7ed', '#fdba74'], accent: '#fdba74', glow: '#fb923c' },
}

function recapCards(r) {
  const share = r.hours_out > 0 ? Math.round((r.phones_down_hours / r.hours_out) * 100) : 0
  const change = r.change_hours
  return [
    { title: 'Time with\nfriends', value: String(short(r.hours_together)), unit: 'h', footer: change > 0 ? `${short(change)}h more than last week` : 'Since Monday', detail: 'ring', ...LOOK.friends },
    { title: 'New people\nyou met', value: String(r.new_people), footer: r.new_people ? 'Say hi again soon' : 'Join an open Hang', detail: 'wave', ...LOOK.people },
    { title: 'Zones your\nteam holds', value: String(r.zones), footer: r.top_place ? `Mostly at ${r.top_place}` : 'Take one this week', detail: 'none', ...LOOK.zones },
    { title: 'Phones down\nduring Hangs', value: String(share), unit: '%', footer: `${short(r.phones_down_hours)}h with phones away`, detail: 'slider', labels: ['Phones out', 'Phones down'], ...LOOK.phones },
  ]
}

function surfaceColor() {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue('--surface').trim() || '#ffffff'
  } catch {
    return '#ffffff'
  }
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
          <WarpCarouselBox r={r} />
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

// The carousel was designed for wide screens: a narrower stage and bigger text keep the cards readable on a phone
function WarpCarouselBox({ r }) {
  return (
    <div className="-mx-4" style={{ height: 300 }}>
      <WarpCarousel
        cards={recapCards(r)}
        background={surfaceColor()}
        font='"Barlow", system-ui, sans-serif'
        stageWidth={520}
        textScale={1.45}
        ariaLabel="Your week offline"
        style={{ minHeight: 0, aspectRatio: 'auto' }}
      />
    </div>
  )
}
