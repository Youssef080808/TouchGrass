"""Hangs: start (solo or group), join by code, phone-down breaks, location pings, end + scoring.

Live updates: the app opens a WebSocket at /ws/hangs/{id}. The server checks the Hang every
2 seconds and pushes the new state when something changed (someone joined, picked up, ended).
At 100x the users you'd swap this check for push-based pub/sub (Postgres LISTEN/NOTIFY or Redis).
"""
import asyncio
import random
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import territory
from ..auth import current_user
from ..config import DAILY_POINTS_CAP, JOIN_RADIUS_M, SOLO_MIN_DISTANCE_FROM_HOME_M
from ..db import SessionLocal, get_db
from ..geo import distance_m, hex_for
from ..models import Hang, HangMember, HexScore, User
from ..points import score_member
from ..serializers import hang_out
from ..timeutil import local_day_start_utc, local_today, utcnow
from ..weather import current_weather

router = APIRouter(tags=["hangs"])

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I, easier to read aloud
LEFT_AREA_FACTOR = 3  # moving 3x the join radius away from the Hang counts as leaving


class StartHang(BaseModel):
    kind: Literal["solo", "group"]
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    place_name: str | None = Field(default=None, max_length=120)
    place_type: str | None = Field(default=None, max_length=40)


class JoinHang(BaseModel):
    code: str = Field(min_length=4, max_length=8)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class Ping(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class BreakIn(BaseModel):
    reason: Literal["picked_up", "left_app"] = "picked_up"


def _active_membership(db: Session, user: User) -> HangMember | None:
    return db.scalar(
        select(HangMember).join(Hang)
        .where(HangMember.user_id == user.id, Hang.status == "active",
               (HangMember.break_reason.is_(None)) | (HangMember.break_reason != "left"))
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
    if body.kind == "solo" and user.home_lat is not None and not body.place_name:
        if distance_m(user.home_lat, user.home_lng, body.lat, body.lng) < SOLO_MIN_DISTANCE_FROM_HOME_M:
            raise HTTPException(
                400, f"Solo sessions count when you're at least {SOLO_MIN_DISTANCE_FROM_HOME_M:.0f} m "
                     "from home, or at a suggested place. Go touch some grass!")
    weather = current_weather(body.lat, body.lng)
    hang = Hang(
        code=_new_code(db), kind=body.kind, host_id=user.id, lat=body.lat, lng=body.lng,
        hex_id=hex_for(body.lat, body.lng), place_name=body.place_name, place_type=body.place_type,
        bad_weather=bool(weather and weather["bad"]),
    )
    db.add(hang)
    db.flush()
    db.add(HangMember(hang_id=hang.id, user_id=user.id, last_ping_at=utcnow()))
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
        raise HTTPException(409, "Leave your current Hang before joining another")
    # Anti-cheat: you have to actually be there.
    d = distance_m(hang.lat, hang.lng, body.lat, body.lng)
    if d > JOIN_RADIUS_M:
        raise HTTPException(400, f"You're {d:.0f} m away. Get within {JOIN_RADIUS_M:.0f} m of the group to join.")
    db.add(HangMember(hang_id=hang.id, user_id=user.id, last_ping_at=utcnow()))
    db.commit()
    db.refresh(hang)
    return hang_out(db, hang)


@router.get("/hangs/{hang_id}")
def get_hang(hang_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return hang_out(db, _get_hang(db, hang_id))


@router.post("/hangs/{hang_id}/ping")
def ping(hang_id: int, body: Ping, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The app sends its location every 30 s during a Hang. Walking away counts as leaving."""
    hang = _get_hang(db, hang_id)
    m = _member(hang, user)
    m.last_ping_at = utcnow()
    if hang.status == "active" and m.broke_at is None:
        if distance_m(hang.lat, hang.lng, body.lat, body.lng) > LEFT_AREA_FACTOR * JOIN_RADIUS_M:
            m.broke_at, m.break_reason = utcnow(), "left_area"
    db.commit()
    return {"ok": True, "broke": m.broke_at is not None}


@router.post("/hangs/{hang_id}/break")
def break_phone_down(hang_id: int, body: BreakIn, user: User = Depends(current_user),
                     db: Session = Depends(get_db)):
    """Called when the app sees the phone picked up or the app left. Ends your phone-down time."""
    hang = _get_hang(db, hang_id)
    m = _member(hang, user)
    if hang.status == "active" and m.broke_at is None:
        m.broke_at, m.break_reason = utcnow(), body.reason
        db.commit()
    return hang_out(db, hang)


@router.post("/hangs/{hang_id}/leave")
def leave(hang_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    hang = _get_hang(db, hang_id)
    m = _member(hang, user)
    if hang.status == "active":
        if m.broke_at is None:
            m.broke_at = utcnow()
        m.break_reason = "left"
        db.commit()
    return {"ok": True}


@router.post("/hangs/{hang_id}/end")
def end_hang(hang_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Host ends the Hang: score everyone, update streaks, add territory, send Friend or Foe alerts."""
    hang = _get_hang(db, hang_id)
    if hang.host_id != user.id:
        raise HTTPException(403, "Only the host can end the Hang")
    if hang.status != "active":
        raise HTTPException(409, "This Hang already ended")

    now = utcnow()
    hang.status, hang.ended_at = "ended", now
    owner_before = territory.owner_of(db, hang.hex_id)
    today = local_today()
    day_start = local_day_start_utc(today)
    present = [m for m in hang.members if m.break_reason != "left"]

    for m in hang.members:
        u = m.user
        # Streak: +1 if you also played yesterday, back to 1 if you skipped a day.
        if u.last_active_date != today:
            u.streak = u.streak + 1 if u.last_active_date == today - timedelta(days=1) else 1
            u.last_active_date = today

        others = [o for o in present if o.id != m.id]
        teammates = sum(1 for o in others if o.user.team_id == u.team_id)
        earned_today = db.scalar(
            select(func.coalesce(func.sum(HangMember.points_earned), 0)).join(Hang)
            .where(HangMember.user_id == u.id, Hang.ended_at >= day_start, Hang.id != hang.id)
        ) or 0
        been_here = db.scalar(
            select(func.count()).select_from(HangMember).join(Hang)
            .where(HangMember.user_id == u.id, Hang.hex_id == hang.hex_id,
                   Hang.status == "ended", Hang.id != hang.id, HangMember.points_earned > 0)
        )
        # The host has to pick up their phone to end the Hang, so a host pickup in the last
        # 60 seconds doesn't cost them the party bonus.
        host_ending = (m.user_id == hang.host_id and m.broke_at is not None
                       and m.break_reason != "left" and (now - m.broke_at).total_seconds() <= 60)
        result = score_member(
            seconds=((m.broke_at or now) - m.joined_at).total_seconds(),
            teammates=teammates, others=len(others) - teammates,
            broke=m.broke_at is not None and not host_ending, streak_days=u.streak, place_type=hang.place_type,
            new_place=not been_here, bad_weather=hang.bad_weather,
            cap_left=DAILY_POINTS_CAP - int(earned_today),
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
