import { Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { usePhoneDown } from '../hooks/usePhoneDown'
import { RollingTimer } from './AnimatedNumber'
import BonusRing from './BonusRing'
import { TeamDot } from './ui'

/**
 * Optional phones-down mode: black screen, phone face-down, bonus grows up to 1.5x.
 * Picking the phone up, switching apps or locking the screen pauses the bonus
 * (your time together still counts either way).
 */
export default function PhoneDownOverlay({ hang, me, isHost, bonus, share, onStop, onEnd }) {
  const [, tick] = useState(0)
  const { faceDown, wakeLock } = usePhoneDown({ active: true, onBreak: onStop })

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const together = Date.now() - new Date(me.joined_at).getTime()
  const downCount = hang.members.filter((m) => m.phones_down_active).length

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col items-center justify-between bg-black px-6 py-12 text-white" role="dialog" aria-label="Phones-down mode">
      <div className="text-center">
        <p className="font-display text-lg font-bold uppercase tracking-[0.25em] text-white/40">Phones down</p>
        <p className="mt-1 text-sm text-white/35">
          {downCount} of {hang.members.length} in phones-down mode
        </p>
      </div>

      <div className="text-center">
        <BonusRing share={share} size={248} stroke={10} track="rgb(255 255 255 / 0.08)" color="rgb(190 242 100 / 0.7)">
          <RollingTimer ms={together} className="font-display text-[60px] font-semibold leading-none text-white/75" />
          <p className="mt-2 font-display text-lg font-bold uppercase tracking-wide text-lime/70">x{bonus.toFixed(2)} bonus</p>
        </BonusRing>
        <div className="mx-auto mt-8 flex max-w-xs items-center justify-center gap-2 text-white/55">
          <Smartphone className={`size-5 transition-transform duration-500 ${faceDown ? 'rotate-180 text-lime' : ''}`} aria-hidden />
          <p className="text-[15px]">{faceDown ? 'Face-down. Enjoy the people around you.' : 'Now lay your phone face-down.'}</p>
        </div>
        <p className="mx-auto mt-3 max-w-xs text-[13px] leading-relaxed text-white/35">
          Keep this screen open{wakeLock ? ' (we keep it dark for you)' : ''}. Picking it up, switching apps or
          locking it pauses the bonus. Your time together still counts.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {hang.members.map((m) => (
            <span key={m.user_id} className={`flex items-center gap-1.5 text-[13px] ${m.phones_down_active ? 'text-lime/80' : 'text-white/40'}`}>
              <TeamDot color={m.team?.color} className="size-2" />
              {m.name}
            </span>
          ))}
        </div>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-2">
        {isHost && (
          <button onClick={onEnd} className="h-12 rounded-2xl bg-white/10 text-[15px] font-semibold text-white/80 active:bg-white/15">
            End Hang for everyone
          </button>
        )}
        <button onClick={() => onStop('exit')} className="h-12 rounded-2xl text-[15px] text-white/45 active:bg-white/5">
          Leave phones-down mode
        </button>
      </div>
    </div>
  )
}
