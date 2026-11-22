import {
  ArrowRight, BookOpen, Camera, ChevronDown, Clapperboard, Cloud, CloudRain, Coffee, Dumbbell, ExternalLink, Flame,
  Footprints, Hexagon, Landmark, Lightbulb, MapPin, Minus, Moon, Music, Palette, Plus, QrCode, Snowflake, Sparkles,
  Sun, Trees, UsersRound, UtensilsCrossed,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import AnimatedNumber from '../components/AnimatedNumber'
import FriendOrFoe from '../components/FriendOrFoe'
import LiquidText from '../components/LiquidText'
import { LogoMark } from '../components/Logo'
import OpenHangCard from '../components/OpenHangCard'
import Rallies from '../components/Rallies'
import QuestCard from '../components/QuestCard'
import RallySheet from '../components/RallySheet'
import TeamRequests from '../components/TeamRequests'
import { Avatar, Button, Card, ErrorText, Page, Rise, SectionTitle } from '../components/ui'
import { cn } from '../lib/cn'
import { BUZZ, haptic } from '../lib/haptics'
import { getPosition } from '../lib/location'
import { useTheme } from '../theme'
import { useUser } from '../user'

const PLACE_ICONS = {
  park: Trees, hiking_area: Trees, gym: Dumbbell, sports_complex: Dumbbell, cafe: Coffee, library: BookOpen,
  book_store: BookOpen, museum: Landmark, art_gallery: Palette, restaurant: UtensilsCrossed,
  movie_theater: Clapperboard, tourist_attraction: Camera, night_club: Music,
}

const OTHER = 'Other'
const SIZES = [null, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20] // null = no limit
const OPEN_DEFAULT_SIZE = 6

const FIRST_STEPS = [
  'Start a Hang where you are: open to new people, or just friends.',
  'People nearby check themselves in. Friends scan your QR code.',
  'Phones down. Your time together builds friendships and claims the zone.',
]

function WeatherChip({ weather }) {
  if (!weather) return null
  const Icon = weather.label === 'Snow' ? Snowflake : ['Rain', 'Drizzle', 'Thunderstorm'].includes(weather.label) ? CloudRain : weather.label === 'Clear' ? Sun : Cloud
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-surface px-3 text-sm font-medium text-ink-soft ring-1 ring-line">
      <Icon className="size-4" aria-hidden /> {weather.temp_c}°C · {weather.label}
    </span>
  )
}

function HeroStat({ icon, value, label }) {
  return (
    <div className="flex flex-col">
      <span className="flex items-center gap-1.5 font-display text-[26px] font-bold leading-none">
        {icon}
        <AnimatedNumber value={value} />
      </span>
      <span className="mt-1 text-[12px] font-medium text-white/60">{label}</span>
    </div>
  )
}

/** Two-way switch on the navy card (lime = chosen). */
function Segmented({ label, options, value, onChange }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-1 rounded-2xl bg-white/10 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-11 rounded-xl px-2 text-[14px] font-semibold leading-tight transition-colors',
            value === o.value ? 'bg-lime text-on-accent' : 'text-white/75 active:bg-white/10',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function Home() {
  const { user } = useUser()
  const { dark, toggle } = useTheme()
  const navigate = useNavigate()
  const [active, setActive] = useState(null)
  const [zones, setZones] = useState(0)
  const [suggest, setSuggest] = useState(null)
  const [suggestError, setSuggestError] = useState(null)
  const [openHangs, setOpenHangs] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null) // { place, message }: place is set when a place card was tapped
  const [code, setCode] = useState('')
  const [rally, setRally] = useState(null) // the Plan a rally / Team up sheet: null = closed
  const [ralliesKey, setRalliesKey] = useState(0)

  // What you're starting: activity, open or friends-only, how many people, who can come
  const activities = [...new Set([...(user.interests ?? []).slice(0, 4), 'Hanging out', 'Study'])]
  const [activity, setActivity] = useState(activities[0])
  const [otherText, setOtherText] = useState('')
  const [visibility, setVisibility] = useState('open')
  const [size, setSize] = useState(OPEN_DEFAULT_SIZE)
  const [sizeTouched, setSizeTouched] = useState(false)
  const [joinMode, setJoinMode] = useState('anyone')
  const chosenActivity = activity === OTHER ? otherText.trim() : activity

  const chooseVisibility = (v) => {
    setVisibility(v)
    if (!sizeTouched) setSize(v === 'open' ? OPEN_DEFAULT_SIZE : null)
  }
  const stepSize = (dir) => {
    setSizeTouched(true)
    const i = SIZES.indexOf(size)
    setSize(SIZES[Math.min(Math.max(i + dir, 0), SIZES.length - 1)])
  }

  const loadNearby = useCallback(async () => {
    setSuggestError(null)
    try {
      const pos = await getPosition()
      const [places, open] = await Promise.all([
        api(`/suggestions?lat=${pos.lat}&lng=${pos.lng}`),
        api(`/meet/open-hangs?lat=${pos.lat}&lng=${pos.lng}`).catch(() => []),
      ])
      setSuggest(places)
      setOpenHangs(open)
    } catch (e) {
      setSuggestError(e.message)
      setOpenHangs((h) => h ?? [])
    }
  }, [])

  useEffect(() => {
    api('/me/active-hang').then((d) => setActive(d.hang)).catch(() => {})
    api('/leaderboard')
      .then((d) => setZones(d.teams.find((t) => t.id === user.team?.id)?.hexes ?? 0))
      .catch(() => {})
    loadNearby()
  }, [loadNearby, user.team?.id])

  const start = async (kind, place) => {
    setBusy(place ? place.name : kind)
    setError(null)
    try {
      const pos = await getPosition()
      const group = kind === 'group'
      const hang = await api('/hangs', {
        method: 'POST',
        body: {
          kind, ...pos,
          place_name: place?.name ?? null, place_type: place?.type ?? null,
          place_lat: place?.lat ?? null, place_lng: place?.lng ?? null, // the server checks you're really there
          visibility: group ? visibility : 'friends',
          activity: chosenActivity || null,
          max_size: group ? size : null,
          join_mode: joinMode,
        },
      })
      haptic(BUZZ.start)
      navigate(`/hang/${hang.id}`)
    } catch (e) {
      setError({ place: place?.name ?? null, message: e.message })
      setBusy(null)
    }
  }

  const join = (e) => {
    e.preventDefault()
    if (code.trim().length >= 4) navigate(`/join/${code.trim().toUpperCase()}`)
  }

  const nearby = (openHangs ?? []).filter((h) => h.my_status !== 'member').slice(0, 2)

  return (
    <Page className="bg-canvas">
      <header className="flex items-center gap-3 pb-4 pt-5">
        <Avatar name={user.name} color={user.team?.color} size={44} />
        <div className="min-w-0 flex-1">
          {/* leading-tight, not leading-none: truncate cuts off anything outside the line, like the tails of y and g */}
          <h1 className="truncate font-display text-[28px] font-bold leading-tight">Hey {user.name}</h1>
          <p className="truncate text-sm font-medium text-muted">{user.team ? `Playing for ${user.team.name}` : 'No team yet'}</p>
        </div>
        <button
          aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={toggle}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface ring-1 ring-line active:bg-chip"
        >
          {dark ? <Sun className="size-5 text-amber-400" aria-hidden /> : <Moon className="size-5 text-ink-soft" aria-hidden />}
        </button>
      </header>

      <div className="space-y-4">
        {active && (
          <Rise>
            <button
              onClick={() => navigate(`/hang/${active.id}`)}
              className="press-lime flex min-h-14 w-full items-center gap-3 rounded-3xl bg-lime p-4 text-left text-on-accent"
            >
              <span className="relative flex size-3" aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-on-accent opacity-60" />
                <span className="relative inline-flex size-3 rounded-full bg-on-accent" />
              </span>
              <span className="flex-1 font-semibold">You're in a live Hang · {active.code}</span>
              <ArrowRight className="size-5" aria-hidden />
            </button>
          </Rise>
        )}

        {/* 1. Start a Hang right where you are */}
        <Rise>
          <section className="bg-hex relative overflow-hidden rounded-[28px] bg-brand p-5 text-white shadow-xl shadow-brand/20">
            <div className="flex gap-6">
              <HeroStat icon={<Flame className="size-5 text-orange-400" aria-hidden />} value={user.streak} label="day streak" />
              <HeroStat icon={<Sparkles className="size-5 text-lime" aria-hidden />} value={user.points} label="points" />
              <HeroStat icon={<Hexagon className="size-5 text-sky-300" aria-hidden />} value={zones} label="team zones" />
            </div>
            <h2 className="mt-5 font-display text-[40px] font-extrabold uppercase leading-[0.9] tracking-tight">
              Go <LiquidText fill={0.74} delay={500}>outside.</LiquidText>
            </h2>
            <p className="mt-1.5 text-[15px] text-white/75">Start a Hang right where you are.</p>

            <p className="mt-4 text-[13px] font-semibold uppercase tracking-wide text-white/60">What are you doing?</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[...activities, OTHER].map((a) => (
                <button
                  key={a}
                  aria-pressed={activity === a}
                  onClick={() => setActivity(a)}
                  className={cn(
                    'min-h-10 rounded-full px-3.5 text-[14px] font-semibold transition-colors',
                    activity === a ? 'bg-lime text-on-accent' : 'bg-white/10 text-white/85 active:bg-white/20',
                  )}
                >
                  {a === OTHER ? 'Something else' : a}
                </button>
              ))}
            </div>
            {activity === OTHER && (
              <>
                <label htmlFor="activity-other" className="sr-only">What are you doing?</label>
                <input
                  id="activity-other"
                  value={otherText}
                  onChange={(e) => setOtherText(e.target.value)}
                  maxLength={40}
                  placeholder="Frisbee, picnic, jam session"
                  className="mt-2 h-11 w-full rounded-xl bg-white/10 px-3 text-[15px] text-white outline-none ring-1 ring-white/15 placeholder:text-white/45 focus:ring-2 focus:ring-lime"
                />
              </>
            )}

            <div className="mt-4">
              <Segmented
                label="Who can see it"
                value={visibility}
                onChange={chooseVisibility}
                options={[
                  { value: 'open', label: 'Open to new people' },
                  { value: 'friends', label: 'Just my friends' },
                ]}
              />
            </div>

            <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl bg-white/10 p-1 pl-4">
              <span className="text-[14px] font-semibold">{size ? `Up to ${size} people` : 'No size limit'}</span>
              <div className="flex gap-1">
                <button aria-label="Fewer people" onClick={() => stepSize(-1)} className="flex size-11 items-center justify-center rounded-xl active:bg-white/15">
                  <Minus className="size-5" aria-hidden />
                </button>
                <button aria-label="More people" onClick={() => stepSize(1)} className="flex size-11 items-center justify-center rounded-xl active:bg-white/15">
                  <Plus className="size-5" aria-hidden />
                </button>
              </div>
            </div>

            {visibility === 'open' && (
              <>
                <div className="mt-2">
                  <Segmented
                    label="Who can join"
                    value={joinMode}
                    onChange={setJoinMode}
                    options={[
                      { value: 'anyone', label: 'Anyone can come' },
                      { value: 'approve', label: 'I approve each person' },
                    ]}
                  />
                </div>
                <p className="mt-2 text-[12px] leading-snug text-white/60">
                  Open Hangs are for public places. People nearby who like the same things will see it and check
                  themselves in when they arrive.
                </p>
              </>
            )}

            <Button variant="lime" className="mt-4 w-full" loading={busy === 'group'} onClick={() => start('group')}>
              <UsersRound className="size-5" aria-hidden /> Start Hang
            </Button>
            <button
              onClick={() => start('solo')}
              disabled={busy === 'solo'}
              className="mt-1 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl text-[14px] font-semibold text-white/70 active:bg-white/10"
            >
              <Footprints className="size-4" aria-hidden /> {busy === 'solo' ? 'Starting...' : 'Or go solo'}
            </button>
          </section>
        </Rise>

        <ErrorText>{error && !error.place && error.message}</ErrorText>

        <Rise i={1}>
          <QuestCard />
        </Rise>

        <FriendOrFoe
          onFight={() => start('group')}
          onTeamUp={(n) => setRally({ hexId: n.hex_id, inviteTeam: n.other_team })}
        />

        <TeamRequests />

        {/* Plans for later: your team's rallies and Team ups */}
        <Rallies onPlan={() => setRally({})} refreshKey={ralliesKey} />

        {user.points === 0 && !active && (
          <Rise i={1}>
            <Card>
              <div className="flex items-center gap-3">
                <LogoMark size={48} />
                <div>
                  <p className="font-display text-[24px] font-extrabold uppercase leading-none">Your first Hang</p>
                  <p className="mt-1 text-sm text-muted">Three steps to meet people and put your team on the map.</p>
                </div>
              </div>
              <ol className="mt-4 space-y-2.5">
                {FIRST_STEPS.map((step, i) => (
                  <li key={step} className="flex items-center gap-3 text-[15px]">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-lime font-display text-base font-bold text-on-accent">
                      {i + 1}
                    </span>
                    {step}
                  </li>
                ))}
              </ol>
            </Card>
          </Rise>
        )}

        {/* 2. Happening near you: open Hangs, people first */}
        <section className="pt-2">
          <SectionTitle
            action={
              <button onClick={() => navigate('/meet')} className="inline-flex min-h-11 items-center gap-1 px-1 text-sm font-semibold text-brand-ink">
                See all <ArrowRight className="size-4" aria-hidden />
              </button>
            }
          >
            Happening near you
          </SectionTitle>
          {openHangs === null && <div className="h-44 animate-pulse rounded-3xl bg-surface ring-1 ring-line" aria-label="Loading open Hangs" />}
          {openHangs !== null && nearby.length === 0 && (
            <Card className="flex items-start gap-3">
              <UsersRound className="mt-0.5 size-5 shrink-0 text-faint" aria-hidden />
              <p className="text-sm text-muted">
                Nothing open near you right now. Start an open Hang above: people nearby who like the same things will see it.
              </p>
            </Card>
          )}
          <div className="space-y-3">
            {nearby.map((h, i) => (
              <Rise key={h.id} i={i + 1}>
                <OpenHangCard hang={h} onChange={loadNearby} />
              </Rise>
            ))}
          </div>
        </section>

        <Rise i={2}>
          <Card className="p-3">
            <form onSubmit={join} className="flex items-center gap-2">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-chip text-brand-ink">
                <QrCode className="size-5" aria-hidden />
              </div>
              <label htmlFor="join-code" className="sr-only">Hang code</label>
              <input
                id="join-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Join a friend with a code"
                maxLength={8}
                autoComplete="off"
                className="h-11 min-w-0 flex-1 bg-transparent font-display text-xl font-bold tracking-[0.2em] text-ink outline-none placeholder:font-sans placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-faint"
              />
              <Button type="submit" className="h-11 px-5" disabled={code.trim().length < 4}>
                Join
              </Button>
            </form>
            <p className="mt-2 px-1 text-[13px] text-muted">Or scan your friend's QR code with your phone camera.</p>
          </Card>
        </Rise>

        {/* 3. Need an idea? Places, folded away */}
        <details className="group rounded-3xl bg-surface ring-1 ring-line">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 [&::-webkit-details-marker]:hidden">
            <Lightbulb className="size-5 shrink-0 text-brand-ink" aria-hidden />
            <span className="flex-1 font-semibold">Need an idea? Places nearby</span>
            <WeatherChip weather={suggest?.weather} />
            <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="space-y-3 px-3 pb-3">
            {suggestError && (
              <div className="text-sm text-ink-soft">
                <p>{suggestError}</p>
                <Button variant="secondary" className="mt-3 h-11" onClick={loadNearby}>
                  Try again
                </Button>
              </div>
            )}
            {!suggest && !suggestError && <div className="h-28 animate-pulse rounded-3xl bg-chip" aria-label="Loading places" />}
            {suggest && suggest.places.length === 0 && (
              <p className="px-1 text-sm text-muted">No spots found nearby. You can still start a Hang right where you are.</p>
            )}
            {suggest?.places.map((p) => {
              const Icon = PLACE_ICONS[p.type] ?? MapPin
              return (
                <div key={`${p.name}-${p.lat}`} className="rounded-2xl bg-canvas p-3 ring-1 ring-line">
                  <div className="flex items-start gap-3">
                    <div className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${p.active ? 'bg-lime text-on-accent' : 'bg-chip text-brand-ink'}`}>
                      <Icon className="size-5" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-[16px] font-semibold leading-tight">{p.name}</h3>
                      <p className="mt-0.5 text-[13px] text-muted">{p.reason}</p>
                      {p.active && (
                        <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-lime/30 px-2.5 py-0.5 text-xs font-bold text-ink dark:text-lime">
                          <Dumbbell className="size-3.5" aria-hidden /> Active place +20%
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <a
                      href={p.maps_url}
                      target="_blank"
                      rel="noreferrer"
                      className="press-line flex h-11 items-center justify-center gap-1.5 rounded-xl bg-chip text-sm font-semibold text-ink-soft transition-transform"
                    >
                      <ExternalLink className="size-4" aria-hidden /> Directions
                    </a>
                    <Button className="h-11 rounded-xl text-sm" loading={busy === p.name} onClick={() => start('group', p)}>
                      I'm here, start
                    </Button>
                  </div>
                  {error?.place === p.name && (
                    <div className="mt-3">
                      <ErrorText>{error.message}</ErrorText>
                    </div>
                  )}
                </div>
              )
            })}
            {suggest?.source === 'sample' && (
              <p className="text-center text-xs text-faint">Sample places. Add a Google Places key on the server for real ones.</p>
            )}
          </div>
        </details>
      </div>

      <RallySheet
        preset={rally}
        onClose={() => setRally(null)}
        onCreated={() => {
          setRally(null)
          setRalliesKey((k) => k + 1)
        }}
      />
    </Page>
  )
}
