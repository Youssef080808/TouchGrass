import { useEffect, useRef, useState } from 'react'

/*
 * "Phones down" detection for a website.
 *
 * A website can't see other apps, so we use three browser features:
 *  - Screen Wake Lock: keeps the screen on (black) so the phone doesn't lock by itself.
 *  - Page visibility: if the page is hidden (switched app, locked the screen), that's a break.
 *  - Device orientation: we see when the phone is lying face-down, and when it's picked back up.
 *
 * A native app version could use real screen-time APIs instead.
 */

const FACE_DOWN_BETA = 150 // phone flat and upside down: beta near +/-180 degrees
const PICKUP_GRACE_MS = 3000 // face-up for this long after being face-down = picked up

export async function askMotionPermission() {
  // iPhone needs permission for motion sensors, requested from a button tap
  const D = window.DeviceOrientationEvent
  if (D && typeof D.requestPermission === 'function') {
    try {
      return (await D.requestPermission()) === 'granted'
    } catch {
      return false
    }
  }
  return true
}

export function usePhoneDown({ active, onBreak }) {
  const [faceDown, setFaceDown] = useState(false)
  const [wakeLock, setWakeLock] = useState(false)
  const breakRef = useRef(onBreak)
  breakRef.current = onBreak

  useEffect(() => {
    if (!active) return undefined
    let lock = null
    let wasDown = false
    let upSince = null
    let broke = false
    const fireBreak = (reason) => {
      if (broke) return
      broke = true
      breakRef.current?.(reason)
    }

    const requestLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          lock = await navigator.wakeLock.request('screen')
          setWakeLock(true)
          lock.addEventListener('release', () => setWakeLock(false))
        }
      } catch {
        setWakeLock(false)
      }
    }
    requestLock()

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') fireBreak('left_app')
    }

    const onOrientation = (e) => {
      if (e.beta == null) return
      const down = Math.abs(e.beta) > FACE_DOWN_BETA
      setFaceDown(down)
      if (down) {
        wasDown = true
        upSince = null
      } else if (wasDown) {
        upSince = upSince ?? Date.now()
        if (Date.now() - upSince > PICKUP_GRACE_MS) fireBreak('picked_up')
      }
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('deviceorientation', onOrientation)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('deviceorientation', onOrientation)
      lock?.release().catch(() => {})
    }
  }, [active])

  return { faceDown, wakeLock }
}
