import { Handshake, PartyPopper, Swords, UserX, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'
import { Rise } from './ui'

/**
 * Territory alerts. When another team takes one of your zones you get the choice:
 * Fight back (go out and win it back) or Team up (do a joint Hang and share it).
 * Also shows other messages, like a team accepting or declining your join request.
 */
export default function FriendOrFoe({ onFight, onTeamUp }) {
  const [items, setItems] = useState([])

  useEffect(() => {
    api('/me/notifications').then(setItems).catch(() => {})
  }, [])

  const dismiss = async (id) => {
    setItems((list) => list.filter((n) => n.id !== id))
    api(`/me/notifications/${id}/read`, { method: 'POST' }).catch(() => {})
  }

  if (!items.length) return null
  return (
    <div className="space-y-3">
      {items.slice(0, 2).map((n, i) =>
        n.kind === 'friend_or_foe' ? (
          <Rise key={n.id} i={i}>
            <div className="rounded-3xl bg-[#020817] p-4 text-white shadow-lg ring-1 ring-line">
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-red-500/20">
                  <Swords className="size-5 text-red-300" aria-hidden />
                </div>
                <div className="flex-1">
                  <p className="font-display text-lg font-bold uppercase leading-none tracking-wide text-lime">Friend or foe?</p>
                  <p className="mt-1.5 text-[15px] leading-snug text-white/90">{n.message}</p>
                </div>
                <button aria-label="Dismiss" onClick={() => dismiss(n.id)} className="-m-2 rounded-full p-2 text-white/50 active:bg-white/10">
                  <X className="size-5" />
                </button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-red-500 font-semibold shadow-[0_4px_0_0_#991b1b] active:translate-y-[3px] active:shadow-[0_1px_0_0_#991b1b]"
                  onClick={() => {
                    dismiss(n.id)
                    onFight?.(n)
                  }}
                >
                  <Swords className="size-4" aria-hidden /> Fight back
                </button>
                <button
                  className="press-lime flex h-12 items-center justify-center gap-2 rounded-2xl bg-lime font-semibold text-on-accent"
                  onClick={() => {
                    dismiss(n.id)
                    onTeamUp?.(n)
                  }}
                >
                  <Handshake className="size-4" aria-hidden /> Team up
                </button>
              </div>
            </div>
          </Rise>
        ) : ['team_declined', 'hang_declined', 'hang_removed'].includes(n.kind) ? (
          <Rise key={n.id} i={i}>
            <div className="flex items-center gap-3 rounded-3xl bg-surface p-4 ring-1 ring-line">
              <UserX className="size-5 shrink-0 text-muted" aria-hidden />
              <p className="flex-1 text-[15px] font-semibold">{n.message}</p>
              <button aria-label="Dismiss" onClick={() => dismiss(n.id)} className="-m-2 rounded-full p-2 text-muted active:bg-chip">
                <X className="size-5" />
              </button>
            </div>
          </Rise>
        ) : (
          <Rise key={n.id} i={i}>
            <div className="flex items-center gap-3 rounded-3xl bg-lime p-4 text-on-accent">
              <PartyPopper className="size-5 shrink-0" aria-hidden />
              <p className="flex-1 text-[15px] font-semibold">{n.message}</p>
              <button aria-label="Dismiss" onClick={() => dismiss(n.id)} className="-m-2 rounded-full p-2 active:bg-black/10">
                <X className="size-5" />
              </button>
            </div>
          </Rise>
        ),
      )}
    </div>
  )
}
