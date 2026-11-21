import { ArrowLeft, CloudRain, Crown, Footprints, Lock, MapPin, Smartphone, Sparkles, Users } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import PhoneDownOverlay from '../components/PhoneDownOverlay'
import { Avatar, Button, Card, ErrorText, Spinner, TeamDot } from '../components/ui'
import { useHang } from '../hooks/useHang'
import { askMotionPermission } from '../hooks/usePhoneDown'
import { formatDuration } from '../lib/format'
import { getPosition } from '../lib/location'
import { useUser } from '../user'
import Results from './Results'

const PING_EVERY_MS = 30000      // location check while the app is open
const HEARTBEAT_EVERY_MS = 15000 // "still in phones-down mode" signal
const PHONES_DOWN_MAX_BONUS = 0.5 // same as backend/app/points.py

const PAUSE_MESSAGES = {
  picked_up: 'You picked up your phone, so the phones-down bonus paused.',
  left_app: 'You left the app, so the phones-down bonus paused.',
  exit: null,
}

/** Live bonus estimate: share of your time spent in phones-down mode. */
function phonesDownBonus(member) {
  const end = member.left_at ? new Date(member.left_at).getTime() : Date.now()
  const total = (end - new Date(member.joined_at).getTime()) / 1000
  let down = member.phones_down_seconds
  if (member.phones_down_active && member.phones_down_since) {
    down += (Date.now() - new Date(member.phones_down_since).getTime()) / 1000
  }
  const share = total > 0 ? Math.min(down / total, 1) : 0
  return 1 + PHONES_DOWN_MAX_BONUS * share
}

function MemberStatus({ m }) {
  if (m.left_reason === 'checked_out') {
    return <span className="rounded-full bg-chip px-2.5 py-1 text-xs font-semibold text-muted">Checked out</span>
  }
  if (m.left_reason === 'left_area') {
    return <span className="rounded-full bg-danger-soft px-2.5 py-1 text-xs font-semibold text-danger">Left</span>
  }
  if (m.phones_down_active) {
    return <span className="rounded-full bg-lime/60 px-2.5 py-1 text-xs font-semibold text-on-accent">Phones down</span>
  }
  return <span className="rounded-full bg-chip px-2.5 py-1 text-xs font-semibold text-muted">Here</span>
}

export default function HangPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, refresh: refreshUser } = useUser()
  const { hang, setHang, error } = useHang(id)
  const [phonesDown, setPhonesDown] = useState(false)
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

  // While the app is open, send location every 30 s (walking away counts as leaving)
  useEffect(() => {
    if (!active || !stillHere) return undefined
    const send = () =>
      getPosition()
        .then((pos) => api(`/hangs/${id}/ping`, { method: 'POST', body: pos }))
        .catch(() => {})
    const t = setInterval(send, PING_EVERY_MS)
    return () => clearInterval(t)
  }, [active, stillHere, id])

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
      navigator.vibrate?.(300)
      refreshUser()
    }
  }, [active, hang?.status, refreshUser])

  const startPhonesDown = async () => {
    setPauseNote(null)
    setActionError(null)
    await askMotionPermission()
    try {
      setHang(await api(`/hangs/${id}/phones-down`, { method: 'POST', body: { active: true } }))
      setPhonesDown(true)
    } catch (e) {
      setActionError(e.message)
    }
  }

  const stopPhonesDown = useCallback(
    async (reason) => {
      setPhonesDown(false)
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

  if (hang.status === 'ended') return <Results hang={hang} me={me} />

  if (!me) {
    return (
      <div className="min-h-dvh bg-canvas p-6">
        <ErrorText>You're not in this Hang. Ask for the code and join.</ErrorText>
        <Button className="mt-4 w-full" onClick={() => navigate('/')}>Home</Button>
      </div>
    )
  }

  const joinUrl = `${window.location.origin}/join/${hang.code}`
  const title = hang.place_name || (hang.kind === 'solo' ? 'Solo session' : 'Group Hang')
  const others = hang.members.filter((m) => m.user_id !== user.id)
  const hostName = hang.members.find((m) => m.user_id === hang.host_id)?.name ?? 'the host'
  const together = (me.left_at ? new Date(me.left_at).getTime() : Date.now()) - new Date(me.joined_at).getTime()
  const bonus = phonesDownBonus(me)
  const here = hang.members.filter((m) => !m.left_at).length

  return (
    <div className="min-h-dvh bg-canvas pb-10">
      {phonesDown && (
        <PhoneDownOverlay hang={hang} me={me} isHost={isHost} bonus={bonus} onStop={stopPhonesDown} onEnd={endHang} />
      )}

      <header className="pt-safe bg-brand px-5 pb-8 text-white">
        <div className="flex items-center justify-between pt-4">
          <button aria-label="Back" onClick={() => navigate('/')} className="-ml-2 rounded-full p-2 active:bg-white/10">
            <ArrowLeft className="size-5" />
          </button>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            {hang.kind === 'solo' ? 'Solo' : `${here} here`} · live
          </span>
        </div>
        <h1 className="mt-3 flex items-center gap-2 text-2xl font-bold">
          {hang.kind === 'solo' ? <Footprints className="size-6" /> : <MapPin className="size-6" />} {title}
        </h1>
        <p className="mt-6 text-center text-sm text-white/60">{me.left_at ? 'Your time (stopped)' : 'Time together'}</p>
        <p className="text-center font-mono text-6xl font-light tabular-nums">{formatDuration(together)}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1 rounded-full bg-lime px-3 py-1 font-semibold text-on-accent">
            <Users className="size-4" /> Party x{me.party_multiplier}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1 font-semibold">
            <Smartphone className="size-4 rotate-180" /> Phones-down x{bonus.toFixed(2)}
          </span>
          {hang.bad_weather && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1">
              <CloudRain className="size-4" /> Bad weather +20%
            </span>
          )}
        </div>
      </header>

      <div className="-mt-4 space-y-4 px-4">
        {me.left_at ? (
          <Card className="text-[15px]">
            <p className="font-semibold">
              {me.left_reason === 'checked_out' ? "You're checked out." : 'You left the Hang area, so your time stopped.'}
            </p>
            <p className="mt-1 text-muted">You'll get your points when {hostName} ends the Hang.</p>
            <Button variant="secondary" className="mt-3 h-10 w-full" onClick={() => navigate('/')}>
              Home
            </Button>
          </Card>
        ) : (
          <Card className="flex items-start gap-3">
            <div className="rounded-2xl bg-canvas p-2.5">
              <Lock className="size-5 text-brand-ink" />
            </div>
            <p className="text-[15px] text-ink-soft">
              <span className="font-semibold text-ink">Lock your phone and put it away.</span> Your time keeps
              counting until you check out{isHost ? ' or end the Hang' : ` or ${hostName} ends the Hang`}.
            </p>
          </Card>
        )}

        {pauseNote && (
          <p className="rounded-2xl bg-warn-soft px-3 py-2 text-sm text-warn">{pauseNote} Your time together still counts.</p>
        )}

        {hang.kind === 'group' && stillHere && (
          <Card className="flex items-center gap-4">
            <div className="rounded-2xl bg-[#ffffff] p-1">
              <QRCodeSVG value={joinUrl} size={112} fgColor="#0b1d3a" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted">Friends scan this with their camera, or enter</p>
              <p className="mt-1 text-3xl font-black tracking-[0.2em] text-brand-ink">{hang.code}</p>
              <p className="mt-1 text-xs text-faint">They need to be within 100 m of you.</p>
            </div>
          </Card>
        )}

        <Card>
          <h2 className="mb-3 font-semibold">Who's here</h2>
          <ul className="space-y-3">
            {[me, ...others].map((m) => (
              <li key={m.user_id} className="flex items-center gap-3">
                <Avatar name={m.name} color={m.team?.color} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 font-semibold">
                    {m.name}
                    {m.user_id === user.id && <span className="text-faint">(you)</span>}
                    {m.user_id === hang.host_id && <Crown className="size-4 text-amber-500" />}
                  </p>
                  <p className="flex items-center gap-1.5 text-sm text-muted">
                    <TeamDot color={m.team?.color} className="size-2" /> {m.team?.name}
                  </p>
                </div>
                <MemberStatus m={m} />
              </li>
            ))}
          </ul>
          {hang.kind === 'group' && hang.members.length === 1 && (
            <p className="mt-3 text-sm text-faint">Waiting for friends to join...</p>
          )}
        </Card>

        <ErrorText>{actionError}</ErrorText>

        {stillHere && (
          <>
            <Button variant="lime" className="h-14 w-full text-lg" onClick={startPhonesDown}>
              <Smartphone className="size-5 rotate-180" /> Phones-down mode · up to x1.5
            </Button>
            <p className="-mt-2 text-center text-xs text-faint">
              Optional bonus: keep the app open on a black screen with your phone face-down.
            </p>
          </>
        )}
        {isHost ? (
          <Button variant="secondary" className="w-full" loading={busy === 'end'} onClick={endHang}>
            <Sparkles className="size-5" /> End Hang and collect points
          </Button>
        ) : (
          stillHere && (
            <Button variant="danger" className="w-full" loading={busy === 'checkout'} onClick={checkOut}>
              Check out
            </Button>
          )
        )}
        <p className="text-center text-xs text-faint">
          {isHost
            ? 'Ending checks your location, then everyone gets their points.'
            : 'Checking out checks your location. Points arrive when the host ends the Hang.'}
        </p>
      </div>
    </div>
  )
}
