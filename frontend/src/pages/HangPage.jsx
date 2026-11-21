import { ArrowLeft, CloudRain, Crown, Footprints, MapPin, Smartphone, Sparkles, Users } from 'lucide-react'
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

const PING_EVERY_MS = 30000

export default function HangPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, refresh: refreshUser } = useUser()
  const { hang, setHang, error } = useHang(id)
  const [phonesDown, setPhonesDown] = useState(false)
  const [busy, setBusy] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [, tick] = useState(0)
  const wasActive = useRef(false)

  const me = hang?.members.find((m) => m.user_id === user.id)
  const isHost = hang?.host_id === user.id
  const active = hang?.status === 'active'

  // Clock tick for the timer
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Send location every 30 s while the Hang is live (walking away counts as leaving)
  useEffect(() => {
    if (!active || !me) return undefined
    const send = () =>
      getPosition()
        .then((pos) => api(`/hangs/${id}/ping`, { method: 'POST', body: pos }))
        .catch(() => {})
    const t = setInterval(send, PING_EVERY_MS)
    return () => clearInterval(t)
  }, [active, me, id])

  // When the Hang ends: leave phones-down mode, buzz the phone, refresh points
  useEffect(() => {
    if (active) wasActive.current = true
    if (hang?.status === 'ended' && wasActive.current) {
      setPhonesDown(false)
      navigator.vibrate?.(300)
      refreshUser()
    }
  }, [active, hang?.status, refreshUser])

  const sendBreak = useCallback(
    async (reason) => {
      try {
        setHang(await api(`/hangs/${id}/break`, { method: 'POST', body: { reason } }))
      } catch {
        // offline: the server will still see missed pings
      }
    },
    [id, setHang],
  )

  const enterPhonesDown = async () => {
    await askMotionPermission()
    setPhonesDown(true)
  }

  const exitPhonesDown = async () => {
    setPhonesDown(false)
    await sendBreak('picked_up')
  }

  const endHang = async () => {
    setBusy('end')
    setActionError(null)
    try {
      setHang(await api(`/hangs/${id}/end`, { method: 'POST' }))
      refreshUser()
    } catch (e) {
      setActionError(e.message)
    } finally {
      setBusy(null)
      setPhonesDown(false)
    }
  }

  const leave = async () => {
    setBusy('leave')
    try {
      await api(`/hangs/${id}/leave`, { method: 'POST' })
      navigate('/', { replace: true })
    } catch (e) {
      setActionError(e.message)
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

  return (
    <div className="min-h-dvh bg-canvas pb-10">
      {phonesDown && (
        <PhoneDownOverlay hang={hang} me={me} isHost={isHost} onBreak={sendBreak} onExit={exitPhonesDown} onEnd={endHang} />
      )}

      <header className="pt-safe bg-forest px-5 pb-8 text-white">
        <div className="flex items-center justify-between pt-4">
          <button aria-label="Back" onClick={() => navigate('/')} className="-ml-2 rounded-full p-2 active:bg-white/10">
            <ArrowLeft className="size-5" />
          </button>
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider">
            {hang.kind === 'solo' ? 'Solo' : `${hang.members.length} here`} · live
          </span>
        </div>
        <h1 className="mt-3 flex items-center gap-2 text-2xl font-bold">
          {hang.kind === 'solo' ? <Footprints className="size-6" /> : <MapPin className="size-6" />} {title}
        </h1>
        <p className="mt-6 text-center text-sm text-white/60">{me.broke_at ? 'Phone-down time (stopped)' : 'Phone-down time'}</p>
        <p className="text-center font-mono text-6xl font-light tabular-nums">
          {formatDuration((me.broke_at ? new Date(me.broke_at).getTime() : Date.now()) - new Date(me.joined_at).getTime())}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1 rounded-full bg-lime px-3 py-1 font-semibold text-forest">
            <Users className="size-4" /> Party bonus x{me.party_multiplier}
          </span>
          {hang.bad_weather && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1">
              <CloudRain className="size-4" /> Bad weather +20%
            </span>
          )}
        </div>
      </header>

      <div className="-mt-4 space-y-4 px-4">
        {me.broke_at && (
          <ErrorText>You picked up your phone, so your phone-down time stopped and you lost the party bonus.</ErrorText>
        )}

        {hang.kind === 'group' && (
          <Card className="flex items-center gap-4">
            <div className="rounded-2xl bg-white p-1 ring-1 ring-black/5">
              <QRCodeSVG value={joinUrl} size={112} fgColor="#0d3b23" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-slate-500">Friends scan this with their camera, or enter</p>
              <p className="mt-1 text-3xl font-black tracking-[0.2em] text-forest">{hang.code}</p>
              <p className="mt-1 text-xs text-slate-400">They need to be within 100 m of you.</p>
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
                    {m.user_id === user.id && <span className="text-slate-400">(you)</span>}
                    {m.user_id === hang.host_id && <Crown className="size-4 text-amber-500" />}
                  </p>
                  <p className="flex items-center gap-1.5 text-sm text-slate-500">
                    <TeamDot color={m.team?.color} className="size-2" /> {m.team?.name}
                  </p>
                </div>
                {m.broke_at ? (
                  <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-600">Picked up</span>
                ) : (
                  <span className="rounded-full bg-lime/60 px-2.5 py-1 text-xs font-semibold text-forest">
                    x{m.party_multiplier}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {hang.kind === 'group' && hang.members.length === 1 && (
            <p className="mt-3 text-sm text-slate-400">Waiting for friends to join...</p>
          )}
        </Card>

        <ErrorText>{actionError}</ErrorText>

        {!me.broke_at && (
          <Button variant="lime" className="h-14 w-full text-lg" onClick={enterPhonesDown}>
            <Smartphone className="size-5 rotate-180" /> Put phones down
          </Button>
        )}
        {isHost ? (
          <Button variant="secondary" className="w-full" loading={busy === 'end'} onClick={endHang}>
            <Sparkles className="size-5" /> End Hang and collect points
          </Button>
        ) : (
          <Button variant="danger" className="w-full" loading={busy === 'leave'} onClick={leave}>
            Leave Hang
          </Button>
        )}
        <p className="text-center text-xs text-slate-400">
          {isHost ? 'Everyone gets their points when you end the Hang.' : 'You get your points when the host ends the Hang.'}
        </p>
      </div>
    </div>
  )
}

