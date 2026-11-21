"""Turning notifications on and off for this browser, plus a test button."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import notify
from ..auth import current_user
from ..db import get_db
from ..models import PushSubscription, User

router = APIRouter(prefix="/push", tags=["notifications"])


class SubscriptionKeys(BaseModel):
    p256dh: str = Field(max_length=200)
    auth: str = Field(max_length=100)


class Subscription(BaseModel):
    """What the browser's pushManager.subscribe() gives back (subscription.toJSON())."""
    endpoint: str = Field(max_length=1024, pattern=r"^https?://")
    keys: SubscriptionKeys


class Unsubscribe(BaseModel):
    endpoint: str = Field(max_length=1024)


@router.get("/key")
def public_key():
    """The key browsers need to subscribe (applicationServerKey)."""
    return {"key": notify.PUBLIC_KEY}


@router.post("/subscribe")
def subscribe(body: Subscription, user: User = Depends(current_user), db: Session = Depends(get_db)):
    # Same browser, maybe a different account now: the subscription follows whoever is signed in.
    sub = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == body.endpoint))
    if sub is None:
        sub = PushSubscription(endpoint=body.endpoint)
        db.add(sub)
    sub.user_id, sub.p256dh, sub.auth = user.id, body.keys.p256dh, body.keys.auth
    db.commit()
    return {"ok": True}


@router.post("/unsubscribe")
def unsubscribe(body: Unsubscribe, user: User = Depends(current_user), db: Session = Depends(get_db)):
    sub = db.scalar(select(PushSubscription).where(PushSubscription.endpoint == body.endpoint,
                                                   PushSubscription.user_id == user.id))
    if sub:
        db.delete(sub)
        db.commit()
    return {"ok": True}


@router.post("/test")
def test(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Sends a notification to all of your devices, so you can check it works."""
    devices = db.scalar(select(func.count()).select_from(PushSubscription)
                        .where(PushSubscription.user_id == user.id)) or 0
    notify.send([user.id], "Notifications are on", "This is how Turfed lets you know your Hang is done.", "/me")
    return {"devices": devices}
