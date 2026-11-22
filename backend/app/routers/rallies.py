"""Rallies: plan a Hang for later, and Team up. Plus zone info and today's hot zones for the map.

- Plan: pick a place and a time. Your team gets a notification and says "I'm in" (or "Can't make it").
  Open rallies also show up for people nearby (Meet), people who like the activity first.
- RALLY_REMINDER_MINUTES before it starts, everyone who's in gets a reminder (plans.run_jobs).
- Arriving: from RALLY_EARLY_MINUTES before the start, the first person within PLACE_RADIUS_M of the place starts
  the real Hang there. Everyone else who's in shows up as "on the way" and is checked in when they get there:
  the app does it by itself while it's open (frontend/src/hooks/useRallyArrive.js). Nobody has to scan anyone.
- Team up: a rally that also invites the rival team that just took your zone. If both teams show up and earn
  points, they share the zone for TRUCE_DAYS (plans.after_hang_finished).
"""
from datetime import datetime, timedelta, timezone
from typing import Literal

import h3
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import hotzones, notify, plans, territory
from ..auth import current_user
from ..config import OPEN_HANG_RADIUS_M, PLACE_RADIUS_M, RALLY_EARLY_MINUTES, RALLY_REMINDER_MINUTES
from ..db import get_db
from ..geo import distance_m, hex_boundary, hex_center, hex_for
from ..models import Hang, HangMember, HangRsvp, Rally, RallyRsvp, Team, User
from ..serializers import hang_out, here_count, team_out
from ..timeutil import iso, utcnow
from ..weather import current_weather
from .hangs import (OPEN_HANG_HOME_RADIUS_M, Location, _active_membership, _auto_end_if_due, _near_home, _new_code,
                    is_blocked)

router = APIRouter(tags=["rallies"])

MAX_DAYS_AHEAD = 7   # rallies can be planned up to a week ahead
MAX_PLANNED = 3      # rallies one person can have planned at once


class PlanRally(BaseModel):
    place_name: str = Field(min_length=1, max_length=120)
    place_type: str | None = Field(default=None, max_length=40)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    starts_at: datetime
    visibility: Literal["team", "open"] = "team"
    activity: str | None = Field(default=None, max_length=40)
    invite_team_id: int | None = None  # Team up: the rival team


class RallyAnswer(BaseModel):
    going: bool


def _naive_utc(dt: datetime) -> datetime:
    return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt


def _far(d: float) -> str:
    return f"{d / 1000:.1f} km" if d >= 1000 else f"{d:.0f} m"


def _get_rally(db: Session, rally_id: int, user: User) -> Rally:
    rally = db.get(Rally, rally_id)
    if rally is None or not plans.can_see(rally, user):
        raise HTTPException(404, "Rally not found")
    if plans.sync(rally):
        db.commit()
    return rally


def _answer(db: Session, rally: Rally, user_id: int, going: bool) -> None:
    r = next((x for x in rally.rsvps if x.user_id == user_id), None)
    if r is None:
        rally.rsvps.append(RallyRsvp(user_id=user_id, going=going, created_at=utcnow()))
    elif r.going != going:
        r.going, r.created_at = going, utcnow()


def _on_the_way(db: Session, hang: Hang, user_id: int, status: str = "going") -> None:
    """Show someone on the live Hang's screen as on the way (or mark them arrived)."""
    r = db.scalar(select(HangRsvp).where(HangRsvp.hang_id == hang.id, HangRsvp.user_id == user_id))
    if r is None:
        db.add(HangRsvp(hang_id=hang.id, user_id=user_id, status=status, created_at=utcnow()))
    elif r.status != "arrived":
        r.status, r.decided_at = status, utcnow()


def rally_out(rally: Rally, user: User, lat: float | None = None, lng: float | None = None) -> dict:
    going = [r for r in rally.rsvps if r.going]
    mine = next((r for r in rally.rsvps if r.user_id == user.id), None)
    hang = rally.hang
    member = next((m for m in hang.members if m.user_id == user.id), None) if hang else None
    live = hang is not None and hang.status == "active"
    return {
        "id": rally.id,
        "kind": rally.kind,
        "visibility": rally.visibility,
        "activity": rally.activity,
        "place": {"name": rally.place_name, "type": rally.place_type, "lat": rally.lat, "lng": rally.lng},
        "hex_id": rally.hex_id,
        "starts_at": iso(rally.starts_at),
        "status": rally.status,
        "host": {"id": rally.host_id, "name": rally.host.name, "team": team_out(rally.host.team)},
        "team": team_out(rally.team),
        "invite_team": team_out(rally.invite_team),
        "going_count": len(going),
        "going": [{"id": r.user_id, "name": r.user.name, "team": team_out(r.user.team)} for r in going][:8],
        "my_going": None if mine is None else mine.going,
        "is_host": rally.host_id == user.id,
        "hang_id": rally.hang_id,
        "here_count": here_count(hang) if live else 0,
        "my_hang_status": None if member is None else ("in" if member.left_at is None else "left"),
        "arrive_from": iso(rally.starts_at - timedelta(minutes=RALLY_EARLY_MINUTES)),
        "arrive_radius_m": PLACE_RADIUS_M,
        "distance_m": round(distance_m(rally.lat, rally.lng, lat, lng)) if lat is not None and lng is not None else None,
        "shares_interest": bool(rally.activity and rally.activity in (user.interests or [])),
    }


@router.get("/rallies")
def list_rallies(scope: Literal["mine", "open"] = "mine",
                 lat: float | None = Query(default=None, ge=-90, le=90),
                 lng: float | None = Query(default=None, ge=-180, le=180),
                 user: User = Depends(current_user), db: Session = Depends(get_db)):
    """mine: rallies for your team, Team ups with your team, and ones you host or answered (live first, then by time).
    open: open rallies from other people within OPEN_HANG_RADIUS_M (including ones you said you're in on), the ones
    for things you like first."""
    rows = db.scalars(select(Rally).where(Rally.status.in_(plans.OPEN_STATUSES)).order_by(Rally.starts_at)).all()
    changed = False
    out = []
    for rally in rows:
        changed |= plans.sync(rally)
        if rally.status not in plans.OPEN_STATUSES:
            continue
        mine = plans.involves(rally, user)
        if scope == "mine" and not mine:
            continue
        if scope == "open":
            if plans.from_your_side(rally, user) or rally.visibility != "open" or lat is None or lng is None:
                continue
            if distance_m(rally.lat, rally.lng, lat, lng) > OPEN_HANG_RADIUS_M:
                continue
        out.append(rally_out(rally, user, lat, lng))
    if changed:
        db.commit()
    if scope == "open":
        out.sort(key=lambda r: (not r["shares_interest"], r["starts_at"]))
    else:
        out.sort(key=lambda r: (r["status"] != "live", r["starts_at"]))
    return out


@router.post("/rallies")
def plan_rally(body: PlanRally, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Plan a rally (or Team up, with invite_team_id). Your team (and the invited team) get a notification."""
    now = utcnow()
    starts = _naive_utc(body.starts_at)
    if starts < now - timedelta(minutes=5):
        raise HTTPException(400, "That time has already passed. Pick a time from now on.")
    if starts > now + timedelta(days=MAX_DAYS_AHEAD):
        raise HTTPException(400, f"Rallies can be planned up to {MAX_DAYS_AHEAD} days ahead.")
    starts = max(starts, now)

    invite = None
    if body.invite_team_id is not None:
        invite = db.get(Team, body.invite_team_id)
        if invite is None:
            raise HTTPException(404, "That team doesn't exist")
        if user.team_id is None:
            raise HTTPException(400, "Join a team first, then you can team up with another one.")
        if invite.id == user.team_id:
            raise HTTPException(400, "That's your own team. Plan a normal rally instead.")
    open_rally = body.visibility == "open" and invite is None
    if not open_rally and user.team_id is None:
        raise HTTPException(400, "You're not on a team yet. Make it open to people nearby, or join a team in Me.")
    if open_rally:
        # Same safety rules as open Hangs: public places only, and not for people others keep reporting.
        if _near_home(user, Location(lat=body.lat, lng=body.lng), OPEN_HANG_HOME_RADIUS_M):
            raise HTTPException(400, "Open rallies are for public places, and that's your home. "
                                     "Keep it to your team, or pick a public place.")
        if is_blocked(db, user.id):
            raise HTTPException(403, "You can't post open rallies right now because of reports from other players.")
    planned = db.scalar(select(func.count()).select_from(Rally).where(
        Rally.host_id == user.id, Rally.status == "planned")) or 0
    if planned >= MAX_PLANNED:
        raise HTTPException(409, f"You already have {MAX_PLANNED} rallies planned. Cancel one first.")

    rally = Rally(
        host_id=user.id, team_id=user.team_id, invite_team_id=invite.id if invite else None,
        kind="team_up" if invite else "rally", visibility="open" if open_rally else "team",
        activity=(body.activity or "").strip() or None, place_name=body.place_name.strip(),
        place_type=body.place_type, lat=body.lat, lng=body.lng, hex_id=hex_for(body.lat, body.lng),
        starts_at=starts, status="planned", created_at=now,
        # Starting soon: the invite itself works as the reminder
        reminder_sent_at=now if starts - timedelta(minutes=RALLY_REMINDER_MINUTES) <= now else None,
    )
    rally.rsvps.append(RallyRsvp(user_id=user.id, going=True, created_at=now))
    db.add(rally)
    db.commit()
    db.refresh(rally)

    when = plans.when_label(rally.starts_at, now)
    others = plans.audience_ids(db, rally) - {user.id}
    if invite:
        notify.send(others, "Team up?",
                    f"{rally.team.name} and {invite.name}: joint Hang at {rally.place_name} {when}. "
                    "If both teams show up, you share the zone.", "/")
    else:
        notify.send(others, f"{user.name} is rallying",
                    f"{plans.what(rally)} at {rally.place_name} {when}. Tap to say you're in.", "/")
    return rally_out(rally, user)


@router.post("/rallies/{rally_id}/rsvp")
def answer_rally(rally_id: int, body: RallyAnswer, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """'I'm in' (going: true) or 'Can't make it' (going: false)."""
    rally = _get_rally(db, rally_id, user)
    if rally.status not in plans.OPEN_STATUSES:
        raise HTTPException(409, "This rally is over")
    if body.going and not plans.involves(rally, user) and is_blocked(db, user.id):
        raise HTTPException(403, "You can't join open rallies right now because of reports from other players.")
    if not body.going and rally.host_id == user.id and rally.status == "planned":
        raise HTTPException(400, "You're the host. Cancel the rally instead.")
    _answer(db, rally, user.id, body.going)
    hang = rally.hang
    if hang is not None and hang.status == "active" and not any(m.user_id == user.id for m in hang.members):
        _on_the_way(db, hang, user.id, "going" if body.going else "cancelled")
    db.commit()
    return rally_out(rally, user)


@router.post("/rallies/{rally_id}/cancel")
def cancel_rally(rally_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    rally = _get_rally(db, rally_id, user)
    if rally.host_id != user.id:
        raise HTTPException(403, "Only the host can cancel a rally")
    if rally.status == "live":
        raise HTTPException(409, "It already started. End the Hang instead.")
    if rally.status == "planned":
        rally.status = "cancelled"
        db.commit()
        notify.send([uid for uid in plans.going_ids(rally) if uid != user.id], "Rally cancelled",
                    f"{user.name} called off {plans.what(rally).lower()} at {rally.place_name} "
                    f"({plans.when_label(rally.starts_at)}).", "/")
    return rally_out(rally, user)


@router.post("/rallies/{rally_id}/arrive")
def arrive_at_rally(rally_id: int, body: Location, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """'I'm here'. The first person there starts the real Hang at the planned place; everyone after joins it.
    The server checks you're within PLACE_RADIUS_M of the place."""
    rally = _get_rally(db, rally_id, user)
    if rally.status in ("cancelled", "expired"):
        raise HTTPException(409, "This rally is off" if rally.status == "cancelled" else "This rally is over")
    now = utcnow()
    opens = rally.starts_at - timedelta(minutes=RALLY_EARLY_MINUTES)
    if now < opens:
        raise HTTPException(400, f"It starts {plans.when_label(rally.starts_at, now)}. "
                                 f"You can check in from {plans.clock(opens)}.")
    if not plans.involves(rally, user) and is_blocked(db, user.id):
        raise HTTPException(403, "You can't join open rallies right now because of reports from other players.")
    d = distance_m(rally.lat, rally.lng, body.lat, body.lng)
    if d > PLACE_RADIUS_M:
        raise HTTPException(400, f"You're {_far(d)} from {rally.place_name}. You'll be checked in when you get there.")

    hang = rally.hang
    if hang is not None:
        _auto_end_if_due(db, hang)
        if hang.status != "active" or rally.status == "done":
            rally.status = "done"
            db.commit()
            raise HTTPException(409, "This rally's Hang already ended")
        member = next((m for m in hang.members if m.user_id == user.id), None)
        if member is not None:
            if member.left_at is None:
                return hang_out(db, hang)
            raise HTTPException(409, "You already left this Hang.")
        if _active_membership(db, user):
            raise HTTPException(409, "Check out of your current Hang before joining another")
        if hang.max_size and here_count(hang) >= hang.max_size:
            raise HTTPException(409, f"This Hang is full ({hang.max_size} people max).")
        db.add(HangMember(hang_id=hang.id, user_id=user.id, joined_at=now, last_verified_at=now, joined_via="arrive"))
        _on_the_way(db, hang, user.id, "arrived")
        _answer(db, rally, user.id, True)
        db.commit()
        db.refresh(hang)
        return hang_out(db, hang)

    # First one here: start the real Hang at the planned place
    if _active_membership(db, user):
        raise HTTPException(409, "Check out of your current Hang before starting the rally")
    weather = current_weather(rally.lat, rally.lng)
    hang = Hang(
        code=_new_code(db), kind="group", host_id=user.id, lat=rally.lat, lng=rally.lng, hex_id=rally.hex_id,
        place_name=rally.place_name, place_type=rally.place_type, bad_weather=bool(weather and weather["bad"]),
        started_at=now, visibility="open" if rally.visibility == "open" else "friends", activity=rally.activity,
        max_size=None, join_mode="anyone",
    )
    db.add(hang)
    db.flush()
    db.add(HangMember(hang_id=hang.id, user_id=user.id, joined_at=now, last_verified_at=now, joined_via="host"))
    rally.hang_id, rally.status = hang.id, "live"
    _answer(db, rally, user.id, True)
    coming = [uid for uid in plans.going_ids(rally) if uid != user.id]
    for uid in coming:
        db.add(HangRsvp(hang_id=hang.id, user_id=uid, status="going", created_at=now))
    db.commit()
    db.refresh(hang)
    notify.send(coming, f"{user.name} is there",
                f"The {plans.what(rally).lower()} at {rally.place_name} has started. "
                "Open Turfed when you get there and you're checked in.", "/")
    return hang_out(db, hang)


@router.get("/zones/{hex_id}")
def zone_info(hex_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """One map zone: a name for it (the last place played there, or today's hot zone), who holds it, and whether
    it's shared (Team up) or hot today. Used by "Rally here" and Team up."""
    if not h3.is_valid_cell(hex_id):
        raise HTTPException(404, "No such zone")
    lat, lng = hex_center(hex_id)
    hot = next((z for z in hotzones.todays(db) if z.hex_id == hex_id), None)
    played = db.scalar(select(Hang.place_name).where(Hang.hex_id == hex_id, Hang.place_name.is_not(None))
                       .order_by(Hang.started_at.desc()))
    scores = territory.standings(db, [hex_id]).get(hex_id, {})
    owner_id, contested = territory.owner_from(scores)
    ally_id = territory.ally_of(territory.active_truces(db, [hex_id]).get(hex_id), owner_id)
    return {
        "hex_id": hex_id,
        "lat": lat,
        "lng": lng,
        "place_name": played or (hot.place_name if hot else None),
        "owner": team_out(db.get(Team, owner_id)) if owner_id else None,
        "shared_with": team_out(db.get(Team, ally_id)) if ally_id else None,
        "contested": contested and ally_id is None,
        "hot": hot is not None,
    }


@router.get("/hot-zones")
def hot_zones(db: Session = Depends(get_db)):
    """Today's double-points zones, with their hexagon outline for the map."""
    zones = hotzones.todays(db)
    ends = iso(hotzones.ends_at(zones[0].day)) if zones else None
    return [{
        "hex_id": z.hex_id,
        "place_name": z.place_name,
        "lat": z.lat,
        "lng": z.lng,
        "reason": z.reason,
        "boundary": hex_boundary(z.hex_id),
        "ends_at": ends,
    } for z in zones]
