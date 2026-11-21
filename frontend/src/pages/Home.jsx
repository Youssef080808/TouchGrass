import {
  ArrowRight, BookOpen, Camera, Clapperboard, Cloud, CloudRain, Coffee, Dumbbell, ExternalLink, Flame, Footprints,
  Hexagon, Landmark, MapPin, Moon, Music, Palette, QrCode, Snowflake, Sparkles, Sun, Trees, Users, UtensilsCrossed,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import AnimatedNumber from '../components/AnimatedNumber'
import FriendOrFoe from '../components/FriendOrFoe'
import { Avatar, Button, Card, ErrorText, Page, Rise, SectionTitle } from '../components/ui'
import { getPosition } from '../lib/location'
import { useTheme } from '../theme'
import { useUser } from '../user'

const PLACE_ICONS = {
  park: Trees, hiking_area: Trees, gym: Dumbbell, sports_complex: Dumbbell, cafe: Coffee, library: BookOpen,
  book_store: BookOpen, museum: Landmark, art_gallery: Palette, restaurant: UtensilsCrossed,
  movie_theater: Clapperboard, tourist_attraction: Camera, night_club: Music,
}

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
      <span className="flex items-center gap-1.5 font-display text-[30px] font-bold leading-none">
        {icon}
        <AnimatedNumber value={value} />
      </span>
      <span className="mt-1 text-[13px] font-medium text-white/60">{label}</span>
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
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null) // { place, message }: place is set when a place card was tapped
  const [code, setCode] = useState('')

  const loadSuggestions = useCallback(async () => {
    setSuggestError(null)
    try {
      const pos = await getPosition()
      setSuggest(await api(`/suggestions?lat=${pos.lat}&lng=${pos.lng}`))
    } catch (e) {
      setSuggestError(e.message)
    }
  }, [])

  useEffect(() => {
    api('/me/active-hang').then((d) => setActive(d.hang)).catch(() => {})
    api('/leaderboard')
      .then((d) => setZones(d.teams.find((t) => t.id === user.team?.id)?.hexes ?? 0))
      .catch(() => {})
    loadSuggestions()
  }, [loadSuggestions, user.team?.id])

  const start = async (kind, place) => {
    setBusy(place ? place.name : kind)
    setError(null)
    try {
      const pos = await getPosition()
      const hang = await api('/hangs', {
        method: 'POST',
        body: { kind, ...pos, place_name: place?.name ?? null, place_type: place?.type ?? null },
      })
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

  return (
    <Page className="bg-canvas">
      <header className="flex items-center gap-3 pb-4 pt-5">
        <Avatar name={user.name} color={user.team?.color} size={44} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[28px] font-bold leading-none">Hey {user.name}</h1>
          {user.team && <p className="mt-1 truncate text-sm font-medium text-muted">Playing for {user.team.name}</p>}
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
        <Rise>
          <section className="bg-hex relative overflow-hidden rounded-[28px] bg-brand p-5 text-white shadow-xl shadow-brand/20">
            <div className="flex gap-6">
              <HeroStat icon={<Flame className="size-6 text-orange-400" aria-hidden />} value={user.streak} label="day streak" />
              <HeroStat icon={<Sparkles className="size-6 text-lime" aria-hidden />} value={user.points} label="points" />
              <HeroStat icon={<Hexagon className="size-6 text-sky-300" aria-hidden />} value={zones} label="team zones" />
            </div>
            <h2 className="mt-6 font-display text-[44px] font-extrabold uppercase leading-[0.9] tracking-tight">
              Go <span className="text-lime">outside.</span>
            </h2>
            <p className="mt-2 text-[15px] text-white/75">Phones down with friends. More people, more points.</p>
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <Button variant="lime" loading={busy === 'group'} onClick={() => start('group')}>
                <Users className="size-5" aria-hidden /> Start Hang
              </Button>
              <Button
                className="bg-white/12 text-white ring-1 ring-white/15 active:bg-white/20"
                loading={busy === 'solo'}
                onClick={() => start('solo')}
              >
                <Footprints className="size-5" aria-hidden /> Go solo
              </Button>
            </div>
          </section>
        </Rise>

        <ErrorText>{error && !error.place && error.message}</ErrorText>

        <FriendOrFoe onFight={() => start('group')} onTeamUp={() => start('group')} />

        {active && (
          <Rise i={1}>
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
                placeholder="Join with a code"
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

        <section className="pt-2">
          <SectionTitle action={<WeatherChip weather={suggest?.weather} />}>Where to go</SectionTitle>
          {suggestError && (
            <Card className="text-sm text-ink-soft">
              <p>{suggestError}</p>
              <Button variant="secondary" className="mt-3 h-11" onClick={loadSuggestions}>
                Try again
              </Button>
            </Card>
          )}
          {!suggest && !suggestError && (
            <div className="space-y-3" aria-label="Loading places">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-36 animate-pulse rounded-3xl bg-surface ring-1 ring-line" />
              ))}
            </div>
          )}
          <div className="space-y-3">
            {suggest?.places.map((p, i) => {
              const Icon = PLACE_ICONS[p.type] ?? MapPin
              return (
                <Rise key={`${p.name}-${p.lat}`} i={i + 3}>
                  <Card>
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ${
                          p.active ? 'bg-lime text-on-accent' : 'bg-chip text-brand-ink'
                        }`}
                      >
                        <Icon className="size-6" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-[17px] font-semibold leading-tight">{p.name}</h3>
                        <p className="mt-1 text-sm text-muted">{p.reason}</p>
                        {p.active && (
                          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-lime/30 px-2.5 py-0.5 text-xs font-bold text-ink dark:text-lime">
                            <Dumbbell className="size-3.5" aria-hidden /> Active place +20%
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
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
                  </Card>
                </Rise>
              )
            })}
          </div>
          {suggest?.source === 'sample' && (
            <p className="mt-3 text-center text-xs text-faint">
              Sample places. Add a Google Places key on the server for real ones.
            </p>
          )}
        </section>
      </div>
    </Page>
  )
}
