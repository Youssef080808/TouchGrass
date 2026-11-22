import { LocateFixed, MapPin } from 'lucide-react'
import { useRef } from 'react'
import { AttributionControl, MapContainer, Polygon, TileLayer, useMapEvents } from 'react-leaflet'
import { MAP_TILES, MAP_TILES_DARK } from '../config'
import { useTheme } from '../theme'

const HOT = '#ff3d00'
const NOBODY = '#94a3b8'

/** Is the point inside the polygon? boundary = [[lat, lng], ...] (ray casting) */
export function inside(point, boundary) {
  let hit = false
  for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i++) {
    const [yi, xi] = boundary[i]
    const [yj, xj] = boundary[j]
    if (yi > point.lat !== yj > point.lat && point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

function Follow({ onMove }) {
  const map = useMapEvents({
    moveend: () => {
      const c = map.getCenter()
      onMove({ lat: c.lat, lng: c.lng })
    },
    click: (e) => map.panTo(e.latlng),
  })
  return null
}

/**
 * A small map with a pin fixed in the middle: drag the map (or tap a spot) to move the pin.
 * Shows team zones and today's hot zones so you can see whose turf you're picking.
 */
export default function MapPicker({ start, me, zones = [], hotZones = [], onMove }) {
  const { dark } = useTheme()
  const mapRef = useRef(null)

  return (
    <div className="map-picker relative isolate h-60 overflow-hidden rounded-2xl ring-1 ring-line">
      <MapContainer
        ref={mapRef}
        center={[start.lat, start.lng]}
        zoom={16}
        zoomControl={false}
        attributionControl={false}
        className="h-full w-full"
        style={{ height: '100%', width: '100%' }}
      >
        {dark ? (
          <>
            <TileLayer url={MAP_TILES_DARK.url} attribution={MAP_TILES_DARK.attribution}
              maxNativeZoom={MAP_TILES_DARK.maxNativeZoom} maxZoom={MAP_TILES_DARK.maxZoom} />
            <TileLayer url={MAP_TILES_DARK.labelsUrl}
              maxNativeZoom={MAP_TILES_DARK.maxNativeZoom} maxZoom={MAP_TILES_DARK.maxZoom} />
          </>
        ) : (
          <TileLayer url={MAP_TILES.url} attribution={MAP_TILES.attribution} maxZoom={MAP_TILES.maxZoom} />
        )}
        {zones.map((h) => (
          <Polygon
            key={h.hex_id}
            positions={h.boundary}
            interactive={false}
            pathOptions={{ color: h.owner?.color ?? NOBODY, weight: 1.5, fillOpacity: 0.25 }}
          />
        ))}
        {hotZones.map((z) => (
          <Polygon
            key={`hot-${z.hex_id}`}
            positions={z.boundary}
            interactive={false}
            pathOptions={{ color: HOT, weight: 3, dashArray: '6 6', fillOpacity: 0 }}
          />
        ))}
        <AttributionControl position="bottomleft" prefix={false} />
        <Follow onMove={onMove} />
      </MapContainer>

      {/* The pin: its tip marks the middle of the map */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-[500] -translate-x-1/2 translate-y-[calc(-100%+3px)]" aria-hidden>
        <MapPin className="size-10 fill-brand text-white drop-shadow-md dark:fill-lime dark:text-ink" strokeWidth={1.75} />
      </div>
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-[500] size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/30" aria-hidden />

      {me && (
        <button
          type="button"
          aria-label="Move the pin to where I am"
          onClick={() => mapRef.current?.setView([me.lat, me.lng], Math.max(mapRef.current.getZoom(), 16))}
          className="absolute right-3 top-3 z-[500] flex size-10 items-center justify-center rounded-full bg-surface text-ink shadow-md ring-1 ring-line active:bg-chip"
        >
          <LocateFixed className="size-5" aria-hidden />
        </button>
      )}
    </div>
  )
}
