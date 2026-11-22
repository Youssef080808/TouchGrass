"""Sign in, sign out, and adding a login to your account. Creating an account is POST /users (users.py)."""
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import auth
from ..config import GOOGLE_CLIENT_ID
from ..db import get_db
from ..models import User
from ..serializers import user_out

router = APIRouter(tags=["accounts"])


class EmailLogin(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=auth.PASSWORD_MAX)


class GoogleLogin(BaseModel):
    credential: str = Field(min_length=10, max_length=4096)


class EmailOnly(BaseModel):
    email: str = Field(max_length=254)


def signed_in(db: Session, user: User) -> dict:
    token = auth.start_session(db, user)
    db.refresh(user)
    return {"token": token, "user": user_out(user)}


def google_email(claims: dict) -> str | None:
    """The Google account's email, only if Google has verified it."""
    email = (claims.get("email") or "").strip().lower()
    return email if email and claims.get("email_verified") else None


@router.get("/auth/config")
def auth_config():
    """What the sign-in screen can offer. No Google client ID = no Google button."""
    return {"google_client_id": GOOGLE_CLIENT_ID or None}


@router.post("/auth/check-email")
def check_email(body: EmailOnly, db: Session = Depends(get_db)):
    """Used while signing up, so a taken email is caught on the first screen, not the last."""
    email = auth.normalize_email(body.email)
    return {"email": email, "available": db.scalar(select(User.id).where(User.email == email)) is None}


@router.post("/auth/login")
def login(body: EmailLogin, request: Request, db: Session = Depends(get_db)):
    email = auth.normalize_email(body.email)
    keys = (f"email:{email}", f"ip:{request.client.host if request.client else '?'}")
    auth.check_attempts(*keys)
    user = db.scalar(select(User).where(User.email == email))
    if user is not None and not user.password_hash and user.google_sub:
        raise HTTPException(400, "This account signs in with Google. Tap Continue with Google.")
    if not auth.check_password(body.password, user.password_hash if user else None):
        auth.record_fail(*keys)
        raise HTTPException(401, "Wrong email or password.")
    auth.clear_fails(keys[0])
    return signed_in(db, user)


@router.post("/auth/google")
def google_login(body: GoogleLogin, db: Session = Depends(get_db)):
    """Sign in with Google. A Google account we haven't seen gets {new_user: true}: the app then asks for
    the rest of the profile and creates the account with POST /users (sending the same credential)."""
    claims = auth.verify_google(body.credential)
    user = db.scalar(select(User).where(User.google_sub == claims["sub"]))
    if user is not None:
        return signed_in(db, user)
    email = google_email(claims)
    if email and db.scalar(select(User.id).where(User.email == email)) is not None:
        # Emails aren't verified at sign-up, so we never merge accounts by email automatically
        raise HTTPException(409, f"There's already an account with {email}. Sign in with your password, "
                                 "then link Google in the Me tab.")
    return {"new_user": True, "email": email, "name": (claims.get("given_name") or claims.get("name") or "")[:40]}


@router.post("/auth/logout")
def logout(x_user_token: str | None = Header(default=None), db: Session = Depends(get_db)):
    """Signs this device out (its token stops working)."""
    auth.end_session(db, x_user_token)
    return {"ok": True}


def _after_new_login(db: Session, user: User, had_login: bool) -> dict:
    if not had_login:
        # An old device-only account is now saved: retire the device token and start a real session
        auth.retire_device_token(user)
        db.commit()
        return signed_in(db, user)
    db.commit()
    db.refresh(user)
    return {"token": None, "user": user_out(user)}


@router.post("/me/login/email")
def add_password(body: EmailLogin, user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    """Add an email + password to your account (a device-only account, or one that uses Google)."""
    if user.password_hash:
        raise HTTPException(409, "You already have a password.")
    # A Google account keeps the email Google gave it
    email = user.email or auth.normalize_email(body.email)
    auth.check_new_password(body.password)
    if db.scalar(select(User.id).where(User.email == email, User.id != user.id)) is not None:
        raise HTTPException(409, "Another account already uses this email.")
    had_login = auth.has_login(user)
    user.email = email
    user.password_hash = auth.hash_password(body.password)
    return _after_new_login(db, user, had_login)


@router.post("/me/login/google")
def link_google(body: GoogleLogin, user: User = Depends(auth.current_user), db: Session = Depends(get_db)):
    """Link a Google account, so you can sign in with Google too."""
    if user.google_sub:
        raise HTTPException(409, "Google is already linked to your account.")
    claims = auth.verify_google(body.credential)
    if db.scalar(select(User.id).where(User.google_sub == claims["sub"])) is not None:
        raise HTTPException(409, "That Google account already has its own Turfed account.")
    had_login = auth.has_login(user)
    user.google_sub = claims["sub"]
    email = google_email(claims)
    if not user.email and email and db.scalar(select(User.id).where(User.email == email)) is None:
        user.email = email
    return _after_new_login(db, user, had_login)
