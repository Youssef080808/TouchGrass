import { LoaderCircle } from 'lucide-react'
import { initials } from '../lib/format'

const VARIANTS = {
  primary: 'bg-forest text-white active:bg-forest-light',
  lime: 'bg-lime text-forest active:brightness-95',
  secondary: 'bg-white text-slate-900 ring-1 ring-slate-200 active:bg-slate-50',
  ghost: 'bg-transparent text-slate-700 active:bg-slate-100',
  danger: 'bg-white text-red-600 ring-1 ring-red-200 active:bg-red-50',
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
  return <div className={`rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5 ${className}`}>{children}</div>
}

export function Spinner({ label }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
      <LoaderCircle className="size-7 animate-spin" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  )
}

export function ErrorText({ children }) {
  if (!children) return null
  return <p className="rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700">{children}</p>
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
