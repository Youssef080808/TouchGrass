"""Small AI helper (Google Gemini) for ideas and icebreakers.

Only Hang details go to the model: the activity, group size, shared interests, time of day, weather and
the place name. No names, emails or exact locations. Without GEMINI_API_KEY, or if the call fails or is
slow, every caller gets its built-in answer instead, so the app works the same with or without AI.
Answers are cached for a few minutes so the same screen doesn't call the model again on every refresh.
"""
import json
import logging
import time

import httpx

from .config import GEMINI_API_KEY, GEMINI_MODEL

log = logging.getLogger(__name__)
URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
CACHE_SECONDS = 10 * 60
_cache: dict[str, tuple[float, object]] = {}


def enabled() -> bool:
    return bool(GEMINI_API_KEY)


def ask_json(prompt: str, timeout: float = 8.0):
    """Ask the model for JSON. Returns the parsed JSON, or None if AI is off or anything goes wrong."""
    if not enabled():
        return None
    hit = _cache.get(prompt)
    if hit and time.time() - hit[0] < CACHE_SECONDS:
        return hit[1]
    try:
        r = httpx.post(
            URL.format(model=GEMINI_MODEL),
            headers={"x-goog-api-key": GEMINI_API_KEY},
            json={
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {"responseMimeType": "application/json"},
            },
            timeout=timeout,
        )
        r.raise_for_status()
        parts = r.json()["candidates"][0]["content"]["parts"]
        text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
        data = json.loads(text)
    except Exception as e:  # network, quota, bad JSON: fall back quietly
        log.warning("AI call failed: %s", e)
        return None
    if len(_cache) > 500:
        _cache.clear()
    _cache[prompt] = (time.time(), data)
    return data


def clean(text, limit: int) -> str:
    """One short line of model text, safe to show."""
    return " ".join(str(text or "").split())[:limit]
