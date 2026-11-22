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
- Minimum: under MIN_HANG_MINUTES earns nothing (stops quick "zone hopping").
- Alone = solo: if nobody else stayed 10+ minutes, the host is scored like a solo session, which only
  counts away from home or at a real place (checked: you must be near it when you start).
- Forgotten Hangs: if nobody opens the app for NO_CHECKIN_END_HOURS, the Hang ends by itself and time
  counts only up to the last check-in. It also ends once everyone has left.

Notifications bring people back to the app only when it's worth it: the host can set a timer ("buzz us in
1 h"), and everyone hears when the Hang is over and what they earned. See notify.py.

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

from .. import hotzones, notify, plans, territory
from ..auth import current_user
from ..config import (DAILY_POINTS_CAP, HOME_RADIUS_M, JOIN_RADIUS_M, MIN_HANG_MINUTES, NO_CHECKIN_END_HOURS,
                      PLACE_RADIUS_M, POINTS_TIME_SCALE, REPORTS_TO_BLOCK)
from ..db import SessionLocal, get_db
from ..geo import distance_m, hex_for
from ..models import Hang, HangMember, HexScore, User
from ..points import score_member
from ..models import Report
from ..serializers import PHONES_DOWN_HEARTBEAT_GRACE_S, counted_party, hang_out, here_count, people_met
from ..timeutil import local_day_start_utc, local_today, utcnow
from ..weather import current_weather

router = APIRouter(tags=["hangs"])

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I, easier to read aloud
STAY_RADIUS_FACTOR = 3  # you count as "at the Hang" within 3x the join radius (300 m by default)
OPEN_HANG_HOME_RADIUS_M = 150  # an open Hang can't start this close to the host's home


def is_blocked(db: Session, user_id: int) -> bool:
    """Reported by REPORTS_TO_BLOCK different people: no posting or joining open Hangs."""
    reporters = db.scalar(select(func.count(func.distinct(Report.reporter_id))).where(Report.user_id == user_id)) or 0
    return reporters >= REPORTS_TO_BLOCK


class Location(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class StartHang(Location):
    kind: Literal["solo", "group"]
    place_name: str | None = Field(default=None, max_length=120)
    place_type: str | None = Field(default=None, max_length=40)
    # Where the suggested place is, so the server can check you're really there
    place_lat: float | None = Field(default=None, ge=-90, le=90)
    place_lng: float | None = Field(default=None, ge=-180, le=180)
    # Open to new people (shows up in Meet) or just friends (QR/code); what you're doing; how many people at most
    visibility: Literal["open", "friends"] = "friends"
    activity: str | None = Field(default=None, max_length=40)
    max_size: int | None = Field(default=None, ge=2, le=50)
    join_mode: Literal["anyone", "approve"] = "anyone"


class JoinHang(Location):
    code: str = Field(min_length=4, max_length=8)


class HangTimer(BaseModel):
    minutes: int | None = Field(default=None, ge=1, le=600)  # None clears the timer


class PhonesDown(BaseModel):
    active: bool  # true = start or keep going (heartbeat), false = stop


def _active_membership(db: Session, user: User) -> HangMember | None:
    m = db.scalar(
        select(HangMember).join(Hang)
        .where(HangMember.user_id == user.id, Hang.status == "active", HangMember.left_at.is_(None))
    )
    if m and _auto_end_if_due(db, m.hang):
        return None
    return m


def _get_hang(db: Session, hang_id: int) -> Hang:
    hang = db.get(Hang, hang_id)
    if hang is None:
        raise HTTPException(404, "Hang not found")
    _auto_end_if_due(db, hang)
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


def _scaled_minutes(start: datetime, stop: datetime) -> float:
    return (stop - start).total_seconds() * POINTS_TIME_SCALE / 60


def _someone_else_stayed(hang: Hang, end_at: datetime) -> bool:
    """A real group: at least one person besides the host was there MIN_HANG_MINUTES or more."""
    return any(
        _scaled_minutes(m.joined_at, m.left_at or end_at) >= MIN_HANG_MINUTES
        for m in hang.members if m.user_id != hang.host_id
    )


def _solo_counts(hang: Hang, host: User) -> bool:
    """Solo time counts at a real place (checked at start) or away from a home you've set."""
    if hang.place_name:
        return True
    return host.home_lat is not None and not _near_home(host, Location(lat=hang.lat, lng=hang.lng))


def _last_checkin(hang: Hang) -> datetime:
    """The last time anyone in the Hang had the app open (location ping, phones-down heartbeat or joining)."""
    times = [hang.started_at]
    for m in hang.members:
        times += [t for t in (m.joined_at, m.last_verified_at, m.phones_down_seen_at) if t]
    return max(times)


def _auto_end_if_due(db: Session, hang: Hang) -> bool:
    """End a Hang nobody has checked in to for NO_CHECKIN_END_HOURS, or that everyone has left.
    Returns True if it ended it."""
    if hang.status != "active":
        return False
    if all(m.left_at for m in hang.members):
        _finish_hang(db, hang, max(m.left_at for m in hang.members), "everyone_left")
    else:
        last = _last_checkin(hang)
        if utcnow() - last < timedelta(hours=NO_CHECKIN_END_HOURS):
            return False
        _finish_hang(db, hang, last, "no_checkins")  # time counts only up to the last check-in
    db.commit()
    _announce_end(hang)
    return True


def end_overdue_hangs() -> int:
    """Run every minute from main.py so forgotten Hangs end even if nobody opens the app."""
    ended = 0
    with SessionLocal() as db:
        for hang in db.scalars(select(Hang).where(Hang.status == "active")).all():
            ended += _auto_end_if_due(db, hang)
    return ended


def send_due_timers() -> int:
    """Run every few seconds from main.py: when a Hang's timer runs out, notify everyone still in it."""
    now = utcnow()
    sent = 0
    with SessionLocal() as db:
        due = db.scalars(select(Hang).where(
            Hang.status == "active", Hang.timer_ends_at.is_not(None), Hang.timer_ends_at <= now,
            Hang.timer_sent_at.is_(None))).all()
        for hang in due:
            hang.timer_sent_at = now
            db.commit()
            where = f"Your Hang at {hang.place_name}" if hang.place_name else "Your Hang"
            here = [m.user_id for m in hang.members if m.left_at is None]
            if hang.host_id in here:
                notify.send([hang.host_id], "Time's up!", f"{where} is done. Tap to end it and collect everyone's points.",
                            f"/hang/{hang.id}")
            notify.send([uid for uid in here if uid != hang.host_id], "Time's up!",
                        f"{where} is done. {hang.host.name} can end it now so everyone gets their points.",
                        f"/hang/{hang.id}")
            sent += 1
    return sent


def _announce_end(hang: Hang, skip_user_id: int | None = None) -> None:
    """After a Hang ends, tell each person (except whoever ended it) what they earned."""
    where = f" at {hang.place_name}" if hang.place_name else ""
    for m in hang.members:
        if m.user_id != skip_user_id:
            notify.send([m.user_id], f"Hang over: +{m.points_earned or 0} points",
                        f"Your Hang{where} just ended. Tap to see how you scored.", f"/hang/{hang.id}")


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
    # "I'm here" at a suggested place: check you really are (stops claiming a park from your couch).
    if body.place_name:
        if body.place_lat is None or body.place_lng is None:
            raise HTTPException(400, "Missing the place's location. Refresh the app and try again.")
        d = distance_m(body.place_lat, body.place_lng, body.lat, body.lng)
        if d > PLACE_RADIUS_M:
            far = f"{d / 1000:.1f} km" if d >= 1000 else f"{d:.0f} m"
            raise HTTPException(400, f"You're {far} from {body.place_name}. Start the Hang when you get there.")
    # Anti-cheat for solo: it only counts away from a home you've set (or at a suggested place).
    if body.kind == "solo" and not body.place_name:
        if user.home_lat is None:
            raise HTTPException(
                400, "Set your home spot in Profile first, so the app can tell you're out. "
                     "Or start at one of the places below.")
        if _near_home(user, body):
            raise HTTPException(
                400, f"Solo sessions count when you're at least {HOME_RADIUS_M:.0f} m "
                     "from home, or at a suggested place. Go touch some grass!")
    open_hang = body.kind == "group" and body.visibility == "open"
    if open_hang:
        # Safety: open Hangs are for public places, so not at home, and not for people others keep reporting.
        if _near_home(user, body, OPEN_HANG_HOME_RADIUS_M):
            raise HTTPException(400, "Open Hangs are for public places, and you're at home. "
                                     "Make it a friends-only Hang, or start it somewhere public.")
        if is_blocked(db, user.id):
            raise HTTPException(403, "You can't post open Hangs right now because of reports from other players.")
    weather = current_weather(body.lat, body.lng)
    now = utcnow()
    hang = Hang(
        code=_new_code(db), kind=body.kind, host_id=user.id, lat=body.lat, lng=body.lng,
        hex_id=hex_for(body.lat, body.lng), place_name=body.place_name, place_type=body.place_type,
        bad_weather=bool(weather and weather["bad"]), started_at=now,
        visibility="open" if open_hang else "friends",
        activity=(body.activity or "").strip() or None,
        max_size=body.max_size if body.kind == "group" else None,
        join_mode=body.join_mode if open_hang else "anyone",
    )
    db.add(hang)
    db.flush()
    db.add(HangMember(hang_id=hang.id, user_id=user.id, joined_at=now, last_verified_at=now, joined_via="host"))
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
    if hang.max_size and here_count(hang) >= hang.max_size:
        raise HTTPException(409, f"This Hang is full ({hang.max_size} people max).")
    now = utcnow()
    db.add(HangMember(hang_id=hang.id, user_id=user.id, joined_at=now, last_verified_at=now, joined_via="code"))
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


@router.post("/hangs/{hang_id}/timer")
def set_timer(hang_id: int, body: HangTimer, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Host sets "buzz us in N minutes" (or clears it). Everyone still in the Hang gets a notification when
    it's up. The demo speed-up (POINTS_TIME_SCALE) applies, so with 60 a 30-minute timer takes 30 seconds."""
    hang = _get_hang(db, hang_id)
    if hang.host_id != user.id:
        raise HTTPException(403, "Only the host can set the timer")
    if hang.status != "active":
        raise HTTPException(409, "This Hang already ended")
    hang.timer_ends_at = (None if body.minutes is None
                          else utcnow() + timedelta(seconds=body.minutes * 60 / POINTS_TIME_SCALE))
    hang.timer_sent_at = None
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


def _finish_hang(db: Session, hang: Hang, end_at: datetime, reason: str) -> None:
    """Score everyone, update streaks, add territory, send Friend or Foe alerts. The caller commits."""
    hang.status, hang.ended_at, hang.end_reason = "ended", end_at, reason
    now = utcnow()
    owner_before = territory.owner_of(db, hang.hex_id)
    hang.hex_owner_before_id = owner_before
    today = local_today()
    day_start = local_day_start_utc(today)
    # Nobody else stayed? Then it was really a solo session, with the solo rules.
    host = db.get(User, hang.host_id)
    solo_at_home = not _someone_else_stayed(hang, end_at) and not _solo_counts(hang, host)
    # Double points if the Hang's zone was a hot zone on the day it started (hotzones.py)
    hot_zone = hotzones.is_hot(hang.hex_id, hotzones.local_date(hang.started_at))

    # People who really took part: stayed MIN_HANG_MINUTES and didn't just go home. They count for the
    # new-people bonus (so someone popping in for a second doesn't count).
    stayed = [m for m in hang.members if m.left_reason != "left_area"
              and _scaled_minutes(m.joined_at, min(m.left_at or end_at, end_at)) >= MIN_HANG_MINUTES]

    for m in hang.members:
        u = m.user
        stop = min(m.left_at or end_at, end_at)   # everyone still checked in stops when the Hang ends
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
        met_before = people_met(db, u.id, exclude_hang_id=hang.id)
        new_people = [o.user.name for o in stayed if o.user_id != u.id and o.user_id not in met_before]
        result = score_member(
            seconds=(stop - m.joined_at).total_seconds(),
            phones_down_seconds=m.phones_down_seconds or 0,
            teammates=teammates, others=others, streak_days=u.streak, place_type=hang.place_type,
            new_place=not been_here, bad_weather=hang.bad_weather,
            left_area=m.left_reason == "left_area", cap_left=DAILY_POINTS_CAP - int(earned_today),
            solo_at_home=solo_at_home if m.user_id == hang.host_id else False,
            new_people=len(new_people), hot_zone=hot_zone,
        )
        result["new_people_names"] = new_people
        m.points_earned, m.breakdown = result["total"], result
        u.points += result["total"]
        if result["total"] > 0 and u.team_id:
            db.add(HexScore(hex_id=hang.hex_id, team_id=u.team_id, hang_id=hang.id,
                            points=result["total"], earned_at=now))

    db.flush()
    owner_after = territory.owner_of(db, hang.hex_id)
    plans.after_hang_finished(db, hang)  # rallies: mark done; Team up: start a truce if both teams showed up
    territory.notify_friend_or_foe(db, hang.hex_id, hang.place_name or "a zone near you",
                                   owner_before, owner_after, skip_push={m.user_id for m in hang.members})


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

    _finish_hang(db, hang, utcnow(), "host")
    db.commit()
    _announce_end(hang, skip_user_id=user.id)
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
