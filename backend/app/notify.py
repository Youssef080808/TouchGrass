"""Push notifications (Web Push): they reach people even when the app is closed and the phone is away.

When someone taps "Turn on notifications", their browser hands us a subscription: an address at Google's,
Apple's or Mozilla's push service. To notify them we sign a message with our VAPID key and post it there;
the browser wakes our service worker (frontend/public/sw.js), which shows it.

Sending happens on a small thread pool, so it never slows down a request and a failed send never breaks one.
"""
import base64
import json
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Iterable

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from pywebpush import WebPushException, webpush
from sqlalchemy import select

from .config import BACKEND_DIR, VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT
from .db import SessionLocal
from .models import PushSubscription

log = logging.getLogger("uvicorn.error")
_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="push")
_KEY_FILE = BACKEND_DIR / "vapid.json"


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _load_keys() -> tuple[str, str]:
    """(public, private) VAPID keys, base64url. From .env, else from vapid.json, else made once and saved."""
    if VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY:
        return VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
    if _KEY_FILE.exists():
        saved = json.loads(_KEY_FILE.read_text())
        return saved["public_key"], saved["private_key"]
    key = ec.generate_private_key(ec.SECP256R1())
    public = _b64(key.public_key().public_bytes(serialization.Encoding.X962,
                                                serialization.PublicFormat.UncompressedPoint))
    private = _b64(key.private_numbers().private_value.to_bytes(32, "big"))
    _KEY_FILE.write_text(json.dumps({"public_key": public, "private_key": private}))
    log.info("Made new Web Push keys in %s", _KEY_FILE.name)
    return public, private


PUBLIC_KEY, _PRIVATE_KEY = _load_keys()


def send(user_ids: Iterable[int | None], title: str, body: str, url: str = "/") -> None:
    """Notify everyone in user_ids on every device they turned notifications on for. Returns right away."""
    ids = sorted({i for i in user_ids if i})
    if ids:
        _pool.submit(_deliver, ids, json.dumps({"title": title, "body": body, "url": url}))


def _deliver(user_ids: list[int], payload: str) -> int:
    sent = 0
    with SessionLocal() as db:
        subs = db.scalars(select(PushSubscription).where(PushSubscription.user_id.in_(user_ids))).all()
        for s in subs:
            try:
                webpush(
                    {"endpoint": s.endpoint, "keys": {"p256dh": s.p256dh, "auth": s.auth}},
                    payload,
                    vapid_private_key=_PRIVATE_KEY,
                    vapid_claims={"sub": VAPID_SUBJECT},  # a fresh dict each time: webpush() edits it
                    ttl=60 * 60,
                    headers={"Urgency": "high"},
                    timeout=10,
                )
                sent += 1
            except WebPushException as e:
                status = e.response.status_code if e.response is not None else None
                if status in (404, 410):  # the browser turned notifications off, or the subscription expired
                    db.delete(s)
                else:
                    log.warning("Push to user %s failed: %s", s.user_id, e)
            except Exception:
                log.exception("Push to user %s failed", s.user_id)
        db.commit()
    return sent
