import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { distanceM } from '../lib/geo'
import { BUZZ, haptic } from '../lib/haptics'
import { getPosition } from '../lib/location'

const CHECK_EVERY_MS = 30000

/**
 * Said "I'm in" to a rally? From 30 minutes before it starts, while the app is open, this checks you in by
 * itself once you're at the place (the server checks you're within 400 m). The first person there starts the
 * Hang; everyone after joins it. Nobody has to scan anyone. (A native app would do this in the background.)
 */
export function useRallyArrive(enabled) {
  const navigate = useNavigate()
  useEffect(() => {
    if (!enabled) return undefined
    let stopped = false
    const check = async () => {
      try {
        const rallies = await api('/rallies')
        const now = Date.now()
        const due = rallies.filter(
          (r) => r.my_going && !r.my_hang_status && new Date(r.arrive_from).getTime() <= now,
        )
        if (!due.length || stopped) return
        const pos = await getPosition({ timeout: 8000 })
        const here = due.find((r) => distanceM(pos, r.place) <= r.arrive_radius_m)
        if (!here || stopped) return
        const hang = await api(`/rallies/${here.id}/arrive`, { method: 'POST', body: pos })
        if (stopped) return
        haptic(BUZZ.join)
        navigate(`/hang/${hang.id}`)
      } catch {
        // not there yet, already in another Hang, offline or no location: try again on the next check
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
