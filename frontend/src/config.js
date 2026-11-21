export const APP_NAME = 'TouchGrass'
export const TAGLINE = 'Phones down. Friends up. Claim your city.'

// '' means "same server": the Vite proxy in development, FastAPI serving the build in production.
// Set VITE_API_URL only if the front end and API are hosted on different domains.
export const API_URL = import.meta.env.VITE_API_URL || ''

export const DEFAULT_CENTER = { lat: 45.5048, lng: -73.5772 } // McGill, Montreal

export const TEAM_COLORS = ['#22c55e', '#3b82f6', '#f97316', '#a855f7', '#ef4444', '#eab308', '#06b6d4', '#ec4899']

// Map background. The default OpenStreetMap tiles show local (French) names in Montreal,
// so we use Esri's World Street Map, which labels places in English.
// Street names stay official (e.g. "Rue Sherbrooke") on any map.
export const MAP_TILES = {
  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
  attribution: 'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, OpenStreetMap contributors',
  maxZoom: 19,
}
