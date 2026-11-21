import confetti from 'canvas-confetti'

const COLORS = ['#bef264', '#84cc16', '#ffffff', '#38bdf8', '#facc15']

/** Celebration burst (skipped when the phone asks for reduced motion). */
export function celebrate() {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const base = { colors: COLORS, disableForReducedMotion: true, zIndex: 3000 }
  confetti({ ...base, particleCount: 90, spread: 75, startVelocity: 42, origin: { y: 0.35 } })
  setTimeout(() => confetti({ ...base, particleCount: 50, angle: 60, spread: 60, origin: { x: 0, y: 0.6 } }), 180)
  setTimeout(() => confetti({ ...base, particleCount: 50, angle: 120, spread: 60, origin: { x: 1, y: 0.6 } }), 180)
}
