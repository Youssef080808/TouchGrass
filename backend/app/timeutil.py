"""Times are stored in UTC without a timezone (works the same on SQLite and Postgres)."""
from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo

from .config import TIMEZONE


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def local_today() -> date:
    """'Today' for streaks and the daily cap, in the city's own timezone."""
    return datetime.now(ZoneInfo(TIMEZONE)).date()


def local_day_start_utc(day: date) -> datetime:
    start = datetime.combine(day, time.min, tzinfo=ZoneInfo(TIMEZONE))
    return start.astimezone(timezone.utc).replace(tzinfo=None)


def iso(dt: datetime | None) -> str | None:
    return dt.isoformat() + "Z" if dt else None
