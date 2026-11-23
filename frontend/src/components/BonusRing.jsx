import { AnimatePresence, motion, useReducedMotion } from 'motion/react'

/**
 * Circular ring that fills with your phones-down share (0 to 1). Full ring = the full 1.5x bonus.
 * Children are shown in the middle (the timer). `people` sit around the ring: each one pops in with a
 * spring when they check in, and the end of the filled arc breathes softly so the ring feels alive.
 */
export default function BonusRing({ share = 0, size = 232, stroke = 12, track = 'rgb(255 255 255 / 0.12)', color = '#bef264', people = [], children }) {
  const reduce = useReducedMotion()
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const part = Math.min(Math.max(share, 0), 1)
  const filled = part * c
  // where the filled arc ends (the ring starts at the top and goes clockwise)
  const end = part * 2 * Math.PI - Math.PI / 2
  const tip = { x: size / 2 + r * Math.cos(end), y: size / 2 + r * Math.sin(end) }
  const avatar = 38
  const orbit = r + stroke / 2 + avatar / 2 - 6

  return (
    <div className="relative mx-auto" style={{ width: size, height: size, marginBottom: people.length ? 36 : 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="overflow-visible">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
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
            style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.22, 1, 0.36, 1)' }}
          />
        </g>
        {part > 0.01 && (
          <motion.circle
            cx={tip.x}
            cy={tip.y}
            r={stroke * 0.9}
            fill={color}
            initial={false}
            animate={reduce ? { opacity: 0.35 } : { opacity: [0.15, 0.5, 0.15], r: [stroke * 0.7, stroke * 1.25, stroke * 0.7] }}
            transition={reduce ? { duration: 0 } : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
      <AnimatePresence>
        {people.slice(0, 8).map((p, i, list) => {
          // spread people around the lower-left to lower-right of the ring, first person at the bottom
          const spread = Math.min(1, list.length / 6)
          const a = Math.PI / 2 + (list.length === 1 ? 0 : (i / (list.length - 1) - 0.5) * Math.PI * 1.1 * spread)
          const x = size / 2 + orbit * Math.cos(a) - avatar / 2
          const y = size / 2 + orbit * Math.sin(a) - avatar / 2
          return (
            <motion.span
              key={p.id}
              title={p.name}
              initial={reduce ? false : { scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 18, delay: reduce ? 0 : 0.08 * i }}
              className="absolute flex items-center justify-center rounded-full border-[3px] border-brand font-display text-base font-bold text-white shadow-lg dark:border-canvas"
              style={{ left: x, top: y, width: avatar, height: avatar, background: p.color }}
            >
              {p.name.slice(0, 1).toUpperCase()}
            </motion.span>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
