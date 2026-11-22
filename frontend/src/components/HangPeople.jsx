import { Check, Lightbulb, MessageCircleQuestion, RefreshCw, Route, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { Avatar, Card, ErrorText, SectionTitle } from './ui'

/**
 * Open Hangs: requests to join (the host answers with one tap, seeing a little profile first) and the people
 * on their way. Nobody needs to be scanned: they check themselves in when they arrive.
 */
export function RsvpCard({ hang, isHost, onHang }) {
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const pending = hang.rsvps.filter((r) => r.status === 'pending')
  const coming = hang.rsvps.filter((r) => r.status === 'going')
  if (!(isHost && pending.length) && !coming.length) return null

  const answer = async (r, verdict) => {
    setBusy(`${verdict}-${r.user_id}`)
    setError(null)
    try {
      onHang(await api(`/hangs/${hang.id}/rsvps/${r.user_id}/${verdict}`, { method: 'POST' }))
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      {isHost && pending.length > 0 && (
        <>
          <SectionTitle>Want to join</SectionTitle>
          <ul className="space-y-3">
            {pending.map((r) => (
              <li key={r.user_id} className="flex items-center gap-3">
                <Avatar name={r.name} color={r.team?.color} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{r.name}</p>
                  <p className="truncate text-[13px] text-muted">
                    {r.hangs_done} {r.hangs_done === 1 ? 'Hang' : 'Hangs'} done
                    {r.interests.length > 0 && ` · ${r.interests.slice(0, 3).join(', ')}`}
                  </p>
                </div>
                <button
                  aria-label={`Decline ${r.name}`}
                  disabled={Boolean(busy)}
                  onClick={() => answer(r, 'decline')}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full bg-chip text-ink-soft active:bg-line"
                >
                  <X className="size-5" aria-hidden />
                </button>
                <button
                  aria-label={`Accept ${r.name}`}
                  disabled={Boolean(busy)}
                  onClick={() => answer(r, 'accept')}
                  className="press-lime flex size-11 shrink-0 items-center justify-center rounded-full bg-lime text-on-accent"
                >
                  <Check className="size-5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <ErrorText>{error}</ErrorText>
        </>
      )}
      {coming.length > 0 && (
        <div className={isHost && pending.length ? 'mt-4 border-t border-line pt-3' : ''}>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Route className="size-4 text-brand-ink" aria-hidden /> On the way: {coming.map((r) => r.name).join(', ')}
          </p>
          <p className="mt-1 text-[13px] text-muted">They'll check themselves in when they arrive. No need to stop.</p>
        </div>
      )}
    </Card>
  )
}

/** A question for people meeting for the first time, based on what they have in common. */
export function IcebreakerCard({ hangId, peopleKey }) {
  const [n, setN] = useState(0)
  const [data, setData] = useState(null)

  useEffect(() => {
    let live = true
    api(`/hangs/${hangId}/icebreaker?n=${n}`)
      .then((d) => live && setData(d))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [hangId, n, peopleKey])

  if (!data?.show) return null
  return (
    <div className="rounded-3xl bg-lime p-4 text-on-accent">
      <p className="flex items-center gap-2 font-display text-lg font-bold uppercase leading-none tracking-wide">
        <MessageCircleQuestion className="size-5" aria-hidden /> Icebreaker
      </p>
      <p className="mt-1 text-[13px] font-semibold opacity-75">
        First time together{data.topic ? `, and you all like ${data.topic.toLowerCase()}` : ''}. Before phones go down:
      </p>
      <p className="mt-2 font-display text-[26px] font-bold leading-tight">{data.question}</p>
      <button
        onClick={() => setN((x) => x + 1)}
        className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-black/10 px-4 text-sm font-semibold active:bg-black/20"
      >
        <RefreshCw className="size-4" aria-hidden /> Another one
      </button>
    </div>
  )
}

/**
 * "What should we do?": three ideas for this group, from what they have in common, the time and the weather.
 * Loads only when tapped. Uses AI when the server has a key, and built-in ideas otherwise.
 */
export function IdeasCard({ hangId }) {
  const [state, setState] = useState('idle') // idle | loading | done | error
  const [data, setData] = useState(null)

  function load() {
    setState('loading')
    api(`/hangs/${hangId}/ideas`)
      .then((d) => {
        setData(d)
        setState('done')
      })
      .catch(() => setState('error'))
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 font-display text-lg font-bold uppercase leading-none tracking-wide text-ink">
          <Lightbulb className="size-5 text-brand-ink" aria-hidden /> What should we do?
        </p>
        {data?.source === 'ai' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-lime/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink-soft">
            <Sparkles className="size-3" aria-hidden /> AI
          </span>
        )}
      </div>
      {state !== 'done' ? (
        <>
          <p className="mt-1 text-[13px] text-ink-soft">Ideas for this group, picked from what you all like, the time and the weather.</p>
          <button
            onClick={load}
            disabled={state === 'loading'}
            className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-brand px-4 text-sm font-semibold text-white active:opacity-80 disabled:opacity-60"
          >
            {state === 'loading' ? (
              <><RefreshCw className="size-4 animate-spin" aria-hidden /> Thinking…</>
            ) : (
              <><Sparkles className="size-4" aria-hidden /> {state === 'error' ? 'Try again' : 'Give us ideas'}</>
            )}
          </button>
        </>
      ) : (
        <ol className="mt-3 space-y-2.5">
          {data.ideas.map((idea, i) => (
            <li key={idea.title} className="flex gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-lime font-display text-sm font-bold text-on-accent">
                {i + 1}
              </span>
              <div>
                <p className="font-semibold leading-tight text-ink">{idea.title}</p>
                {idea.detail && <p className="text-[13px] leading-snug text-ink-soft">{idea.detail}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}
