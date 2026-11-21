"""Fill the database with fake teams, players and territory so the map looks alive in a demo.

    python seed.py          add sample data (skips if teams already exist)
    python seed.py --reset  wipe EVERYTHING and start over

All names and scores here are made up.
"""
import random
import sys
from datetime import timedelta

import h3

from app.auth import new_token
from app.db import Base, SessionLocal, engine
from app.geo import hex_for
from app.models import HexScore, Team, User
from app.timeutil import local_today, utcnow

TEAMS = [
    ("Grass Gang", "#22c55e"),
    ("Night Owls", "#6366f1"),
    ("Sunset Crew", "#f97316"),
    ("Ice Breakers", "#06b6d4"),
]

PLAYERS = [
    ("Maya", 0, ["Running", "Coffee", "Photography"]),
    ("Omar", 0, ["Basketball", "Gym"]),
    ("Léa", 0, ["Hiking", "Art"]),
    ("Sam", 1, ["Board games", "Coffee", "Movies"]),
    ("Priya", 1, ["Reading", "Art"]),
    ("Jules", 1, ["Music", "Food"]),
    ("Noah", 2, ["Soccer", "Running"]),
    ("Chloé", 2, ["Tennis", "Coffee"]),
    ("Ethan", 2, ["Climbing", "Gym"]),
    ("Aisha", 3, ["Photography", "Hiking"]),
    ("Lucas", 3, ["Bowling", "Food"]),
    ("Zoe", 3, ["Basketball", "Music"]),
]

# (place, lat, lng, team index that mostly holds it, a rival team index or None)
TERRITORY = [
    ("McGill campus", 45.5048, -73.5772, 0, 2),          # close fight: shows a contested hex
    ("Parc du Mont-Royal", 45.5036, -73.5874, 0, None),
    ("Parc Jeanne-Mance", 45.5155, -73.5862, 2, None),
    ("Parc La Fontaine", 45.5268, -73.5697, 1, None),
    ("Grande Bibliothèque", 45.5154, -73.5620, 1, 3),
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


if __name__ == "__main__":
    main(reset="--reset" in sys.argv)
