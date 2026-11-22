"""Daily quest: one small goal a day, the same for everyone, with a bonus you claim once it's done.

Only Hangs that counted (ended, 10+ minutes, not removed by the host) move a quest forward, so the
anti-cheat rules apply to quests too. The quest changes at midnight (city time) and rotates through QUESTS.
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import current_user
from ..db import get_db
from ..models import Hang, HangMember, User
from ..timeutil import local_day_start_utc, local_today

router = APIRouter(tags=["quests"])

QUEST_BONUS = 30
FIRST_DAY = date(2026, 11, 22)  # launch day starts with the first quest below
QUESTS = [
    {"key": "new_person", "title": "Hang with someone new", "detail": "Be in a Hang with someone you've never hung out with.", "goal": 1, "unit": "person"},
    {"key": "open_hang", "title": "Join an open Hang", "detail": "Find one in Meet and check yourself in.", "goal": 1, "unit": "Hang"},
    {"key": "group", "title": "Hang with 3 or more", "detail": "Get at least 3 people in one Hang.", "goal": 3, "unit": "people"},
    {"key": "phones_down", "title": "Phones down for 20 minutes", "detail": "Use the phones-down switch during a Hang.", "goal": 20, "unit": "min"},
    {"key": "time_out", "title": "Spend an hour outside", "detail": "Add up an hour of Hangs today.", "goal": 60, "unit": "min"},
]


def todays_quest(day: date) -> dict:
    return QUESTS[(day.toordinal() - FIRST_DAY.toordinal()) % len(QUESTS)]


def _progress(db: Session, user: User, key: str, day: date) -> int:
    """How far this person got today, from the Hangs that counted."""
    rows = db.execute(
        select(HangMember, Hang).join(Hang)
        .where(HangMember.user_id == user.id, Hang.status == "ended",
               Hang.ended_at >= local_day_start_utc(day), HangMember.points_earned > 0)
    ).all()
    if key == "new_person":
        return sum((m.breakdown or {}).get("new_people", 0) for m, _ in rows)
    if key == "open_hang":
        return sum(1 for _, h in rows if h.visibility == "open" and h.host_id != user.id)
    if key == "group":
        best = 0
        for _, h in rows:
            best = max(best, sum(1 for o in h.members if (o.points_earned or 0) > 0))
        return best
    if key == "phones_down":
        return round(sum((m.breakdown or {}).get("minutes", 0) * (m.breakdown or {}).get("phones_down_share", 0)
                         for m, _ in rows))
    if key == "time_out":
        return sum((m.breakdown or {}).get("minutes", 0) for m, _ in rows)
    return 0


def quest_out(db: Session, user: User) -> dict:
    day = local_today()
    q = todays_quest(day)
    progress = _progress(db, user, q["key"], day)
    return {**q, "bonus": QUEST_BONUS, "progress": min(progress, q["goal"]),
            "done": progress >= q["goal"], "claimed": user.quest_claimed_on == day}


@router.get("/me/quest")
def my_quest(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return quest_out(db, user)


@router.post("/me/quest/claim")
def claim_quest(user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = quest_out(db, user)
    if q["claimed"]:
        raise HTTPException(409, "You already claimed today's quest")
    if not q["done"]:
        raise HTTPException(400, "Finish the quest first")
    user.quest_claimed_on = local_today()
    user.points += QUEST_BONUS
    db.commit()
    return quest_out(db, user)
