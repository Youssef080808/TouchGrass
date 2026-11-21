import { Bell, BellRing, Timer } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api'
import { DEMO_MODE } from '../config'
import { usePush } from '../hooks/usePush'
import { Button, Card, ErrorText } from './ui'

// "Buzz us in...": the host picks how long; everyone gets a notification when it's up.
const CHOICES = [...(DEMO_MODE ? [[1, '1 min']] : []), [30, '30 min'], [60, '1 h'], [120, '2 h']]

function countdown(ms) {
  const s = Math.max(Math.ceil(ms / 1000), 0)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/** Hang page: the host sets a timer; everyone sees the countdown and can turn on notifications here. */
export default function HangTimer({ hang, isHost, onHang }) {
  const push = usePush()
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  const endsAt = hang.timer_ends_at ? new Date(hang.timer_ends_at).getTime() : null
  if (!isHost && !endsAt) return null

  const left = endsAt ? endsAt - Date.now() : null
  const setTimer = async (minutes) => {
    setBusy(minutes ?? 'clear')
    setError(null)
    try {
      onHang(await api(`/hangs/${hang.id}/timer`, { method: 'POST', body: { minutes } }))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-chip text-brand-ink">
          {left !== null && left <= 0 ? <BellRing className="size-5" aria-hidden /> : <Timer className="size-5" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          {endsAt ? (
            <>
              <p className="font-display text-[22px] font-bold leading-tight">
                {left > 0 ? `Time's up in ${countdown(left)}` : "Time's up!"}
              </p>
              <p className="text-sm text-muted">
                {left > 0 ? 'Everyone gets a notification, so phones can stay away.' : isHost ? 'End the Hang when you are ready.' : 'The host can end it now.'}
              </p>
            </>
          ) : (
            <>
              <p className="font-semibold">Buzz us when it's time</p>
              <p className="text-sm text-muted">Pick a length and put your phones away. Everyone gets a notification when it's up.</p>
            </>
          )}
        </div>
      </div>

      {isHost && (
        <div className="mt-3 flex flex-wrap gap-2">
          {CHOICES.map(([minutes, label]) => (
            <Button key={minutes} variant="secondary" className="h-10 flex-1 px-3 text-sm" loading={busy === minutes} onClick={() => setTimer(minutes)}>
              {label}
            </Button>
          ))}
          {endsAt && (
            <Button variant="ghost" className="h-10 px-3 text-sm" loading={busy === 'clear'} onClick={() => setTimer(null)}>
              Clear
            </Button>
          )}
        </div>
      )}

      {push.status === 'off' && (
        <Button variant="lime" className="mt-3 h-11 w-full" loading={push.busy} onClick={push.turnOn}>
          <Bell className="size-4" aria-hidden /> Turn on notifications on this device
        </Button>
      )}
      {(error || push.error) && (
        <div className="mt-3">
          <ErrorText>{error || push.error}</ErrorText>
        </div>
      )}
    </Card>
  )
}
