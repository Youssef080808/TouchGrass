import { useEffect, useState } from 'react'
import GlassLogoReveal from './GlassLogoReveal'

// The Turfed mark without its navy tile: hexagon, flag pole and lime flag. Shapes are opaque (the glass
// uses the outline), so the hexagon's faint lime fill is pre-mixed over navy. The glass settles into a
// flat navy plate, so the reveal ends on the app icon.
const MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="16 14 68 78">
  <polygon points="50,26 76,41 76,71 50,86 24,71 24,41" fill="#385244" stroke="#ffffff" stroke-width="6" stroke-linejoin="round"/>
  <rect x="47" y="18" width="6" height="42" rx="3" fill="#ffffff"/>
  <path d="M53 19 L76 26.5 L53 35 Z" fill="#bef264"/>
</svg>`

const NAVY = '#0b1d3a'
const SEEN_KEY = 'tg_splash_seen'
const SHOW_MS = 4300 // the reveal takes about 3.5 s, then a short hold
const FADE_MS = 450

function shouldShow() {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
    return !sessionStorage.getItem(SEEN_KEY)
  } catch {
    return false
  }
}

/** Full-screen glass reveal of the Turfed logo, once each time the app is opened. Tap to skip. */
export default function LaunchSplash() {
  const [phase, setPhase] = useState(() => (shouldShow() ? 'show' : 'done')) // show | fade | done

  useEffect(() => {
    if (phase !== 'show') return undefined
    try {
      sessionStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* private mode: it just shows again next time */
    }
    const t = setTimeout(() => setPhase('fade'), SHOW_MS)
    return () => clearTimeout(t)
  }, [phase])

  useEffect(() => {
    if (phase !== 'fade') return undefined
    const t = setTimeout(() => setPhase('done'), FADE_MS)
    return () => clearTimeout(t)
  }, [phase])

  if (phase === 'done') return null
  return (
    <div
      className="fixed inset-0 z-[3000] transition-opacity ease-out"
      style={{ backgroundColor: NAVY, opacity: phase === 'fade' ? 0 : 1, transitionDuration: `${FADE_MS}ms` }}
    >
      <GlassLogoReveal
        logo={MARK}
        label="Turfed"
        look="dark"
        background={NAVY}
        iconPlate
        keepPlate
        plateColor="#132d58"
        originalColors
        loop={false}
        logoScale={0.66}
        finalScale={0.86}
        tileSize={220}
        className="h-full w-full"
        onClick={() => setPhase('fade')}
      />
      <p
        className="pointer-events-none absolute inset-x-0 bottom-[16%] text-center font-display text-5xl font-extrabold uppercase tracking-tight text-white opacity-0 motion-safe:animate-[splash-word_600ms_ease-out_2600ms_forwards]"
        aria-hidden
      >
        Turf<span className="text-lime">ed</span>
      </p>
      <button
        onClick={() => setPhase('fade')}
        className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] min-h-11 rounded-full px-4 text-sm font-semibold text-white/60 active:bg-white/10"
      >
        Skip
      </button>
    </div>
  )
}
