// Adapted from 21st.dev "Animated Number" by ikascom (https://21st.dev/r/ikascom/animated-number).
// A number that rolls when it changes: increases come up from below, decreases drop from above,
// so the direction is readable at a glance. Respects the phone's reduced-motion setting.
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { cn } from '../lib/cn'

const SPRING = { type: 'spring', stiffness: 350, damping: 35 }
const INSTANT = { duration: 0 }
const defaultFormat = new Intl.NumberFormat('en-CA').format

export default function AnimatedNumber({ value, format = defaultFormat, className, ...props }) {
  const reduce = useReducedMotion()
  // Work out the direction while rendering (React's "adjust state when a prop changes" pattern)
  const [previous, setPrevious] = useState(value)
  const [direction, setDirection] = useState(0)
  if (value !== previous) {
    setDirection(value > previous ? 1 : -1)
    setPrevious(value)
  }
  const offset = reduce ? 0 : 10

  return (
    <span className={cn('relative inline-flex overflow-hidden tabular-nums', className)} {...props}>
      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
        <motion.span
          key={value}
          custom={direction}
          variants={{
            enter: (dir) => ({ y: offset * dir, opacity: 0 }),
            center: { y: 0, opacity: 1 },
            exit: (dir) => ({ y: -offset * dir, opacity: 0 }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={reduce ? INSTANT : SPRING}
          className="inline-block"
        >
          {format(value)}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

/** Counts up from 0 to `to` in a few rolling steps (used for points you just won). */
export function CountUp({ to, steps = 12, duration = 1100, delay = 250, ...props }) {
  const reduce = useReducedMotion()
  const [value, setValue] = useState(reduce ? to : 0)
  useEffect(() => {
    if (reduce || to <= 0) {
      setValue(to)
      return undefined
    }
    let i = 0
    let timer
    const start = setTimeout(function tick() {
      i += 1
      setValue(Math.round((to * i) / steps))
      if (i < steps) timer = setTimeout(tick, duration / steps)
    }, delay)
    return () => {
      clearTimeout(start)
      clearTimeout(timer)
    }
  }, [to, steps, duration, delay, reduce])
  return <AnimatedNumber value={value} {...props} />
}

/** mm:ss (or h:mm:ss) timer whose digits roll every second. */
export function RollingTimer({ ms, className }) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const two = (n) => String(n).padStart(2, '0')
  return (
    <span className={cn('inline-flex items-baseline tabular-nums', className)} aria-label={`${h ? `${h} h ` : ''}${m} min ${s} s`}>
      {h > 0 && (
        <>
          <AnimatedNumber value={h} format={String} />
          <span>:</span>
        </>
      )}
      <AnimatedNumber value={m} format={two} />
      <span>:</span>
      <AnimatedNumber value={s} format={two} />
    </span>
  )
}
