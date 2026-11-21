import { useCallback, useEffect, useRef, useState } from 'react'
import { api, getToken, wsUrl } from '../api'

/**
 * Live state of one Hang. Listens on a WebSocket (the server pushes changes);
 * if the WebSocket can't connect, it falls back to asking every 3 seconds.
 */
export function useHang(id) {
  const [hang, setHang] = useState(null)
  const [error, setError] = useState(null)
  const endedRef = useRef(false)

  const refresh = useCallback(async () => {
    try {
      const data = await api(`/hangs/${id}`)
      endedRef.current = data.status === 'ended'
      setHang(data)
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }, [id])

  useEffect(() => {
    let ws
    let pollTimer
    let closed = false
    const startPolling = () => {
      if (!pollTimer && !closed && !endedRef.current) pollTimer = setInterval(refresh, 3000)
    }

    refresh()
    try {
      ws = new WebSocket(wsUrl(`/api/ws/hangs/${id}?token=${encodeURIComponent(getToken() || '')}`))
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        if (msg.hang) {
          endedRef.current = msg.hang.status === 'ended'
          setHang(msg.hang)
        }
      }
      ws.onerror = startPolling
      ws.onclose = startPolling
    } catch {
      startPolling()
    }

    return () => {
      closed = true
      clearInterval(pollTimer)
      if (ws) {
        ws.onclose = null
        ws.close()
      }
    }
  }, [id, refresh])

  return { hang, setHang, error, refresh }
}
