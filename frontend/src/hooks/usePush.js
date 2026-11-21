import { useCallback, useEffect, useState } from 'react'
import { disablePush, enablePush, pushStatus } from '../lib/push'

/** This browser's notification state, plus turnOn (call from a tap) and turnOff. */
export function usePush() {
  const [status, setStatus] = useState(null) // null while checking, then 'on' | 'off' | 'blocked' | 'unsupported'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const refresh = useCallback(() => pushStatus().then(setStatus).catch(() => setStatus('off')), [])
  useEffect(() => {
    refresh()
  }, [refresh])

  const turnOn = async () => {
    setBusy(true)
    setError(null)
    try {
      await enablePush()
      setStatus('on')
      return true
    } catch (e) {
      setError(e.message)
      refresh()
      return false
    } finally {
      setBusy(false)
    }
  }

  const turnOff = async () => {
    setBusy(true)
    setError(null)
    try {
      await disablePush()
      setStatus('off')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return { status, busy, error, setError, turnOn, turnOff }
}
