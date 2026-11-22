import { CircleAlert, Flag, Frown, MapPinOff, MessageSquareMore, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api'
import { cn } from '../lib/cn'
import { Button, ErrorText } from './ui'

const REASONS = [
  { key: 'Rude or mean', icon: Frown },
  { key: 'Made me feel unsafe', icon: CircleAlert },
  { key: "Wasn't really there", icon: MapPinOff },
  { key: 'Something else', icon: MessageSquareMore },
]
const OTHER = 'Something else'

/** Small "Report" link that opens a sheet. Reports from 3 different people stop someone posting or joining open Hangs. */
export default function ReportButton({ userId, hangId = null, name, className = '' }) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  if (done) return <span className={cn('text-xs font-semibold text-muted', className)}>Reported. Thanks.</span>
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`Report ${name}`}
        className={cn('inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold text-muted active:bg-chip', className)}
      >
        <Flag className="size-3.5" aria-hidden /> Report
      </button>
      {open && (
        <ReportSheet
          userId={userId}
          hangId={hangId}
          name={name}
          onClose={() => setOpen(false)}
          onSent={() => {
            setOpen(false)
            setDone(true)
          }}
        />
      )}
    </>
  )
}

function ReportSheet({ userId, hangId, name, onClose, onSent }) {
  const [reason, setReason] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const text = reason === OTHER ? note.trim() : [reason, note.trim()].filter(Boolean).join(': ')
  const send = async () => {
    if (!reason) return setError('Pick what happened.')
    if (!text) return setError('Tell us briefly what happened.')
    setBusy(true)
    setError(null)
    try {
      await api('/reports', { method: 'POST', body: { user_id: userId, hang_id: hangId, reason: text.slice(0, 200) } })
      onSent()
    } catch (e) {
      setError(e.message || "Couldn't send it. Try again.")
      setBusy(false)
    }
  }

  // Portal: cards animate with transforms, which would trap a fixed overlay inside them
  return createPortal(
    <div className="fixed inset-0 z-[1200] flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="report-title">
      <button aria-label="Close" tabIndex={-1} className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-3xl bg-surface px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line" aria-hidden />
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="report-title" className="font-display text-2xl font-bold uppercase leading-none tracking-wide text-ink">
              Report {name}
            </h2>
            <p className="mt-1 text-sm text-muted">Only the Turfed team sees this. {name} won't know it was you.</p>
          </div>
          <button aria-label="Close" onClick={onClose} className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-ink active:bg-chip">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="mt-4 space-y-2" role="radiogroup" aria-label="What happened">
          {REASONS.map(({ key, icon: Icon }) => {
            const on = reason === key
            return (
              <button
                key={key}
                role="radio"
                aria-checked={on}
                onClick={() => {
                  setReason(key)
                  setError(null)
                }}
                className={cn(
                  'flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 text-left text-[15px] font-semibold transition-colors',
                  on ? 'bg-brand text-white' : 'bg-chip text-ink active:bg-line',
                )}
              >
                <Icon className="size-5 shrink-0" aria-hidden /> {key}
              </button>
            )
          })}
        </div>

        {reason && (
          <div className="mt-3">
            <label htmlFor="report-note" className="text-sm font-semibold text-ink-soft">
              {reason === OTHER ? 'What happened?' : 'Anything to add? (optional)'}
            </label>
            <textarea
              id="report-note"
              rows={2}
              maxLength={150}
              value={note}
              onChange={(e) => {
                setNote(e.target.value)
                setError(null)
              }}
              className="mt-1 w-full resize-none rounded-2xl bg-chip px-4 py-3 text-[16px] text-ink ring-1 ring-line placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder={reason === OTHER ? 'Tell us briefly' : 'A few words'}
            />
          </div>
        )}

        {error && (
          <div className="mt-2">
            <ErrorText>{error}</ErrorText>
          </div>
        )}
        <Button variant="danger" className="mt-4 w-full" loading={busy} onClick={send}>
          Send report
        </Button>
      </div>
    </div>,
    document.body,
  )
}
