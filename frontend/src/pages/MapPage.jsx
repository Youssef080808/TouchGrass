import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Polygon, Popup, TileLayer } from 'react-leaflet'
import { api } from '../api'
import { TeamDot } from '../components/ui'
import { DEFAULT_CENTER, MAP_TILES } from '../config'
import { getPosition } from '../lib/location'
import { useUser } from '../user'

/** The city as a board game: each hexagon is coloured by the team that holds it. */
export default function MapPage() {
  const { user } = useUser()
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
        <TileLayer url={MAP_TILES.url} attribution={MAP_TILES.attribution} maxZoom={MAP_TILES.maxZoom} />
        {hexes.map((h) => {
          const color = h.owner?.color ?? '#94a3b8'
          const mine = h.owner && h.owner.id === user.team?.id
          return (
            <Polygon
              key={h.hex_id}
              positions={h.boundary}
              pathOptions={{
                color,
                weight: mine ? 3 : 1.5,
                fillColor: color,
                fillOpacity: h.owner ? 0.38 : 0.12,
                dashArray: h.contested ? '6 6' : null,
              }}
            >
              <Popup>
                <p className="m-0 font-semibold">{h.owner ? `${h.owner.name} hold this zone` : 'Nobody holds this zone'}</p>
                {h.contested && <p className="m-0 text-red-600">Contested! It could flip any time.</p>}
                <ul className="m-0 mt-2 list-none p-0">
                  {h.scores.map((s) => (
                    <li key={s.id} className="flex items-center gap-2">
                      <TeamDot color={s.color} className="size-2" /> {s.name}: {s.points} pts
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
            radius={8}
            pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }}
          />
        )}
      </MapContainer>

      <div className="pt-safe pointer-events-none absolute inset-x-0 top-0 z-[500] p-4">
        <div className="pointer-events-auto rounded-3xl bg-white/95 p-4 shadow-lg backdrop-blur">
          <h1 className="text-lg font-bold">Territory</h1>
          <p className="text-sm text-slate-500">Hang out somewhere to claim it for your team. Dashed = contested.</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            {legend.map((t) => (
              <span key={t.id} className={`flex items-center gap-1.5 text-sm ${t.id === user.team?.id ? 'font-bold' : ''}`}>
                <TeamDot color={t.color} /> {t.name} · {t.hexes}
              </span>
            ))}
            {!legend.length && <span className="text-sm text-slate-400">No territory yet. Be the first!</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
