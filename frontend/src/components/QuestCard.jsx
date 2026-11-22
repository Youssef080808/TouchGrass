import { Check, Target } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { BUZZ, haptic } from '../lib/haptics'
import { useUser } from '../user'
import { ErrorText } from './ui'

/** Today's quest: one small goal a day, with a bonus to claim once it's done. Only Hangs that counted move it. */
export default function QuestCard() {
  const { refresh } = useUser()
  const [quest, setQuest] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let live = true
    api('/me/quest')
      .then((q) => live && setQuest(q))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  if (!quest) return null
  const pct = Math.round((quest.progress / quest.goal) * 100)

  const claim = async () => {
    setBusy(true)
    setError(null)
    try {
      setQuest(await api('/me/quest/claim', { method: 'POST' }))
      haptic(BUZZ.join)
      refresh()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-3xl bg-surface p-4 ring-1 ring-line" aria-labelledby="quest-title">
      <div className="flex items-start gap-3">
        <div className={`grid size-11 shrink-0 place-items-center rounded-2xl ${quest.claimed ? 'bg-lime text-on-accent' : 'bg-chip text-brand-ink'}`}>
          {quest.claimed ? <Check className="size-6" aria-hidden /> : <Target className="size-6" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Today's quest · +{quest.bonus} pts</p>
          <h2 id="quest-title" className="font-display text-[22px] font-bold leading-tight text-ink">{quest.title}</h2>
          <p className="text-[13px] leading-snug text-muted">{quest.claimed ? 'Done for today. A new quest comes at midnight.' : quest.detail}</p>
        </div>
      </div>

      {!quest.claimed && (
        <div className="mt-3 flex items-center gap-3">
          <div
            className="h-2.5 flex-1 overflow-hidden rounded-full bg-chip"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={quest.goal}
            aria-valuenow={quest.progress}
            aria-label="Quest progress"
          >
            <div className="h-full rounded-full bg-lime transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          {quest.done ? (
            <button
              onClick={claim}
              disabled={busy}
              className="press-lime inline-flex min-h-11 shrink-0 items-center rounded-full bg-lime px-4 text-sm font-bold text-on-accent disabled:opacity-60"
            >
              {busy ? 'Claiming…' : `Claim +${quest.bonus}`}
            </button>
          ) : (
            <span className="shrink-0 text-sm font-semibold tabular-nums text-ink-soft">
              {quest.progress}/{quest.goal}
              {quest.unit === 'min' ? ' min' : ''}
            </span>
          )}
        </div>
      )}
      {error && (
        <div className="mt-2">
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </section>
  )
}
