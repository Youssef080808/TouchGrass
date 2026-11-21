import {
  ArrowRight, Cloud, CloudRain, ExternalLink, Flame, Footprints, MapPin, Moon, QrCode, Snowflake, Sparkles, Sun, Users,
} from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import FriendOrFoe from '../components/FriendOrFoe'
import { Button, Card, ErrorText, Page, TeamDot } from '../components/ui'
import { APP_NAME } from '../config'
import { getPosition } from '../lib/location'
import { useTheme } from '../theme'
import { useUser } from '../user'

function WeatherChip({ weather }) {
  if (!weather) return null
  const Icon = weather.label === 'Snow' ? Snowflake : ['Rain', 'Drizzle', 'Thunderstorm'].includes(weather.label) ? CloudRain : weather.label === 'Clear' ? Sun : Cloud
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-sm text-ink-soft ring-1 ring-line">
      <Icon className="size-4" /> {weather.temp_c}°C · {weather.label}
    </span>
  )
}

export default function Home() {
  const { user } = useUser()
  const { dark, toggle } = useTheme()
  const navigate = useNavigate()
  const [active, setActive] = useState(null)
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
    loadSuggestions()
  }, [loadSuggestions])

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
      <header className="flex items-center justify-between pb-4 pt-5">
        <div>
          <p className="text-sm font-semibold text-grass">{APP_NAME}</p>
          <h1 className="text-2xl font-bold tracking-tight">Hey {user.name}</h1>
        </div>
        <div className="flex gap-2">
          <button
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={toggle}
            className="inline-flex size-9 items-center justify-center rounded-full bg-surface ring-1 ring-line active:bg-chip"
          >
            {dark ? <Sun className="size-4 text-amber-400" /> : <Moon className="size-4 text-ink-soft" />}
          </button>
          <span className="inline-flex items-center gap-1 rounded-full bg-surface px-3 py-1.5 text-sm font-semibold ring-1 ring-line">
            <Flame className="size-4 text-orange-500" /> {user.streak}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-surface px-3 py-1.5 text-sm font-semibold ring-1 ring-line">
            <Sparkles className="size-4 text-grass" /> {user.points}
          </span>
        </div>
      </header>

      <div className="space-y-4">
        <FriendOrFoe onFight={() => start('group')} onTeamUp={() => start('group')} />

        {active && (
          <button
            onClick={() => navigate(`/hang/${active.id}`)}
            className="flex w-full items-center gap-3 rounded-3xl bg-lime p-4 text-left text-on-accent"
          >
            <span className="relative flex size-3">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-on-accent opacity-60" />
              <span className="relative inline-flex size-3 rounded-full bg-on-accent" />
            </span>
            <span className="flex-1 font-semibold">You're in a live Hang · {active.code}</span>
            <ArrowRight className="size-5" />
          </button>
        )}

        <div className="rounded-3xl bg-brand p-5 text-white shadow-lg">
          <h2 className="text-xl font-bold">Go outside</h2>
          <p className="mt-1 text-[15px] text-white/70">Phones down with friends. More people, more points.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="lime" loading={busy === 'group'} onClick={() => start('group')}>
              <Users className="size-5" /> Start Hang
            </Button>
            <Button
              className="bg-white/10 text-white active:bg-white/20"
              loading={busy === 'solo'}
              onClick={() => start('solo')}
            >
              <Footprints className="size-5" /> Go solo
            </Button>
          </div>
        </div>

        <ErrorText>{error && !error.place && error.message}</ErrorText>

        <Card>
          <form onSubmit={join} className="flex items-center gap-2">
            <QrCode className="size-5 shrink-0 text-faint" />
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Join with a code"
              maxLength={8}
              className="h-11 min-w-0 flex-1 bg-transparent text-[15px] font-semibold tracking-widest outline-none placeholder:font-normal placeholder:tracking-normal"
            />
            <Button type="submit" className="h-10 px-4" disabled={code.trim().length < 4}>
              Join
            </Button>
          </form>
          <p className="mt-2 text-xs text-faint">Or scan your friend's QR code with your phone camera.</p>
        </Card>

        <section>
          <div className="mb-3 mt-2 flex items-center justify-between">
            <h2 className="text-lg font-bold">Where to go</h2>
            <WeatherChip weather={suggest?.weather} />
          </div>
          {suggestError && (
            <Card className="text-sm text-ink-soft">
              <p>{suggestError}</p>
              <Button variant="secondary" className="mt-3 h-10" onClick={loadSuggestions}>
                Try again
              </Button>
            </Card>
          )}
          {!suggest && !suggestError && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-3xl bg-surface" />
              ))}
            </div>
          )}
          <div className="space-y-3">
            {suggest?.places.map((p) => (
              <Card key={`${p.name}-${p.lat}`} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-2xl bg-canvas p-2.5">
                    <MapPin className="size-5 text-brand-ink" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-semibold">{p.name}</h3>
                      {p.active && (
                        <span className="shrink-0 rounded-full bg-lime/70 px-2 py-0.5 text-[11px] font-semibold text-on-accent">
                          Active +20%
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-muted">{p.reason}</p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <a
                    href={p.maps_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex h-10 items-center justify-center gap-1.5 rounded-xl bg-canvas text-sm font-semibold text-ink-soft"
                  >
                    <ExternalLink className="size-4" /> Directions
                  </a>
                  <Button className="h-10 rounded-xl text-sm" loading={busy === p.name} onClick={() => start('group', p)}>
                    I'm here, start
                  </Button>
                </div>
                {error?.place === p.name && (
                  <div className="mt-3">
                    <ErrorText>{error.message}</ErrorText>
                  </div>
                )}
              </Card>
            ))}
          </div>
          {suggest?.source === 'sample' && (
            <p className="mt-3 text-center text-xs text-faint">
              Sample places. Add a Google Places key on the server for real ones.
            </p>
          )}
        </section>

        {user.team && (
          <p className="flex items-center justify-center gap-2 pt-2 text-sm text-faint">
            <TeamDot color={user.team.color} /> Playing for {user.team.name}
          </p>
        )}
      </div>
    </Page>
  )
}
