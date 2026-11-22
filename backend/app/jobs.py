"""Helpers for background jobs that must happen once (the daily hot-zone push, the Sunday recap)."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import TIMEZONE
from .models import JobRun


def claim(db: Session, name: str, key: str) -> bool:
    """True the first time a job claims (name, key), e.g. ("hot_zones_push", "2026-11-21"); False after that.
    Works across restarts and if two copies of the server run at once (the database keeps (name, key) unique)."""
    db.add(JobRun(name=name, key=key))
    try:
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        return False


def local_now() -> datetime:
    """Now, in the city's own timezone."""
    return datetime.now(ZoneInfo(TIMEZONE))


def to_local(dt: datetime) -> datetime:
    """A stored time (UTC, no timezone) in the city's own timezone."""
    return dt.replace(tzinfo=timezone.utc).astimezone(ZoneInfo(TIMEZONE))
