"""Current weather from Open-Meteo (free, no API key). Failures return None, never crash the app."""
import httpx

URL = "https://api.open-meteo.com/v1/forecast"
PARAMS = "temperature_2m,precipitation,weather_code,wind_speed_10m"


def describe(code: int) -> str:
    # WMO weather codes
    if code == 0:
        return "Clear"
    if code in (1, 2):
        return "Partly cloudy"
    if code == 3:
        return "Cloudy"
    if code in (45, 48):
        return "Fog"
    if 51 <= code <= 57:
        return "Drizzle"
    if 61 <= code <= 67 or 80 <= code <= 82:
        return "Rain"
    if 71 <= code <= 77 or code in (85, 86):
        return "Snow"
    if code >= 95:
        return "Thunderstorm"
    return "Unknown"


def _parse(data: dict) -> dict:
    cur = data["current"]
    code = int(cur["weather_code"])
    temp = float(cur["temperature_2m"])
    label = describe(code)
    return {
        "temp_c": round(temp),
        "code": code,
        "label": label,
        "bad": code >= 51 or temp <= -5,   # rain, snow, storms or deep cold
        "outdoor_ok": code < 51 and temp > -10,
    }


def current_weather(lat: float, lng: float) -> dict | None:
    try:
        r = httpx.get(URL, params={"latitude": lat, "longitude": lng, "current": PARAMS}, timeout=3)
        r.raise_for_status()
        return _parse(r.json())
    except Exception:
        return None


async def current_weather_async(client: httpx.AsyncClient, lat: float, lng: float) -> dict | None:
    try:
        r = await client.get(URL, params={"latitude": lat, "longitude": lng, "current": PARAMS}, timeout=3)
        r.raise_for_status()
        return _parse(r.json())
    except Exception:
        return None
