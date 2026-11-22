"""Accounts: email + password and/or Sign in with Google.

Signing in creates a LoginSession: the app keeps a random token and sends it as the X-User-Token header
(and as ?token= on the Hang WebSocket). The database only stores the token's SHA-256 hash, so a leaked
database can't be used to sign in. Passwords are hashed with scrypt (Python's standard library).

Accounts made before sign-in existed have no login yet. They keep working with their old device token
until the player saves the account (adds an email or Google); then that old token stops working.
"""
import base64
import hashlib
import hmac
import re
import secrets
import time
from collections import defaultdict, deque

from fastapi import Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import GOOGLE_CLIENT_ID
from .db import get_db
from .models import LoginSession, User

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PASSWORD_MIN = 8
PASSWORD_MAX = 128

# scrypt settings: ~16 MB of memory per hash, which makes guessing slow
_N, _R, _P = 2**14, 8, 1


def new_token() -> str:
    return secrets.token_urlsafe(32)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# --- Passwords ---

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P, dklen=32)
    b64 = lambda b: base64.b64encode(b).decode()  # noqa: E731
    return f"scrypt${_N}${_R}${_P}${b64(salt)}${b64(digest)}"


def check_password(password: str, stored: str | None) -> bool:
    if not stored:
        # Same amount of work as a real check, so response times don't reveal which emails exist
        hashlib.scrypt(password.encode(), salt=b"x" * 16, n=_N, r=_R, p=_P, dklen=32)
        return False
    try:
        _, n, r, p, salt, digest = stored.split("$")
        expected = base64.b64decode(digest)
        actual = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p),
                                dklen=len(expected))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


def check_new_password(password: str) -> None:
    if len(password) < PASSWORD_MIN:
        raise HTTPException(400, f"Use at least {PASSWORD_MIN} characters for your password.")
    if len(password) > PASSWORD_MAX:
        raise HTTPException(400, f"Use at most {PASSWORD_MAX} characters for your password.")


def normalize_email(email: str) -> str:
    email = (email or "").strip().lower()
    if len(email) > 254 or not EMAIL_RE.match(email):
        raise HTTPException(400, "That doesn't look like an email address.")
    return email


# --- Too many wrong passwords ---

_FAILS: dict[str, deque] = defaultdict(deque)
FAIL_LIMIT = 8            # wrong passwords allowed...
FAIL_WINDOW_S = 15 * 60   # ...per email (and per IP address) in this many seconds


def _recent_fails(key: str) -> deque:
    q = _FAILS[key]
    while q and q[0] < time.monotonic() - FAIL_WINDOW_S:
        q.popleft()
    return q


def check_attempts(*keys: str) -> None:
    if any(len(_recent_fails(k)) >= FAIL_LIMIT for k in keys):
        raise HTTPException(429, "Too many wrong passwords. Wait 15 minutes and try again.")


def record_fail(*keys: str) -> None:
    for k in keys:
        _recent_fails(k).append(time.monotonic())


def clear_fails(*keys: str) -> None:
    for k in keys:
        _FAILS.pop(k, None)


# --- Google ---

def verify_google(credential: str) -> dict:
    """Checks a Google ID token (from the Sign in with Google button) and returns its claims:
    sub (Google's id for the person), email, email_verified, given_name, name."""
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(400, "Sign in with Google isn't set up on this server.")
    if credential.count(".") != 2:  # not a JWT at all; no need to ask Google
        raise HTTPException(401, "Google sign-in didn't work. Try again.")
    from google.auth.exceptions import GoogleAuthError
    from google.auth.transport import requests as google_requests
    from google.oauth2 import id_token

    try:
        claims = id_token.verify_oauth2_token(credential, google_requests.Request(), GOOGLE_CLIENT_ID)
    except ValueError:  # bad, expired, or made for another app
        raise HTTPException(401, "Google sign-in didn't work. Try again.") from None
    except GoogleAuthError:  # couldn't download Google's keys
        raise HTTPException(503, "Couldn't reach Google. Try again in a moment.") from None
    if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise HTTPException(401, "Google sign-in didn't work. Try again.")
    return claims


# --- Sessions ---

def has_login(user: User) -> bool:
    return bool(user.email and user.password_hash) or bool(user.google_sub)


def start_session(db: Session, user: User) -> str:
    """Signs this device in. Returns the token the app keeps. Commits."""
    token = new_token()
    db.add(LoginSession(user_id=user.id, token_hash=_token_hash(token)))
    db.commit()
    return token


def end_session(db: Session, token: str | None) -> None:
    if token:
        row = db.scalar(select(LoginSession).where(LoginSession.token_hash == _token_hash(token)))
        if row is not None:
            db.delete(row)
            db.commit()


def retire_device_token(user: User) -> None:
    """An old device-only account just got a login: its old token stops working."""
    user.token = new_token()


def user_for_token(db: Session, token: str | None) -> User | None:
    if not token:
        return None
    session = db.scalar(select(LoginSession).where(LoginSession.token_hash == _token_hash(token)))
    if session is not None:
        return db.get(User, session.user_id)
    # Old device-only accounts (no login yet)
    user = db.scalar(select(User).where(User.token == token))
    if user is not None and not has_login(user):
        return user
    return None


def current_user(x_user_token: str | None = Header(default=None), db: Session = Depends(get_db)) -> User:
    if not x_user_token:
        raise HTTPException(status_code=401, detail="Not signed in")
    user = user_for_token(db, x_user_token)
    if user is None:
        raise HTTPException(status_code=401, detail="You've been signed out. Sign in again.")
    return user
