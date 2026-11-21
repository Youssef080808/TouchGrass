// Short vibrations on key moments. Android browsers support this; iPhones ignore it silently.
export const BUZZ = {
  tap: 15,
  start: [30, 40, 30],          // you started a Hang
  join: [40, 60, 40],           // you joined, or someone joined yours
  phonesDown: 25,               // phones-down mode on
  end: 300,                     // the Hang ended
  capture: [60, 50, 60, 50, 180], // your team took a zone
}

export function haptic(pattern = BUZZ.tap) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern)
  } catch {
    // some browsers throw if the page hasn't been tapped yet; a missed buzz is fine
  }
}
