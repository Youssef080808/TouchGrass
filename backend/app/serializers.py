"""Turn database rows into the JSON the app receives."""
from sqlalchemy.orm import Session

from . import territory
from .models import Hang, Team, User
from .points import party_multiplier
from .timeutil import iso


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


def hang_out(db: Session, hang: Hang) -> dict:
    members = []
    for m in hang.members:
        if m.break_reason == "left" and hang.status == "active":
            continue  # people who left aren't shown in a live Hang
        others = [o for o in hang.members if o.id != m.id]
        teammates = sum(1 for o in others if o.user.team_id == m.user.team_id)
        members.append({
            "user_id": m.user_id,
            "name": m.user.name,
            "team": team_out(m.user.team),
            "joined_at": iso(m.joined_at),
            "broke_at": iso(m.broke_at),
            "break_reason": m.break_reason,
            "party_multiplier": 1.0 if m.broke_at else round(party_multiplier(teammates, len(others) - teammates), 2),
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
    }
    if hang.status == "ended":
        owner_id = territory.owner_of(db, hang.hex_id)
        data["hex_owner"] = team_out(db.get(Team, owner_id)) if owner_id else None
    return data
