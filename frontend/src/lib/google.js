import { useEffect, useState } from 'react'
import { api } from '../api'

// Sign in with Google (Google Identity Services). The server says which client ID to use, so turning Google
// on or off is one setting on the server (GOOGLE_CLIENT_ID), with no rebuild of the front end.

let configPromise = null
export function authConfig() {
  if (!configPromise) {
    configPromise = api('/auth/config').catch(() => {
      configPromise = null // try again next time
      return { google_client_id: null }
    })
  }
  return configPromise
}

/** true / false once known, null while loading */
export function useGoogleEnabled() {
  const [on, setOn] = useState(null)
  useEffect(() => {
    let alive = true
    authConfig().then((c) => alive && setOn(Boolean(c.google_client_id)))
    return () => {
      alive = false
    }
  }, [])
  return on
}

let scriptPromise = null
export function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google)
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://accounts.google.com/gsi/client'
      s.async = true
      s.onload = () => (window.google?.accounts?.id ? resolve(window.google) : reject(new Error('no google')))
      s.onerror = () => {
        scriptPromise = null
        s.remove()
        reject(new Error("Couldn't load Google sign-in"))
      }
      document.head.appendChild(s)
    })
  }
  return scriptPromise
}
