import { Flag, Hexagon, LocateFixed, Shield, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Polygon, Popup, TileLayer } from 'react-leaflet'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { LogoMark } from '../components/Logo'
import { Button, TeamDot } from '../components/ui'
import { DEFAULT_CENTER, MAP_TILES, MAP_TILES_DARK } from '../config'
import { BUZZ, haptic } from '../lib/haptics'
import { getPosition } from '../lib/location'
import { useTheme } from '../theme'
import { useUser } from '../user'

/** The city as a board game: each hexagon is coloured by the team that holds it. */
const NOBODY = '#94a3b8'
const FLIP_AT_MS = 1150 // middle of the flip animation in index.css (0.7 s delay + half of 0.9 s)

function centerOf(boundary) {
  const n = boundary.length
  return {
    lat: boundary.reduce((sum, [lat]) => sum + lat, 0) / n,
    lng: boundary.reduce((sum, [, lng]) => sum + lng, 0) / n,
  }
}

export default function MapPage() {
  const { user } = useUser()
  const { dark } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const [hexes, setHexes] = useState(null)
  const [me, setMe] = useState(null)
  // Arriving from a Hang's results: show what happened to its zone (once, not again on reload)
  const [capture] = useState(() => location.state?.capture ?? null)
  const [bannerOpen, setBannerOpen] = useState(true)

  useEffect(() => {
    api('/territory').then(setHexes).catch(() => setHexes([]))
    getPosition().then(setMe).catch(() => {})
  }, [])

  useEffect(() => {
    if (location.state?.capture) navigate(location.pathname, { replace: true, state: null })
  }, [location.state, location.pathname, navigate])

  const target = capture && hexes?.find((h) => h.hex_id === capture.hex)

  // Buzz as the hexagon flips to your colour
  useEffect(() => {
    if (!target || !capture.flipped || !capture.mine) return undefined
    const t = setTimeout(() => haptic(BUZZ.capture), FLIP_AT_MS)
    return () => clearTimeout(t)
  }, [target, capture])

  const legend = useMemo(() => {
    const counts = new Map()
    for (const h of hexes ?? []) {
      if (!h.owner) continue
      const entry = counts.get(h.owner.id) ?? { ...h.owner, hexes: 0 }
      entry.hexes += 1
      counts.set(h.owner.id, entry)
    }
    return [...counts.values()].sort((a, b) => b.hexes - a.hexes)
  }, [hexes])

  const center = target ? centerOf(target.boundary) : me ?? DEFAULT_CENTER
  const mine = legend.find((t) => t.id === user.team?.id)?.hexes ?? 0
  const empty = hexes !== null && hexes.length === 0

  return (
    <div
      className="relative h-dvh"
      style={capture ? { '--cap-from': capture.from ?? NOBODY, '--cap-to': capture.to } : undefined}
    >
      <MapContainer
        key={target ? 'capture' : me ? 'me' : 'default'}
        center={[center.lat, center.lng]}
        zoom={target ? 16 : 14}
        zoomControl={false}
        className="absolute inset-0 z-0"
        style={{ height: '100%', width: '100%' }}
      >
        {dark ? (
          <>
            <TileLayer key="dark" url={MAP_TILES_DARK.url} attribution={MAP_TILES_DARK.attribution}
              maxNativeZoom={MAP_TILES_DARK.maxNativeZoom} maxZoom={MAP_TILES_DARK.maxZoom} />
            <TileLayer key="dark-labels" url={MAP_TILES_DARK.labelsUrl}
              maxNativeZoom={MAP_TILES_DARK.maxNativeZoom} maxZoom={MAP_TILES_DARK.maxZoom} />
          </>
        ) : (
          <TileLayer key="light" url={MAP_TILES.url} attribution={MAP_TILES.attribution} maxZoom={MAP_TILES.maxZoom} />
        )}
        {(hexes ?? []).map((h) => {
          const color = h.owner?.color ?? NOBODY
          const ours = h.owner && h.owner.id === user.team?.id
          const isTarget = h === target
          return (
            <Polygon
              key={h.hex_id}
              positions={h.boundary}
              pathOptions={{
                color,
                weight: ours || isTarget ? 3 : 1.5,
                fillColor: color,
                fillOpacity: h.owner ? (isTarget ? 0.55 : 0.4) : 0.12,
                dashArray: h.contested ? '6 6' : null,
              }}
              // A direct prop (not in pathOptions): Leaflet only reads className when the shape is first drawn
              className={isTarget ? (capture.flipped ? 'hex-capture' : 'hex-highlight') : undefined}
            >
              <Popup>
                <p className="m-0 font-display text-lg font-bold leading-tight">
                  {h.owner ? `${h.owner.name} hold this zone` : 'Nobody holds this zone'}
                </p>
                {h.contested && <p className="m-0 mt-1 font-semibold text-danger">Contested! It could flip any time.</p>}
                <ul className="m-0 mt-2 list-none space-y-1 p-0">
                  {h.scores.map((s) => (
                    <li key={s.id} className="flex items-center gap-2">
                      <TeamDot color={s.color} className="size-2.5" /> {s.name}: <b>{s.points}</b> pts
                    </li>
                  ))}
                </ul>
              </Popup>
            </Polygon>
          )
        })}
        {me && (
          <CircleMarker
            center={[me.lat, me.lng]}
            radius={9}
            pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }}
          />
        )}
      </MapContainer>

      <div className="pt-safe pointer-events-none absolute inset-x-0 top-0 z-[500] p-4">
        <div className="pointer-events-auto rounded-3xl bg-surface/95 p-4 shadow-xl shadow-black/10 ring-1 ring-line backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-display text-[30px] font-extrabold uppercase leading-none">Territory</h1>
              <p className="mt-1 text-sm text-muted">Hang out somewhere to claim it. Dashed = contested.</p>
            </div>
            {user.team && (
              <span className="flex shrink-0 items-center gap-1.5 rounded-2xl bg-lime px-3 py-2 font-display text-lg font-bold leading-none text-on-accent">
                <Hexagon className="size-5" aria-hidden /> {mine}
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {legend.map((t) => (
              <span
                key={t.id}
                className={`flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold ${
                  t.id === user.team?.id ? 'bg-chip ring-2 ring-brand-ink' : 'bg-chip'
                }`}
              >
                <TeamDot color={t.color} className="size-2.5" /> {t.name} · {t.hexes}
              </span>
            ))}
            {hexes === null && <span className="h-8 w-40 animate-pulse rounded-full bg-chip" aria-label="Loading" />}
            {!legend.length && hexes?.length > 0 && <span className="text-sm text-faint">Nobody holds a zone right now.</span>}
          </div>
        </div>
      </div>
      {target && bannerOpen && (
        <div
          role="status"
          className={`absolute inset-x-4 z-[500] flex items-center gap-3 rounded-3xl p-3 pr-2 shadow-xl motion-safe:animate-rise ${
            capture.mine ? 'bg-lime text-on-accent shadow-lime/25' : 'bg-surface text-ink ring-1 ring-line'
          }`}
          style={{ bottom: 'calc(env(safe-area-inset-bottom) + 92px)', animationDelay: '1.2s' }}
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#0b1d3a] text-lime">
            {capture.flipped ? <Flag className="size-5" aria-hidden /> : capture.mine ? <Shield className="size-5" aria-hidden /> : <Hexagon className="size-5" aria-hidden />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[22px] font-bold uppercase leading-none">{capture.title}</p>
            <p className="mt-0.5 truncate text-sm">{capture.text}</p>
          </div>
          <button
            aria-label="Close"
            onClick={() => setBannerOpen(false)}
            className="flex size-11 shrink-0 items-center justify-center rounded-full active:bg-black/10"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
      )}
      {empty && (
        <div className="absolute inset-x-6 top-1/2 z-[500] -translate-y-1/3 rounded-3xl bg-surface/95 p-5 text-center shadow-xl ring-1 ring-line backdrop-blur motion-safe:animate-rise">
          <LogoMark size={56} className="mx-auto" />
          <p className="mt-3 font-display text-[26px] font-extrabold uppercase leading-none">No turf yet</p>
          <p className="mt-1.5 text-[15px] text-muted">Every Hang claims the zone you're in. Start one and put your team on the map.</p>
          <Button variant="lime" className="mt-4 w-full" onClick={() => navigate('/')}>
            Start a Hang
          </Button>
        </div>
      )}
      {me && !(target && bannerOpen) && (
        <span className="pointer-events-none absolute right-4 z-[500] flex items-center gap-1.5 rounded-full bg-surface/95 px-3 py-1.5 text-xs font-semibold text-ink-soft shadow ring-1 ring-line" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 92px)' }}>
          <LocateFixed className="size-3.5 text-[#2563eb]" aria-hidden /> You
        </span>
      )}
    </div>
  )
}
