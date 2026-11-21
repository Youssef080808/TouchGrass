// Push notifications for this browser: turn on, turn off, check, and keep the server in sync.
// Works in Chrome, Edge, Firefox and Safari on laptops. On iPhone, only once the app is added to the Home Screen.
import { api } from '../api'

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}

function keyBytes(base64url) {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

function sameKey(buffer, bytes) {
  if (!buffer) return false
  const a = new Uint8Array(buffer)
  return a.length === bytes.length && a.every((v, i) => v === bytes[i])
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration()
  return reg ? reg.pushManager.getSubscription() : null
}

/** 'unsupported' | 'blocked' | 'on' | 'off' */
export async function pushStatus() {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  const sub = await currentSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

/** Call this from a tap: asks for permission, subscribes this browser and tells the server. */
export async function enablePush() {
  if (!pushSupported()) throw new Error("This browser can't show notifications.")
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked for this site. Allow them in your browser settings, then try again.'
        : 'Notifications were not turned on.',
    )
  }
  const reg = await navigator.serviceWorker.register('/sw.js')
  await navigator.serviceWorker.ready
  const key = keyBytes((await api('/push/key')).key)
  let sub = await reg.pushManager.getSubscription()
  if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
    await sub.unsubscribe() // made with an old server key: start over
    sub = null
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
  await api('/push/subscribe', { method: 'POST', body: sub.toJSON() })
}

export async function disablePush() {
  const sub = pushSupported() ? await currentSubscription() : null
  if (!sub) return
  await api('/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }).catch(() => {})
  await sub.unsubscribe()
}

/** On app start: if this browser already has notifications on, make sure the server knows
 *  (for example after the database was reset for a demo). Silent; never asks for anything. */
export async function syncPush() {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return
    const sub = await currentSubscription()
    if (sub) await api('/push/subscribe', { method: 'POST', body: sub.toJSON() })
  } catch {
    // offline or signed out: try again next time
  }
}
