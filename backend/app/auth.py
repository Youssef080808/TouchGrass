"""Simple device-token auth (hackathon version).

Sign-up returns a random token; the app stores it and sends it as the X-User-Token header.
For a real launch: replace with proper accounts (e.g. Sign in with Apple/Google).
"""
import secrets

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import User


def new_token() -> str:
    return secrets.token_urlsafe(32)


def current_user(x_user_token: str | None = Header(default=None), db: Session = Depends(get_db)) -> User:
    if not x_user_token:
        raise HTTPException(status_code=401, detail="Not signed in")
    user = db.scalar(select(User).where(User.token == x_user_token))
    if user is None:
        raise HTTPException(status_code=401, detail="Unknown user, please sign up again")
    return user
