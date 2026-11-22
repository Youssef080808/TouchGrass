import { useEffect, useRef, useState } from 'react'
import { authConfig, loadGoogle } from '../lib/google'
import { useTheme } from '../theme'

/**
 * Google's own "Continue with Google" button. Calls onCredential(idToken) after the person picks an account.
 * Renders nothing when the server has no Google client ID.
 * text: 'continue_with' | 'signin_with' | 'signup_with'
 */
export default function GoogleButton({ onCredential, text = 'continue_with' }) {
  const box = useRef(null)
  const callback = useRef(onCredential)
  callback.current = onCredential
  const { dark } = useTheme()
  const [state, setState] = useState('loading') // loading | ready | off | failed

  useEffect(() => {
    let alive = true
    authConfig().then(async ({ google_client_id: clientId }) => {
      if (!alive) return
      if (!clientId) {
        setState('off')
        return
      }
      try {
        const google = await loadGoogle()
        if (!alive || !box.current) return
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (res) => res?.credential && callback.current(res.credential),
          auto_select: false,
          cancel_on_tap_outside: true,
        })
        box.current.replaceChildren()
        google.accounts.id.renderButton(box.current, {
          type: 'standard',
          theme: dark ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'pill',
          text,
          logo_alignment: 'center',
          width: Math.max(200, Math.min(400, Math.round(box.current.offsetWidth || 320))),
        })
        setState('ready')
      } catch {
        if (alive) setState('failed')
      }
    })
    return () => {
      alive = false
    }
  }, [dark, text])

  if (state === 'off') return null
  return (
    <div>
      <div className="relative min-h-11">
        <div ref={box} className="flex justify-center [color-scheme:normal]" />
        {state === 'loading' && <div className="absolute inset-0 animate-pulse rounded-full bg-chip" aria-hidden />}
      </div>
      {state === 'failed' && (
        <p className="mt-1 text-center text-[13px] text-muted">Google sign-in couldn't load. Use your email instead.</p>
      )}
    </div>
  )
}
