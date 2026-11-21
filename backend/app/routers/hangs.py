"""Hangs: start (solo or group), join by code, check out, phones-down bonus, end + scoring.

How time is verified (people can lock their phones and put them away):
- Check-in: you must be within JOIN_RADIUS_M of the host to join (location checked).
- After that the group can move around together. Your time only stops if you go home
  (within HOME_RADIUS_M of your home), unless the Hang itself is there.
- While the app is open it sends your location every 30 s; being home counts as leaving.
- Check-out: your location is checked again. If you're home, your time stops at the last
  moment you were confirmed out.
- End: the host can end it anywhere except from home.
- Phones-down bonus (optional): the app sends a heartbeat every 15 s while it's open on the black
  screen. If the phone is locked or the app closed, heartbeats stop and the bonus stops growing.

Live updates: the app opens a WebSocket at /api/ws/hangs/{id}. The server checks the Hang every
2 seconds and pushes the new state when something changed.
At 100x the users you'd swap this check for push-based pub/sub (Postgres LISTEN/NOTIFY or Redis).
"""
import asyncio
import random
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import territory
from ..auth import current_user
from ..config import DAILY_POINTS_CAP, HOME_RADIUS_M, JOIN_RADIUS_M
from ..db import SessionLocal, get_db
from ..geo import distance_m, hex_for
from ..models import Hang, HangMember, HexScore, User
from ..points import score_member
from ..serializers import PHONES_DOWN_HEARTBEAT_GRACE_S, counted_party, hang_out
from ..timeutil import local_day_start_utc, local_today, utcnow
from ..weather import current_weather

router = APIRouter(tags=["hangs"])

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I, easier to read aloud
STAY_RADIUS_FACTOR = 3  # you count as "at the Hang" within 3x the join radius (300 m by default)


class Location(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class StartHang(Location):
    kind: Literal["solo", "group"]
    place_name: str | None = Field(default=None, max_length=120)
    place_type: str | None = Field(default=None, max_length=40)


class JoinHang(Location):
    code: str = Field(min_length=4, max_length=8)


class PhonesDown(BaseModel):
    active: bool  # true = start or keep going (heartbeat), false = stop


def _active_membership(db: Session, user: User) -> HangMember | None:
    return db.scalar(
        select(HangMember).join(Hang)
        .where(HangMember.user_id == user.id, Hang.status == "active", HangMember.left_at.is_(None))
    )


def _get_hang(db: Session, hang_id: int) -> Hang:
    hang = db.get(Hang, hang_id)
    if hang is None:
        raise HTTPException(404, "Hang not found")
    return hang


def _member(hang: Hang, user: User) -> HangMember:
    for m in hang.members:
        if m.user_id == user.id:
            return m
    raise HTTPException(403, "You're not in this Hang")


def _new_code(db: Session) -> str:
    while True:
        code = "".join(random.choices(CODE_ALPHABET, k=6))
        if not db.scalar(select(Hang).where(Hang.code == code, Hang.status == "active")):
            return code


def _at_hang(hang: Hang, loc: Location) -> bool:
    return distance_m(hang.lat, hang.lng, loc.lat, loc.lng) <= STAY_RADIUS_FACTOR * JOIN_RADIUS_M


def _near_home(user: User, loc: Location, radius_m: float = HOME_RADIUS_M) -> bool:
    """Within radius_m of the user's (rounded) home. False if no home is set."""
    if user.home_lat is None or user.home_lng is None:
        return False
    return distance_m(user.home_lat, user.home_lng, loc.lat, loc.lng) < radius_m


def _still_out(hang: Hang, user: User, loc: Location) -> bool:
    """Still counts as hanging out: anywhere but home (the group can move around together).
    Being at the Hang's own spot always counts, even if that's near your home."""
    return _at_hang(hang, loc) or not _near_home(user, loc)


def _close_phones_down(m: HangMember, at: datetime) -> None:
    """End the current phones-down stretch, counting it only up to the last heartbeat (+20 s)."""
    if m.phones_down_since is None:
        return
    end = min(at, (m.phones_down_seen_at or m.phones_down_since)
              + timedelta(seconds=PHONES_DOWN_HEARTBEAT_GRACE_S))
    m.phones_down_seconds = (m.phones_down_seconds or 0) + max((end - m.phones_down_since).total_seconds(), 0)
    m.phones_down_since = None
    m.phones_down_seen_at = None


def _stop_time(m: HangMember, loc_ok: bool, now: datetime) -> tuple[datetime, str]:
    """When this person's time stops: now if they're still out, else (they're home) their last confirmed moment."""
    if loc_ok:
        m.last_verified_at = now
        return now, "checked_out"
    return m.last_verified_at or m.joined_at, "left_area"


@router.get("/me/active-hang")
def my_active_hang(user: User = Depends(current_user), db: Session = Depends(get_db)):
    m = _active_membership(db, user)
    return {"hang": hang_out(db, m.hang) if m else None}


@router.post("/hangs")
def start_hang(body: StartHang, user: User = Depends(current_user), db: Session = Depends(get_db)):
    existing = _active_membership(db, user)
    if existing:
        raise HTTPException(409, f"You're already in a Hang (code {existing.hang.code})")
    # Anti-cheat for solo: it only counts away from home (or at a suggested place).
    if body.kind == "solo" and not body.place_name and _near_home(user, body):
        raise HTTPException(
            400, f"Solo sessions count when you're at least {HOME_RADIUS_M:.0f} m "
                 "from home, or at a suggested place. Go touch some grass!")
    weather = current_weather(body.lat, body.lng)
    now = utcnow()
    hang = Hang(
        code=_new_code(db), kind=body.kind, host_id=user.id, lat=body.lat, lng=body.lng,
        hex_id=hex_for(body.lat, body.lng), place_name=body.place_name, place_type=body.place_type,
        bad_weather=bool(weather and weather["bad"]), started_at=now,
    )
    db.add(hang)
    db.flush()
    db.add(HangMember(hang_id=hang.id, user_id=user.id, joined_at=now, last_verified_at=now))
    db.commit()
    db.refresh(hang)
    return hang_out(db, hang)


@router.post("/hangs/join")
def join_hang(body: JoinHang, user: User = Depends(current_user), db: Session = Depends(get_db)):
    hang = db.scalar(select(Hang).where(Hang.code == body.code.strip().upper(), Hang.status == "active"))
    if hang is None:
        raise HTTPException(404, "No live Hang with that code")
    if any(m.user_id == user.id for m in hang.members):
        return hang_out(db, hang)  # already in it (e.g. scanned the QR twice)
    if hang.kind == "solo":
        raise HTTPException(400, "That's a solo session, it can't be joined")
    if _active_membership(db, user):
        raise HTTPException(409, "Check out of your current Hang before joining another")
    # Anti-cheat: you have to actually be there.
    d = distance_m(hang.lat, hang.lng, body.lat, body.lng)
    if d > JOIN_RADIUS_M:
        raise HTTPException(400, f"You're {d:.0f} m away. Get within {JOIN_RADIUS_M:.0f} m of the group to join.")
    now = utcnow()
    db.add(HangMember(hang_id=hang.id, user_id=user.id, joined_at=now, last_verified_at=now))
    db.commit()
    db.refresh(hang)
    return hang_out(db, hang)


@router.get("/hangs/{hang_id}")
def get_hang(hang_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return hang_out(db, _get_hang(db, hang_id))


@router.post("/hangs/{hang_id}/ping")
def ping(hang_id: int, body: Location, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The app sends its location every 30 s while it's open. Being home counts as leaving."""
    hang = _get_hang(db, hang_id)
    m = _member(hang, user)
    if hang.status == "active" and m.left_at is None:
        now = utcnow()
        if _still_out(hang, user, body):
            m.last_verified_at = now
        else:
            _close_phones_down(m, now)
            m.left_at, m.left_reason = m.last_verified_at or m.joined_at, "left_area"
        db.commit()
    return {"ok": True, "left": m.left_at is not None}


@router.post("/hangs/{hang_id}/phones-down")
def phones_down(hang_id: int, body: PhonesDown, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Start, keep alive (heartbeat every 15 s) or stop the optional phones-down bonus."""
    hang = _get_hang(db, hang_id)
    m = _member(hang, user)
    if hang.status != "active" or m.left_at is not None:
        return hang_out(db, hang)
    now = utcnow()
    if body.active:
        stale = (m.phones_down_seen_at is not None and
                 (now - m.phones_down_seen_at).total_seconds() > PHONES_DOWN_HEARTBEAT_GRACE_S)
        if stale:  # heartbeats stopped (phone locked?), so close the old stretch and start fresh
            _close_phones_down(m, now)
        if m.phones_down_since is None:
            m.phones_down_since = now
        m.phones_down_seen_at = now
    else:
        _close_phones_down(m, now)
    db.commit()
    return hang_out(db, hang)


@router.post("/hangs/{hang_id}/checkout")
def checkout(hang_id: int, body: Location, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Leave before the Hang ends. Your points are added when the host ends the Hang."""
    hang = _get_hang(db, hang_id)
    m = _member(hang, user)
    if hang.status == "active" and m.left_at is None:
        now = utcnow()
        stop, reason = _stop_time(m, _still_out(hang, user, body), now)
        _close_phones_down(m, stop)
        m.left_at, m.left_reason = stop, reason
        db.commit()
    return hang_out(db, hang)


@router.post("/hangs/{hang_id}/end")
def end_hang(hang_id: int, body: Location, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Host ends the Hang: score everyone, update streaks, add territory, send Friend or Foe alerts."""
    hang = _get_hang(db, hang_id)
    if hang.host_id != user.id:
        raise HTTPException(403, "Only the host can end the Hang")
    if hang.status != "active":
        raise HTTPException(409, "This Hang already ended")
    # The group may have moved on together, so ending works anywhere you're still out, just not from home.
    if not _still_out(hang, user, body):
        raise HTTPException(400, "You're at home, so you can't end the Hang from here. End it while you're still out.")

    now = utcnow()
    hang.status, hang.ended_at = "ended", now
    owner_before = territory.owner_of(db, hang.hex_id)
    today = local_today()
    day_start = local_day_start_utc(today)

    for m in hang.members:
        u = m.user
        stop = m.left_at or now   # everyone still checked in stops when the host ends the Hang
        _close_phones_down(m, stop)
        # Streak: +1 if you also played yesterday, back to 1 if you skipped a day.
        if u.last_active_date != today:
            u.streak = u.streak + 1 if u.last_active_date == today - timedelta(days=1) else 1
            u.last_active_date = today

        teammates, others = counted_party(hang, m)
        earned_today = db.scalar(
            select(func.coalesce(func.sum(HangMember.points_earned), 0)).join(Hang)
            .where(HangMember.user_id == u.id, Hang.ended_at >= day_start, Hang.id != hang.id)
        ) or 0
        been_here = db.scalar(
            select(func.count()).select_from(HangMember).join(Hang)
            .where(HangMember.user_id == u.id, Hang.hex_id == hang.hex_id,
                   Hang.status == "ended", Hang.id != hang.id, HangMember.points_earned > 0)
        )
        result = score_member(
            seconds=(stop - m.joined_at).total_seconds(),
            phones_down_seconds=m.phones_down_seconds or 0,
            teammates=teammates, others=others, streak_days=u.streak, place_type=hang.place_type,
            new_place=not been_here, bad_weather=hang.bad_weather,
            left_area=m.left_reason == "left_area", cap_left=DAILY_POINTS_CAP - int(earned_today),
        )
        m.points_earned, m.breakdown = result["total"], result
        u.points += result["total"]
        if result["total"] > 0 and u.team_id:
            db.add(HexScore(hex_id=hang.hex_id, team_id=u.team_id, hang_id=hang.id,
                            points=result["total"], earned_at=now))

    db.flush()
    owner_after = territory.owner_of(db, hang.hex_id)
    territory.notify_friend_or_foe(db, hang.hex_id, hang.place_name or "a zone near you",
                                   owner_before, owner_after)
    db.commit()
    return hang_out(db, hang)


def _load_state(hang_id: int) -> dict | None:
    with SessionLocal() as db:
        hang = db.get(Hang, hang_id)
        return hang_out(db, hang) if hang else None


def _token_ok(token: str | None) -> bool:
    if not token:
        return False
    with SessionLocal() as db:
        return db.scalar(select(User.id).where(User.token == token)) is not None


@router.websocket("/ws/hangs/{hang_id}")
async def hang_updates(ws: WebSocket, hang_id: int, token: str | None = None):
    await ws.accept()
    if not await run_in_threadpool(_token_ok, token):
        await ws.close(code=4401)
        return
    last = None
    try:
        while True:
            state = await run_in_threadpool(_load_state, hang_id)
            if state is None:
                await ws.send_json({"error": "Hang not found"})
                break
            if state != last:
                await ws.send_json({"hang": state})
                last = state
            if state["status"] == "ended":
                break
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        return
    await ws.close()
