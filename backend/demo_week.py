"""Give one account a realistic week of Hangs, so "Your week offline" on the Me page (and Hang history,
"Your people", Ranks) has something to show in a demo.

    python demo_week.py you@example.com          add 4 finished Hangs this week and 1 last week
    python demo_week.py you@example.com --undo   remove them again (and the demo friends)

It writes straight to the database the backend uses (backend/.env), with points worked out by the app's own
scoring. Run it with the backend stopped or running, then refresh the Me page. Safe to run twice: the
second run replaces the first.
"""
import sys
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select

from app.auth import new_token
from app.config import POINTS_TIME_SCALE, TIMEZONE
from app.db import Base, SessionLocal, add_missing_columns, engine
from app.geo import hex_for
from app.models import Hang, HangMember, HexScore, User
from app.points import score_member
from app.routers.hangs import _new_code

TAG = "demo_week"  # stored in Hang.end_reason so --undo finds exactly these
FRIEND_EMAIL = "demo.friend{}@turfed.demo"
FRIENDS = [("Maya", ["Basketball", "Coffee"]), ("Omar", ["Soccer", "Running"]),
           ("Lea", ["Board games", "Coffee"]), ("Sami", ["Basketball", "Study"])]

# (days before today, start hour, minutes, place, lat, lng, activity, friends by index, phones-down share)
THIS_WEEK = [
    (0, 13, 95, "Jeanne-Mance Park courts", 45.5155, -73.5862, "Basketball", [0, 3], 0.7),
    (1, 18, 70, "Café Olimpico", 45.5232, -73.5995, "Coffee", [0, 2], 0.5),
    (2, 16, 120, "Mount Royal lookout", 45.5040, -73.5874, "Hiking", [1, 2, 3], 0.85),
    (3, 12, 55, "McGill library steps", 45.5046, -73.5772, "Study", [3], 0.4),
]
LAST_WEEK = [(8, 15, 60, "Jeanne-Mance Park courts", 45.5155, -73.5862, "Basketball", [0], 0.3)]


def utc_at(day, hour: int) -> datetime:
    local = datetime.combine(day, time(hour), tzinfo=ZoneInfo(TIMEZONE))
    return local.astimezone(ZoneInfo("UTC")).replace(tzinfo=None)


def undo(db, me: User) -> int:
    ids = db.scalars(select(Hang.id).join(HangMember).where(Hang.end_reason == TAG, HangMember.user_id == me.id)).all()
    for hid in ids:
        for m in db.scalars(select(HangMember).where(HangMember.hang_id == hid)).all():
            if m.points_earned:
                m.user.points = max(0, m.user.points - m.points_earned)
        db.execute(delete(HexScore).where(HexScore.hang_id == hid))
        db.execute(delete(HangMember).where(HangMember.hang_id == hid))
        db.execute(delete(Hang).where(Hang.id == hid))
    return len(ids)


def friends(db, me: User) -> list[User]:
    out = []
    for i, (name, interests) in enumerate(FRIENDS):
        email = FRIEND_EMAIL.format(i)
        u = db.scalar(select(User).where(User.email == email))
        if u is None:
            u = User(name=name, email=email, token=new_token(), interests=interests, team_id=me.team_id)
            db.add(u)
            db.flush()
        out.append(u)
    return out


def add_hang(db, me: User, crew: list[User], spec, today) -> int:
    days_ago, hour, minutes, place, lat, lng, activity, idx, pd_share = spec
    day = today - timedelta(days=days_ago)
    start = utc_at(day, hour)
    # Real seconds that the app's scoring turns into `minutes` game minutes at this POINTS_TIME_SCALE
    seconds = minutes * 60 / POINTS_TIME_SCALE
    end = start + timedelta(seconds=seconds)
    people = [me] + [crew[i] for i in idx]
    hang = Hang(code=_new_code(db), kind="group", host_id=me.id, lat=lat, lng=lng,
                hex_id=hex_for(lat, lng), place_name=place, place_type="park",
                status="ended", started_at=start, ended_at=end, end_reason=TAG, visibility="friends",
                activity=activity, join_mode="anyone")
    db.add(hang)
    db.flush()
    total = 0
    for u in people:
        others = [o for o in people if o is not u]
        new = [o.name for o in others] if days_ago == 0 and u is me else []  # met them "today"
        result = score_member(
            seconds=seconds, phones_down_seconds=seconds * pd_share,
            teammates=len([o for o in others if o.team_id and o.team_id == u.team_id]),
            others=len([o for o in others if not (o.team_id and o.team_id == u.team_id)]),
            streak_days=1, place_type="park", new_place=False, bad_weather=False, left_area=False,
            cap_left=10_000, solo_at_home=False, new_people=len(new), hot_zone=False,
        )
        result["new_people_names"] = new
        db.add(HangMember(hang_id=hang.id, user_id=u.id, joined_at=start, last_verified_at=end,
                          phones_down_seconds=seconds * pd_share, points_earned=result["total"],
                          breakdown=result, joined_via="host" if u is me else "code"))
        u.points += result["total"]
        total += result["total"]
    if me.team_id:  # enough points that your team holds the zone
        db.add(HexScore(hex_id=hang.hex_id, team_id=me.team_id, hang_id=hang.id, points=max(total, 300), earned_at=end))
    return total


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        sys.exit(__doc__)
    Base.metadata.create_all(engine)
    add_missing_columns()
    with SessionLocal() as db:
        me = db.scalar(select(User).where(User.email == args[0].strip().lower()))
        if me is None:
            sys.exit(f"No account with the email {args[0]}. Sign up in the app first, then run this again.")
        removed = undo(db, me)
        if "--undo" in sys.argv:
            db.commit()
            print(f"Removed {removed} demo Hangs for {me.name}.")
            return
        crew = friends(db, me)
        today = datetime.now(ZoneInfo(TIMEZONE)).date()
        monday = today - timedelta(days=today.weekday())
        # keep this week's Hangs inside this week (on a Monday they all land today, at different hours)
        week = [(min(s[0], (today - monday).days), *s[1:]) for s in THIS_WEEK]
        pts = sum(add_hang(db, me, crew, s, today) for s in week + LAST_WEEK)
        db.commit()
        print(f"Added {len(week)} Hangs this week and 1 last week for {me.name} ({pts} points across everyone).")
        print("Refresh the Me page: 'Your week offline' now shows the card carousel.")


if __name__ == "__main__":
    main()
