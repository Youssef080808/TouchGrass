import { useId } from 'react'
import { cn } from '../lib/cn'

/**
 * Grainy black-and-white satin: a few thick, heavily blurred light bands that slowly drift over a dark
 * ground, with film grain on top. Plain SVG + CSS, so it costs almost nothing and needs no WebGL.
 * The drift stops for people who turn on reduced motion.
 */
export default function SatinBackground({ className, ground = '#0e0e10', light = '#f2f2f4', grain = 0.22 }) {
  const id = useId().replace(/:/g, '')
  const band = (d, w, o, cls) => (
    <path d={d} fill="none" stroke={light} strokeWidth={w} strokeLinecap="round" opacity={o} className={cls} />
  )
  return (
    <svg aria-hidden viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" className={cn('pointer-events-none', className)}>
      <defs>
        <filter id={`satin-blur-${id}`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="30" />
        </filter>
        <filter id={`satin-grain-${id}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.95" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
      </defs>
      <rect width="400" height="400" fill={ground} />
      <g filter={`url(#satin-blur-${id})`}>
        {band('M-80 150 C 80 40, 220 300, 480 120', 105, 0.95, 'satin-drift-a')}
        {band('M-60 380 C 120 260, 260 420, 480 300', 80, 0.6, 'satin-drift-b')}
        {band('M260 -60 C 220 120, 120 220, 60 460', 55, 0.55, 'satin-drift-c')}
      </g>
      <rect width="400" height="400" filter={`url(#satin-grain-${id})`} opacity={grain} />
    </svg>
  )
}
