import { Flag } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api'
import { cn } from '../lib/cn'

/** Small "Report" link. Reports from 3 different people stop someone posting or joining open Hangs. */
export default function ReportButton({ userId, hangId = null, name, className = '' }) {
  const [done, setDone] = useState(false)
  if (done) return <span className={cn('text-xs font-semibold text-muted', className)}>Reported. Thanks.</span>
  const report = async () => {
    const reason = window.prompt(`Report ${name}? Tell us briefly what happened.`)
    if (!reason?.trim()) return
    try {
      await api('/reports', { method: 'POST', body: { user_id: userId, hang_id: hangId, reason: reason.trim().slice(0, 200) } })
      setDone(true)
    } catch {
      // offline: nothing changes, they can try again
    }
  }
  return (
    <button
      onClick={report}
      aria-label={`Report ${name}`}
      className={cn('inline-flex min-h-8 items-center gap-1 rounded-full px-2 text-xs font-semibold text-muted active:bg-chip', className)}
    >
      <Flag className="size-3.5" aria-hidden /> Report
    </button>
  )
}
