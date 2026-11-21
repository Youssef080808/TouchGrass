import { ArrowLeft, Check, Hexagon, MapPin, Plus, Smartphone, Users } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { LogoMark } from '../components/Logo'
import { Button, ErrorText, Rise } from '../components/ui'
import { APP_NAME, TAGLINE, TEAM_COLORS } from '../config'
import { getPosition } from '../lib/location'
import { useUser } from '../user'

export const PENDING_JOIN_KEY = 'tg_pending_join'

const STEPS = ['welcome', 'name', 'interests', 'team', 'home']
const DEFAULT_INTERESTS = [
  'Basketball', 'Soccer', 'Running', 'Climbing', 'Gym', 'Tennis', 'Hiking', 'Board games',
  'Coffee', 'Reading', 'Art', 'Music', 'Movies', 'Food', 'Photography', 'Bowling',
]

const FEATURES = [
  { Icon: Users, text: 'Go somewhere real with your friends.' },
  { Icon: Smartphone, text: 'Put your phones down together.' },
  { Icon: Hexagon, text: 'Earn points and take over your neighbourhood.' },
]

function StepTitle({ children, sub }) {
  return (
    <>
      <h2 className="font-display text-[38px] font-extrabold uppercase leading-[0.95] tracking-tight">{children}</h2>
      {sub && <p className="mt-3 text-[16px] text-muted">{sub}</p>}
    </>
  )
}

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
    api('/teams')
      .then((list) => {
        setTeams(list)
        // A new team starts with a colour nobody uses yet, so its zones stand out on the map
        const used = new Set(list.map((t) => t.color?.toLowerCase()))
        setNewColor((c) => (used.has(c) ? (TEAM_COLORS.find((x) => !used.has(x)) ?? c) : c))
      })
      .catch(() => {})
  }, [])

  const picked = teams.find((t) => t.id === teamId)

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
      <div className="bg-hex relative flex min-h-dvh flex-col justify-between overflow-hidden bg-brand px-6 pb-10 pt-16 text-white">
        <div className="pointer-events-none absolute -right-10 top-16 opacity-90" aria-hidden>
          <Hexagon className="size-40 text-lime motion-safe:animate-float" strokeWidth={1.2} style={{ fill: 'rgb(190 242 100 / 0.12)' }} />
        </div>
        <div className="pointer-events-none absolute bottom-40 right-8" aria-hidden>
          <Hexagon className="size-16 text-sky-300 motion-safe:animate-float" strokeWidth={1.5} style={{ animationDelay: '1.2s', fill: 'rgb(125 211 252 / 0.12)' }} />
        </div>

        <div className="relative">
          <Rise>
            <LogoMark size={76} className="motion-safe:animate-pop drop-shadow-xl" title="Turfed logo" />
            <h1 className="mt-6 font-display text-[88px] font-extrabold uppercase leading-[0.85] tracking-tight">
              Turf<span className="text-lime">ed</span>
            </h1>
            <p className="mt-5 max-w-[18rem] text-xl leading-snug text-white/80">{TAGLINE}</p>
          </Rise>
          <ul className="mt-10 space-y-3">
            {FEATURES.map(({ Icon, text }, i) => (
              <Rise key={text} i={i + 2} as="li" className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white/10">
                  <Icon className="size-5 text-lime" aria-hidden />
                </span>
                <span className="text-[16px] text-white/85">{text}</span>
              </Rise>
            ))}
          </ul>
        </div>
        <Rise i={6}>
          <Button variant="lime" className="h-14 w-full text-lg" onClick={next}>
            Get started
          </Button>
          <p className="mt-3 text-center text-sm text-white/45">Free · 18+ · {APP_NAME}</p>
        </Rise>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas px-5 pb-8 pt-6">
      <div className="mb-8 flex items-center gap-3">
        <button aria-label="Back" onClick={() => setStep(step - 1)} className="-ml-2 flex size-11 items-center justify-center rounded-full active:bg-chip">
          <ArrowLeft className="size-5" />
        </button>
        <div className="flex flex-1 gap-1.5" aria-label={`Step ${step} of ${STEPS.length - 1}`}>
          {STEPS.slice(1).map((s, i) => (
            <span key={s} className={`h-2 flex-1 rounded-full transition-colors duration-300 ${i < step ? 'bg-brand dark:bg-lime' : 'bg-line'}`} />
          ))}
        </div>
      </div>

      <div className="flex-1" key={step}>
        {STEPS[step] === 'name' && (
          <Rise as="section">
            <StepTitle>What should we call you?</StepTitle>
            <label htmlFor="name" className="mt-6 block text-sm font-semibold text-ink-soft">First name</label>
            <input
              id="name"
              autoFocus
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex"
              autoComplete="given-name"
              className="mt-1.5 h-14 w-full rounded-2xl bg-surface px-4 text-lg text-ink outline-none ring-1 ring-line placeholder:text-faint focus:ring-2 focus:ring-brand-ink"
            />
            <label className="mt-5 flex items-start gap-3 rounded-2xl bg-surface p-4 text-[15px] text-ink-soft ring-1 ring-line">
              <input
                type="checkbox"
                checked={isAdult}
                onChange={(e) => setIsAdult(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-brand-ink"
              />
              <span>I'm 18 or older. {APP_NAME} helps adults meet up in real life.</span>
            </label>
          </Rise>
        )}

        {STEPS[step] === 'interests' && (
          <Rise as="section">
            <StepTitle sub="We use this to suggest places and people.">What do you like doing?</StepTitle>
            <div className="mt-6 flex flex-wrap gap-2">
              {allInterests.map((i) => {
                const on = interests.includes(i)
                return (
                  <button
                    key={i}
                    onClick={() => toggleInterest(i)}
                    aria-pressed={on}
                    className={`flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold transition-colors ${
                      on ? 'bg-brand text-white dark:bg-lime dark:text-on-accent' : 'bg-surface text-ink-soft ring-1 ring-line'
                    }`}
                  >
                    {on && <Check className="size-4" aria-hidden />}
                    {i}
                  </button>
                )
              })}
            </div>
          </Rise>
        )}

        {STEPS[step] === 'team' && (
          <Rise as="section">
            <StepTitle sub="Your team claims territory together. Ask to join your friends' team, or start your own.">Pick your crew</StepTitle>
            <div className="mt-6 space-y-2">
              {teams.map((t) => {
                const on = teamId === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTeamId(t.id)
                      setNewTeam('')
                    }}
                    aria-pressed={on}
                    className={`flex min-h-16 w-full items-center gap-3 rounded-2xl bg-surface p-3 text-left ring-1 transition ${
                      on ? 'ring-2 ring-brand-ink' : 'ring-line'
                    }`}
                  >
                    <span className="flex size-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${t.color}26` }}>
                      <Hexagon className="size-6" style={{ color: t.color, fill: t.color }} aria-hidden />
                    </span>
                    <span className="flex-1 font-display text-xl font-bold">{t.name}</span>
                    <span className="text-sm text-muted">
                      {t.members} {t.members === 1 ? 'member' : 'members'}
                    </span>
                    {on && <Check className="size-5 text-brand-ink" aria-hidden />}
                  </button>
                )
              })}
            </div>
            {picked && (
              <p className="mt-3 rounded-2xl bg-chip px-3 py-2 text-sm text-ink-soft">
                {picked.members > 0
                  ? `Someone on ${picked.name} has to accept you. You can play while you wait.`
                  : `Nobody's on ${picked.name} yet, so you're in.`}
              </p>
            )}
            <div className={`mt-4 rounded-2xl bg-surface p-4 ring-1 ${teamId === null && newTeam ? 'ring-2 ring-brand-ink' : 'ring-line'}`}>
              <label htmlFor="new-team" className="flex items-center gap-2 font-display text-xl font-bold">
                <Plus className="size-5" aria-hidden /> New team
              </label>
              <input
                id="new-team"
                value={newTeam}
                maxLength={40}
                onChange={(e) => {
                  setNewTeam(e.target.value)
                  setTeamId(null)
                }}
                placeholder="Team name"
                className="mt-3 h-12 w-full rounded-xl bg-canvas px-3 text-ink outline-none ring-1 ring-line placeholder:text-faint focus:ring-2 focus:ring-brand-ink"
              />
              <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Team colour">
                {TEAM_COLORS.map((c) => (
                  <button
                    key={c}
                    role="radio"
                    aria-checked={newColor === c}
                    aria-label={`Colour ${c}`}
                    onClick={() => setNewColor(c)}
                    className={`size-8 rounded-full transition ${newColor === c ? 'scale-110 ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </Rise>
        )}

        {STEPS[step] === 'home' && (
          <Rise as="section">
            <StepTitle sub="Optional. Solo sessions only count when you're away from home, so the couch doesn't earn points. It's rounded and never shown to anyone.">
              Set your home spot
            </StepTitle>
            <Button variant="secondary" className="mt-6 h-14 w-full" onClick={setHomeHere}>
              <MapPin className="size-5" aria-hidden /> {home ? 'Home set' : "I'm home right now"}
              {home && <Check className="size-5 text-grass" aria-hidden />}
            </Button>
          </Rise>
        )}
      </div>

      <div className="space-y-3 pt-6">
        <ErrorText>{error}</ErrorText>
        <Button className="h-14 w-full text-lg" onClick={next} disabled={!canContinue} loading={busy}>
          {step === STEPS.length - 1 ? (home ? "Let's go" : 'Skip for now') : 'Continue'}
        </Button>
      </div>
    </div>
  )
}
