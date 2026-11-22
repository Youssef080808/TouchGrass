import { Flame, Globe2, Handshake, MapPin, MapPinPlus, Navigation, UsersRound, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { DEFAULT_CENTER } from '../config'
import { useHotZones } from '../hooks/useHotZones'
import { cn } from '../lib/cn'
import { distanceLabel, distanceM } from '../lib/geo'
import { BUZZ, haptic } from '../lib/haptics'
import { getPosition } from '../lib/location'
import { toLocalInput } from '../lib/when'
import { useUser } from '../user'
import MapPicker, { inside } from './MapPicker'
import { Button, ErrorText, TeamDot } from './ui'

const HERE = 'here'
const ZONE = 'zone'
const PIN = 'pin'
const CUSTOM = 'custom'
const NEAR_M = 150 // a pin this close to a known place takes its name
const HANGING_OUT = 'Hanging out'

/** Quick times. "Tonight 8 PM" only before 7:30 PM. */
function timeChoices(now) {
  const at = (hour, dayOffset = 0) => {
    const d = new Date(now)
    d.setDate(d.getDate() + dayOffset)
    d.setHours(hour, 0, 0, 0)
    return d
  }
  const minutes = (m) => new Date(now.getTime() + m * 60000)
  const choices = [
    { key: 'now', label: 'Now', at: () => new Date() },
    { key: '30', label: 'In 30 min', at: () => minutes(30) },
    { key: '60', label: 'In 1 hour', at: () => minutes(60) },
  ]
  if (now.getHours() * 60 + now.getMinutes() < 19 * 60 + 30) choices.push({ key: 'tonight', label: 'Tonight 8 PM', at: () => at(20) })
  choices.push({ key: 'tomorrow', label: 'Tomorrow 7 PM', at: () => at(19, 1) })
  choices.push({ key: CUSTOM, label: 'Pick a time' })
  return choices
}

function Label({ children }) {
  return <p className="mb-2 mt-5 text-[13px] font-semibold uppercase tracking-wide text-muted">{children}</p>
}

function Chip({ on, onClick, children }) {
  return (
    <button
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'min-h-10 rounded-full px-3.5 text-[14px] font-semibold transition-colors',
        on ? 'bg-brand text-white dark:bg-lime dark:text-on-accent' : 'bg-chip text-ink-soft active:bg-line',
      )}
    >
      {children}
    </button>
  )
}

function PlaceOption({ on, onClick, icon: Icon, title, sub, hot }) {
  return (
    <button
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={cn(
        'flex min-h-14 w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors',
        on ? 'bg-chip ring-2 ring-brand-ink' : 'bg-canvas ring-1 ring-line active:bg-chip',
      )}
    >
      <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', on ? 'bg-brand text-white dark:bg-lime dark:text-on-accent' : 'bg-chip text-brand-ink')}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{title}</span>
        {sub && <span className="block truncate text-[13px] text-muted">{sub}</span>}
      </span>
      {hot && (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#ff3d00] px-2 py-0.5 text-xs font-bold text-white">
          <Flame className="size-3.5" aria-hidden /> x2
        </span>
      )}
    </button>
  )
}

/**
 * Plan a rally (a Hang for later) or Team up with a rival team.
 * preset: null = closed. {} = blank. { place: {name, type, lat, lng}, hot } = a known spot (a hot zone).
 * { hexId } = a map zone (its name and centre come from /zones). { hexId, inviteTeam } = Team up.
 * If it starts now and you're already there, the Hang starts right away.
 */
export default function RallySheet({ preset, onClose, onCreated }) {
  const { user } = useUser()
  const navigate = useNavigate()
  const open = preset != null
  const inviteTeam = preset?.inviteTeam ?? null
  const teamUp = Boolean(inviteTeam)

  const [here, setHere] = useState(null)
  const [locError, setLocError] = useState(null)
  const [zone, setZone] = useState(null) // the preset place, once known
  const [zoneName, setZoneName] = useState('')
  const [hereName, setHereName] = useState('')
  const [pin, setPin] = useState(null) // { lat, lng } picked on the map
  const [pinName, setPinName] = useState('')
  const [turf, setTurf] = useState(null) // team zones, loaded when the map opens
  const hotZones = useHotZones()
  const [suggested, setSuggested] = useState([])
  const [placeKey, setPlaceKey] = useState(null)
  const [now, setNow] = useState(() => new Date())
  const [timeKey, setTimeKey] = useState(null)
  const [custom, setCustom] = useState('')
  const activities = useMemo(() => [...new Set([...(user.interests ?? []).slice(0, 4), HANGING_OUT])], [user.interests])
  const [activity, setActivity] = useState(activities[0])
  const [visibility, setVisibility] = useState(user.team ? 'team' : 'open')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // Fresh start every time the sheet opens
  useEffect(() => {
    if (!open) return undefined
    let alive = true
    const opened = new Date()
    setNow(opened)
    setTimeKey(teamUp ? '60' : opened.getHours() * 60 + opened.getMinutes() < 19 * 60 + 30 ? 'tonight' : '60')
    setCustom(toLocalInput(new Date(opened.getTime() + 2 * 3600000)))
    setPlaceKey(null)
    setZone(preset.place ? { ...preset.place, hot: preset.hot } : null)
    setZoneName('')
    setHereName('')
    setPin(null)
    setPinName('')
    setSuggested([])
    setError(null)
    setLocError(null)
    setVisibility(user.team ? 'team' : 'open')
    if (!preset.place && preset.hexId) {
      api(`/zones/${preset.hexId}`)
        .then((z) => alive && setZone({ name: z.place_name, lat: z.lat, lng: z.lng, type: null, hot: z.hot }))
        .catch(() => {})
    }
    getPosition()
      .then(async (pos) => {
        if (!alive) return
        setHere(pos)
        const s = await api(`/suggestions?lat=${pos.lat}&lng=${pos.lng}`).catch(() => null)
        if (alive && s) setSuggested(s.places.slice(0, 5))
      })
      .catch((e) => alive && setLocError(e.message))
    return () => {
      alive = false
    }
  }, [open, preset, teamUp, user.team])

  // Escape closes
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const times = timeChoices(now)
  // Suggested places, minus the one already at the top (a Team up or Rally here spot)
  const places = suggested.filter((p) => !zone?.name || p.name !== zone.name).slice(0, 4)
  // The pin: the closest known place takes its name, and we show whose zone it's in
  const known = [
    ...(zone?.name ? [zone] : []),
    ...suggested,
    ...hotZones.map((z) => ({ name: z.place_name, lat: z.lat, lng: z.lng, type: null })),
  ]
  const near = pin
    ? known
        .map((p) => ({ ...p, d: distanceM(pin, p) }))
        .filter((p) => p.d <= NEAR_M)
        .sort((a, b) => a.d - b.d)[0]
    : null
  const pinTurf = pin && turf ? turf.find((h) => h.owner && inside(pin, h.boundary)) : null
  const pinHot = Boolean(pin && hotZones.some((z) => inside(pin, z.boundary)))
  const pickOnMap = () => {
    setPlaceKey(PIN)
    const start = zone ?? here ?? DEFAULT_CENTER
    if (!pin) setPin({ lat: start.lat, lng: start.lng })
    if (!turf) api('/territory').then(setTurf).catch(() => setTurf([]))
  }

  const key = placeKey ?? (preset.place || preset.hexId ? ZONE : places.length ? 's0' : HERE)
  const chosen =
    key === ZONE
      ? zone && { ...zone, name: zone.name || zoneName.trim() || 'This zone' }
      : key === HERE
        ? here && { lat: here.lat, lng: here.lng, type: null, name: hereName.trim() || `${user.name}'s spot` }
        : key === PIN
          ? pin && {
              lat: pin.lat,
              lng: pin.lng,
              type: pinName.trim() ? null : (near?.type ?? null),
              name: pinName.trim() || near?.name || '',
            }
          : places[Number(key.slice(1))]
  const away = (p) => (here && p ? distanceLabel(distanceM(here, p)) : null)

  const submit = async () => {
    setError(null)
    if (!chosen) {
      setError(locError || 'Pick a place first.')
      return
    }
    if (!chosen.name) {
      setError('Name the spot so people know where to meet.')
      return
    }
    const choice = times.find((t) => t.key === timeKey)
    const when = timeKey === CUSTOM ? new Date(custom) : choice?.at()
    if (!when || Number.isNaN(when.getTime())) {
      setError('Pick a time.')
      return
    }
    setBusy(true)
    try {
      const rally = await api('/rallies', {
        method: 'POST',
        body: {
          place_name: chosen.name,
          place_type: chosen.type ?? null,
          lat: chosen.lat,
          lng: chosen.lng,
          starts_at: when.toISOString(),
          visibility: teamUp ? 'team' : visibility,
          activity,
          invite_team_id: inviteTeam?.id ?? null,
        },
      })
      haptic(BUZZ.tap)
      // Starting now and you're already there: start the Hang right away
      if (here && new Date(rally.arrive_from) <= new Date() && distanceM(here, rally.place) <= rally.arrive_radius_m) {
        try {
          const hang = await api(`/rallies/${rally.id}/arrive`, { method: 'POST', body: here })
          haptic(BUZZ.start)
          onClose()
          navigate(`/hang/${hang.id}`)
          return
        } catch {
          // still planned; it shows in the list and checks everyone in on arrival
        }
      }
      onCreated?.(rally)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const sendLabel = teamUp ? `Invite ${inviteTeam.name}` : visibility === 'open' ? 'Post rally' : `Send to ${user.team?.name ?? 'my team'}`

  return (
    <div className="fixed inset-0 z-[1200] flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="rally-title">
      <button aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative max-h-[92dvh] w-full max-w-[440px] overflow-y-auto rounded-t-[32px] bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-3 shadow-2xl motion-safe:animate-rise">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" aria-hidden />
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="rally-title" className="font-display text-[30px] font-extrabold uppercase leading-none">
              {teamUp ? 'Team up' : 'Plan a rally'}
            </h2>
            <p className="mt-1.5 text-[15px] text-muted">
              {teamUp ? (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  A joint Hang with <TeamDot color={inviteTeam.color} className="size-2.5" /> <b className="text-ink">{inviteTeam.name}</b>
                </span>
              ) : (
                'Pick a place and a time. Your team gets a notification.'
              )}
            </p>
          </div>
          <button aria-label="Close" onClick={onClose} className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full active:bg-chip">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        {teamUp && (
          <div className="mt-3 flex items-start gap-3 rounded-2xl bg-lime/30 p-3 text-[14px] leading-snug dark:bg-lime/15">
            <Handshake className="mt-0.5 size-5 shrink-0 text-brand-ink" aria-hidden />
            <p>
              Both teams get the invite. If people from both show up and earn points, you <b>share the zone for 7 days</b>: it
              counts for both teams and neither can take it from the other.
            </p>
          </div>
        )}

        <Label>Where</Label>
        <div className="space-y-2" role="radiogroup" aria-label="Where">
          {(preset.place || preset.hexId) && (
            <>
              <PlaceOption
                on={key === ZONE}
                onClick={() => setPlaceKey(ZONE)}
                icon={MapPin}
                title={zone ? zone.name || zoneName.trim() || 'This zone' : 'Loading the zone...'}
                sub={zone ? (away(zone) ? `${away(zone)} away` : 'On the map') : null}
                hot={zone?.hot}
              />
              {key === ZONE && zone && !zone.name && (
                <input
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                  maxLength={120}
                  placeholder="Name the spot (e.g. the courts by the pond)"
                  aria-label="Name the spot"
                  className="h-11 w-full rounded-xl bg-canvas px-3 text-[15px] text-ink outline-none ring-1 ring-line placeholder:text-faint focus:ring-2 focus:ring-brand-ink"
                />
              )}
            </>
          )}
          {places.map((p, i) => (
            <PlaceOption
              key={`${p.name}-${p.lat}`}
              on={key === `s${i}`}
              onClick={() => setPlaceKey(`s${i}`)}
              icon={MapPin}
              title={p.name}
              sub={p.reason}
            />
          ))}
          <PlaceOption
            on={key === HERE}
            onClick={() => setPlaceKey(HERE)}
            icon={Navigation}
            title="Where I am now"
            sub={here ? 'Your current spot' : locError || 'Finding you...'}
          />
          {key === HERE && here && (
            <input
              value={hereName}
              onChange={(e) => setHereName(e.target.value)}
              maxLength={120}
              placeholder={`Name it (or it's "${user.name}'s spot")`}
              aria-label="Name the spot"
              className="h-11 w-full rounded-xl bg-canvas px-3 text-[15px] text-ink outline-none ring-1 ring-line placeholder:text-faint focus:ring-2 focus:ring-brand-ink"
            />
          )}
          <PlaceOption
            on={key === PIN}
            onClick={pickOnMap}
            icon={MapPinPlus}
            title={key === PIN && chosen?.name ? chosen.name : 'Pick on the map'}
            sub={key === PIN ? 'Drag the map or tap a spot' : 'Anywhere you like'}
            hot={key === PIN && pinHot}
          />
          {key === PIN && pin && (
            <>
              <MapPicker start={pin} me={here} zones={turf ?? []} hotZones={hotZones} onMove={setPin} />
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[13px] text-muted">
                {away(pin) && <span>{away(pin)} away</span>}
                {pinTurf && (
                  <span className="inline-flex items-center gap-1">
                    <TeamDot color={pinTurf.owner.color} className="size-2" />
                    {pinTurf.owner.id === user.team?.id ? 'Your zone' : `${pinTurf.owner.name}'s zone`}
                  </span>
                )}
                {pinHot && <span className="font-semibold text-[#ff3d00]">Hot zone: double points today</span>}
              </p>
              <input
                value={pinName}
                onChange={(e) => setPinName(e.target.value)}
                maxLength={120}
                placeholder={near ? `Name it (or it's "${near.name}")` : 'Name the spot (e.g. the courts by the pond)'}
                aria-label="Name the spot"
                className="h-11 w-full rounded-xl bg-canvas px-3 text-[15px] text-ink outline-none ring-1 ring-line placeholder:text-faint focus:ring-2 focus:ring-brand-ink"
              />
            </>
          )}
        </div>

        <Label>When</Label>
        <div className="flex flex-wrap gap-1.5">
          {times.map((t) => (
            <Chip key={t.key} on={timeKey === t.key} onClick={() => setTimeKey(t.key)}>
              {t.label}
            </Chip>
          ))}
        </div>
        {timeKey === CUSTOM && (
          <input
            type="datetime-local"
            value={custom}
            min={toLocalInput(now)}
            max={toLocalInput(new Date(now.getTime() + 7 * 86400000))}
            onChange={(e) => setCustom(e.target.value)}
            aria-label="Date and time"
            className="mt-2 h-11 w-full rounded-xl bg-canvas px-3 text-[15px] text-ink outline-none ring-1 ring-line focus:ring-2 focus:ring-brand-ink"
          />
        )}

        <Label>What</Label>
        <div className="flex flex-wrap gap-1.5">
          {activities.map((a) => (
            <Chip key={a} on={activity === a} onClick={() => setActivity(a)}>
              {a}
            </Chip>
          ))}
        </div>

        {!teamUp && (
          <>
            <Label>Who</Label>
            <div role="radiogroup" aria-label="Who" className="grid grid-cols-2 gap-1 rounded-2xl bg-chip p-1">
              {[
                { value: 'team', label: 'My team', Icon: UsersRound, disabled: !user.team },
                { value: 'open', label: 'Anyone nearby', Icon: Globe2 },
              ].map(({ value, label, Icon, disabled }) => (
                <button
                  key={value}
                  role="radio"
                  aria-checked={visibility === value}
                  disabled={disabled}
                  onClick={() => setVisibility(value)}
                  className={cn(
                    'flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-[14px] font-semibold transition disabled:opacity-40',
                    visibility === value ? 'bg-surface text-ink shadow-sm' : 'text-muted',
                  )}
                >
                  <Icon className="size-4" aria-hidden /> {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[13px] leading-snug text-muted">
              {visibility === 'open'
                ? 'Your team gets a notification, and people nearby who like the same things see it in Meet. Public places only.'
                : user.team
                  ? `Everyone on ${user.team.name} gets a notification.`
                  : 'Join a team in Me to plan rallies just for your team.'}
            </p>
          </>
        )}

        <div className="mt-4">
          <ErrorText>{error}</ErrorText>
        </div>
        <Button variant="lime" className="mt-3 w-full" loading={busy} onClick={submit}>
          {teamUp ? <Handshake className="size-5" aria-hidden /> : null}
          {sendLabel}
        </Button>
      </div>
    </div>
  )
}
