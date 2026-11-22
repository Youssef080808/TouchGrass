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
# Within this of your home counts as being home: Hang time stops there and solo sessions can't start there.
HOME_RADIUS_M = _float("HOME_RADIUS_M", 100)
POINTS_TIME_SCALE = _float("POINTS_TIME_SCALE", 1)                # demo speed-up (60 = 1 s counts as 1 min)
DAILY_POINTS_CAP = _int("DAILY_POINTS_CAP", 300)
MIN_HANG_MINUTES = _float("MIN_HANG_MINUTES", 10)                 # shorter Hangs earn nothing (stops zone hopping)
# A Hang ends by itself after this long with nobody opening the app (stops forgotten Hangs).
NO_CHECKIN_END_HOURS = _float("NO_CHECKIN_END_HOURS", 3)
PLACE_RADIUS_M = _float("PLACE_RADIUS_M", 400)                    # "I'm here" at a place: must be this close to it
# Meet: open Hangs within this distance show up for you, and players with this many reports (from
# different people) can't post or join open Hangs any more.
OPEN_HANG_RADIUS_M = _float("OPEN_HANG_RADIUS_M", 5000)
REPORTS_TO_BLOCK = _int("REPORTS_TO_BLOCK", 3)
HEX_RESOLUTION = _int("HEX_RESOLUTION", 9)                        # H3 res 9 = hexes about 350 m across
TERRITORY_DECAY_PER_DAY = _float("TERRITORY_DECAY_PER_DAY", 0.9)  # territory points keep 90% per day

# Rallies, Team up, hot zones and the weekly recap (plans.py, hotzones.py, routers/rallies.py, routers/recap.py)
RALLY_REMINDER_MINUTES = _float("RALLY_REMINDER_MINUTES", 20)  # everyone who's in hears "starts in 20 min"
RALLY_EARLY_MINUTES = _float("RALLY_EARLY_MINUTES", 30)        # you can check in to a rally this long before it starts
TRUCE_DAYS = _float("TRUCE_DAYS", 7)                           # Team up: how long the two teams share the zone
HOT_ZONES_PER_DAY = _int("HOT_ZONES_PER_DAY", 2)
HOT_ZONE_PUSH_HOUR = _int("HOT_ZONE_PUSH_HOUR", 17)            # local hour of the daily "Hot zones tonight" push
RECAP_PUSH_HOUR = _int("RECAP_PUSH_HOUR", 18)                  # local hour of the Sunday "Your week offline" push

# Web Push notifications. Leave the keys empty and the server makes a pair once and keeps it in
# backend/vapid.json (git-ignored). Changing keys means everyone has to turn notifications on again.
VAPID_PUBLIC_KEY = os.getenv("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.getenv("VAPID_PRIVATE_KEY", "")
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT") or "mailto:turfed@example.com"  # who push services can contact

CORS_ORIGINS = [o.strip() for o in (os.getenv("CORS_ORIGINS") or "*").split(",") if o.strip()]

# Where the built front end lives (FastAPI serves it so the whole app is one URL).
STATIC_DIR = Path(os.getenv("STATIC_DIR") or (BACKEND_DIR.parent / "frontend" / "dist"))
