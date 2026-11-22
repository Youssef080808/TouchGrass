// Times for rallies, history and the weekly recap, in the phone's own timezone.
// English formats ("8:00 PM") so they match the rest of the app's text.

const clockFmt = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
const weekdayFmt = new Intl.DateTimeFormat('en-US', { weekday: 'short' })
const dateFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

export const clock = (d) => clockFmt.format(new Date(d))

/** Whole days from b to a, by calendar date (not 24-hour blocks). */
function dayDiff(a, b) {
  const start = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((start(a) - start(b)) / 86400000)
}

/** When a rally starts: "Now", "In 25 min", "Tonight 8:00 PM", "Today 3:00 PM", "Tomorrow 7:00 PM", "Sat 7:00 PM" */
export function startsLabel(iso, now = new Date()) {
  const t = new Date(iso)
  const mins = Math.round((t - now) / 60000)
  if (mins <= 5) return 'Now'
  if (mins < 60) return `In ${mins} min`
  const days = dayDiff(t, now)
  if (days === 0) return `${t.getHours() >= 17 ? 'Tonight' : 'Today'} ${clock(t)}`
  if (days === 1) return `Tomorrow ${clock(t)}`
  return `${weekdayFmt.format(t)} ${clock(t)}`
}

/** When a Hang happened: "Today 8:12 PM", "Yesterday 6:40 PM", "Fri 8:12 PM", "Nov 12" */
export function happenedLabel(iso, now = new Date()) {
  const t = new Date(iso)
  const days = dayDiff(now, t)
  if (days === 0) return `Today ${clock(t)}`
  if (days === 1) return `Yesterday ${clock(t)}`
  if (days < 7) return `${weekdayFmt.format(t)} ${clock(t)}`
  return dateFmt.format(t)
}

/** 45 -> "45 min", 90 -> "1 h 30", 120 -> "2 h" */
export function minutesLabel(minutes) {
  const m = Math.max(Math.round(minutes), 0)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`
}

/** 0.4 -> "24 min", 6 -> "6 h", 6.5 -> "6.5 h" */
export function hoursLabel(h) {
  if (h < 1) return `${Math.round(h * 60)} min`
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`
}

/** Value for <input type="datetime-local"> (local time, to the minute) */
export function toLocalInput(d) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Google Maps link for a spot */
export function mapsUrl({ lat, lng }) {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`
}
