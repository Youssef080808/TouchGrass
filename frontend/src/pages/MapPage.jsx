import { Hexagon, LocateFixed } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Polygon, Popup, TileLayer } from 'react-leaflet'
import { api } from '../api'
import { TeamDot } from '../components/ui'
import { DEFAULT_CENTER, MAP_TILES, MAP_TILES_DARK } from '../config'
import { getPosition } from '../lib/location'
import { useTheme } from '../theme'
import { useUser } from '../user'

/** The city as a board game: each hexagon is coloured by the team that holds it. */
export default function MapPage() {
  const { user } = useUser()
  const { dark } = useTheme()
  const [hexes, setHexes] = useState([])
  const [me, setMe] = useState(null)

  useEffect(() => {
    api('/territory').then(setHexes).catch(() => {})
    getPosition().then(setMe).catch(() => {})
  }, [])

  const legend = useMemo(() => {
    const counts = new Map()
    for (const h of hexes) {
      if (!h.owner) continue
      const entry = counts.get(h.owner.id) ?? { ...h.owner, hexes: 0 }
      entry.hexes += 1
      counts.set(h.owner.id, entry)
    }
    return [...counts.values()].sort((a, b) => b.hexes - a.hexes)
  }, [hexes])

  const center = me ?? DEFAULT_CENTER
  const mine = legend.find((t) => t.id === user.team?.id)?.hexes ?? 0

  return (
    <div className="relative h-dvh">
      <MapContainer
        key={me ? 'me' : 'default'}
        center={[center.lat, center.lng]}
        zoom={14}
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
        {hexes.map((h) => {
          const color = h.owner?.color ?? '#94a3b8'
          const ours = h.owner && h.owner.id === user.team?.id
          return (
            <Polygon
              key={h.hex_id}
              positions={h.boundary}
              pathOptions={{
                color,
                weight: ours ? 3 : 1.5,
                fillColor: color,
                fillOpacity: h.owner ? 0.4 : 0.12,
                dashArray: h.contested ? '6 6' : null,
              }}
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
            {!legend.length && <span className="text-sm text-faint">No territory yet. Be the first!</span>}
          </div>
        </div>
      </div>
      {me && (
        <span className="pointer-events-none absolute right-4 z-[500] flex items-center gap-1.5 rounded-full bg-surface/95 px-3 py-1.5 text-xs font-semibold text-ink-soft shadow ring-1 ring-line" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 92px)' }}>
          <LocateFixed className="size-3.5 text-[#2563eb]" aria-hidden /> You
        </span>
      )}
    </div>
  )
}
