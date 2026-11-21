import { API_URL } from './config'

const TOKEN_KEY = 'tg_token'

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // storage blocked (private mode): the app still works until the page reloads
  }
}

/** Call the backend: api('/me'), api('/hangs', { method: 'POST', body: {...} }) */
export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers['X-User-Token'] = token

  let res
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    const err = new Error("Can't reach the server. Check your connection.")
    err.status = 0
    throw err
  }

  let data = null
  try {
    data = await res.json()
  } catch {
    // empty response
  }
  if (!res.ok) {
    const detail = data?.detail
    const message = typeof detail === 'string' ? detail : detail?.[0]?.msg || `Something went wrong (${res.status})`
    const err = new Error(message)
    err.status = res.status
    throw err
  }
  return data
}

/** Full WebSocket URL for a path, e.g. wsUrl('/api/ws/hangs/3') */
export function wsUrl(path) {
  const base = API_URL || window.location.origin
  return base.replace(/^http/, 'ws') + path
}
