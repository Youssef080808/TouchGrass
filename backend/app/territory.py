"""Who owns which hexagon.

Every Hang adds points for each member's team to the Hang's hexagon (HexScore rows).
A team's score in a hex = sum of its points, each faded by TERRITORY_DECAY_PER_DAY per day.
The team with the highest score owns the hex. It is "contested" when the runner-up has 80%+ of it.

Scores are computed on read, which is simple and fine for a hackathon.
At 100x the users: keep a running total per (hex, team) and apply the fade in a nightly job.
"""
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import notify
from .config import TERRITORY_DECAY_PER_DAY
from .models import HexScore, Notification, Team, User
from .timeutil import utcnow

MIN_POINTS_TO_OWN = 1.0
CONTESTED_RATIO = 0.8


def standings(db: Session, hex_ids: list[str] | None = None) -> dict[str, dict[int, float]]:
    """{hex_id: {team_id: faded score}}"""
    now = utcnow()
    query = select(HexScore.hex_id, HexScore.team_id, HexScore.points, HexScore.earned_at)
    if hex_ids is not None:
        query = query.where(HexScore.hex_id.in_(hex_ids))
    result: dict[str, dict[int, float]] = defaultdict(lambda: defaultdict(float))
    for hex_id, team_id, points, earned_at in db.execute(query):
        days = max((now - earned_at).total_seconds() / 86400, 0)
        result[hex_id][team_id] += points * (TERRITORY_DECAY_PER_DAY ** days)
    return result


def owner_from(scores: dict[int, float]) -> tuple[int | None, bool]:
    """(owning team id or None, contested?)"""
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    if not ranked or ranked[0][1] < MIN_POINTS_TO_OWN:
        return None, False
    contested = len(ranked) > 1 and ranked[1][1] >= CONTESTED_RATIO * ranked[0][1]
    return ranked[0][0], contested


def owner_of(db: Session, hex_id: str) -> int | None:
    return owner_from(standings(db, [hex_id]).get(hex_id, {}))[0]


def notify_friend_or_foe(db: Session, hex_id: str, place: str, before: int | None, after: int | None,
                         skip_push: set[int] = frozenset()) -> None:
    """When a hex changes hands, tell both teams. The losing team gets the Friend or Foe choice.
    skip_push: people who don't need a push about it (they were in the Hang and see it on the results screen)."""
    if before is None or after is None or before == after:
        return
    winner, loser = db.get(Team, after), db.get(Team, before)
    if winner is None or loser is None:
        return
    losers = db.scalars(select(User).where(User.team_id == loser.id)).all()
    winners = db.scalars(select(User).where(User.team_id == winner.id)).all()
    notify.send([u.id for u in losers if u.id not in skip_push], "Friend or foe?",
                f"{winner.name} just took {place} from your team. Fight back, or team up?", "/")
    notify.send([u.id for u in winners if u.id not in skip_push], "Zone captured!",
                f"Your team took {place} from {loser.name}.", "/map")
    for user in losers:
        db.add(Notification(
            user_id=user.id, kind="friend_or_foe", hex_id=hex_id, other_team_id=winner.id,
            message=f"{winner.name} just took {place} from your team. Fight back, or invite them to a joint Hang?",
        ))
    for user in winners:
        db.add(Notification(
            user_id=user.id, kind="territory_won", hex_id=hex_id, other_team_id=loser.id,
            message=f"Your team took {place} from {loser.name}!",
        ))
