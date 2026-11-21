import { Flame, LogOut, MapPin, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { Avatar, Button, Card, ErrorText, Page, TeamDot } from '../components/ui'
import { getFakeLocation, getPosition, setFakeLocation, TEST_LOCATIONS } from '../lib/location'
import { useUser } from '../user'

export default function Profile() {
  const { user, setUser, signOut } = useUser()
  const [allInterests, setAllInterests] = useState([])
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
  }, [])

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
    <Page className="bg-canvas">
      <div className="flex flex-col items-center pb-6 pt-10">
        <Avatar name={user.name} color={user.team?.color} size={88} />
        <h1 className="mt-3 text-2xl font-bold">{user.name}</h1>
        {user.team && (
          <p className="mt-1 flex items-center gap-2 text-slate-500">
            <TeamDot color={user.team.color} /> {user.team.name}
          </p>
        )}
        <div className="mt-4 flex gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 font-semibold ring-1 ring-black/5">
            <Sparkles className="size-4 text-grass" /> {user.points} pts
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 font-semibold ring-1 ring-black/5">
            <Flame className="size-4 text-orange-500" /> {user.streak} day streak
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <Card>
          <h2 className="font-semibold">Interests</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {allInterests.map((i) => (
              <button
                key={i}
                onClick={() => toggle(i)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  interests.includes(i) ? 'bg-forest text-white' : 'bg-canvas text-slate-600'
                }`}
              >
                {i}
              </button>
            ))}
          </div>
          <Button className="mt-4 h-10 w-full" loading={saving} onClick={() => save({ interests }, 'Interests saved.')}>
            Save interests
          </Button>
        </Card>

        <Card>
          <h2 className="font-semibold">Home spot</h2>
          <p className="mt-1 text-sm text-slate-500">
            {user.has_home ? 'Set. Solo sessions count once you are 300 m+ away.' : 'Not set.'} Rounded, never shown.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" className="h-10" onClick={setHome}>
              <MapPin className="size-4" /> I'm home now
            </Button>
            <Button variant="ghost" className="h-10" disabled={!user.has_home} onClick={() => save({ clear_home: true }, 'Home cleared.')}>
              Clear
            </Button>
          </div>
        </Card>

        {message && <p className="rounded-2xl bg-lime/50 px-3 py-2 text-sm text-forest">{message}</p>}
        <ErrorText>{error}</ErrorText>

        <Card>
          <h2 className="font-semibold">Testing tools</h2>
          <p className="mt-1 text-sm text-slate-500">
            Pretend this device is somewhere else. The app uses this location for Hang starts, joins, pings, and checkouts.
          </p>
          <label className="mt-3 block text-sm font-semibold" htmlFor="test-location">
            Pick a location
          </label>
          <select
            id="test-location"
            value={selectedLocation}
            onChange={(e) => applyPreset(e.target.value)}
            className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
          >
            <option value="">Choose a preset...</option>
            {TEST_LOCATIONS.map((place) => (
              <option key={place.name} value={place.name}>{place.name}</option>
            ))}
          </select>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-slate-500">
              Latitude
              <input
                type="number"
                step="any"
                value={customLat}
                onChange={(e) => setCustomLat(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
              />
            </label>
            <label className="text-xs font-semibold text-slate-500">
              Longitude
              <input
                type="number"
                step="any"
                value={customLng}
                onChange={(e) => setCustomLng(e.target.value)}
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900"
              />
            </label>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" className="h-10" onClick={applyCustom}>
              Use coordinates
            </Button>
            <Button variant="ghost" className="h-10" onClick={clearFake} disabled={!fake}>
              Use real location
            </Button>
          </div>
          {fake && (
            <p className="mt-3 rounded-xl bg-lime/40 px-3 py-2 text-xs font-semibold text-forest">
              Active test location: {fake.lat.toFixed(5)}, {fake.lng.toFixed(5)}
            </p>
          )}
        </Card>

        <Button variant="danger" className="w-full" onClick={() => window.confirm('Log out on this device?') && signOut()}>
          <LogOut className="size-5" /> Log out
        </Button>
      </div>
    </Page>
  )
}
