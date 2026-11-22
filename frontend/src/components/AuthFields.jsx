import { Eye, EyeOff } from 'lucide-react'
import { useId, useState } from 'react'
import { cn } from '../lib/cn'

export const PASSWORD_MIN = 8
export const looksLikeEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim())

/** "or" between the Google button and the email form */
export function OrDivider({ children = 'or' }) {
  return (
    <div className="my-4 flex items-center gap-3 text-[13px] font-semibold uppercase tracking-wide text-faint" aria-hidden>
      <span className="h-px flex-1 bg-line" />
      {children}
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}

/**
 * Email + password inside a real <form>, so password managers offer to fill and save them, and Enter submits.
 * isNew: a new password (shows the rule, tells password managers to suggest one).
 * lockedEmail: show this email instead of an input (an account that already has one).
 */
export function EmailPasswordFields({
  email, setEmail, password, setPassword, onSubmit, isNew = false, lockedEmail = null, size = 'lg', autoFocus = false,
}) {
  const id = useId()
  const [show, setShow] = useState(false)
  // Enter submits (the form has no submit button of its own; the screen's main button does that)
  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onSubmit?.()
    }
  }
  const input = cn(
    'w-full bg-surface text-ink outline-none ring-1 ring-line placeholder:text-faint focus:ring-2 focus:ring-brand-ink',
    size === 'lg' ? 'h-14 rounded-2xl px-4 text-lg' : 'h-12 rounded-xl px-3 text-[16px]',
  )
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit?.()
      }}
      className="space-y-3"
    >
      <div>
        <label htmlFor={`${id}-email`} className="block text-sm font-semibold text-ink-soft">Email</label>
        {lockedEmail ? (
          <input id={`${id}-email`} type="email" name="email" autoComplete="username" value={lockedEmail} readOnly
            className={cn(input, 'mt-1.5 bg-chip text-ink-soft')} />
        ) : (
          <input
            id={`${id}-email`}
            type="email"
            name="email"
            inputMode="email"
            autoComplete={isNew ? 'email' : 'username'}
            autoCapitalize="none"
            spellCheck={false}
            autoFocus={autoFocus}
            value={email}
            maxLength={254}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="you@example.com"
            className={cn(input, 'mt-1.5')}
          />
        )}
      </div>
      <div>
        <label htmlFor={`${id}-password`} className="block text-sm font-semibold text-ink-soft">Password</label>
        <div className="relative mt-1.5">
          <input
            id={`${id}-password`}
            type={show ? 'text' : 'password'}
            name="password"
            autoComplete={isNew ? 'new-password' : 'current-password'}
            value={password}
            maxLength={128}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={isNew ? `At least ${PASSWORD_MIN} characters` : 'Your password'}
            className={cn(input, 'pr-12')}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide password' : 'Show password'}
            aria-pressed={show}
            className="absolute right-1 top-1/2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-muted active:bg-chip"
          >
            {show ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
          </button>
        </div>
      </div>
    </form>
  )
}
