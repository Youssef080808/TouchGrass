// Phone location. Browsers only allow this on HTTPS (or localhost).

const FAKE_KEY = 'tg_fake_location'

/** Testing helper: pretend to be somewhere (set from the Profile page). */
export function getFakeLocation() {
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
    // a few metres of jitter so two test devices aren't on the exact same spot
    const jitter = () => (Math.random() - 0.5) * 0.0002
    return Promise.resolve({ lat: fake.lat + jitter(), lng: fake.lng + jitter() })
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
