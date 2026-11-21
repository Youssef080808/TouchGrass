"""Teams: list, start one, ask to join, accept or decline, leave.

You can't just put yourself on a team. Asking to join sends a request to everyone on that team, and you're in
as soon as any one of them accepts (the first answer counts). A team with nobody on it is open, since there's
no one to ask. You can ask to join another team while you're on one; you switch over when they accept.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import notify
from ..auth import current_user
from ..db import get_db
from ..models import Notification, Team, TeamJoinRequest, User
from ..serializers import team_out
from ..timeutil import iso, utcnow

router = APIRouter(tags=["teams"])

HEX_COLOR = r"^#[0-9a-fA-F]{6}$"


class NewTeam(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    color: str = Field(pattern=HEX_COLOR)


def _member_count(db: Session, team_id: int) -> int:
    return db.scalar(select(func.count()).select_from(User).where(User.team_id == team_id)) or 0


def _cancel_pending(db: Session, user: User) -> None:
    """You can only wait on one team at a time."""
    for r in db.scalars(select(TeamJoinRequest).where(TeamJoinRequest.user_id == user.id,
                                                      TeamJoinRequest.status == "pending")):
        r.status, r.decided_at = "cancelled", utcnow()


def create_team(db: Session, user: User, name: str, color: str) -> Team:
    """Start a team and put the user on it (whoever starts a team doesn't need anyone's OK)."""
    name = name.strip()
    if not name:
        raise HTTPException(400, "Give your team a name")
    if db.scalar(select(Team).where(func.lower(Team.name) == name.lower())):
        raise HTTPException(409, "A team with that name already exists. Ask to join it instead.")
    team = Team(name=name, color=color)
    db.add(team)
    db.flush()
    _cancel_pending(db, user)
    user.team_id = team.id
    return team


def request_to_join(db: Session, user: User, team: Team) -> TeamJoinRequest:
    """Ask to join a team. An empty team has nobody to ask, so you're in straight away."""
    if user.team_id == team.id:
        raise HTTPException(409, f"You're already on {team.name}")
    existing = db.scalar(select(TeamJoinRequest).where(
        TeamJoinRequest.user_id == user.id, TeamJoinRequest.team_id == team.id, TeamJoinRequest.status == "pending"))
    if existing:
        return existing
    _cancel_pending(db, user)
    req = TeamJoinRequest(user_id=user.id, team_id=team.id, created_at=utcnow())
    if _member_count(db, team.id) == 0:
        req.status, req.decided_at = "accepted", req.created_at
        user.team_id = team.id
    else:
        members = db.scalars(select(User.id).where(User.team_id == team.id)).all()
        notify.send(members, "Join request", f"{user.name} wants to join {team.name}. Anyone on the team can accept.",
                    "/me")
    db.add(req)
    db.flush()
    return req


def _request_out(db: Session, r: TeamJoinRequest) -> dict:
    current = db.get(Team, r.user.team_id) if r.user.team_id else None
    return {
        "id": r.id,
        "status": r.status,
        "team": team_out(r.team),
        "user": {"id": r.user.id, "name": r.user.name, "points": r.user.points, "team": team_out(current)},
        "created_at": iso(r.created_at),
    }


def my_team_out(db: Session, user: User) -> dict:
    """What the app needs about teams: your team and its members, requests waiting for your team to answer,
    and your own request if you're waiting on one."""
    team = db.get(Team, user.team_id) if user.team_id else None
    out = {"team": team_out(team), "members": [], "requests": [], "my_request": None}
    if team:
        members = db.scalars(select(User).where(User.team_id == team.id).order_by(User.points.desc(), User.name))
        out["members"] = [{"id": u.id, "name": u.name, "points": u.points, "streak": u.streak} for u in members]
        waiting = db.scalars(select(TeamJoinRequest).where(
            TeamJoinRequest.team_id == team.id, TeamJoinRequest.status == "pending").order_by(TeamJoinRequest.id))
        out["requests"] = [_request_out(db, r) for r in waiting]
    mine = db.scalar(select(TeamJoinRequest).where(
        TeamJoinRequest.user_id == user.id, TeamJoinRequest.status == "pending"))
    if mine:
        out["my_request"] = _request_out(db, mine)
    return out


@router.get("/teams")
def list_teams(db: Session = Depends(get_db)):
    counts = dict(db.execute(select(User.team_id, func.count()).group_by(User.team_id)).all())
    return [{**team_out(t), "members": counts.get(t.id, 0)} for t in db.scalars(select(Team).order_by(Team.name))]


@router.post("/teams")
def start_team(body: NewTeam, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Start a new team and join it. If you were on another team, you leave it."""
    create_team(db, user, body.name, body.color)
    db.commit()
    return my_team_out(db, user)


@router.get("/me/team")
def my_team(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return my_team_out(db, user)


@router.post("/teams/{team_id}/join")
def ask_to_join(team_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Send a join request to the team's members (or join right away if the team is empty)."""
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(404, "That team doesn't exist")
    request_to_join(db, user, team)
    db.commit()
    return my_team_out(db, user)


def _get_request(db: Session, request_id: int) -> TeamJoinRequest:
    r = db.get(TeamJoinRequest, request_id)
    if r is None:
        raise HTTPException(404, "Request not found")
    return r


@router.post("/join-requests/{request_id}/cancel")
def cancel_request(request_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    r = _get_request(db, request_id)
    if r.user_id != user.id:
        raise HTTPException(403, "That's not your request")
    if r.status == "pending":
        r.status, r.decided_at = "cancelled", utcnow()
        db.commit()
    return my_team_out(db, user)


def _answer(db: Session, user: User, request_id: int, accept: bool) -> dict:
    r = _get_request(db, request_id)
    if user.team_id != r.team_id:
        raise HTTPException(403, f"Only people on {r.team.name} can answer this request")
    if r.status != "pending":
        raise HTTPException(409, "They cancelled this request" if r.status == "cancelled"
                            else "Someone on your team already answered this request")
    r.status, r.decided_at, r.decided_by_id = ("accepted" if accept else "declined"), utcnow(), user.id
    if accept:
        r.user.team_id = r.team_id
        message = f"You're on {r.team.name}! {user.name} accepted your request."
    else:
        message = f"{r.team.name} declined your request to join. You can ask another team."
    db.add(Notification(user_id=r.user_id, kind="team_joined" if accept else "team_declined", message=message))
    db.commit()
    notify.send([r.user_id], f"You're on {r.team.name}!" if accept else "Join request declined", message,
                "/" if accept else "/me")
    return my_team_out(db, user)


@router.post("/join-requests/{request_id}/accept")
def accept_request(request_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _answer(db, user, request_id, accept=True)


@router.post("/join-requests/{request_id}/decline")
def decline_request(request_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return _answer(db, user, request_id, accept=False)


@router.post("/me/team/leave")
def leave_team(user: User = Depends(current_user), db: Session = Depends(get_db)):
    if user.team_id is None:
        raise HTTPException(409, "You're not on a team")
    user.team_id = None
    db.commit()
    return my_team_out(db, user)
