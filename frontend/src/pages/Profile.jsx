import { Check, Flame, FlaskConical, Hexagon, LogOut, MapPin, Monitor, Moon, Palette, Sparkles, Sun, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import AnimatedNumber from '../components/AnimatedNumber'
import { Avatar, Button, Card, ErrorText, Rise, SectionTitle } from '../components/ui'
import { getFakeLocation, getPosition, setFakeLocation, TEST_LOCATIONS } from '../lib/location'
import { useTheme } from '../theme'
import { useUser } from '../user'

const FIELD =
  'mt-1 h-11 w-full rounded-xl bg-canvas px-3 text-sm text-ink outline-none ring-1 ring-line focus:ring-2 focus:ring-brand-ink'

function HeaderStat({ icon, value, label }) {
  return (
    <div className="flex-1 rounded-2xl bg-white/10 p-3 text-center">
      <span className="flex items-center justify-center gap-1.5 font-display text-[28px] font-bold leading-none">
        {icon}
        <AnimatedNumber value={value} />
      </span>
      <span className="mt-1 block text-xs font-medium text-white/60">{label}</span>
    </div>
  )
}

export default function Profile() {
  const { user, setUser, signOut } = useUser()
  const theme = useTheme()
  const [allInterests, setAllInterests] = useState([])
  const [myTeam, setMyTeam] = useState(null)
  const [zones, setZones] = useState(0)
  const [interests, setInterests] = useState(user.interests)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const initialFake = getFakeLocation()
  const [fake, setFake] = useState(initialFake)
  const [selectedLocation, setSelectedLocation] = useState(
    TEST_LOCATIONS.find((p) => p.lat === initialFake?.lat && p.lng === initialFake?.lng)?.name ?? '',
  )
  const [customLat, setCustomLat] = useState(initialFake?.lat?.toString() ?? '')
  const [customLng, setCustomLng] = useState(initialFake?.lng?.toString() ?? '')

  useEffect(() => {
    api('/interests').then(setAllInterests).catch(() => {})
    api('/me/team').then(setMyTeam).catch(() => {})
    api('/leaderboard')
      .then((d) => setZones(d.teams.find((t) => t.id === user.team?.id)?.hexes ?? 0))
      .catch(() => {})
  }, [user.team?.id])

  const save = async (body, done) => {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      setUser(await api('/me', { method: 'PATCH', body }))
      setMessage(done)
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const toggle = (i) => setInterests((l) => (l.includes(i) ? l.filter((x) => x !== i) : [...l, i]))

  const setHome = async () => {
    try {
      const pos = await getPosition()
      await save({ home_lat: pos.lat, home_lng: pos.lng }, 'Home saved.')
    } catch (e) {
      setError(e.message)
    }
  }

  const applyPreset = (name) => {
    setSelectedLocation(name)
    const place = TEST_LOCATIONS.find((p) => p.name === name)
    if (!place) return
    setError(null)
    setCustomLat(place.lat.toString())
    setCustomLng(place.lng.toString())
    setFakeLocation(place)
    setFake(place)
    setMessage(`Test location set to ${place.name}.`)
  }

  const applyCustom = () => {
    const lat = Number(customLat)
    const lng = Number(customLng)
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      setError('Enter a valid latitude (-90 to 90) and longitude (-180 to 180).')
      return
    }
    const place = { lat, lng }
    setSelectedLocation('')
    setFakeLocation(place)
    setFake(place)
    setError(null)
    setMessage('Custom test location set.')
  }

  const clearFake = () => {
    setFakeLocation(null)
    setFake(null)
    setSelectedLocation('')
    setCustomLat('')
    setCustomLng('')
    setError(null)
    setMessage('Using your real device location.')
  }

  return (
    <div className="min-h-dvh bg-canvas pb-32">
      <header className="pt-safe bg-hex rounded-b-[36px] bg-brand px-5 pb-6 text-white">
        <Rise className="flex flex-col items-center pt-10">
          <Avatar name={user.name} color={user.team?.color} size={88} ring />
          <h1 className="mt-4 font-display text-[36px] font-extrabold leading-none">{user.name}</h1>
          {user.team && (
            <p className="mt-2 flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold">
              <Hexagon className="size-4" style={{ color: user.team.color, fill: user.team.color }} aria-hidden /> {user.team.name}
            </p>
          )}
        </Rise>
        <div className="mt-6 flex gap-2">
          <HeaderStat icon={<Sparkles className="size-5 text-lime" aria-hidden />} value={user.points} label="points" />
          <HeaderStat icon={<Flame className="size-5 text-orange-400" aria-hidden />} value={user.streak} label="day streak" />
          <HeaderStat icon={<Hexagon className="size-5 text-sky-300" aria-hidden />} value={zones} label="team zones" />
        </div>
      </header>

      <div className="space-y-4 px-4 pt-5">
        {message && (
          <p role="status" className="flex items-center gap-2 rounded-2xl bg-lime px-3 py-2 text-sm font-semibold text-on-accent">
            <Check className="size-4" aria-hidden /> {message}
          </p>
        )}
        <ErrorText>{error}</ErrorText>

        {myTeam?.team && (
          <Rise>
            <Card>
              <SectionTitle
                action={
                  <span className="flex items-center gap-1 text-sm font-semibold text-muted">
                    <Users className="size-4" aria-hidden /> {myTeam.members.length}
                  </span>
                }
              >
                Your team
              </SectionTitle>
              <div className="-mx-2">
                {myTeam.members.map((m) => (
                  <div key={m.id} className={`flex min-h-12 items-center gap-3 rounded-2xl px-2 py-1.5 ${m.id === user.id ? 'bg-lime/30 dark:bg-lime/15' : ''}`}>
                    <Avatar name={m.name} color={myTeam.team.color} size={36} />
                    <span className="flex-1 truncate font-semibold">
                      {m.name}
                      {m.id === user.id && <span className="ml-1.5 text-sm font-normal text-muted">(you)</span>}
                    </span>
                    {m.streak > 0 && (
                      <span className="flex items-center gap-0.5 text-sm font-semibold text-orange-500">
                        <Flame className="size-4" aria-hidden /> {m.streak}
                      </span>
                    )}
                    <span className="w-16 text-right font-display text-lg font-bold">{m.points}</span>
                  </div>
                ))}
              </div>
              {myTeam.members.length === 1 && (
                <p className="mt-2 text-sm text-muted">Just you so far. Friends can pick {myTeam.team.name} when they sign up.</p>
              )}
            </Card>
          </Rise>
        )}

        <Rise i={1}>
          <Card>
            <SectionTitle action={<Palette className="size-5 text-muted" aria-hidden />}>Appearance</SectionTitle>
            <div className="grid grid-cols-3 rounded-2xl bg-chip p-1" role="radiogroup" aria-label="Theme">
              {[
                ['light', 'Light', Sun],
                ['dark', 'Dark', Moon],
                ['system', 'Auto', Monitor],
              ].map(([value, label, Icon]) => (
                <button
                  key={value}
                  role="radio"
                  aria-checked={theme.pref === value}
                  onClick={() => theme.choose(value)}
                  className={`flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition ${
                    theme.pref === value ? 'bg-surface text-ink shadow-sm' : 'text-muted'
                  }`}
                >
                  <Icon className="size-4" aria-hidden /> {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-faint">Auto follows your phone's setting.</p>
          </Card>
        </Rise>

        <Rise i={2}>
          <Card>
            <SectionTitle>Interests</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {allInterests.map((i) => {
                const on = interests.includes(i)
                return (
                  <button
                    key={i}
                    onClick={() => toggle(i)}
                    aria-pressed={on}
                    className={`flex min-h-10 items-center gap-1 rounded-full px-3.5 text-sm font-semibold transition-colors ${
                      on ? 'bg-brand text-white dark:bg-lime dark:text-on-accent' : 'bg-chip text-ink-soft'
                    }`}
                  >
                    {on && <Check className="size-3.5" aria-hidden />}
                    {i}
                  </button>
                )
              })}
            </div>
            <Button className="mt-4 h-11 w-full" loading={saving} onClick={() => save({ interests }, 'Interests saved.')}>
              Save interests
            </Button>
          </Card>
        </Rise>

        <Rise i={3}>
          <Card>
            <SectionTitle>Home spot</SectionTitle>
            <p className="text-sm text-muted">
              {user.has_home ? "Set. Solo sessions count once you're 100 m+ away, and Hang time stops when you're back." : 'Not set.'} Rounded, never shown.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" className="h-11" onClick={setHome}>
                <MapPin className="size-4" aria-hidden /> I'm home now
              </Button>
              <Button variant="ghost" className="h-11" disabled={!user.has_home} onClick={() => save({ clear_home: true }, 'Home cleared.')}>
                Clear
              </Button>
            </div>
          </Card>
        </Rise>

        <Rise i={4}>
          <Card>
            <SectionTitle action={<FlaskConical className="size-5 text-muted" aria-hidden />}>Testing tools</SectionTitle>
            <p className="text-sm text-muted">
              Pretend this device is somewhere else. The app uses this location for Hang starts, joins, pings, and checkouts.
            </p>
            <label className="mt-3 block text-sm font-semibold text-ink-soft" htmlFor="test-location">
              Pick a location
            </label>
            <select id="test-location" value={selectedLocation} onChange={(e) => applyPreset(e.target.value)} className={FIELD}>
              <option value="">Choose a preset...</option>
              {TEST_LOCATIONS.map((place) => (
                <option key={place.name} value={place.name}>{place.name}</option>
              ))}
            </select>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-xs font-semibold text-muted">
                Latitude
                <input type="number" step="any" value={customLat} onChange={(e) => setCustomLat(e.target.value)} className={FIELD} />
              </label>
              <label className="text-xs font-semibold text-muted">
                Longitude
                <input type="number" step="any" value={customLng} onChange={(e) => setCustomLng(e.target.value)} className={FIELD} />
              </label>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" className="h-11" onClick={applyCustom}>
                Use coordinates
              </Button>
              <Button variant="ghost" className="h-11" onClick={clearFake} disabled={!fake}>
                Use real location
              </Button>
            </div>
            {fake && (
              <p className="mt-3 rounded-xl bg-lime/40 px-3 py-2 text-xs font-semibold text-ink dark:bg-lime/15 dark:text-lime">
                Active test location: {fake.lat.toFixed(5)}, {fake.lng.toFixed(5)}
              </p>
            )}
          </Card>
        </Rise>

        <Button variant="danger" className="w-full" onClick={() => window.confirm('Log out on this device?') && signOut()}>
          <LogOut className="size-5" aria-hidden /> Log out
        </Button>
      </div>
    </div>
  )
}
