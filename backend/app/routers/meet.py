"""Meet: helping people find new people, not just their usual friends.

- Open Hangs: a Hang marked "open" shows up for people nearby (within OPEN_HANG_RADIUS_M), people who share
  your interests first. Exact spots of "I approve each person" Hangs are only shown once you're accepted.
- "I'm coming": anyone-can-come Hangs say yes straight away; otherwise the host gets a request with a small
  profile (interests, Hangs done) and taps Accept or Decline. A full Hang (max_size) takes no more people.
- Checking yourself in: tap "I'm here" (the app also does it by itself when you arrive with the app open).
  The server checks you're within JOIN_RADIUS_M of the Hang, so the host never has to stop to scan anyone.
- After the game the host can say someone wasn't really there: their points for it are taken back.
- Your people: everyone you've hung out with and your hours together. About 50 hours makes a casual friend,
  90 a friend, 200 a close friend (Jeffrey Hall, Journal of Social and Personal Relationships, 2018).
- Icebreakers for people meeting for the first time, and reports (enough of them block open Hangs).
"""
import json
from collections import Counter
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import notify
from ..auth import current_user
from ..config import JOIN_RADIUS_M, OPEN_HANG_RADIUS_M, POINTS_TIME_SCALE
from ..db import get_db
from ..geo import distance_m
from ..models import Hang, HangMember, HangRsvp, HexScore, Notification, Report, User
from ..serializers import hang_out, here_count, people_met, spots_left, team_out
from ..timeutil import iso, utcnow
from .hangs import Location, _active_membership, _auto_end_if_due, _close_phones_down, _get_hang, is_blocked

router = APIRouter(tags=["meet"])

# Hours together it takes to reach each friendship level (Hall 2018)
FRIEND_LEVELS = [(0, "Acquaintance"), (50, "Casual friend"), (90, "Friend"), (200, "Close friend")]
REMOVE_WINDOW = timedelta(hours=2)  # the host can say someone wasn't there up to 2 h after the Hang ends

GENERIC_QUESTIONS = [
    "What's something you're weirdly good at?",
    "What's the best thing you've eaten in Montreal?",
    "What would you do with a free Saturday and no phone?",
    "What's a hobby you'd pick up if you had the time?",
    "What's the last thing that made you laugh out loud?",
    "Where's your favourite spot in the city, and why?",
]
ICEBREAKERS = {
    "Basketball": ["Who's the best player you've ever played against?", "Shooter or defender, honestly?"],
    "Soccer": ["Which team do you support, and why them?", "Best goal you've ever scored?"],
    "Running": ["What's the longest run you've ever done?", "Morning runner or evening runner?"],
    "Climbing": ["What's the hardest route you've sent?", "Bouldering or ropes?"],
    "Gym": ["What's your favourite day: push, pull or legs?", "What got you into lifting?"],
    "Tennis": ["Who taught you to play?", "Favourite player to watch?"],
    "Hiking": ["Best view you've ever hiked to?", "Where's the next trail on your list?"],
    "Board games": ["What's the game you always win?", "Which game ruined a friendship?"],
    "Coffee": ["What's your go-to order?", "Best café you've found so far?"],
    "Reading": ["What's the last book you couldn't put down?", "Which book would you make everyone read?"],
    "Art": ["Who's an artist you'd love to meet?", "Do you make art, or mostly look at it?"],
    "Music": ["What song is on repeat for you right now?", "Best concert you've been to?"],
    "Movies": ["What movie could you watch a hundred times?", "Last movie you saw in a theatre?"],
    "Food": ["What's the best cheap eat around here?", "What dish could you cook for us?"],
    "Photography": ["What's the best photo you've ever taken?", "Phone or camera?"],
    "Bowling": ["What's your best score ever?", "Spin or straight?"],
    "Study": ["What's your program, and why did you pick it?", "Best study spot on campus?"],
}


def _require_open(hang: Hang) -> None:
    if hang.status != "active":
        raise HTTPException(409, "This Hang already ended")
    if (hang.visibility or "friends") != "open":
        raise HTTPException(403, "This Hang is friends only. Scan the host's QR code to join.")


def _rsvp(db: Session, hang_id: int, user_id: int) -> HangRsvp | None:
    return db.scalar(select(HangRsvp).where(HangRsvp.hang_id == hang_id, HangRsvp.user_id == user_id))


def _maps_url(lat: float, lng: float) -> str:
    return f"https://www.google.com/maps/search/?api=1&query={lat:.6f},{lng:.6f}"


def _open_card(db: Session, hang: Hang, user: User, lat: float, lng: float) -> dict:
    """One open Hang as Meet shows it, from this person's point of view."""
    d = distance_m(hang.lat, hang.lng, lat, lng)
    here = [m for m in hang.members if m.left_at is None]
    mine = set(user.interests or [])
    others = [m for m in here if m.user_id != user.id]
    sharing = [m for m in others if mine & set(m.user.interests or [])]
    shared = sorted(mine & set().union(*[set(m.user.interests or []) for m in others])) if others else []
    member = any(m.user_id == user.id and m.left_at is None for m in hang.members)
    r = _rsvp(db, hang.id, user.id)
    status = "member" if member else (r.status if r else None)
    # Exact spot: always for anyone-can-come Hangs (they're in public places); for approved ones, once you're in
    show_spot = (hang.join_mode or "anyone") != "approve" or status in ("member", "going", "arrived")
    return {
        "id": hang.id,
        "activity": hang.activity,
        "place_name": hang.place_name,
        "host": {"id": hang.host_id, "name": hang.host.name, "team": team_out(hang.host.team)},
        "distance_m": int(round(d / 50) * 50),
        "here_count": len(here),
        "max_size": hang.max_size,
        "spots_left": spots_left(db, hang),
        "join_mode": hang.join_mode or "anyone",
        "people": [{"name": m.user.name, "team": team_out(m.user.team)} for m in here][:6],
        "sharing_count": len(sharing),
        "shared_interests": shared[:3],
        "started_at": iso(hang.started_at),
        "my_status": status,
        "in_reach": d <= JOIN_RADIUS_M,
        "lat": hang.lat if show_spot else None,
        "lng": hang.lng if show_spot else None,
        "maps_url": _maps_url(hang.lat, hang.lng) if show_spot else None,
    }


@router.get("/meet/open-hangs")
def open_hangs(lat: float = Query(ge=-90, le=90), lng: float = Query(ge=-180, le=180),
               user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Open Hangs near you: the ones you're in or going to first, then by shared interests, then distance."""
    cards = []
    for hang in db.scalars(select(Hang).where(Hang.status == "active", Hang.visibility == "open")).all():
        if _auto_end_if_due(db, hang):
            continue
        if distance_m(hang.lat, hang.lng, lat, lng) > OPEN_HANG_RADIUS_M:
            continue
        cards.append(_open_card(db, hang, user, lat, lng))
    cards.sort(key=lambda c: (c["my_status"] not in ("member", "going", "pending"),
                              -c["sharing_count"], c["distance_m"]))
    return cards


@router.get("/me/rsvp")
def my_rsvp(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The open Hang you said you're coming to (the app checks you in by itself when you get there)."""
    r = db.scalar(select(HangRsvp).join(Hang).where(
        HangRsvp.user_id == user.id, HangRsvp.status == "going", Hang.status == "active")
        .order_by(HangRsvp.created_at.desc()))
    if r is None or _auto_end_if_due(db, r.hang):
        return {"rsvp": None}
    return {"rsvp": {"hang_id": r.hang_id, "lat": r.hang.lat, "lng": r.hang.lng, "activity": r.hang.activity}}


@router.post("/hangs/{hang_id}/rsvp")
def rsvp(hang_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """'I'm coming'. Anyone-can-come Hangs say yes; approve-each-person Hangs send the host a request."""
    hang = _get_hang(db, hang_id)
    _require_open(hang)
    if any(m.user_id == user.id and m.left_at is None for m in hang.members):
        return {"status": "member"}
    if is_blocked(db, user.id):
        raise HTTPException(403, "You can't join open Hangs right now because of reports from other players.")
    r = _rsvp(db, hang.id, user.id)
    if r and r.status in ("going", "pending", "arrived"):
        return {"status": r.status}
    if r and r.status == "declined":
        raise HTTPException(403, "The host can't take more people this time.")
    if spots_left(db, hang) == 0:
        raise HTTPException(409, "This Hang is full.")
    status = "pending" if (hang.join_mode or "anyone") == "approve" else "going"
    if r is None:
        r = HangRsvp(hang_id=hang.id, user_id=user.id)
        db.add(r)
    r.status, r.created_at, r.decided_at = status, utcnow(), None
    what = hang.activity or "your Hang"
    if status == "pending":
        message = f"{user.name} wants to join {what}. Open the Hang to say yes or no."
        db.add(Notification(user_id=hang.host_id, kind="hang_request", message=message))
        db.commit()
        notify.send([hang.host_id], "Someone wants to join", message, url=f"/hang/{hang.id}")
    else:
        # No push here: the host shouldn't have to stop a game every time someone says they're coming
        db.add(Notification(user_id=hang.host_id, kind="hang_rsvp", message=f"{user.name} is coming to {what}!"))
        db.commit()
    return {"status": status}


@router.delete("/hangs/{hang_id}/rsvp")
def cancel_rsvp(hang_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    r = _rsvp(db, hang_id, user.id)
    if r and r.status in ("going", "pending"):
        r.status, r.decided_at = "cancelled", utcnow()
        db.commit()
    return {"status": None}


@router.post("/hangs/{hang_id}/rsvps/{user_id}/{answer}")
def answer_rsvp(hang_id: int, user_id: int, answer: str, user: User = Depends(current_user),
                db: Session = Depends(get_db)):
    """The host accepts or declines a request to join."""
    if answer not in ("accept", "decline"):
        raise HTTPException(404, "Not found")
    hang = _get_hang(db, hang_id)
    if hang.host_id != user.id:
        raise HTTPException(403, "Only the host can answer requests")
    _require_open(hang)
    r = _rsvp(db, hang.id, user_id)
    if r is None or r.status != "pending":
        return hang_out(db, hang)
    what = hang.activity or f"{user.name}'s Hang"
    if answer == "accept":
        if spots_left(db, hang) == 0:
            raise HTTPException(409, "Your Hang is full. Make room first, or decline.")
        r.status, r.decided_at = "going", utcnow()
        message = f"You're in! {user.name} said yes to {what}. Tap I'm here when you arrive."
        db.add(Notification(user_id=user_id, kind="hang_accepted", message=message))
        db.commit()
        notify.send([user_id], "You're in!", message, url="/meet")
    else:
        r.status, r.decided_at = "declined", utcnow()
        db.add(Notification(user_id=user_id, kind="hang_declined",
                            message=f"{what} can't take more people this time. Try another one nearby!"))
        db.commit()
    return hang_out(db, hang)


@router.post("/hangs/{hang_id}/arrive")
def arrive(hang_id: int, body: Location, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """'I'm here': check yourself in to an open Hang. The server checks you're really there."""
    hang = _get_hang(db, hang_id)
    if any(m.user_id == user.id and m.left_at is None for m in hang.members):
        return hang_out(db, hang)
    _require_open(hang)
    if any(m.user_id == user.id for m in hang.members):
        raise HTTPException(409, "You already left this Hang.")
    if is_blocked(db, user.id):
        raise HTTPException(403, "You can't join open Hangs right now because of reports from other players.")
    r = _rsvp(db, hang.id, user.id)
    going = r is not None and r.status == "going"
    if (hang.join_mode or "anyone") == "approve" and not going:
        raise HTTPException(403, "The host approves each person for this Hang. Tap I'm coming and wait for a yes.")
    if _active_membership(db, user):
        raise HTTPException(409, "Check out of your current Hang before joining another")
    d = distance_m(hang.lat, hang.lng, body.lat, body.lng)
    if d > JOIN_RADIUS_M:
        far = f"{d / 1000:.1f} km" if d >= 1000 else f"{d:.0f} m"
        raise HTTPException(400, f"You're {far} away. You can check in once you're within {JOIN_RADIUS_M:.0f} m.")
    full = bool(hang.max_size) and ((here_count(hang) >= hang.max_size) if going else (spots_left(db, hang) == 0))
    if hang.max_size and full:
        raise HTTPException(409, f"This Hang is full ({hang.max_size} people max).")
    now = utcnow()
    db.add(HangMember(hang_id=hang.id, user_id=user.id, joined_at=now, last_verified_at=now, joined_via="arrive"))
    if r is not None:
        r.status, r.decided_at = "arrived", now
    db.commit()
    db.refresh(hang)
    return hang_out(db, hang)


@router.post("/hangs/{hang_id}/members/{user_id}/remove")
def remove_member(hang_id: int, user_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The host says someone who checked themselves in wasn't really there. During the Hang their time stops;
    afterwards (up to 2 h) their points for it are taken back. It also counts as a report."""
    hang = _get_hang(db, hang_id)
    if hang.host_id != user.id:
        raise HTTPException(403, "Only the host can do that")
    m = next((x for x in hang.members if x.user_id == user_id), None)
    if m is None or m.user_id == hang.host_id:
        raise HTTPException(404, "They're not in this Hang")
    if m.joined_via != "arrive":
        raise HTTPException(400, "Only people who checked themselves in can be removed")
    if m.left_reason == "removed":
        return hang_out(db, hang)
    if hang.status == "ended":
        if hang.ended_at and utcnow() - hang.ended_at > REMOVE_WINDOW:
            raise HTTPException(409, "It's too late to change this Hang")
        earned = m.points_earned or 0
        if earned:
            m.user.points = max((m.user.points or 0) - earned, 0)
            if m.user.team_id:
                score = db.scalar(select(HexScore).where(HexScore.hang_id == hang.id,
                                                         HexScore.team_id == m.user.team_id,
                                                         HexScore.points == earned))
                if score:
                    db.delete(score)
        m.points_earned = 0
        m.breakdown = {**(m.breakdown or {}), "removed": True, "total": 0}
    else:
        _close_phones_down(m, m.joined_at)
        m.left_at = m.joined_at  # their time never counted
    m.left_reason = "removed"
    db.add(Report(reporter_id=user.id, user_id=m.user_id, hang_id=hang.id,
                  reason="The host said they weren't at the Hang"))
    db.add(Notification(user_id=m.user_id, kind="hang_removed",
                        message=f"{user.name} said you weren't at their Hang, so it didn't count."))
    db.commit()
    db.refresh(hang)
    return hang_out(db, hang)


class ReportIn(BaseModel):
    user_id: int
    hang_id: int | None = None
    reason: str = Field(min_length=1, max_length=200)


@router.post("/reports")
def report(body: ReportIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Report a player. Reports from REPORTS_TO_BLOCK different people block them from open Hangs."""
    if body.user_id == user.id:
        raise HTTPException(400, "You can't report yourself")
    if db.get(User, body.user_id) is None:
        raise HTTPException(404, "No such player")
    already = db.scalar(select(Report).where(Report.reporter_id == user.id, Report.user_id == body.user_id,
                                             Report.hang_id == body.hang_id))
    if already is None:
        db.add(Report(reporter_id=user.id, user_id=body.user_id, hang_id=body.hang_id, reason=body.reason.strip()))
        db.commit()
    return {"ok": True}


def _stop(m: HangMember, hang: Hang):
    return m.left_at or hang.ended_at or utcnow()


def _level(hours: float) -> dict:
    current = FRIEND_LEVELS[0]
    nxt = None
    for i, (need, name) in enumerate(FRIEND_LEVELS):
        if hours >= need:
            current = (need, name)
            nxt = FRIEND_LEVELS[i + 1] if i + 1 < len(FRIEND_LEVELS) else None
    progress = 1.0 if nxt is None else (hours - current[0]) / (nxt[0] - current[0])
    return {
        "level": current[1],
        "next_level": nxt[1] if nxt else None,
        "hours_to_next": round(nxt[0] - hours, 1) if nxt else 0,
        "progress": round(min(max(progress, 0), 1), 3),
    }


def hours_together(db: Session, user_id: int) -> dict[int, dict]:
    """For everyone you've shared a Hang with: overlapping time (in game hours) and when you last hung out."""
    together: dict[int, dict] = {}
    for mine in db.scalars(select(HangMember).where(HangMember.user_id == user_id)).all():
        if mine.left_reason == "removed":
            continue
        hang = mine.hang
        start, stop = mine.joined_at, _stop(mine, hang)
        for other in hang.members:
            if other.user_id == user_id or other.left_reason == "removed":
                continue
            seconds = (min(stop, _stop(other, hang)) - max(start, other.joined_at)).total_seconds()
            if seconds <= 0:
                continue
            entry = together.setdefault(other.user_id, {"seconds": 0.0, "last": hang.started_at, "hangs": 0})
            entry["seconds"] += seconds
            entry["hangs"] += 1
            entry["last"] = max(entry["last"], hang.started_at)
    return together


@router.get("/meet/people")
def my_people(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Everyone you've hung out with, your hours together and how close you are to the next friendship level."""
    mine = set(user.interests or [])
    people = []
    for other_id, t in hours_together(db, user.id).items():
        other = db.get(User, other_id)
        if other is None:
            continue
        hours = t["seconds"] * POINTS_TIME_SCALE / 3600
        people.append({
            "user": {"id": other.id, "name": other.name, "team": team_out(other.team)},
            "hours": round(hours, 1),
            "hangs": t["hangs"],
            "last_hang_at": iso(t["last"]),
            "shared_interests": sorted(mine & set(other.interests or []))[:3],
            **_level(hours),
        })
    people.sort(key=lambda p: (-p["hours"], p["user"]["name"]))
    return people


@router.post("/meet/people/{user_id}/hang-again")
def hang_again(user_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """'Hang again': let someone you've hung out with know you'd like to see them again."""
    if user_id not in hours_together(db, user.id):
        raise HTTPException(404, "You haven't hung out with them yet")
    message = f"{user.name} wants to hang out again!"
    recent = db.scalar(select(Notification).where(
        Notification.user_id == user_id, Notification.kind == "hang_again", Notification.message == message,
        Notification.created_at >= utcnow() - timedelta(hours=6)))
    if recent is None:
        db.add(Notification(user_id=user_id, kind="hang_again", message=message))
        db.commit()
        notify.send([user_id], "Hang again?", message, url="/meet")
    return {"ok": True}


@router.get("/hangs/{hang_id}/icebreaker")
def icebreaker(hang_id: int, n: int = Query(default=0, ge=0), user: User = Depends(current_user),
               db: Session = Depends(get_db)):
    """A question for people meeting for the first time, picked from what they have in common."""
    hang = _get_hang(db, hang_id)
    here = [m for m in hang.members if m.left_at is None]
    if user.id not in {m.user_id for m in here} or hang.status != "active":
        return {"show": False}
    first_timers: set[int] = set()
    for i, a in enumerate(here):
        met = people_met(db, a.user_id, exclude_hang_id=hang.id)
        for b in here[i + 1:]:
            if b.user_id not in met:
                first_timers.update((a.user_id, b.user_id))
    if not first_timers:
        return {"show": False}
    counts = Counter(i for m in here for i in set(m.user.interests or []))
    shared = [name for name, c in counts.most_common() if c >= 2]
    topic = next((t for t in shared if t in ICEBREAKERS), None)
    if topic is None and hang.activity in ICEBREAKERS:
        topic = hang.activity
    questions = _ai_icebreakers(topic, hang.activity, shared) or (ICEBREAKERS.get(topic, []) + GENERIC_QUESTIONS)
    return {
        "show": True,
        "topic": topic,
        "question": questions[n % len(questions)],
        "first_timers": [m.user.name for m in here if m.user_id in first_timers],
    }


# ---------- AI: "What should we do?", icebreakers, "why you'd like it" ----------
# Each one has a built-in answer, used when there's no GEMINI_API_KEY or the model call fails.

IDEAS = {
    "Basketball": [("21 to 11", "Everyone for themselves; first to 11 picks the next game."),
                   ("Shooting ladder", "Make it from each spot on the arc before moving out.")],
    "Soccer": [("Small-sided game", "Split into two teams, small goals, no keepers."),
               ("Crossbar challenge", "Everyone gets three tries; loser grabs the water.")],
    "Running": [("Easy loop, then strides", "Run together at talking pace, finish with 4 short sprints."),
                ("Pick a landmark", "Run to a spot none of you have been, then walk back.")],
    "Tennis": [("King of the court", "Winner of each point stays on; everyone rotates in."),
               ("Doubles with switches", "Swap partners every game so everyone plays together.")],
    "Board games": [("Quick-game tournament", "Short games, everyone plays everyone once."),
                    ("Teach-a-game", "Each person teaches a game the others don't know.")],
    "Coffee": [("Café hop", "Pick two cafés nearby; everyone rates the same drink at each."),
               ("Walk and sip", "Grab drinks to go and walk somewhere none of you know.")],
    "Hiking": [("Summit and photo", "Head for the best lookout and take one group photo."),
               ("Trail bingo", "Spot a dog, a squirrel, a runner, a great view.")],
    "Study": [("50/10 sprints", "50 minutes of focus, 10 minutes of talking. Repeat."),
              ("Teach-back", "Each person explains one thing they learned to the others.")],
    "Food": [("Cheap-eats crawl", "Split three small dishes at three spots nearby."),
             ("Picnic", "Everyone brings one thing; eat outside if it's nice.")],
}
GENERIC_IDEAS = [
    ("Walk somewhere new", "Pick a street or park none of you have been to and explore."),
    ("Two truths and a lie", "A quick game to learn something about everyone."),
    ("Photo challenge", "15 minutes to take the best photo of something nearby; vote on the winner."),
    ("Find the best view", "Head to the highest point you can reach nearby."),
]


def _local_time_label() -> str:
    from zoneinfo import ZoneInfo

    from ..config import TIMEZONE
    from ..timeutil import utcnow as _now
    h = _now().astimezone(ZoneInfo(TIMEZONE)).hour
    return "morning" if 5 <= h < 12 else "afternoon" if h < 17 else "evening" if h < 22 else "night"


def _group_context(hang: Hang) -> dict:
    here = [m for m in hang.members if m.left_at is None]
    counts = Counter(i for m in here for i in set(m.user.interests or []))
    return {
        "here": here,
        "shared": [name for name, c in counts.most_common() if c >= 2][:4],
        "common": [name for name, _ in counts.most_common(6)],
    }


@router.get("/hangs/{hang_id}/ideas")
def hang_ideas(hang_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Three things this group could do right now, from what they have in common, the time and the weather."""
    from .. import ai
    from ..weather import current_weather

    hang = _get_hang(db, hang_id)
    ctx = _group_context(hang)
    if user.id not in {m.user_id for m in ctx["here"]}:
        raise HTTPException(403, "Only people in this Hang can see its ideas")
    weather = current_weather(hang.lat, hang.lng) if ai.enabled() else None
    prompt = (
        "You suggest things for a small group of people who just met up in person in Montreal to do together "
        "right now. Keep it cheap or free, safe, doable where they are, and fun for people who may not know "
        "each other well. No phones as the main activity.\n"
        f"Group size: {len(ctx['here'])}\n"
        f"Planned activity: {hang.activity or 'none'}\n"
        f"Interests they share: {', '.join(ctx['shared']) or 'none'}\n"
        f"Other interests in the group: {', '.join(ctx['common']) or 'unknown'}\n"
        f"Where: {hang.place_name or 'a public spot'}\n"
        f"Time of day: {_local_time_label()}\n"
        f"Weather: {weather['label'] + ', ' + str(weather['temp_c']) + ' C' if weather else 'unknown'}\n"
        'Reply with JSON: {"ideas": [{"title": "max 5 words", "detail": "one sentence, max 18 words"}]} '
        "with exactly 3 ideas, the best first."
    )
    data = ai.ask_json(prompt)
    ideas = []
    if isinstance(data, dict):
        for i in data.get("ideas") or []:
            if isinstance(i, dict) and i.get("title"):
                ideas.append({"title": ai.clean(i["title"], 40), "detail": ai.clean(i.get("detail"), 140)})
    if len(ideas) >= 2:
        return {"source": "ai", "ideas": ideas[:3]}
    keys = [hang.activity] + ctx["shared"]
    pool = [x for k in keys if k in IDEAS for x in IDEAS[k]] + GENERIC_IDEAS
    seen, out = set(), []
    for title, detail in pool:
        if title not in seen:
            seen.add(title)
            out.append({"title": title, "detail": detail})
    return {"source": "builtin", "ideas": out[:3]}


def _ai_icebreakers(topic: str | None, activity: str | None, shared: list[str]) -> list[str]:
    from .. import ai
    prompt = (
        "Write icebreaker questions for people meeting for the first time in person at a casual meetup. "
        "Friendly, light, easy to answer, nothing personal or awkward (no dating, money, religion, politics).\n"
        f"What they're doing: {activity or 'hanging out'}\n"
        f"Interests they share: {', '.join(shared) or 'unknown'}\n"
        'Reply with JSON: {"questions": ["..."]} with 5 questions, each under 14 words.'
    )
    data = ai.ask_json(prompt)
    qs = data.get("questions") if isinstance(data, dict) else None
    return [ai.clean(q, 120) for q in qs if isinstance(q, str) and q.strip()][:5] if isinstance(qs, list) else []


@router.get("/meet/why")
def why_youd_like(ids: str = Query(max_length=200), user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    """One short line per open Hang on why you might enjoy it. Empty when there's no AI (Meet already
    shows shared interests on each card)."""
    from .. import ai
    if not ai.enabled():
        return {}
    wanted = [int(x) for x in ids.split(",") if x.strip().isdigit()][:6]
    rows = []
    for hid in wanted:
        hang = db.get(Hang, hid)
        if hang is None or hang.status != "active" or hang.visibility != "open":
            continue
        ctx = _group_context(hang)
        rows.append({"id": hid, "activity": hang.activity or "hanging out", "size": len(ctx["here"]),
                     "group_interests": ctx["common"][:5]})
    if not rows:
        return {}
    prompt = (
        "For each meetup below, write one short, friendly line (max 12 words) telling this person why they "
        "might enjoy joining. Base it on their interests and the group's. Don't invent facts.\n"
        f"Their interests: {', '.join(user.interests or []) or 'unknown'}\n"
        f"Meetups: {json.dumps(rows)}\n"
        'Reply with JSON: {"lines": [{"id": 1, "line": "..."}]}'
    )
    data = ai.ask_json(prompt)
    out = {}
    if isinstance(data, dict):
        for item in data.get("lines") or []:
            if isinstance(item, dict) and item.get("id") in wanted and item.get("line"):
                out[str(item["id"])] = ai.clean(item["line"], 90)
    return out
