/**
 * Turfed logo: a flag planted in a hexagon ("this turf is ours").
 * <LogoMark size={64} /> draws the app icon; `tile={false}` draws the mark without the navy square.
 */
export function LogoMark({ size = 64, tile = true, className = '', title = 'Turfed' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={title} className={className}>
      {tile && <rect width="100" height="100" rx="22" fill="#0b1d3a" />}
      <polygon
        points="50,26 76,41 76,71 50,86 24,71 24,41"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.9"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <polygon points="50,36 67.3,46 67.3,66 50,76 32.7,66 32.7,46" fill="#bef264" fillOpacity="0.25" />
      <rect x="48" y="18" width="4" height="40" rx="2" fill="#ffffff" />
      <path d="M52 19 L74 26 L52 34 Z" fill="#bef264" />
    </svg>
  )
}

/** Wordmark: TURF in the current colour, ED in lime. */
export function Wordmark({ className = '' }) {
  return (
    <span className={`font-display font-extrabold uppercase tracking-tight ${className}`}>
      Turf<span className="text-lime">ed</span>
    </span>
  )
}
