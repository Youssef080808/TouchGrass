import { Flame, LogOut, MapPin, Monitor, Moon, Sparkles, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { Avatar, Button, Card, ErrorText, Page, TeamDot } from '../components/ui'
import { DEFAULT_CENTER } from '../config'
import { getFakeLocation, getPosition, setFakeLocation } from '../lib/location'
import { useTheme } from '../theme'
import { useUser } from '../user'

export default function Profile() {
  const { user, setUser, signOut } = useUser()
  const theme = useTheme()
  const [allInterests, setAllInterests] = useState([])
  const [interests, setInterests] = useState(user.interests)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [fake, setFake] = useState(Boolean(getFakeLocation()))

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

  const toggleFake = () => {
    setFakeLocation(fake ? null : DEFAULT_CENTER)
    setFake(!fake)
  }

  return (
    <Page className="bg-canvas">
      <div className="flex flex-col items-center pb-6 pt-10">
        <Avatar name={user.name} color={user.team?.color} size={88} />
        <h1 className="mt-3 text-2xl font-bold">{user.name}</h1>
        {user.team && (
          <p className="mt-1 flex items-center gap-2 text-muted">
            <TeamDot color={user.team.color} /> {user.team.name}
          </p>
        )}
        <div className="mt-4 flex gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-4 py-2 font-semibold ring-1 ring-line">
            <Sparkles className="size-4 text-grass" /> {user.points} pts
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-4 py-2 font-semibold ring-1 ring-line">
            <Flame className="size-4 text-orange-500" /> {user.streak} day streak
          </span>
        </div>
      </div>

      <div className="space-y-4">
        <Card>
          <h2 className="font-semibold">Appearance</h2>
          <div className="mt-3 grid grid-cols-3 rounded-2xl bg-chip p-1">
            {[
              ['light', 'Light', Sun],
              ['dark', 'Dark', Moon],
              ['system', 'Auto', Monitor],
            ].map(([value, label, Icon]) => (
              <button
                key={value}
                onClick={() => theme.choose(value)}
                className={`flex h-10 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold ${
                  theme.pref === value ? 'bg-surface shadow-sm' : 'text-muted'
                }`}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-faint">Auto follows your phone's setting.</p>
        </Card>

        <Card>
          <h2 className="font-semibold">Interests</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {allInterests.map((i) => (
              <button
                key={i}
                onClick={() => toggle(i)}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  interests.includes(i) ? 'bg-brand text-white' : 'bg-canvas text-ink-soft'
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
          <p className="mt-1 text-sm text-muted">
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

        {message && <p className="rounded-2xl bg-lime/50 px-3 py-2 text-sm text-on-accent">{message}</p>}
        <ErrorText>{error}</ErrorText>

        <Card>
          <h2 className="font-semibold">Testing tools</h2>
          <label className="mt-2 flex items-center justify-between gap-3 text-sm text-ink-soft">
            Pretend I'm at McGill (for testing on a laptop)
            <input type="checkbox" checked={fake} onChange={toggleFake} className="size-5 accent-brand-ink" />
          </label>
        </Card>

        <Button variant="danger" className="w-full" onClick={() => window.confirm('Log out on this device?') && signOut()}>
          <LogOut className="size-5" /> Log out
        </Button>
      </div>
    </Page>
  )
}
