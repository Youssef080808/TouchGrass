import { Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { usePhoneDown } from '../hooks/usePhoneDown'
import { formatDuration, since } from '../lib/format'
import { TeamDot } from './ui'

/** Full-screen black "phones down" mode. Leaving it, switching apps or picking the phone up = break. */
export default function PhoneDownOverlay({ hang, me, isHost, onBreak, onExit, onEnd }) {
  const [, tick] = useState(0)
  const { faceDown, wakeLock } = usePhoneDown({ active: true, onBreak })

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const down = hang.members.filter((m) => !m.broke_at).length

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col items-center justify-between bg-black px-6 py-12 text-white">
      <div className="text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-white/40">Phones down</p>
        <p className="mt-2 text-sm text-white/40">
          {down} of {hang.members.length} still down
        </p>
      </div>

      <div className="text-center">
        <p className="font-mono text-6xl font-light tabular-nums text-white/70">
          {formatDuration(since(me.joined_at))}
        </p>
        <div className="mx-auto mt-8 flex max-w-xs items-center justify-center gap-2 text-white/60">
          <Smartphone className={`size-5 ${faceDown ? 'rotate-180 text-lime' : ''}`} />
          <p className="text-sm">{faceDown ? 'Face-down. Enjoy the people around you.' : 'Now lay your phone face-down.'}</p>
        </div>
        <p className="mx-auto mt-3 max-w-xs text-xs leading-relaxed text-white/30">
          Keep this screen open{wakeLock ? ', we keep it dark for you' : ''}. Picking it up or switching apps ends
          your phone-down time.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {hang.members.map((m) => (
            <span key={m.user_id} className={`flex items-center gap-1.5 text-xs ${m.broke_at ? 'text-red-400' : 'text-white/50'}`}>
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
        <button onClick={onExit} className="h-12 rounded-2xl text-sm text-white/40">
          I need my phone
        </button>
      </div>
    </div>
  )
}
