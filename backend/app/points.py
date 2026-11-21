"""The points formula. Change the numbers here to tune the game.

points = minutes together x party bonus x phones-down bonus x streak bonus x activity bonus x weather bonus
         + new-place bonus, capped per day

Locking your phone is fine: your time together counts from check-in to check-out.
The phones-down bonus is optional: keep the app open on the black screen with the phone face-down
and your points grow up to 1.5x (for the whole Hang), scaled by the share of time you did it.
"""
from .config import POINTS_TIME_SCALE

TEAMMATE_BONUS = 0.5        # each friend (same team) in the Hang adds +0.5x
OTHER_PLAYER_BONUS = 0.3    # each other player adds +0.3x
MAX_PARTY_MULTIPLIER = 3.0
PHONES_DOWN_MAX_BONUS = 0.5  # phones-down mode the whole time = 1.5x
STREAK_BONUS_PER_DAY = 0.1   # +10% per day in a row...
MAX_STREAK_BONUS = 0.5       # ...up to +50%
ACTIVE_PLACE_BONUS = 1.2     # parks, gyms, courts: physically active places
BAD_WEATHER_BONUS = 1.2      # going out in rain, snow or deep cold
NEW_PLACE_BONUS = 25         # first time you score in this hexagon

ACTIVE_PLACE_TYPES = {"park", "gym", "hiking_area", "sports_complex", "stadium",
                      "swimming_pool", "playground", "athletic_field"}


def party_multiplier(teammates: int, others: int) -> float:
    return min(1 + TEAMMATE_BONUS * teammates + OTHER_PLAYER_BONUS * others, MAX_PARTY_MULTIPLIER)


def phones_down_multiplier(phones_down_share: float) -> float:
    return 1 + PHONES_DOWN_MAX_BONUS * min(max(phones_down_share, 0), 1)


def streak_multiplier(streak_days: int) -> float:
    return 1 + min(STREAK_BONUS_PER_DAY * max(streak_days - 1, 0), MAX_STREAK_BONUS)


def score_member(*, seconds: float, phones_down_seconds: float, teammates: int, others: int,
                 streak_days: int, place_type: str | None, new_place: bool, bad_weather: bool,
                 left_area: bool, cap_left: int) -> dict:
    """Points for one person in one Hang, with a breakdown the app can show."""
    seconds = max(seconds, 0)
    minutes = int(seconds * POINTS_TIME_SCALE // 60)
    share = phones_down_seconds / seconds if seconds > 0 else 0
    party = party_multiplier(teammates, others)
    phones_down = phones_down_multiplier(share)
    streak = streak_multiplier(streak_days)
    active = ACTIVE_PLACE_BONUS if place_type in ACTIVE_PLACE_TYPES else 1.0
    weather = BAD_WEATHER_BONUS if bad_weather else 1.0
    bonus = NEW_PLACE_BONUS if new_place and minutes > 0 else 0

    uncapped = round(minutes * party * phones_down * streak * active * weather) + bonus
    total = max(min(uncapped, cap_left), 0)
    return {
        "minutes": minutes,
        "party_multiplier": round(party, 2),
        "phones_down_share": round(min(share, 1), 2),
        "phones_down_multiplier": round(phones_down, 2),
        "streak_multiplier": round(streak, 2),
        "active_multiplier": active,
        "weather_multiplier": weather,
        "new_place_bonus": bonus,
        "left_area": left_area,
        "capped": total < uncapped,
        "total": total,
    }
