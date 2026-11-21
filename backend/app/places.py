"""Place suggestions: Google Places API (New) when a key is set, otherwise sample Montreal places.

Each place gets a simple score you can explain in one sentence:
  2 x interest match + closeness + rating + weather fit
"""
import logging

import httpx

from .config import GOOGLE_PLACES_API_KEY
from .geo import distance_m
from .points import ACTIVE_PLACE_TYPES

log = logging.getLogger("places")

INTERESTS = [
    "Basketball", "Soccer", "Running", "Climbing", "Gym", "Tennis", "Hiking", "Board games",
    "Coffee", "Reading", "Art", "Music", "Movies", "Food", "Photography", "Bowling",
]

# Which kinds of Google place fit each interest (Places API "Table A" types).
INTEREST_TYPES = {
    "Basketball": ["park"], "Soccer": ["park"], "Running": ["park"], "Hiking": ["park"],
    "Tennis": ["park"], "Climbing": ["gym"], "Gym": ["gym"], "Board games": ["cafe"],
    "Coffee": ["cafe"], "Reading": ["library", "book_store"], "Art": ["art_gallery", "museum"],
    "Music": ["night_club", "cafe"], "Movies": ["movie_theater"], "Food": ["restaurant"],
    "Photography": ["park", "tourist_attraction"], "Bowling": ["bowling_alley"],
}
DEFAULT_TYPES = ["park", "cafe", "library", "museum"]
OUTDOOR_TYPES = {"park", "hiking_area", "tourist_attraction", "playground", "athletic_field"}

# Sample data used when there is no Google key. Real Montreal places, approximate coordinates.
SAMPLE_PLACES = [
    {"name": "Mount Royal Park", "type": "park", "lat": 45.5036, "lng": -73.5874},
    {"name": "Jeanne-Mance Park", "type": "park", "lat": 45.5155, "lng": -73.5862},
    {"name": "La Fontaine Park", "type": "park", "lat": 45.5268, "lng": -73.5697},
    {"name": "Jarry Park", "type": "park", "lat": 45.5340, "lng": -73.6280},
    {"name": "Lachine Canal", "type": "park", "lat": 45.4840, "lng": -73.5770},
    {"name": "Old Port of Montreal", "type": "tourist_attraction", "lat": 45.5075, "lng": -73.5536},
    {"name": "Grande Bibliothèque (main library)", "type": "library", "lat": 45.5154, "lng": -73.5620},
    {"name": "Montreal Museum of Fine Arts", "type": "museum", "lat": 45.4986, "lng": -73.5794},
    {"name": "McGill Fitness Centre", "type": "gym", "lat": 45.5079, "lng": -73.5803},
    {"name": "Cafe Olimpico", "type": "cafe", "lat": 45.5236, "lng": -73.6010},
]


def types_for(interests: list[str]) -> list[str]:
    types: list[str] = []
    for interest in interests:
        for t in INTEREST_TYPES.get(interest, []):
            if t not in types:
                types.append(t)
    return types or DEFAULT_TYPES


async def google_nearby(client: httpx.AsyncClient, lat: float, lng: float, types: list[str]) -> list[dict] | None:
    if not GOOGLE_PLACES_API_KEY:
        return None
    body = {
        "includedTypes": types[:10],
        "maxResultCount": 15,
        "locationRestriction": {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": 2500.0}},
    }
    headers = {
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": "places.displayName,places.location,places.rating,places.primaryType,"
                            "places.types,places.googleMapsUri",
    }
    try:
        r = await client.post("https://places.googleapis.com/v1/places:searchNearby",
                              json=body, headers=headers, timeout=5)
        if r.status_code != 200:
            log.warning("Places API error %s: %s", r.status_code, r.text[:300])
            return None
        places = []
        for p in r.json().get("places", []):
            ptype = p.get("primaryType") or next(iter(p.get("types") or []), "place")
            places.append({
                "name": p["displayName"]["text"],
                "type": ptype,
                "lat": p["location"]["latitude"],
                "lng": p["location"]["longitude"],
                "rating": p.get("rating"),
                "maps_url": p.get("googleMapsUri"),
            })
        return places
    except Exception as exc:  # network down, bad key, etc.
        log.warning("Places API failed: %s", exc)
        return None


def rank(places: list[dict], lat: float, lng: float, interests: list[str], weather: dict | None) -> list[dict]:
    wanted = set(types_for(interests))
    bad_weather = bool(weather and weather.get("bad"))
    ranked = []
    for p in places:
        d = distance_m(lat, lng, p["lat"], p["lng"])
        matches = [i for i in interests if p["type"] in INTEREST_TYPES.get(i, [])]
        outdoor = p["type"] in OUTDOOR_TYPES
        score = 2.0 * (1 if p["type"] in wanted else 0)
        score += 1 - min(d / 3000, 1)                       # closer is better
        if p.get("rating"):
            score += (p["rating"] - 3) / 2                  # 3 stars = 0, 5 stars = +1
        if bad_weather:
            score += -1 if outdoor else 0.5                 # rain or snow: prefer indoor places
        reason = []
        if matches:
            reason.append(f"You like {matches[0]}")
        reason.append(f"{d / 1000:.1f} km away" if d >= 1000 else f"{d:.0f} m away")
        if p.get("rating"):
            reason.append(f"rated {p['rating']:.1f}")
        if bad_weather and not outdoor:
            reason.append("indoors")
        ranked.append({
            **p,
            "distance_m": round(d),
            "score": round(score, 2),
            "active": p["type"] in ACTIVE_PLACE_TYPES,
            "reason": " · ".join(reason),
            "maps_url": p.get("maps_url")
            or f"https://www.google.com/maps/search/?api=1&query={p['lat']},{p['lng']}",
        })
    ranked.sort(key=lambda p: p["score"], reverse=True)
    return ranked
