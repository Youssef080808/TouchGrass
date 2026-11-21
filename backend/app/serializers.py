"""Turn database rows into the JSON the app receives."""
from sqlalchemy.orm import Session

from . import territory
from .models import Hang, HangMember, Team, User
from .points import party_multiplier
from .timeutil import iso, utcnow

PHONES_DOWN_HEARTBEAT_GRACE_S = 20  # a phones-down stretch only counts up to 20 s after the last heartbeat


def team_out(team: Team | None) -> dict | None:
    if team is None:
        return None
    return {"id": team.id, "name": team.name, "color": team.color}


def user_out(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.name,
        "team": team_out(user.team),
        "interests": user.interests or [],
        "points": user.points,
        "streak": user.streak,
        "has_home": user.home_lat is not None,
    }


def phones_down_active(m: HangMember) -> bool:
    if m.phones_down_since is None or m.phones_down_seen_at is None:
        return False
    return (utcnow() - m.phones_down_seen_at).total_seconds() <= PHONES_DOWN_HEARTBEAT_GRACE_S


def counted_party(hang: Hang, m: HangMember) -> tuple[int, int]:
    """(teammates, other players) who count toward this member's party bonus.
    Everyone who joined counts, except people whose time stopped because they went home.
    People with no team count as other players, not as each other's teammates."""
    others = [o for o in hang.members if o.id != m.id and o.left_reason != "left_area"]
    team_id = m.user.team_id
    teammates = sum(1 for o in others if team_id is not None and o.user.team_id == team_id)
    return teammates, len(others) - teammates


def hang_out(db: Session, hang: Hang) -> dict:
    members = []
    for m in hang.members:
        teammates, others = counted_party(hang, m)
        members.append({
            "user_id": m.user_id,
            "name": m.user.name,
            "team": team_out(m.user.team),
            "joined_at": iso(m.joined_at),
            "left_at": iso(m.left_at),
            "left_reason": m.left_reason,
            "phones_down_active": phones_down_active(m),
            "phones_down_since": iso(m.phones_down_since),
            "phones_down_seconds": round(m.phones_down_seconds or 0),
            "party_multiplier": round(party_multiplier(teammates, others), 2),
            "points_earned": m.points_earned,
            "breakdown": m.breakdown,
        })
    data = {
        "id": hang.id,
        "code": hang.code,
        "kind": hang.kind,
        "status": hang.status,
        "host_id": hang.host_id,
        "place_name": hang.place_name,
        "place_type": hang.place_type,
        "hex_id": hang.hex_id,
        "bad_weather": hang.bad_weather,
        "started_at": iso(hang.started_at),
        "ended_at": iso(hang.ended_at),
        "members": members,
        "hex_owner": None,
        "hex_owner_before": None,
    }
    if hang.status == "ended":
        owner_id = territory.owner_of(db, hang.hex_id)
        data["hex_owner"] = team_out(db.get(Team, owner_id)) if owner_id else None
        before_id = hang.hex_owner_before_id
        data["hex_owner_before"] = team_out(db.get(Team, before_id)) if before_id else None
    return data
