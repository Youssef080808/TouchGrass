"""Fill the database with fake teams, players and territory so the map looks alive in a demo.

    python seed.py          add sample data (skips if teams already exist)
    python seed.py --reset  wipe EVERYTHING and start over
    python seed.py --open   just add fresh open Hangs near McGill (for Meet; they end by themselves after
                            3 hours without check-ins, so run this again shortly before a demo)

All names and scores here are made up.
"""
import random
import sys
from datetime import timedelta

import h3

from app.auth import new_token
from app.db import Base, SessionLocal, engine
from app.geo import hex_for
from app.models import Hang, HangMember, HexScore, Team, User
from app.timeutil import local_today, utcnow

TEAMS = [
    ("Grass Gang", "#22c55e"),
    ("Night Owls", "#6366f1"),
    ("Sunset Crew", "#f97316"),
    ("Ice Breakers", "#06b6d4"),
]

# Open Hangs from sample players near McGill, so "Happening near you" isn't empty in a demo:
# (activity, place, lat, lng, host index in PLAYERS, other member indexes, max size, join mode)
OPEN_HANGS = [
    ("Basketball", "McGill lower field", 45.5046, -73.5765, 1, [11], 8, "anyone"),
    ("Study", "McLennan Library", 45.5030, -73.5763, 4, [], 4, "approve"),
    ("Running", "Mount Royal Park", 45.5036, -73.5874, 6, [0], None, "anyone"),
]

PLAYERS = [
    ("Maya", 0, ["Running", "Coffee", "Photography"]),
    ("Omar", 0, ["Basketball", "Gym"]),
    ("Leah", 0, ["Hiking", "Art"]),
    ("Sam", 1, ["Board games", "Coffee", "Movies"]),
    ("Priya", 1, ["Reading", "Art"]),
    ("Jules", 1, ["Music", "Food"]),
    ("Noah", 2, ["Soccer", "Running"]),
    ("Chloe", 2, ["Tennis", "Coffee"]),
    ("Ethan", 2, ["Climbing", "Gym"]),
    ("Aisha", 3, ["Photography", "Hiking"]),
    ("Lucas", 3, ["Bowling", "Food"]),
    ("Zoe", 3, ["Basketball", "Music"]),
]

# (place, lat, lng, team index that mostly holds it, a rival team index or None)
TERRITORY = [
    ("McGill campus", 45.5048, -73.5772, 0, 2),          # close fight: shows a contested hex
    ("Mount Royal Park", 45.5036, -73.5874, 0, None),
    ("Jeanne-Mance Park", 45.5155, -73.5862, 2, None),
    ("La Fontaine Park", 45.5268, -73.5697, 1, None),
    ("Grande Bibliothèque (main library)", 45.5154, -73.5620, 1, 3),
    ("Old Port", 45.5075, -73.5536, 3, None),
    ("Mile End", 45.5236, -73.6010, 2, 1),
    ("Lachine Canal", 45.4840, -73.5770, 3, None),
]


def main(reset: bool) -> None:
    if reset:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    random.seed(16)
    with SessionLocal() as db:
        if db.query(Team).count() and not reset:
            print("Teams already exist, nothing to do. Use --reset to start over.")
            return
        teams = [Team(name=n, color=c) for n, c in TEAMS]
        db.add_all(teams)
        db.flush()
        today = local_today()
        for name, team_idx, interests in PLAYERS:
            db.add(User(name=name, token=new_token(), team_id=teams[team_idx].id, interests=interests,
                        points=random.randint(40, 420), streak=random.randint(0, 6),
                        last_active_date=today - timedelta(days=random.randint(0, 2))))
        now = utcnow()
        for _place, lat, lng, owner, rival in TERRITORY:
            center = hex_for(lat, lng)
            for i, hex_id in enumerate(h3.grid_disk(center, 1)):  # the hex plus its 6 neighbours
                base = random.randint(60, 140) if i == 0 else random.randint(15, 60)
                when = now - timedelta(hours=random.randint(1, 40))
                db.add(HexScore(hex_id=hex_id, team_id=teams[owner].id, points=base, earned_at=when))
                if rival is not None and (i == 0 or random.random() < 0.3):
                    db.add(HexScore(hex_id=hex_id, team_id=teams[rival].id,
                                    points=base * random.uniform(0.8, 0.95), earned_at=when))
        db.commit()
        print(f"Added {len(TEAMS)} teams, {len(PLAYERS)} players and territory at {len(TERRITORY)} places.")
    add_open_hangs()


def add_open_hangs() -> None:
    """Open Hangs from sample players, started 25 minutes ago and checked in just now."""
    from app.routers.hangs import _new_code
    with SessionLocal() as db:
        players = {u.name: u for u in db.query(User).all()}
        now = utcnow()
        added = 0
        for activity, place, lat, lng, host_idx, member_idxs, max_size, mode in OPEN_HANGS:
            host = players.get(PLAYERS[host_idx][0])
            if host is None:
                continue
            hang = Hang(code=_new_code(db), kind="group", host_id=host.id, lat=lat, lng=lng, hex_id=hex_for(lat, lng),
                        place_name=place, place_type="park" if activity != "Study" else "library",
                        started_at=now - timedelta(minutes=25), visibility="open", activity=activity,
                        max_size=max_size, join_mode=mode)
            db.add(hang)
            db.flush()
            for i, idx in enumerate([host_idx, *member_idxs]):
                u = players.get(PLAYERS[idx][0])
                if u is None:
                    continue
                db.add(HangMember(hang_id=hang.id, user_id=u.id, joined_at=now - timedelta(minutes=25 - 5 * i),
                                  last_verified_at=now, joined_via="host" if i == 0 else "code"))
            added += 1
        db.commit()
        print(f"Added {added} open Hangs near McGill.")


if __name__ == "__main__":
    if "--open" in sys.argv:
        add_open_hangs()
    else:
        main(reset="--reset" in sys.argv)
