import { ArrowLeft, Check, MapPin, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { Button, ErrorText, TeamDot } from '../components/ui'
import { APP_NAME, TAGLINE, TEAM_COLORS } from '../config'
import { getPosition } from '../lib/location'
import { useUser } from '../user'

export const PENDING_JOIN_KEY = 'tg_pending_join'

const STEPS = ['welcome', 'name', 'interests', 'team', 'home']
const DEFAULT_INTERESTS = [
  'Basketball', 'Soccer', 'Running', 'Climbing', 'Gym', 'Tennis', 'Hiking', 'Board games',
  'Coffee', 'Reading', 'Art', 'Music', 'Movies', 'Food', 'Photography', 'Bowling',
]

export default function Onboarding() {
  const { signIn } = useUser()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [isAdult, setIsAdult] = useState(false)
  const [allInterests, setAllInterests] = useState(DEFAULT_INTERESTS)
  const [interests, setInterests] = useState([])
  const [teams, setTeams] = useState([])
  const [teamId, setTeamId] = useState(null)
  const [newTeam, setNewTeam] = useState('')
  const [newColor, setNewColor] = useState(TEAM_COLORS[0])
  const [home, setHome] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    api('/interests')
      .then((items) => {
        if (Array.isArray(items) && items.length > 0) setAllInterests(items)
      })
      .catch(() => {})
    api('/teams').then(setTeams).catch(() => {})
  }, [])

  const toggleInterest = (i) =>
    setInterests((list) => (list.includes(i) ? list.filter((x) => x !== i) : [...list, i]))

  const canContinue = {
    welcome: true,
    name: name.trim().length > 0 && isAdult,
    interests: interests.length > 0,
    team: teamId !== null || newTeam.trim().length > 0,
    home: true,
  }[STEPS[step]]

  const setHomeHere = async () => {
    setError(null)
    try {
      setHome(await getPosition())
    } catch (e) {
      setError(e.message)
    }
  }

  const finish = async () => {
    setBusy(true)
    setError(null)
    try {
      const { token, user } = await api('/users', {
        method: 'POST',
        body: {
          name: name.trim(),
          is_adult: isAdult,
          interests,
          team_id: teamId,
          new_team_name: teamId === null ? newTeam.trim() : null,
          new_team_color: teamId === null ? newColor : null,
          home_lat: home?.lat ?? null,
          home_lng: home?.lng ?? null,
        },
      })
      signIn(token, user)
      const pending = sessionStorage.getItem(PENDING_JOIN_KEY)
      sessionStorage.removeItem(PENDING_JOIN_KEY)
      navigate(pending ? `/join/${pending}` : '/', { replace: true })
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  const next = () => (step === STEPS.length - 1 ? finish() : setStep(step + 1))

  if (STEPS[step] === 'welcome') {
    return (
      <div className="flex min-h-dvh flex-col justify-between bg-forest px-6 pb-10 pt-20 text-white">
        <div>
          <div className="mb-8 flex items-end gap-1.5">
            {[44, 64, 52, 72, 48].map((h, i) => (
              <span key={i} className="w-3 rounded-t-full bg-lime" style={{ height: h, opacity: 0.5 + i * 0.1 }} />
            ))}
          </div>
          <h1 className="text-5xl font-black tracking-tight">{APP_NAME}</h1>
          <p className="mt-4 text-xl leading-snug text-white/80">{TAGLINE}</p>
          <ul className="mt-10 space-y-3 text-[15px] text-white/80">
            <li>Go somewhere real with your friends.</li>
            <li>Put your phones down together.</li>
            <li>Earn points and take over your neighbourhood.</li>
          </ul>
        </div>
        <Button variant="lime" onClick={next}>
          Get started
        </Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas px-5 pb-8 pt-6">
      <div className="mb-6 flex items-center gap-3">
        <button aria-label="Back" onClick={() => setStep(step - 1)} className="rounded-full p-2 active:bg-black/5">
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex flex-1 gap-1.5">
          {STEPS.slice(1).map((s, i) => (
            <span key={s} className={`h-1.5 flex-1 rounded-full ${i < step ? 'bg-forest' : 'bg-black/10'}`} />
          ))}
        </div>
      </div>

      <div className="flex-1">
        {STEPS[step] === 'name' && (
          <section>
            <h2 className="text-3xl font-bold tracking-tight">What should we call you?</h2>
            <input
              autoFocus
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your first name"
              className="mt-6 h-14 w-full rounded-2xl bg-white px-4 text-lg outline-none ring-1 ring-black/10 focus:ring-2 focus:ring-forest"
            />
            <label className="mt-5 flex items-start gap-3 text-[15px] text-slate-700">
              <input
                type="checkbox"
                checked={isAdult}
                onChange={(e) => setIsAdult(e.target.checked)}
                className="mt-1 size-5 accent-forest"
              />
              I'm 18 or older. {APP_NAME} helps adults meet up in real life.
            </label>
          </section>
        )}

        {STEPS[step] === 'interests' && (
          <section>
            <h2 className="text-3xl font-bold tracking-tight">What do you like doing?</h2>
            <p className="mt-2 text-slate-500">We use this to suggest places and people.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {allInterests.map((i) => {
                const on = interests.includes(i)
                return (
                  <button
                    key={i}
                    onClick={() => toggleInterest(i)}
                    className={`rounded-full px-4 py-2.5 text-[15px] font-medium transition ${
                      on ? 'bg-forest text-white' : 'bg-white text-slate-700 ring-1 ring-black/10'
                    }`}
                  >
                    {i}
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {STEPS[step] === 'team' && (
          <section>
            <h2 className="text-3xl font-bold tracking-tight">Pick your crew</h2>
            <p className="mt-2 text-slate-500">Your team claims territory together. Join your friends' team or start one.</p>
            <div className="mt-6 space-y-2">
              {teams.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setTeamId(t.id)
                    setNewTeam('')
                  }}
                  className={`flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left ring-1 ${
                    teamId === t.id ? 'ring-2 ring-forest' : 'ring-black/10'
                  }`}
                >
                  <TeamDot color={t.color} className="size-4" />
                  <span className="flex-1 font-semibold">{t.name}</span>
                  <span className="text-sm text-slate-400">{t.members} members</span>
                  {teamId === t.id && <Check className="size-5 text-forest" />}
                </button>
              ))}
            </div>
            <div className={`mt-4 rounded-2xl bg-white p-4 ring-1 ${teamId === null && newTeam ? 'ring-2 ring-forest' : 'ring-black/10'}`}>
              <p className="flex items-center gap-2 font-semibold">
                <Plus className="size-4" /> New team
              </p>
              <input
                value={newTeam}
                maxLength={40}
                onChange={(e) => {
                  setNewTeam(e.target.value)
                  setTeamId(null)
                }}
                placeholder="Team name"
                className="mt-3 h-12 w-full rounded-xl bg-canvas px-3 outline-none focus:ring-2 focus:ring-forest"
              />
              <div className="mt-3 flex gap-2">
                {TEAM_COLORS.map((c) => (
                  <button
                    key={c}
                    aria-label={`Colour ${c}`}
                    onClick={() => setNewColor(c)}
                    className={`size-8 rounded-full ${newColor === c ? 'ring-2 ring-slate-900 ring-offset-2' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {STEPS[step] === 'home' && (
          <section>
            <h2 className="text-3xl font-bold tracking-tight">Set your home spot</h2>
            <p className="mt-2 text-slate-500">
              Optional. Solo sessions only count when you're away from home, so staying on the couch doesn't earn
              points. It's rounded and never shown to anyone.
            </p>
            <Button variant="secondary" className="mt-6 w-full" onClick={setHomeHere}>
              <MapPin className="size-5" /> {home ? 'Home set' : "I'm home right now"}
              {home && <Check className="size-5 text-forest" />}
            </Button>
          </section>
        )}
      </div>

      <div className="space-y-3">
        <ErrorText>{error}</ErrorText>
        <Button className="w-full" onClick={next} disabled={!canContinue} loading={busy}>
          {step === STEPS.length - 1 ? (home ? "Let's go" : 'Skip for now') : 'Continue'}
        </Button>
      </div>
    </div>
  )
}
