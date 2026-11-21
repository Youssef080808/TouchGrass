import { LoaderCircle } from 'lucide-react'
import { initials } from '../lib/format'

const VARIANTS = {
  primary: 'bg-brand text-white active:bg-brand-light',
  lime: 'bg-lime text-on-accent active:brightness-95',
  secondary: 'bg-surface text-ink ring-1 ring-line active:bg-chip',
  ghost: 'bg-transparent text-ink-soft active:bg-chip',
  danger: 'bg-surface text-danger ring-1 ring-danger/30 active:bg-danger-soft',
}

export function Button({ variant = 'primary', loading = false, className = '', children, ...props }) {
  return (
    <button
      className={`inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-4 text-[15px] font-semibold transition disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <LoaderCircle className="size-5 animate-spin" /> : children}
    </button>
  )
}

export function Card({ className = '', children }) {
  return <div className={`rounded-3xl bg-surface p-4 shadow-sm ring-1 ring-line ${className}`}>{children}</div>
}

export function Spinner({ label }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted">
      <LoaderCircle className="size-7 animate-spin" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  )
}

export function ErrorText({ children }) {
  if (!children) return null
  return <p className="rounded-2xl bg-danger-soft px-3 py-2 text-sm text-danger">{children}</p>
}

export function Avatar({ name, color = '#16a34a', size = 40 }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ backgroundColor: color, width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(name)}
    </div>
  )
}

export function TeamDot({ color, className = 'size-3' }) {
  return <span className={`inline-block shrink-0 rounded-full ${className}`} style={{ backgroundColor: color }} />
}

export function Page({ children, className = '' }) {
  return <div className={`min-h-dvh px-4 pb-28 pt-safe ${className}`}>{children}</div>
}
