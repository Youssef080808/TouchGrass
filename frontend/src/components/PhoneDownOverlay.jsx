import { Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { usePhoneDown } from '../hooks/usePhoneDown'
import { formatDuration } from '../lib/format'
import { TeamDot } from './ui'

/**
 * Optional phones-down mode: black screen, phone face-down, bonus grows up to 1.5x.
 * Picking the phone up, switching apps or locking the screen pauses the bonus
 * (your time together still counts either way).
 */
export default function PhoneDownOverlay({ hang, me, isHost, bonus, onStop, onEnd }) {
  const [, tick] = useState(0)
  const { faceDown, wakeLock } = usePhoneDown({ active: true, onBreak: onStop })

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const together = Date.now() - new Date(me.joined_at).getTime()
  const downCount = hang.members.filter((m) => m.phones_down_active).length

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col items-center justify-between bg-black px-6 py-12 text-white">
      <div className="text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-white/40">Phones-down mode</p>
        <p className="mt-2 text-sm text-white/40">
          {downCount} of {hang.members.length} in phones-down mode
        </p>
      </div>

      <div className="text-center">
        <p className="font-mono text-6xl font-light tabular-nums text-white/70">{formatDuration(together)}</p>
        <p className="mt-3 text-sm text-lime/70">Bonus x{bonus.toFixed(2)} and growing</p>
        <div className="mx-auto mt-8 flex max-w-xs items-center justify-center gap-2 text-white/60">
          <Smartphone className={`size-5 ${faceDown ? 'rotate-180 text-lime' : ''}`} />
          <p className="text-sm">{faceDown ? 'Face-down. Enjoy the people around you.' : 'Now lay your phone face-down.'}</p>
        </div>
        <p className="mx-auto mt-3 max-w-xs text-xs leading-relaxed text-white/30">
          Keep this screen open{wakeLock ? ' (we keep it dark for you)' : ''}. Picking it up, switching apps or
          locking it pauses the bonus. Your time together still counts.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {hang.members.map((m) => (
            <span key={m.user_id} className={`flex items-center gap-1.5 text-xs ${m.phones_down_active ? 'text-lime/80' : 'text-white/40'}`}>
              <TeamDot color={m.team?.color} className="size-2" />
              {m.name}
            </span>
          ))}
        </div>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3">
        {isHost && (
          <button onClick={onEnd} className="h-12 rounded-2xl bg-white/10 text-sm font-semibold text-white/80">
            End Hang for everyone
          </button>
        )}
        <button onClick={() => onStop('exit')} className="h-12 rounded-2xl text-sm text-white/40">
          Leave phones-down mode
        </button>
      </div>
    </div>
  )
}
