"""Map territory, leaderboards and place suggestions."""
import asyncio
from collections import defaultdict

import httpx
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import territory
from ..auth import current_user
from ..db import get_db
from ..geo import hex_boundary
from ..models import Team, User
from ..places import SAMPLE_PLACES, google_nearby, rank, types_for
from ..serializers import team_out
from ..weather import current_weather_async

router = APIRouter(tags=["game"])


@router.get("/territory")
def get_territory(db: Session = Depends(get_db)):
    """Every hexagon anyone has scored in, with its owner and each team's score."""
    teams = {t.id: t for t in db.scalars(select(Team))}
    out = []
    for hex_id, scores in territory.standings(db).items():
        owner_id, contested = territory.owner_from(scores)
        out.append({
            "hex_id": hex_id,
            "boundary": hex_boundary(hex_id),
            "owner": team_out(teams.get(owner_id)) if owner_id else None,
            "contested": contested,
            "scores": sorted(
                [{**team_out(teams[tid]), "points": round(p)} for tid, p in scores.items() if tid in teams],
                key=lambda s: s["points"], reverse=True,
            ),
        })
    return out


@router.get("/leaderboard")
def leaderboard(db: Session = Depends(get_db)):
    teams = {t.id: t for t in db.scalars(select(Team))}
    hexes_owned: dict[int, int] = defaultdict(int)
    team_points: dict[int, float] = defaultdict(float)
    for scores in territory.standings(db).values():
        owner_id, _ = territory.owner_from(scores)
        if owner_id:
            hexes_owned[owner_id] += 1
        for tid, p in scores.items():
            team_points[tid] += p
    team_rows = sorted(
        [{**team_out(t), "hexes": hexes_owned[t.id], "points": round(team_points[t.id])} for t in teams.values()],
        key=lambda r: (r["hexes"], r["points"]), reverse=True,
    )
    players = db.scalars(select(User).order_by(User.points.desc()).limit(25))
    player_rows = [{"id": u.id, "name": u.name, "team": team_out(u.team), "points": u.points,
                    "streak": u.streak} for u in players]
    return {"teams": team_rows, "players": player_rows}


@router.get("/suggestions")
async def suggestions(lat: float = Query(ge=-90, le=90), lng: float = Query(ge=-180, le=180),
                      user: User = Depends(current_user)):
    """Places to go, ranked by your interests, distance, rating and the weather right now."""
    interests = user.interests or []
    async with httpx.AsyncClient() as client:
        weather, google = await asyncio.gather(
            current_weather_async(client, lat, lng),
            google_nearby(client, lat, lng, types_for(interests)),
        )
    places = google if google else SAMPLE_PLACES
    return {
        "source": "google" if google else "sample",
        "weather": weather,
        "places": rank(places, lat, lng, interests, weather)[:8],
    }
