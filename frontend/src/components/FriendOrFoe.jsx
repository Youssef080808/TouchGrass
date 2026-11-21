import { Handshake, PartyPopper, Swords, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../api'

/**
 * Territory alerts. When another team takes one of your zones you get the choice:
 * Fight back (go out and win it back) or Team up (do a joint Hang and share it).
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
      {items.slice(0, 2).map((n) =>
        n.kind === 'friend_or_foe' ? (
          <div key={n.id} className="rounded-3xl bg-[#020817] p-4 text-white shadow-lg ring-1 ring-line">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-white/10 p-2">
                <Swords className="size-5 text-lime" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-lime">Friend or foe?</p>
                <p className="mt-1 text-[15px] leading-snug">{n.message}</p>
              </div>
              <button aria-label="Dismiss" onClick={() => dismiss(n.id)} className="text-white/50">
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-danger-soft0 font-semibold"
                onClick={() => {
                  dismiss(n.id)
                  onFight?.(n)
                }}
              >
                <Swords className="size-4" /> Fight back
              </button>
              <button
                className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-lime font-semibold text-on-accent"
                onClick={() => {
                  dismiss(n.id)
                  onTeamUp?.(n)
                }}
              >
                <Handshake className="size-4" /> Team up
              </button>
            </div>
          </div>
        ) : (
          <div key={n.id} className="flex items-center gap-3 rounded-3xl bg-lime/60 p-4 text-on-accent">
            <PartyPopper className="size-5 shrink-0" />
            <p className="flex-1 text-sm font-medium">{n.message}</p>
            <button aria-label="Dismiss" onClick={() => dismiss(n.id)}>
              <X className="size-5" />
            </button>
          </div>
        ),
      )}
    </div>
  )
}
