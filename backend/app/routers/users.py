"""Sign-up, profile and notifications. Signing in lives in routers/accounts.py, teams in routers/teams.py."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import auth
from ..auth import current_user, new_token
from ..db import get_db
from ..models import Notification, Team, User
from ..places import INTERESTS
from ..serializers import team_out, user_out
from ..timeutil import iso
from .accounts import google_email
from .teams import create_team, request_to_join

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
    # How you'll sign in: an email + password, or a Google credential from the Sign in with Google button
    email: str | None = Field(default=None, max_length=254)
    password: str | None = Field(default=None, max_length=auth.PASSWORD_MAX)
    google_credential: str | None = Field(default=None, max_length=4096)


class ProfileUpdate(BaseModel):
    interests: list[str] | None = Field(default=None, max_length=16)
    home_lat: float | None = Field(default=None, ge=-90, le=90)
    home_lng: float | None = Field(default=None, ge=-180, le=180)
    clear_home: bool = False


@router.get("/interests")
def list_interests():
    return INTERESTS


@router.post("/users")
def sign_up(body: SignUp, db: Session = Depends(get_db)):
    if not body.is_adult:
        raise HTTPException(400, "Turfed is for people 18 and older")

    # The login first, so nothing is created if it's not valid
    email = password_hash = google_sub = None
    if body.google_credential:
        claims = auth.verify_google(body.google_credential)
        google_sub = claims["sub"]
        if db.scalar(select(User.id).where(User.google_sub == google_sub)) is not None:
            raise HTTPException(409, "This Google account already has an account. Sign in instead.")
        email = google_email(claims)
        if email and db.scalar(select(User.id).where(User.email == email)) is not None:
            email = None  # someone else signed up with that email; this account just uses Google
    elif body.email and body.password:
        email = auth.normalize_email(body.email)
        auth.check_new_password(body.password)
        if db.scalar(select(User.id).where(User.email == email)) is not None:
            raise HTTPException(409, "There's already an account with this email. Sign in instead.")
        password_hash = auth.hash_password(body.password)
    else:
        raise HTTPException(400, "Add an email and password, or continue with Google.")

    team = None
    if body.team_id is not None:
        team = db.get(Team, body.team_id)
        if team is None:
            raise HTTPException(404, "That team doesn't exist")
    elif not (body.new_team_name and body.new_team_name.strip()):
        raise HTTPException(400, "Pick a team or create one")

    user = User(
        name=body.name.strip(),
        token=new_token(),  # not used to sign in (that's a LoginSession); kept because the column is required
        email=email,
        password_hash=password_hash,
        google_sub=google_sub,
        interests=[i for i in body.interests if i in INTERESTS],
    )
    if body.home_lat is not None and body.home_lng is not None:
        user.home_lat, user.home_lng = round(body.home_lat, 3), round(body.home_lng, 3)
    db.add(user)
    db.flush()
    if team is not None:
        request_to_join(db, user, team)  # someone on the team has to accept (unless it's empty)
    else:
        create_team(db, user, body.new_team_name, body.new_team_color or "#22c55e")
    db.commit()
    token = auth.start_session(db, user)
    db.refresh(user)
    return {"token": token, "user": user_out(user)}


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
