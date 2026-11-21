import { LoaderCircle } from 'lucide-react'
import { cn } from '../lib/cn'
import { initials } from '../lib/format'

// Buttons have a solid "3D" edge underneath (game feel) that disappears when pressed.
const VARIANTS = {
  primary: 'bg-brand text-white press-brand dark:bg-brand-light',
  lime: 'bg-lime text-on-accent press-lime',
  secondary: 'bg-surface text-ink ring-1 ring-line press-line',
  ghost: 'bg-transparent text-ink-soft active:bg-chip',
  danger: 'bg-surface text-danger ring-1 ring-danger/30 press-line',
}

export function Button({ variant = 'primary', loading = false, className = '', children, ...props }) {
  return (
    <button
      className={cn(
        'inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-4 text-[16px] font-semibold transition-[transform,box-shadow,background-color] duration-150 disabled:opacity-50',
        VARIANTS[variant],
        className,
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <LoaderCircle className="size-5 animate-spin" aria-label="Loading" /> : children}
    </button>
  )
}

export function Card({ className = '', children, ...props }) {
  return (
    <div className={cn('rounded-3xl bg-surface p-4 ring-1 ring-line', className)} {...props}>
      {children}
    </div>
  )
}

/** Small uppercase label above a section, in the sporty display font. */
export function SectionTitle({ children, action, className = '' }) {
  return (
    <div className={cn('mb-2.5 flex items-end justify-between gap-3', className)}>
      <h2 className="font-display text-[22px] font-bold uppercase leading-none tracking-wide text-ink">{children}</h2>
      {action}
    </div>
  )
}

/** Fades and lifts children in on load. `i` staggers items in a list. */
export function Rise({ i = 0, className = '', children, as: Tag = 'div' }) {
  return (
    <Tag className={cn('motion-safe:animate-rise', className)} style={{ animationDelay: `${i * 60}ms` }}>
      {children}
    </Tag>
  )
}

export function Spinner({ label }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted">
      <LoaderCircle className="size-7 animate-spin" aria-hidden />
      {label && <p className="text-sm">{label}</p>}
    </div>
  )
}

export function ErrorText({ children }) {
  if (!children) return null
  return (
    <p role="alert" className="rounded-2xl bg-danger-soft px-3 py-2 text-sm text-danger">
      {children}
    </p>
  )
}

export function Avatar({ name, color = '#16a34a', size = 40, ring = false }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-display font-bold text-white"
      style={{
        backgroundColor: color,
        width: size,
        height: size,
        fontSize: size * 0.42,
        boxShadow: ring ? `0 0 0 3px var(--surface), 0 0 0 6px ${color}` : undefined,
      }}
      aria-hidden
    >
      {initials(name)}
    </div>
  )
}

export function TeamDot({ color, className = 'size-3' }) {
  return <span className={cn('inline-block shrink-0 rounded-full', className)} style={{ backgroundColor: color }} />
}

/** Rounded stat chip, e.g. a streak or points counter. */
export function Pill({ icon, children, className = '' }) {
  return (
    <span
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-full bg-surface px-3 text-[15px] font-semibold ring-1 ring-line',
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}

export function Page({ children, className = '' }) {
  return <div className={cn('pt-safe min-h-dvh px-4 pb-32', className)}>{children}</div>
}
