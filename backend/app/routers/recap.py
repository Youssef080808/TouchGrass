"""Your Hangs and your week: a history of past Hangs, a weekly recap ("6 h with friends, 3 new people, 2 zones"),
and the same recap as a notification on Sunday evenings (run_weekly_push, called from main.py).

Weeks run Monday to Sunday in the city's time. Hours are game hours (POINTS_TIME_SCALE), like points and
"Your people", so the demo speed-up shows here too.
"""
from collections import Counter
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import jobs, notify, territory
from ..auth import current_user
from ..config import POINTS_TIME_SCALE, RECAP_PUSH_HOUR
from ..db import SessionLocal, get_db
from ..models import Hang, HangMember, PushSubscription, User
from ..timeutil import iso, local_day_start_utc, local_today, utcnow

router = APIRouter(tags=["recap"])


def _minutes(m: HangMember, hang: Hang) -> float:
    """Game minutes you were there: the scored minutes once the Hang is over, else time so far."""
    if m.breakdown and "minutes" in m.breakdown:
        return float(m.breakdown["minutes"])
    stop = m.left_at or hang.ended_at or utcnow()
    return max((stop - m.joined_at).total_seconds(), 0) * POINTS_TIME_SCALE / 60


def _others(m: HangMember, hang: Hang) -> list[HangMember]:
    return [o for o in hang.members if o.user_id != m.user_id and o.left_reason != "removed"]


def week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())  # Monday


def recap_for(db: Session, user: User, monday: date) -> dict:
    """What you did in the week that starts on `monday` (local time)."""
    start, end = local_day_start_utc(monday), local_day_start_utc(monday + timedelta(days=7))
    rows = [m for m in db.scalars(select(HangMember).join(Hang).where(
        HangMember.user_id == user.id, Hang.started_at >= start, Hang.started_at < end)).all()
        if m.left_reason != "removed"]
    together = out = phones_down = 0.0
    people: set[int] = set()
    new_people: set[str] = set()
    hexes: set[str] = set()
    places: Counter = Counter()
    points = 0
    for m in rows:
        hang = m.hang
        minutes = _minutes(m, hang)
        others = _others(m, hang)
        out += minutes
        if others:
            together += minutes
        phones_down += (m.phones_down_seconds or 0) * POINTS_TIME_SCALE / 60
        people.update(o.user_id for o in others)
        new_people.update((m.breakdown or {}).get("new_people_names") or [])
        points += m.points_earned or 0
        hexes.add(hang.hex_id)
        if hang.place_name:
            places[hang.place_name] += 1
    zones = 0
    if user.team_id and hexes:
        truces = territory.active_truces(db, list(hexes))
        for hex_id, scores in territory.standings(db, list(hexes)).items():
            owner_id, _ = territory.owner_from(scores)
            if owner_id == user.team_id or territory.ally_of(truces.get(hex_id), owner_id) == user.team_id:
                zones += 1
    return {
        "week_start": monday.isoformat(),
        "hangs": len(rows),
        "hours_together": round(together / 60, 1),
        "hours_out": round(out / 60, 1),
        "phones_down_hours": round(phones_down / 60, 1),
        "people": len(people),
        "new_people": len(new_people),
        "zones": zones,
        "points": points,
        "top_place": places.most_common(1)[0][0] if places else None,
    }


def _hours(h: float) -> str:
    if h < 1:
        return f"{max(round(h * 60), 1)} min"
    return f"{h:g} h"


def recap_line(r: dict) -> str | None:
    """'6 h with friends, 3 new people, 2 zones. 2 h more than last week.' (None if nothing happened)"""
    if not r["hangs"]:
        return None
    parts = [f"{_hours(r['hours_together'])} with friends" if r["hours_together"] else f"{_hours(r['hours_out'])} outside"]
    if r["new_people"]:
        parts.append(f"{r['new_people']} new {'person' if r['new_people'] == 1 else 'people'}")
    if r["zones"]:
        parts.append(f"{r['zones']} zone{'' if r['zones'] == 1 else 's'}")
    line = ", ".join(parts) + "."
    change = r.get("change_hours") or 0
    if change >= 0.5:
        line += f" That's {_hours(change)} more than last week."
    return line


@router.get("/me/recap")
def my_recap(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """This week so far, with the change in hours with friends since last week."""
    monday = week_start(local_today())
    this_week = recap_for(db, user, monday)
    last_week = recap_for(db, user, monday - timedelta(days=7))
    this_week["last_week_hours_together"] = last_week["hours_together"]
    this_week["change_hours"] = round(this_week["hours_together"] - last_week["hours_together"], 1)
    this_week["line"] = recap_line(this_week)
    return this_week


@router.get("/me/history")
def my_history(limit: int = Query(default=20, ge=1, le=100), user: User = Depends(current_user),
               db: Session = Depends(get_db)):
    """Your past Hangs, newest first (ones you're still in don't show until you leave or they end)."""
    rows = db.scalars(select(HangMember).join(Hang).where(
        HangMember.user_id == user.id, or_(Hang.status == "ended", HangMember.left_at.is_not(None)))
        .order_by(Hang.started_at.desc()).limit(limit)).all()
    out = []
    for m in rows:
        hang = m.hang
        others = _others(m, hang)
        b = m.breakdown or {}
        out.append({
            "hang_id": hang.id,
            "kind": hang.kind,
            "status": hang.status,
            "place_name": hang.place_name,
            "activity": hang.activity,
            "started_at": iso(hang.started_at),
            "ended_at": iso(hang.ended_at or m.left_at),
            "minutes": round(_minutes(m, hang)),
            "points": m.points_earned,  # None until the Hang ends
            "people": [o.user.name for o in others][:6],
            "people_count": len(others),
            "new_people": b.get("new_people_names") or [],
            "hot_zone": (b.get("hot_zone_multiplier") or 1) > 1,
            "removed": m.left_reason == "removed",
        })
    return out


def run_weekly_push() -> bool:
    """Run from main.py every 30 s: on Sunday from RECAP_PUSH_HOUR (local time), send everyone with notifications on
    their week, once."""
    now = jobs.local_now()
    if now.weekday() != 6 or now.hour < RECAP_PUSH_HOUR:
        return False
    monday = week_start(now.date())
    year, week, _ = monday.isocalendar()
    with SessionLocal() as db:
        if not jobs.claim(db, "weekly_recap", f"{year}-W{week:02d}"):
            return False
        for user_id in sorted(set(db.scalars(select(PushSubscription.user_id)))):
            user = db.get(User, user_id)
            if user is None:
                continue
            r = recap_for(db, user, monday)
            r["change_hours"] = round(r["hours_together"] - recap_for(db, user, monday - timedelta(days=7))["hours_together"], 1)
            line = recap_line(r)
            if line:
                notify.send([user_id], "Your week offline", line, "/me")
    return True
