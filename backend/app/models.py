"""Database tables.

Team         a friend group; territory belongs to teams
User         one player; signs in with email + password and/or Google
LoginSession one signed-in device (only a hash of its token is stored)
Hang         one session, solo or group, at one place
HangMember   who was in a Hang, when they joined and left, their phones-down bonus time
HexScore     points a team earned in one map hexagon (territory is the sum, fading over time)
Notification Friend or Foe alerts and other messages
TeamJoinRequest someone asking to join a team; any member can accept or decline
PushSubscription a browser that agreed to get notifications (phone, laptop...)
"""
from datetime import date, datetime

from sqlalchemy import (JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer,
                        String, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base
from .timeutil import utcnow


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(40), unique=True)
    color: Mapped[str] = mapped_column(String(9))  # e.g. "#22c55e"
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    members: Mapped[list["User"]] = relationship(back_populates="team")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(40))
    # Old device-only accounts (before sign-in existed) still use this token until they save their account.
    # Accounts with a login use LoginSession tokens instead, and this is just a random value nobody knows.
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(254), unique=True, index=True)  # lowercase
    password_hash: Mapped[str | None] = mapped_column(String(200))                    # scrypt, see auth.py
    google_sub: Mapped[str | None] = mapped_column(String(64), unique=True, index=True)  # Google's user id
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"))
    interests: Mapped[list] = mapped_column(JSON, default=list)
    # Home is rounded (about 100 m) and only used to check solo sessions. Never shown to anyone.
    home_lat: Mapped[float | None] = mapped_column(Float)
    home_lng: Mapped[float | None] = mapped_column(Float)
    points: Mapped[int] = mapped_column(Integer, default=0)
    streak: Mapped[int] = mapped_column(Integer, default=0)
    last_active_date: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    team: Mapped[Team | None] = relationship(back_populates="members")


class Hang(Base):
    __tablename__ = "hangs"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(8), index=True)  # what the QR code / join link carries
    kind: Mapped[str] = mapped_column(String(10))             # "solo" or "group"
    host_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    hex_id: Mapped[str] = mapped_column(String(20), index=True)
    place_name: Mapped[str | None] = mapped_column(String(120))
    place_type: Mapped[str | None] = mapped_column(String(40))
    bad_weather: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(10), default="active", index=True)  # active / ended
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime)
    # Who held the zone just before this Hang ended, so the app can show a capture
    hex_owner_before_id: Mapped[int | None] = mapped_column(Integer)
    # host / no_checkins (nobody opened the app for hours) / everyone_left
    end_reason: Mapped[str | None] = mapped_column(String(20))
    # Optional timer the host sets ("buzz us in 1 h"): everyone gets a notification when it's up
    timer_ends_at: Mapped[datetime | None] = mapped_column(DateTime)
    timer_sent_at: Mapped[datetime | None] = mapped_column(DateTime)
    # Open Hangs: "open" shows up for people nearby in Meet (by shared interests), "friends" is QR/code only.
    visibility: Mapped[str | None] = mapped_column(String(10), default="friends")
    activity: Mapped[str | None] = mapped_column(String(40))     # what you're doing: "Basketball", "Study"...
    max_size: Mapped[int | None] = mapped_column(Integer)        # most people at once, host included (None = no limit)
    join_mode: Mapped[str | None] = mapped_column(String(10), default="anyone")  # anyone / approve (open Hangs)

    host: Mapped[User] = relationship()
    members: Mapped[list["HangMember"]] = relationship(
        back_populates="hang", order_by="HangMember.joined_at", cascade="all, delete-orphan"
    )


class HangMember(Base):
    __tablename__ = "hang_members"
    __table_args__ = (UniqueConstraint("hang_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    hang_id: Mapped[int] = mapped_column(ForeignKey("hangs.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    # When their time stopped counting before the Hang ended: checked out, or went home.
    left_at: Mapped[datetime | None] = mapped_column(DateTime)
    left_reason: Mapped[str | None] = mapped_column(String(20))          # checked_out, left_area (went home)
    # Last time their location was confirmed at the Hang (join, an in-range ping, check-out).
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime)
    # Optional phones-down bonus: time spent with the app open on the black screen, phone face-down.
    phones_down_seconds: Mapped[float] = mapped_column(Float, default=0)
    phones_down_since: Mapped[datetime | None] = mapped_column(DateTime)  # current stretch started
    phones_down_seen_at: Mapped[datetime | None] = mapped_column(DateTime)  # last heartbeat
    points_earned: Mapped[int | None] = mapped_column(Integer)
    breakdown: Mapped[dict | None] = mapped_column(JSON)
    joined_via: Mapped[str | None] = mapped_column(String(10))  # host / code (QR) / arrive (checked themselves in)

    hang: Mapped[Hang] = relationship(back_populates="members")
    user: Mapped[User] = relationship()


class HangRsvp(Base):
    """'I'm coming' to an open Hang. Anyone-can-come Hangs say yes straight away; otherwise the host decides.
    status: going (you can check in when you arrive), pending (waiting for the host), declined, cancelled,
    arrived (checked in)."""
    __tablename__ = "hang_rsvps"
    __table_args__ = (UniqueConstraint("hang_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    hang_id: Mapped[int] = mapped_column(ForeignKey("hangs.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    status: Mapped[str] = mapped_column(String(10), default="going", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime)

    hang: Mapped[Hang] = relationship()
    user: Mapped[User] = relationship()


class Report(Base):
    """Someone reported another player (or a host said they weren't really at the Hang)."""
    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    reporter_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    hang_id: Mapped[int | None] = mapped_column(ForeignKey("hangs.id"))
    reason: Mapped[str] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class HexScore(Base):
    __tablename__ = "hex_scores"

    id: Mapped[int] = mapped_column(primary_key=True)
    hex_id: Mapped[str] = mapped_column(String(20), index=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    hang_id: Mapped[int | None] = mapped_column(ForeignKey("hangs.id"))
    points: Mapped[float] = mapped_column(Float)
    earned_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(30))  # friend_or_foe, territory_won
    message: Mapped[str] = mapped_column(String(300))
    hex_id: Mapped[str | None] = mapped_column(String(20))
    other_team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"))
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class TeamJoinRequest(Base):
    """Someone asking to join a team. Any current member can accept or decline; the first answer counts."""
    __tablename__ = "team_join_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    status: Mapped[str] = mapped_column(String(10), default="pending", index=True)  # pending, accepted, declined, cancelled
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime)
    decided_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))

    user: Mapped[User] = relationship(foreign_keys=[user_id])
    team: Mapped[Team] = relationship()
    decided_by: Mapped[User | None] = relationship(foreign_keys=[decided_by_id])


class PushSubscription(Base):
    """A browser that turned on notifications. One person can have several (phone, laptop)."""
    __tablename__ = "push_subscriptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    endpoint: Mapped[str] = mapped_column(String(1024), unique=True)  # address at the browser's push service
    p256dh: Mapped[str] = mapped_column(String(200))                   # keys for encrypting messages to it
    auth: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


# ---- Plans: rallies (Hangs planned for later), Team up truces, hot zones. See plans.py and hotzones.py ----

class Rally(Base):
    """A Hang planned for later: a place and a time. The host's team hears about it (plus the rival team for
    Team up, and people nearby if it's open) and says "I'm in". The first person to arrive starts the real
    Hang there; everyone else who's in is checked in when they get there.
    status: planned, live (the Hang started), done (it ended), cancelled, expired (nobody came)."""
    __tablename__ = "rallies"

    id: Mapped[int] = mapped_column(primary_key=True)
    host_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"), index=True)         # the host's team
    invite_team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"), index=True)  # Team up: the rival team
    kind: Mapped[str] = mapped_column(String(10), default="rally")       # rally / team_up
    visibility: Mapped[str] = mapped_column(String(10), default="team")  # team / open (people nearby see it in Meet)
    activity: Mapped[str | None] = mapped_column(String(40))
    place_name: Mapped[str] = mapped_column(String(120))
    place_type: Mapped[str | None] = mapped_column(String(40))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    hex_id: Mapped[str] = mapped_column(String(20), index=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    status: Mapped[str] = mapped_column(String(10), default="planned", index=True)
    hang_id: Mapped[int | None] = mapped_column(ForeignKey("hangs.id"), index=True)  # the real Hang, once someone arrives
    reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    host: Mapped[User] = relationship(foreign_keys=[host_id])
    team: Mapped[Team | None] = relationship(foreign_keys=[team_id])
    invite_team: Mapped[Team | None] = relationship(foreign_keys=[invite_team_id])
    hang: Mapped[Hang | None] = relationship()
    rsvps: Mapped[list["RallyRsvp"]] = relationship(
        back_populates="rally", order_by="RallyRsvp.created_at", cascade="all, delete-orphan"
    )


class RallyRsvp(Base):
    """'I'm in' (going) or 'Can't make it' (not going) for a rally."""
    __tablename__ = "rally_rsvps"
    __table_args__ = (UniqueConstraint("rally_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    rally_id: Mapped[int] = mapped_column(ForeignKey("rallies.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    going: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    rally: Mapped[Rally] = relationship(back_populates="rsvps")
    user: Mapped[User] = relationship()


class Truce(Base):
    """Team up: after a joint Hang, the two teams share that zone until ends_at. A shared zone counts for both
    teams, isn't contested between them, and neither gets a Friend or Foe alert about the other there."""
    __tablename__ = "truces"

    id: Mapped[int] = mapped_column(primary_key=True)
    hex_id: Mapped[str] = mapped_column(String(20), index=True)
    team_a_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    team_b_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    hang_id: Mapped[int | None] = mapped_column(ForeignKey("hangs.id"))
    place_name: Mapped[str | None] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    ends_at: Mapped[datetime] = mapped_column(DateTime, index=True)


class HotZone(Base):
    """One of today's double-points zones (picked once a day, see hotzones.py)."""
    __tablename__ = "hot_zones"
    __table_args__ = (UniqueConstraint("day", "hex_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    day: Mapped[date] = mapped_column(Date, index=True)  # the city's local date
    hex_id: Mapped[str] = mapped_column(String(20))
    place_name: Mapped[str] = mapped_column(String(120))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    reason: Mapped[str] = mapped_column(String(20), default="outdoors")  # contested / outdoors / popular


class JobRun(Base):
    """Background jobs that run once a day or once a week (hot-zone push, Sunday recap), even across restarts."""
    __tablename__ = "job_runs"
    __table_args__ = (UniqueConstraint("name", "key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(40))
    key: Mapped[str] = mapped_column(String(40))  # e.g. the day or the week it ran for
    ran_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class LoginSession(Base):
    """One signed-in device. The app keeps the token; the database only keeps its SHA-256 hash."""
    __tablename__ = "login_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
