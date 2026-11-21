"""Sign-up, profile, teams and notifications."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import current_user, new_token
from ..db import get_db
from ..models import Notification, Team, User
from ..places import INTERESTS
from ..serializers import team_out, user_out
from ..timeutil import iso

router = APIRouter(tags=["users"])

HEX_COLOR = r"^#[0-9a-fA-F]{6}$"


class SignUp(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    is_adult: bool
    interests: list[str] = Field(default_factory=list, max_length=16)
    team_id: int | None = None
    new_team_name: str | None = Field(default=None, max_length=40)
    new_team_color: str | None = Field(default=None, pattern=HEX_COLOR)
    home_lat: float | None = Field(default=None, ge=-90, le=90)
    home_lng: float | None = Field(default=None, ge=-180, le=180)


class ProfileUpdate(BaseModel):
    interests: list[str] | None = Field(default=None, max_length=16)
    home_lat: float | None = Field(default=None, ge=-90, le=90)
    home_lng: float | None = Field(default=None, ge=-180, le=180)
    clear_home: bool = False


@router.get("/interests")
def list_interests():
    return INTERESTS


@router.get("/teams")
def list_teams(db: Session = Depends(get_db)):
    counts = dict(db.execute(select(User.team_id, func.count()).group_by(User.team_id)).all())
    return [{**team_out(t), "members": counts.get(t.id, 0)} for t in db.scalars(select(Team).order_by(Team.name))]


@router.post("/users")
def sign_up(body: SignUp, db: Session = Depends(get_db)):
    if not body.is_adult:
        raise HTTPException(400, "Turfed is for people 18 and older")
    if body.team_id is not None:
        team = db.get(Team, body.team_id)
        if team is None:
            raise HTTPException(404, "That team doesn't exist")
    elif body.new_team_name and body.new_team_name.strip():
        name = body.new_team_name.strip()
        if db.scalar(select(Team).where(func.lower(Team.name) == name.lower())):
            raise HTTPException(409, "A team with that name already exists, pick it from the list")
        team = Team(name=name, color=body.new_team_color or "#22c55e")
        db.add(team)
        db.flush()
    else:
        raise HTTPException(400, "Pick a team or create one")

    user = User(
        name=body.name.strip(),
        token=new_token(),
        team_id=team.id,
        interests=[i for i in body.interests if i in INTERESTS],
    )
    if body.home_lat is not None and body.home_lng is not None:
        user.home_lat, user.home_lng = round(body.home_lat, 3), round(body.home_lng, 3)
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"token": user.token, "user": user_out(user)}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_out(user)


@router.patch("/me")
def update_me(body: ProfileUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.interests is not None:
        user.interests = [i for i in body.interests if i in INTERESTS]
    if body.clear_home:
        user.home_lat = user.home_lng = None
    elif body.home_lat is not None and body.home_lng is not None:
        user.home_lat, user.home_lng = round(body.home_lat, 3), round(body.home_lng, 3)
    db.commit()
    return user_out(user)


@router.get("/me/team")
def my_team(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Your team and everyone on it, most points first."""
    if user.team is None:
        return {"team": None, "members": []}
    members = db.scalars(
        select(User).where(User.team_id == user.team_id).order_by(User.points.desc(), User.name)
    )
    return {
        "team": team_out(user.team),
        "members": [{"id": u.id, "name": u.name, "points": u.points, "streak": u.streak} for u in members],
    }


@router.get("/me/notifications")
def my_notifications(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Notification)
        .where(Notification.user_id == user.id, Notification.read.is_(False))
        .order_by(Notification.created_at.desc())
        .limit(10)
    )
    return [{
        "id": n.id, "kind": n.kind, "message": n.message, "hex_id": n.hex_id,
        "other_team": team_out(db.get(Team, n.other_team_id)) if n.other_team_id else None,
        "created_at": iso(n.created_at),
    } for n in rows]


@router.post("/me/notifications/{notification_id}/read")
def mark_read(notification_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    n = db.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise HTTPException(404, "Notification not found")
    n.read = True
    db.commit()
    return {"ok": True}
