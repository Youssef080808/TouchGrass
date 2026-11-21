import { useEffect, useState } from 'react'
import { cn } from '../lib/cn'

/**
 * Text that fills up with lime liquid, with a gently moving wave on top (styles in index.css, `.liquid-text`).
 * fill: how full it ends up, 0 to 1 (about 0.9 leaves the wave visible). It pours in after `delay` ms.
 * Pure CSS, so it's cheap; with reduced motion the wave holds still and the fill is instant.
 */
export default function LiquidText({ children, fill = 0.9, delay = 250, className = '', style, ...props }) {
  const [level, setLevel] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setLevel(fill), delay)
    return () => clearTimeout(t)
  }, [fill, delay])
  return (
    <span className={cn('liquid-text', className)} style={{ '--liquid-fill': level, ...style }} {...props}>
      {children}
    </span>
  )
}
