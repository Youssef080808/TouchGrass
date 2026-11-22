import { useEffect, useState } from 'react'
import { api } from '../api'

// Today's hot zones (double points). Fetched once and shared by every screen that asks (Map, Home, a Hang),
// refreshed after 10 minutes so a new day's zones show up.
const MAX_AGE_MS = 10 * 60 * 1000
let cache = null // { at, zones }
let pending = null

function load() {
  if (cache && Date.now() - cache.at < MAX_AGE_MS) return Promise.resolve(cache.zones)
  if (!pending) {
    pending = api('/hot-zones')
      .then((zones) => {
        cache = { at: Date.now(), zones }
        return zones
      })
      .finally(() => {
        pending = null
      })
  }
  return pending
}

/** [{ hex_id, place_name, lat, lng, boundary, ends_at, reason }] — empty until loaded */
export function useHotZones() {
  const [zones, setZones] = useState(() => cache?.zones ?? [])
  useEffect(() => {
    let alive = true
    load()
      .then((z) => alive && setZones(z))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return zones
}
