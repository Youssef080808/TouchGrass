import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { distanceM } from '../lib/geo'
import { BUZZ, haptic } from '../lib/haptics'
import { getPosition } from '../lib/location'

const CHECK_EVERY_MS = 30000
const ARRIVE_RADIUS_M = 100 // same as the server's JOIN_RADIUS_M

/**
 * Said "I'm coming" to an open Hang? While the app is open, this checks you in by itself once you're
 * within 100 m, so nobody has to stop to scan you. (The native app would do this in the background.)
 */
export function useAutoArrive(enabled) {
  const navigate = useNavigate()
  useEffect(() => {
    if (!enabled) return undefined
    let stopped = false
    const check = async () => {
      try {
        const { rsvp } = await api('/me/rsvp')
        if (!rsvp || stopped) return
        const pos = await getPosition({ timeout: 8000 })
        if (stopped || distanceM(pos, rsvp) > ARRIVE_RADIUS_M) return
        const hang = await api(`/hangs/${rsvp.hang_id}/arrive`, { method: 'POST', body: pos })
        if (stopped) return
        haptic(BUZZ.join)
        navigate(`/hang/${hang.id}`)
      } catch {
        // not there yet, offline, or no location: try again on the next check
      }
    }
    check()
    const t = setInterval(check, CHECK_EVERY_MS)
    return () => {
      stopped = true
      clearInterval(t)
    }
  }, [enabled, navigate])
}
