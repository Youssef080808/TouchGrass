"""All settings in one place. Values come from environment variables (or backend/.env)."""
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")


def _float(name: str, default: float) -> float:
    return float(os.getenv(name) or default)


def _int(name: str, default: int) -> int:
    return int(os.getenv(name) or default)


# Empty DATABASE_URL -> local SQLite file, so the app runs with zero setup.
DATABASE_URL = os.getenv("DATABASE_URL") or f"sqlite:///{BACKEND_DIR / 'touchgrass.db'}"
GOOGLE_PLACES_API_KEY = os.getenv("GOOGLE_PLACES_API_KEY", "")
TIMEZONE = os.getenv("TIMEZONE") or "America/Montreal"

# Game rules
JOIN_RADIUS_M = _float("JOIN_RADIUS_M", 100)                      # must be this close to the host to join
SOLO_MIN_DISTANCE_FROM_HOME_M = _float("SOLO_MIN_DISTANCE_FROM_HOME_M", 300)
POINTS_TIME_SCALE = _float("POINTS_TIME_SCALE", 1)                # demo speed-up (60 = 1 s counts as 1 min)
DAILY_POINTS_CAP = _int("DAILY_POINTS_CAP", 300)
HEX_RESOLUTION = _int("HEX_RESOLUTION", 9)                        # H3 res 9 = hexes about 350 m across
TERRITORY_DECAY_PER_DAY = _float("TERRITORY_DECAY_PER_DAY", 0.9)  # territory points keep 90% per day

CORS_ORIGINS = [o.strip() for o in (os.getenv("CORS_ORIGINS") or "*").split(",") if o.strip()]

# Where the built front end lives (FastAPI serves it so the whole app is one URL).
STATIC_DIR = Path(os.getenv("STATIC_DIR") or (BACKEND_DIR.parent / "frontend" / "dist"))
