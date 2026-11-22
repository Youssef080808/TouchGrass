import { Check, KeyRound, Link2, Mail, ShieldAlert } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api'
import { useGoogleEnabled } from '../lib/google'
import { useUser } from '../user'
import { EmailPasswordFields, looksLikeEmail, OrDivider, PASSWORD_MIN } from './AuthFields'
import GoogleButton from './GoogleButton'
import { Button, Card, ErrorText } from './ui'

/**
 * Me tab. Old device-only accounts get a big "Save your account" card (email + password or Google).
 * Saved accounts see how they sign in, and can add the other way (link Google, or add a password).
 */
export default function AccountCard() {
  const { user, setUser, signIn } = useUser()
  const googleOn = useGoogleEnabled()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [adding, setAdding] = useState(false) // the "add a password" form on a saved account
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)
  const saved = user.has_login

  const apply = (r, message) => {
    // Saving an old account starts a real session: keep its new token
    if (r.token) signIn(r.token, r.user)
    else setUser(r.user)
    setDone(message)
    setAdding(false)
    setPassword('')
  }

  const addPassword = async () => {
    setError(null)
    if (!user.email && !looksLikeEmail(email)) {
      setError('Enter your email address.')
      return
    }
    if (password.length < PASSWORD_MIN) {
      setError(`Use at least ${PASSWORD_MIN} characters for your password.`)
      return
    }
    setBusy(true)
    try {
      const r = await api('/me/login/email', { method: 'POST', body: { email: user.email ?? email, password } })
      apply(r, saved ? 'Password added.' : 'Account saved. You can sign in anywhere now.')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const linkGoogle = async (credential) => {
    setError(null)
    setBusy(true)
    try {
      const r = await api('/me/login/google', { method: 'POST', body: { credential } })
      apply(r, saved ? 'Google linked.' : 'Account saved. You can sign in with Google anywhere now.')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  if (!saved) {
    return (
      <Card className="p-5 ring-2 ring-amber-400/70">
        <div className="flex items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-amber-400/20 text-amber-600 dark:text-amber-300">
            <ShieldAlert className="size-6" aria-hidden />
          </span>
          <div>
            <h2 className="font-display text-2xl font-extrabold uppercase leading-none">Save your account</h2>
            <p className="mt-1.5 text-[15px] leading-snug text-muted">
              Right now it only lives on this phone. Add a way to sign in so you can use Turfed anywhere and never
              lose your {user.points} points.
            </p>
          </div>
        </div>
        <div className="mt-4">
          <GoogleButton text="continue_with" onCredential={linkGoogle} />
          {googleOn && <OrDivider />}
          <EmailPasswordFields isNew size="md" email={email} setEmail={setEmail} password={password}
            setPassword={setPassword} onSubmit={addPassword} />
          <div className="mt-3 space-y-3">
            <ErrorText>{error}</ErrorText>
            <Button variant="lime" className="w-full" loading={busy} onClick={addPassword}>
              <KeyRound className="size-5" aria-hidden /> Save account
            </Button>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <h2 className="font-display text-2xl font-extrabold uppercase leading-none">Account</h2>
      <ul className="mt-3 divide-y divide-line">
        <li className="flex min-h-12 items-center gap-3 py-2">
          <Mail className="size-5 shrink-0 text-muted" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{user.email ?? 'No email'}</span>
          {user.has_password && <span className="text-[13px] font-semibold text-muted">Password</span>}
        </li>
        <li className="flex min-h-12 items-center gap-3 py-2">
          <Link2 className="size-5 shrink-0 text-muted" aria-hidden />
          <span className="flex-1">Google</span>
          {user.google ? (
            <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-grass">
              <Check className="size-4" aria-hidden /> Linked
            </span>
          ) : (
            !googleOn && <span className="text-[13px] text-muted">Not linked</span>
          )}
        </li>
      </ul>
      {!user.google && googleOn && (
        <div className="mt-2">
          <GoogleButton text="continue_with" onCredential={linkGoogle} />
        </div>
      )}
      {!user.has_password && !adding && (
        <Button variant="secondary" className="mt-3 w-full" onClick={() => setAdding(true)}>
          <KeyRound className="size-5" aria-hidden /> Add a password
        </Button>
      )}
      {adding && (
        <div className="mt-3">
          <EmailPasswordFields isNew size="md" lockedEmail={user.email} email={email} setEmail={setEmail}
            password={password} setPassword={setPassword} onSubmit={addPassword} autoFocus />
          <Button className="mt-3 w-full" loading={busy} onClick={addPassword}>Save password</Button>
        </div>
      )}
      {(error || done) && (
        <div className="mt-3">
          {error ? (
            <ErrorText>{error}</ErrorText>
          ) : (
            <p role="status" className="flex items-center gap-2 rounded-2xl bg-lime px-3 py-2 text-sm font-semibold text-on-accent">
              <Check className="size-4" aria-hidden /> {done}
            </p>
          )}
        </div>
      )}
    </Card>
  )
}
