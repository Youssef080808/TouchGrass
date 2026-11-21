"""Database tables.

Team         a friend group; territory belongs to teams
User         one player (no passwords: a random token identifies the device)
Hang         one session, solo or group, at one place
HangMember   who was in a Hang, when they joined, whether they picked up their phone
HexScore     points a team earned in one map hexagon (territory is the sum, fading over time)
Notification Friend or Foe alerts and other messages
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
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
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
    broke_at: Mapped[datetime | None] = mapped_column(DateTime)          # when they picked up / left
    break_reason: Mapped[str | None] = mapped_column(String(20))        # picked_up, left_app, left_area, left
    last_ping_at: Mapped[datetime | None] = mapped_column(DateTime)
    points_earned: Mapped[int | None] = mapped_column(Integer)
    breakdown: Mapped[dict | None] = mapped_column(JSON)

    hang: Mapped[Hang] = relationship(back_populates="members")
    user: Mapped[User] = relationship()


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
