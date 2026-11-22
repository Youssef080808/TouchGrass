import { ArrowLeft, CloudRain, Crown, Flame, Footprints, Lock, MapPin, Smartphone, Sparkles, Users } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { RollingTimer } from '../components/AnimatedNumber'
import BonusRing from '../components/BonusRing'
import GlowRocker from '../components/GlowRocker'
import { IcebreakerCard, RsvpCard } from '../components/HangPeople'
import HangTimer from '../components/HangTimer'
import PhoneDownOverlay from '../components/PhoneDownOverlay'
import ReportButton from '../components/ReportButton'
import { Avatar, Button, Card, ErrorText, Rise, SectionTitle, Spinner, TeamDot } from '../components/ui'
import { useHang } from '../hooks/useHang'
import { useHotZones } from '../hooks/useHotZones'
import { askMotionPermission } from '../hooks/usePhoneDown'
import { BUZZ, haptic } from '../lib/haptics'
import { getPosition } from '../lib/location'
import { useTheme } from '../theme'
import { useUser } from '../user'
import Results from './Results'

const PING_EVERY_MS = 30000      // location check while the app is open
const HEARTBEAT_EVERY_MS = 15000 // "still in phones-down mode" signal
const POINT_AWARD_EVERY_MS = 60000
const PHONES_DOWN_MAX_BONUS = 0.5 // same as backend/app/points.py

const PAUSE_MESSAGES = {
  picked_up: 'You picked up your phone, so the phones-down bonus paused.',
  left_app: 'You left the app, so the phones-down bonus paused.',
  exit: null,
}

/** Share of your time spent in phones-down mode (0 to 1), live. */
function phonesDownShare(member) {
  const end = member.left_at ? new Date(member.left_at).getTime() : Date.now()
  const total = (end - new Date(member.joined_at).getTime()) / 1000
  let down = member.phones_down_seconds
  if (member.phones_down_active && member.phones_down_since) {
    down += (Date.now() - new Date(member.phones_down_since).getTime()) / 1000
  }
  return total > 0 ? Math.min(down / total, 1) : 0
}

function MemberStatus({ m }) {
  const base = 'rounded-full px-2.5 py-1 text-xs font-bold'
  if (m.left_reason === 'checked_out') return <span className={`${base} bg-chip text-muted`}>Checked out</span>
  if (m.left_reason === 'left_area') return <span className={`${base} bg-danger-soft text-danger`}>Left</span>
  if (m.phones_down_active) return <span className={`${base} bg-lime text-on-accent`}>Phones down</span>
  return <span className={`${base} bg-chip text-ink-soft`}>Here</span>
}

export default function HangPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, refresh: refreshUser } = useUser()
  const { hang, setHang, error } = useHang(id)
  const hotZones = useHotZones()
  const [phonesDown, setPhonesDown] = useState(false)
  const [rockerOn, setRockerOn] = useState(false)
  const rockerTimer = useRef(null)
  const { dark } = useTheme()
  const [pauseNote, setPauseNote] = useState(null)
  const [busy, setBusy] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [, tick] = useState(0)
  const wasActive = useRef(false)

  const me = hang?.members.find((m) => m.user_id === user.id)
  const isHost = hang?.host_id === user.id
  const active = hang?.status === 'active'
  const stillHere = Boolean(me && !me.left_at)

  // Clock tick for the timer
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // While the app is open, send location every 30 s (going home counts as leaving)
  useEffect(() => {
    if (!active || !stillHere) return undefined
    const send = () =>
      getPosition()
        .then((pos) => api(`/hangs/${id}/ping`, { method: 'POST', body: pos }))
        .catch(() => {})
    send() // opening the app counts as a check-in (a Hang nobody opens for 3 hours ends by itself)
    const t = setInterval(send, PING_EVERY_MS)
    return () => clearInterval(t)
  }, [active, stillHere, id])

  // Ask the server to award each newly completed minute, even before the host ends the Hang.
  useEffect(() => {
    if (!active || !stillHere) return undefined
    const tick = () =>
      api(`/hangs/${id}/tick`, { method: 'POST' })
        .then((nextHang) => {
          setHang(nextHang)
          refreshUser()
        })
        .catch(() => {})
    const t = setInterval(tick, POINT_AWARD_EVERY_MS)
    return () => clearInterval(t)
  }, [active, stillHere, id, setHang, refreshUser])

  // Phones-down heartbeat: if the phone locks, these stop and the bonus stops growing
  useEffect(() => {
    if (!phonesDown) return undefined
    const beat = () => api(`/hangs/${id}/phones-down`, { method: 'POST', body: { active: true } }).then(setHang).catch(() => {})
    const t = setInterval(beat, HEARTBEAT_EVERY_MS)
    return () => clearInterval(t)
  }, [phonesDown, id, setHang])

  // When the Hang ends: leave phones-down mode, buzz the phone, refresh points
  useEffect(() => {
    if (active) wasActive.current = true
    if (hang?.status === 'ended' && wasActive.current) {
      setPhonesDown(false)
      haptic(BUZZ.end)
      refreshUser()
    }
  }, [active, hang?.status, refreshUser])

  // Buzz when someone new joins (not for the people already here when the page opened)
  const memberCount = hang?.members.length ?? 0
  const seenMembers = useRef(0)
  useEffect(() => {
    if (seenMembers.current && memberCount > seenMembers.current && active) haptic(BUZZ.join)
    seenMembers.current = memberCount
  }, [memberCount, active])

  const startPhonesDown = async () => {
    setPauseNote(null)
    setActionError(null)
    try {
      setHang(await api(`/hangs/${id}/phones-down`, { method: 'POST', body: { active: true } }))
      haptic(BUZZ.phonesDown)
      setPhonesDown(true)
    } catch (e) {
      setActionError(e.message)
      setRockerOn(false)
    }
  }

  // The rocker switch: flip it on, watch it rock over and light up, then the black screen opens.
  const flipPhonesDown = (next) => {
    clearTimeout(rockerTimer.current)
    setRockerOn(next)
    if (!next) return // flipped back before the black screen opened: cancel
    askMotionPermission() // iPhones only ask from inside the tap itself, so not after the delay
    haptic(BUZZ.tap)
    rockerTimer.current = setTimeout(startPhonesDown, 950)
  }
  useEffect(() => () => clearTimeout(rockerTimer.current), [])

  const stopPhonesDown = useCallback(
    async (reason) => {
      setPhonesDown(false)
      setRockerOn(false)
      setPauseNote(PAUSE_MESSAGES[reason] ?? null)
      try {
        setHang(await api(`/hangs/${id}/phones-down`, { method: 'POST', body: { active: false } }))
      } catch {
        // offline or phone locked: the server stops the bonus when heartbeats stop
      }
    },
    [id, setHang],
  )

  const endHang = async () => {
    setBusy('end')
    setActionError(null)
    try {
      const pos = await getPosition()
      setHang(await api(`/hangs/${id}/end`, { method: 'POST', body: pos }))
      refreshUser()
    } catch (e) {
      setActionError(e.message)
    } finally {
      setBusy(null)
      setPhonesDown(false)
    }
  }

  const checkOut = async () => {
    setBusy('checkout')
    setActionError(null)
    try {
      const pos = await getPosition()
      setHang(await api(`/hangs/${id}/checkout`, { method: 'POST', body: pos }))
      setPhonesDown(false)
    } catch (e) {
      setActionError(e.message)
    } finally {
      setBusy(null)
    }
  }

  if (!hang) {
    return (
      <div className="min-h-dvh bg-canvas p-6">
        {error ? <ErrorText>{error}</ErrorText> : <Spinner label="Loading your Hang" />}
      </div>
    )
  }

  if (hang.status === 'ended') return <Results hang={hang} me={me} onHang={setHang} />

  if (!me) {
    return (
      <div className="min-h-dvh bg-canvas p-6">
        <ErrorText>You're not in this Hang. Ask for the code and join.</ErrorText>
        <Button className="mt-4 w-full" onClick={() => navigate('/')}>Home</Button>
      </div>
    )
  }

  const joinUrl = `${window.location.origin}/join/${hang.code}`
  const title = hang.place_name || hang.activity || (hang.kind === 'solo' ? 'Solo session' : 'Group Hang')
  const openHang = hang.visibility === 'open'
  const others = hang.members.filter((m) => m.user_id !== user.id)
  const hostName = hang.members.find((m) => m.user_id === hang.host_id)?.name ?? 'the host'
  const together = (me.left_at ? new Date(me.left_at).getTime() : Date.now()) - new Date(me.joined_at).getTime()
  const share = phonesDownShare(me)
  const bonus = 1 + PHONES_DOWN_MAX_BONUS * share
  const here = hang.members.filter((m) => !m.left_at).length

  return (
    <div className="min-h-dvh bg-canvas pb-10">
      {phonesDown && (
        <PhoneDownOverlay hang={hang} me={me} isHost={isHost} bonus={bonus} share={share} onStop={stopPhonesDown} onEnd={endHang} />
      )}

      <header className="pt-safe bg-hex rounded-b-[36px] bg-brand px-5 pb-8 text-white">
        <div className="flex items-center justify-between pt-4">
          <button aria-label="Back to Home" onClick={() => navigate('/')} className="-ml-2 flex size-11 items-center justify-center rounded-full active:bg-white/10">
            <ArrowLeft className="size-5" />
          </button>
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 font-display text-sm font-bold uppercase tracking-wider">
            <span className="relative flex size-2" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-lime opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-lime" />
            </span>
            {hang.kind === 'solo' ? 'Solo' : `${here} here`} · live
          </span>
        </div>
        <h1 className="mt-3 flex items-center gap-2 font-display text-[30px] font-bold leading-tight">
          {hang.kind === 'solo' ? <Footprints className="size-7 shrink-0" aria-hidden /> : <MapPin className="size-7 shrink-0" aria-hidden />}
          <span className="truncate">{title}</span>
        </h1>
        {hang.kind === 'group' && (
          <p className="mt-1 text-sm text-white/65">
            {openHang ? 'Open to new people' : 'Just friends'}
            {hang.place_name && hang.activity ? ` · ${hang.activity}` : ''}
            {hang.max_size ? ` · ${here}/${hang.max_size} people` : ''}
            {openHang && hang.join_mode === 'approve' ? ' · You approve each person' : ''}
          </p>
        )}

        <div className="mt-5">
          <BonusRing share={share} size={224} stroke={12}>
            <p className="font-display text-sm font-bold uppercase tracking-[0.18em] text-white/60">
              {me.left_at ? 'Your time' : 'Time together'}
            </p>
            <RollingTimer ms={together} className="mt-1 font-display text-[56px] font-semibold leading-none" />
            <p className="mt-2 text-xs text-white/55">Ring = phones-down bonus</p>
          </BonusRing>
        </div>

        <div className="mt-5 flex flex-wrap justify-center gap-2 text-sm">
          <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-lime px-3.5 font-bold text-on-accent">
            <Users className="size-4" aria-hidden /> Party x{me.party_multiplier}
          </span>
          <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/12 px-3.5 font-bold">
            <Smartphone className="size-4 rotate-180" aria-hidden /> Phones-down x{bonus.toFixed(2)}
          </span>
          {hang.bad_weather && (
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/12 px-3.5 font-bold">
              <CloudRain className="size-4" aria-hidden /> Weather +20%
            </span>
          )}
          {hotZones.some((z) => z.hex_id === hang.hex_id) && (
            <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#ff3d00] px-3.5 font-bold text-white">
              <Flame className="size-4" aria-hidden /> Hot zone x2
            </span>
          )}
        </div>
      </header>

      <div className="-mt-5 space-y-4 px-4">
        <Rise>
          {me.left_at ? (
            <Card className="text-[15px] shadow-lg shadow-black/5">
              <p className="font-semibold">
                {me.left_reason === 'checked_out' ? "You're checked out." : 'You went home, so your time stopped.'}
              </p>
              <p className="mt-1 text-muted">Points you earned before checkout are already added.</p>
              <Button variant="secondary" className="mt-3 w-full" onClick={() => navigate('/')}>
                Home
              </Button>
            </Card>
          ) : (
            <Card className="flex items-start gap-3 shadow-lg shadow-black/5">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-chip text-brand-ink">
                <Lock className="size-5" aria-hidden />
              </div>
              <div>
                <p className="text-[15px] text-ink-soft">
                  <span className="font-semibold text-ink">Lock your phone and put it away.</span> Your time keeps counting
                  until you check out{isHost ? ' or end the Hang' : ` or ${hostName} ends the Hang`}.
                </p>
                <p className="mt-2 text-[13px] text-muted">
                  Points start after 10 minutes. Open the app at least every 3 hours, or the Hang ends by itself.
                </p>
              </div>
            </Card>
          )}
        </Rise>

        {pauseNote && (
          <p role="status" className="rounded-2xl bg-warn-soft px-3 py-2 text-sm text-warn">
            {pauseNote} Your time together still counts.
          </p>
        )}

        {active && stillHere && (
          <Rise i={1}>
            <HangTimer hang={hang} isHost={isHost} onHang={setHang} />
          </Rise>
        )}

        {openHang && active && (
          <Rise i={1}>
            <RsvpCard hang={hang} isHost={isHost} onHang={setHang} />
          </Rise>
        )}

        {hang.kind === 'group' && active && stillHere && (
          <Rise i={1}>
            <IcebreakerCard hangId={hang.id} peopleKey={hang.members.map((m) => m.user_id).join(',')} />
          </Rise>
        )}

        {hang.kind === 'group' && stillHere && (
          <Rise i={1}>
            <Card className="flex items-center gap-4">
              <div className="rounded-2xl bg-[#ffffff] p-2 ring-1 ring-line">
                <QRCodeSVG value={joinUrl} size={120} fgColor="#0b1d3a" />
              </div>
              <div className="min-w-0">
                <p className="text-sm text-muted">Friends scan with their camera, or enter</p>
                <p className="mt-1 font-display text-[34px] font-extrabold leading-none tracking-[0.12em] text-brand-ink">{hang.code}</p>
                <p className="mt-2 text-xs text-faint">
                  {openHang
                    ? 'For friends. People from Meet check themselves in when they arrive.'
                    : 'They need to be within 100 m of you.'}
                </p>
              </div>
            </Card>
          </Rise>
        )}

        <Rise i={2}>
          <Card>
            <SectionTitle>Who's here</SectionTitle>
            <ul className="space-y-3">
              {[me, ...others].map((m) => (
                <li key={m.user_id} className="flex items-center gap-3">
                  <Avatar name={m.name} color={m.team?.color} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 font-semibold">
                      <span className="truncate">{m.name}</span>
                      {m.user_id === user.id && <span className="font-normal text-faint">(you)</span>}
                      {m.user_id === hang.host_id && <Crown className="size-4 shrink-0 text-amber-500" aria-label="Host" />}
                    </p>
                    <p className="flex items-center gap-1.5 text-sm text-muted">
                      <TeamDot color={m.team?.color} className="size-2" /> {m.team?.name}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <MemberStatus m={m} />
                    {openHang && m.user_id !== user.id && <ReportButton userId={m.user_id} hangId={hang.id} name={m.name} />}
                  </div>
                </li>
              ))}
            </ul>
            {hang.kind === 'group' && hang.members.length === 1 && (
              <p className="mt-3 text-sm text-muted">
                Waiting for friends to join... If nobody stays 10 minutes, this counts as a solo session (only away from home).
              </p>
            )}
          </Card>
        </Rise>

        <ErrorText>{actionError}</ErrorText>

        {stillHere && (
          <div className="overflow-hidden rounded-3xl bg-surface shadow-lg shadow-black/5 ring-1 ring-line">
            <div className="h-[300px]">
              <GlowRocker
                checked={rockerOn}
                onChange={flipPhonesDown}
                ariaLabel="Phones-down mode"
                offLabel="UP"
                onLabel="DOWN"
                bottomLabel="x1.5"
                topLabel="x1"
                dotsFromTop
                glowColor="#bef264"
                labelColor="#bef264"
                lightColor={dark ? '#17253e' : '#dfe6ef'}
                darkColor="#0b1d3a"
                orbit={0}
                className="h-full w-full"
              />
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <Smartphone className="size-5 shrink-0 rotate-180 text-brand-ink" aria-hidden />
              <p className="text-[13px] text-muted">
                <span className="font-semibold text-ink">Phones-down mode, up to x1.5.</span> Flip the switch, then put
                your phone face-down on the black screen.
              </p>
            </div>
          </div>
        )}
        {isHost ? (
          <Button className="w-full" loading={busy === 'end'} onClick={endHang}>
            <Sparkles className="size-5" aria-hidden /> End Hang
          </Button>
        ) : (
          stillHere && (
            <Button variant="danger" className="w-full" loading={busy === 'checkout'} onClick={checkOut}>
              Check out
            </Button>
          )
        )}
        <p className="text-center text-[13px] text-faint">
          {isHost
            ? 'Points are awarded automatically each minute. Ending closes the Hang and shows final results.'
            : 'Points are awarded automatically each minute. Checking out stops your time.'}
        </p>
      </div>
    </div>
  )
}
