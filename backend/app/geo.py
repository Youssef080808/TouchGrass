"""Distances and map hexagons (Uber's H3 grid)."""
import math

import h3

from .config import HEX_RESOLUTION

EARTH_RADIUS_M = 6_371_000


def distance_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Haversine distance in metres between two points."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def hex_for(lat: float, lng: float) -> str:
    """The ID of the hexagon this point falls in."""
    return h3.latlng_to_cell(lat, lng, HEX_RESOLUTION)


def hex_boundary(hex_id: str) -> list[list[float]]:
    """Corner points of a hexagon as [lat, lng] pairs (what Leaflet needs to draw it)."""
    return [[lat, lng] for lat, lng in h3.cell_to_boundary(hex_id)]


def hex_center(hex_id: str) -> tuple[float, float]:
    return h3.cell_to_latlng(hex_id)
