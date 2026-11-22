"""Hot zones: every day a couple of zones are worth double points (points.HOT_ZONE_MULTIPLIER).

They pull people to the same spots, where they meet each other, and they stir up rivalries:
- one contested zone if there is one (the closest fight on the map), and
- outdoor places (parks first) where people have played lately or from the sample city places, then busy places.
They're picked once per day (the city's local date) and stored, so everyone sees the same ones all day.
At HOT_ZONE_PUSH_HOUR everyone with notifications on hears about tonight's hot zones (once a day).
"""
import logging
import random
from datetime import date, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import jobs, notify, territory
from .config import HOT_ZONE_PUSH_HOUR, HOT_ZONES_PER_DAY
from .db import SessionLocal
from .geo import distance_m, hex_center, hex_for
from .models import Hang, HotZone, PushSubscription
from .places import OUTDOOR_TYPES, SAMPLE_PLACES
from .timeutil import local_day_start_utc, local_today, utcnow

log = logging.getLogger("uvicorn.error")

RECENT_DAYS = 14     # places people played in the last two weeks are candidates
NAME_RADIUS_M = 300  # a contested zone borrows the name of a known place this close to its centre


def local_date(dt: datetime) -> date:
    """The city's local date of a stored (UTC) time, e.g. the day a Hang started."""
    return jobs.to_local(dt).date()


def ends_at(day: date) -> datetime:
    """Hot zones last until midnight, local time (returned in UTC like every stored time)."""
    return local_day_start_utc(day + timedelta(days=1))


def _known_places(db: Session) -> list[dict]:
    since = utcnow() - timedelta(days=RECENT_DAYS)
    rows = db.execute(select(Hang.place_name, Hang.place_type, Hang.lat, Hang.lng)
                      .where(Hang.place_name.is_not(None), Hang.started_at >= since)
                      .order_by(Hang.started_at.desc())).all()
    played = [{"name": n, "type": t, "lat": la, "lng": ln} for n, t, la, ln in rows]
    return played + SAMPLE_PLACES


def _name_near(hex_id: str, places: list[dict]) -> str | None:
    lat, lng = hex_center(hex_id)
    near = [(distance_m(lat, lng, p["lat"], p["lng"]), p["name"]) for p in places]
    best = min(near, default=None)
    return best[1] if best and best[0] <= NAME_RADIUS_M else None


def _pick(db: Session, day: date) -> list[dict]:
    """The day's hot zones. Seeded by the date, so the choice doesn't depend on who asks first."""
    rng = random.Random(day.isoformat())
    places = _known_places(db)
    picks: list[dict] = []

    contested = sorted(hex_id for hex_id, scores in territory.standings(db).items()
                       if territory.owner_from(scores)[1])
    if contested:
        hex_id = rng.choice(contested)
        lat, lng = hex_center(hex_id)
        picks.append({"hex_id": hex_id, "place_name": _name_near(hex_id, places) or "Contested zone",
                      "lat": lat, "lng": lng, "reason": "contested"})

    by_hex: dict[str, dict] = {}
    for p in places:
        by_hex.setdefault(hex_for(p["lat"], p["lng"]), p)
    outdoor = sorted(h for h, p in by_hex.items() if p.get("type") in OUTDOOR_TYPES)
    others = sorted(h for h in by_hex if h not in outdoor)
    rng.shuffle(outdoor)
    rng.shuffle(others)
    for hex_id in outdoor + others:
        if len(picks) >= HOT_ZONES_PER_DAY:
            break
        if any(z["hex_id"] == hex_id for z in picks):
            continue
        p = by_hex[hex_id]
        picks.append({"hex_id": hex_id, "place_name": p["name"], "lat": p["lat"], "lng": p["lng"],
                      "reason": "outdoors" if p.get("type") in OUTDOOR_TYPES else "popular"})
    return picks[:HOT_ZONES_PER_DAY]


def zones_for_day(db: Session, day: date) -> list[HotZone]:
    """The hot zones of a day. Today's are picked (and saved) the first time anyone asks."""
    rows = db.scalars(select(HotZone).where(HotZone.day == day).order_by(HotZone.id)).all()
    if rows or day != local_today():
        return list(rows)
    for z in _pick(db, day):
        db.add(HotZone(day=day, hex_id=z["hex_id"], place_name=z["place_name"][:120],
                       lat=z["lat"], lng=z["lng"], reason=z["reason"]))
    try:
        db.commit()
    except IntegrityError:  # another request picked them at the same moment: use theirs
        db.rollback()
    return list(db.scalars(select(HotZone).where(HotZone.day == day).order_by(HotZone.id)))


def todays(db: Session) -> list[HotZone]:
    return zones_for_day(db, local_today())


def is_hot(hex_id: str, day: date) -> bool:
    """Was this hex a hot zone on that day? Uses its own database session, so scoring a Hang never commits
    halfway through. Never raises: if anything goes wrong it's just not hot."""
    try:
        with SessionLocal() as db:
            return any(z.hex_id == hex_id for z in zones_for_day(db, day))
    except Exception:
        log.exception("Couldn't check hot zones")
        return False


def send_daily_push() -> bool:
    """Run from main.py every 30 s: picks today's hot zones early, and from HOT_ZONE_PUSH_HOUR (local time) tells
    everyone with notifications on about them, once a day."""
    now = jobs.local_now()
    with SessionLocal() as db:
        zones = zones_for_day(db, now.date())
        if now.hour < HOT_ZONE_PUSH_HOUR or not zones:
            return False
        if not jobs.claim(db, "hot_zones_push", now.date().isoformat()):
            return False
        users = set(db.scalars(select(PushSubscription.user_id)))
    names = [z.place_name for z in zones]
    where = names[0] if len(names) == 1 else f"{', '.join(names[:-1])} and {names[-1]}"
    notify.send(users, "Hot zones tonight", f"Double points at {where} until midnight.", "/map")
    return True
