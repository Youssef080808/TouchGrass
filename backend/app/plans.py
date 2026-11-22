"""Plans: rallies (Hangs planned for later) and the truces that Team up creates. Endpoints: routers/rallies.py.

A rally goes planned -> live (the first person arrived and the real Hang started) -> done (that Hang ended).
It can also be cancelled by its host, or expire if nobody came within EXPIRE_AFTER of the start.

Team up is a rally that also invites the rival team that just took your zone. If both teams show up and earn
points in the joint Hang, they share the zone for TRUCE_DAYS: it counts for both teams (map and leaderboard),
it isn't contested between them, and they don't get Friend or Foe alerts about each other there.
"""
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import jobs, notify
from .config import RALLY_REMINDER_MINUTES, TRUCE_DAYS
from .db import SessionLocal
from .models import Hang, Notification, Rally, Truce, User
from .timeutil import utcnow

EXPIRE_AFTER = timedelta(hours=2)  # a rally nobody showed up to goes away 2 h after its start time
OPEN_STATUSES = ("planned", "live")


def clock(dt: datetime) -> str:
    """'8:00 PM', in the city's time."""
    return jobs.to_local(dt).strftime("%I:%M %p").lstrip("0")


def when_label(starts_at: datetime, now: datetime | None = None) -> str:
    """'now', 'at 3:00 PM', 'tonight at 8:00 PM', 'tomorrow at 7:00 PM', 'Sat at 2:00 PM' (city time)."""
    now = now or utcnow()
    if starts_at <= now + timedelta(minutes=5):
        return "now"
    start, today = jobs.to_local(starts_at), jobs.to_local(now).date()
    if start.date() == today:
        return f"tonight at {clock(starts_at)}" if start.hour >= 17 else f"at {clock(starts_at)}"
    if start.date() == today + timedelta(days=1):
        return f"tomorrow at {clock(starts_at)}"
    return f"{start.strftime('%a')} at {clock(starts_at)}"


def what(rally: Rally) -> str:
    return rally.activity or "Hang"


def going_ids(rally: Rally) -> list[int]:
    return [r.user_id for r in rally.rsvps if r.going]


def from_your_side(rally: Rally, user: User) -> bool:
    """You host it, or it's for your team (or invites your team)."""
    return rally.host_id == user.id or (user.team_id is not None and user.team_id in (rally.team_id, rally.invite_team_id))


def involves(rally: Rally, user: User) -> bool:
    """The rally is for you: it's from your side, or you answered it."""
    return from_your_side(rally, user) or any(r.user_id == user.id for r in rally.rsvps)


def can_see(rally: Rally, user: User) -> bool:
    return rally.visibility == "open" or involves(rally, user)


def audience_ids(db: Session, rally: Rally) -> set[int]:
    """Who hears about a rally: the host's team, plus the invited team for Team up."""
    team_ids = [t for t in (rally.team_id, rally.invite_team_id) if t]
    ids = set(db.scalars(select(User.id).where(User.team_id.in_(team_ids)))) if team_ids else set()
    return ids | {rally.host_id}


def sync(rally: Rally) -> bool:
    """Bring a rally's status up to date: its Hang ended, or nobody came. Returns True if it changed.
    The caller commits."""
    if rally.status == "live" and rally.hang is not None and rally.hang.status == "ended":
        rally.status = "done"
        return True
    if rally.status == "planned" and utcnow() > rally.starts_at + EXPIRE_AFTER:
        rally.status = "expired"
        return True
    return False


def run_jobs() -> int:
    """Run from main.py every 30 s: tidy up old rallies, and remind everyone who's in RALLY_REMINDER_MINUTES before
    a rally starts. Returns how many reminders went out."""
    now = utcnow()
    sent = 0
    with SessionLocal() as db:
        for rally in db.scalars(select(Rally).where(Rally.status.in_(OPEN_STATUSES))).all():
            sync(rally)
            due = rally.starts_at - timedelta(minutes=RALLY_REMINDER_MINUTES) <= now
            if rally.status != "planned" or rally.reminder_sent_at is not None or not due:
                continue
            rally.reminder_sent_at = now
            db.commit()
            minutes = max(round((rally.starts_at - now).total_seconds() / 60), 0)
            title = f"Rally in {minutes} min" if minutes >= 2 else "Rally starting now"
            notify.send(going_ids(rally), title,
                        f"{what(rally)} at {rally.place_name}. Open Turfed when you get there and you're checked in.",
                        "/")
            sent += 1
        db.commit()
    return sent


def after_hang_finished(db: Session, hang: Hang) -> None:
    """Called from hangs._finish_hang after scoring, before Friend or Foe alerts. Marks the hang's rally done and,
    for Team up, starts a truce if both teams really showed up (someone from each earned points).
    The caller commits."""
    rally = db.scalar(select(Rally).where(Rally.hang_id == hang.id))
    if rally is None:
        return
    rally.status = "done"
    if rally.kind != "team_up" or rally.team is None or rally.invite_team is None:
        return
    teams_there = {m.user.team_id for m in hang.members if (m.points_earned or 0) > 0}
    if not {rally.team_id, rally.invite_team_id} <= teams_there:
        return
    now = utcnow()
    db.add(Truce(hex_id=hang.hex_id, team_a_id=rally.team_id, team_b_id=rally.invite_team_id, hang_id=hang.id,
                 place_name=rally.place_name, created_at=now, ends_at=now + timedelta(days=TRUCE_DAYS)))
    message = (f"Truce! {rally.team.name} and {rally.invite_team.name} now share {rally.place_name} "
               f"for {TRUCE_DAYS:g} days. It counts for both teams.")
    everyone = audience_ids(db, rally)
    for user_id in everyone:
        db.add(Notification(user_id=user_id, kind="truce", hex_id=hang.hex_id, message=message))
    db.flush()
    # Everyone on both teams sees it on Home. People who weren't at the Hang also get a push (the ones who were
    # just got "Hang over" and are looking at their results).
    notify.send(everyone - {m.user_id for m in hang.members}, "Truce!", message, "/map")
