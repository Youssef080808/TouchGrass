import { Bell, BellOff, Check, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { usePush } from '../hooks/usePush'
import { syncPush, testPush } from '../lib/push'
import { Button, Card, ErrorText, SectionTitle } from './ui'

/** Me tab: turn notifications on or off for this browser, and send yourself a test. */
export default function NotificationsCard() {
  const push = usePush()
  const [note, setNote] = useState(null)
  const [testing, setTesting] = useState(false)

  // Notifications are on in this browser: make sure the server still knows (e.g. after a database reset)
  useEffect(() => {
    if (push.status === 'on') syncPush()
  }, [push.status])

  if (push.status === null) return null

  const sendTest = async () => {
    setTesting(true)
    setNote(null)
    push.setError(null)
    try {
      const r = await testPush()
      if (r.delivered > 0) {
        setNote(
          `Sent to ${r.delivered === 1 ? 'this device' : `${r.delivered} devices`}. Nothing popped up? On a Mac, allow your ` +
            'browser in System Settings > Notifications and turn off Focus.',
        )
      } else {
        push.setError(r.errors?.[0] ? `Couldn't deliver it: ${r.errors[0]}` : "The server couldn't reach this browser. Tap Turn off, then Turn on, and try again.")
      }
    } catch (e) {
      push.setError(e.message)
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card>
      <SectionTitle action={push.status === 'on' ? <Bell className="size-5 text-grass" aria-hidden /> : <BellOff className="size-5 text-muted" aria-hidden />}>
        Notifications
      </SectionTitle>
      <p className="text-sm text-muted">
        Put your phone away. We'll let you know when your Hang's timer is up, when a Hang ends, when someone asks to join your
        team, and when a rival takes your zone.
      </p>

      {push.status === 'on' && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" className="h-11" loading={testing} onClick={sendTest}>
            <Send className="size-4" aria-hidden /> Send a test
          </Button>
          <Button variant="ghost" className="h-11" loading={push.busy} onClick={() => push.turnOff().then(() => setNote(null))}>
            Turn off
          </Button>
        </div>
      )}
      {push.status === 'off' && (
        <Button className="mt-3 h-11 w-full" loading={push.busy} onClick={push.turnOn}>
          <Bell className="size-4" aria-hidden /> Turn on notifications
        </Button>
      )}
      {push.status === 'blocked' && (
        <p className="mt-3 rounded-2xl bg-chip px-3 py-2 text-sm text-ink-soft">
          Notifications are blocked for this site. Allow them in your browser's site settings (the icon next to the address),
          then reload.
        </p>
      )}
      {push.status === 'unsupported' && (
        <p className="mt-3 rounded-2xl bg-chip px-3 py-2 text-sm text-ink-soft">
          This browser can't show notifications. On iPhone, add Turfed to your Home Screen first (Share, then Add to Home
          Screen) and open it from there.
        </p>
      )}

      {note && (
        <p role="status" className="mt-3 flex items-center gap-2 rounded-2xl bg-lime px-3 py-2 text-sm font-semibold text-on-accent">
          <Check className="size-4 shrink-0" aria-hidden /> {note}
        </p>
      )}
      {push.error && (
        <div className="mt-3">
          <ErrorText>{push.error}</ErrorText>
        </div>
      )}
    </Card>
  )
}
