// Phone location. Browsers only allow this on HTTPS (or localhost).
import { DEMO_MODE } from '../config'

const FAKE_KEY = 'tg_fake_location'

export const TEST_LOCATIONS = [
  { name: 'McGill campus', lat: 45.5048, lng: -73.5772 },
  { name: 'Mont-Royal Park', lat: 45.5036, lng: -73.5874 },
  { name: 'Jeanne-Mance Park', lat: 45.5155, lng: -73.5862 },
  { name: 'La Fontaine Park', lat: 45.5268, lng: -73.5697 },
  { name: 'Old Port', lat: 45.5075, lng: -73.5536 },
  { name: 'Lachine Canal', lat: 45.4840, lng: -73.5770 },
  { name: 'Grande Bibliothèque', lat: 45.5154, lng: -73.5620 },
  { name: 'McGill Fitness Centre', lat: 45.5079, lng: -73.5803 },
]

/** Testing helper: pretend to be somewhere (set from the Profile page). */
export function getFakeLocation() {
  if (!DEMO_MODE) return null // the real app always uses the phone's GPS
  try {
    const value = localStorage.getItem(FAKE_KEY)
    if (!value) return null
    const [lat, lng] = value.split(',').map(Number)
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
  } catch {
    return null
  }
}

export function setFakeLocation(loc) {
  try {
    if (loc) localStorage.setItem(FAKE_KEY, `${loc.lat},${loc.lng}`)
    else localStorage.removeItem(FAKE_KEY)
  } catch {
    // ignore
  }
}

/** Resolves to { lat, lng } or rejects with a message a person can act on. */
export function getPosition({ timeout = 12000 } = {}) {
  const fake = getFakeLocation()
  if (fake) {
    return Promise.resolve(fake)
  }
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Location is not available on this device.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) =>
        reject(
          new Error(
            e.code === 1
              ? 'Allow location access so we can check you are really there.'
              : "Couldn't get your location. Try again outside or near a window.",
          ),
        ),
      { enableHighAccuracy: true, timeout, maximumAge: 15000 },
    )
  })
}
