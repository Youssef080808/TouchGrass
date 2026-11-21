/**
 * Circular ring that fills with your phones-down share (0 to 1). Full ring = the full 1.5x bonus.
 * Children are shown in the middle (the timer).
 */
export default function BonusRing({ share = 0, size = 232, stroke = 12, track = 'rgb(255 255 255 / 0.12)', color = '#bef264', children }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const filled = Math.min(Math.max(share, 0), 1) * c
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c}`}
          style={{ transition: 'stroke-dasharray 0.6s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}
