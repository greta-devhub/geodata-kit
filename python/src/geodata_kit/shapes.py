"""Point → country / first-level subdivision from Natural Earth polygons."""
from __future__ import annotations

import math

from ._data import load
from .subdivisions import get_subdivision, get_subdivision_name

_SCALE = 1000


def _js_round(value: float) -> int:
    """Math.round semantics (half up), so Python and TypeScript pick the same cell."""
    return math.floor(value + 0.5)


def _inside_ring(ring: list[int], x: int, y: int) -> bool:
    inside = False
    j = len(ring) - 2
    for i in range(0, len(ring), 2):
        xi, yi, xj, yj = ring[i], ring[i + 1], ring[j], ring[j + 1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def _contains(feature: dict, x: int, y: int) -> bool:
    min_x, min_y, max_x, max_y = feature["bbox"]
    if x < min_x or x > max_x or y < min_y or y > max_y:
        return False
    return any(_inside_ring(rings[0], x, y) and not any(_inside_ring(hole, x, y) for hole in rings[1:]) for rings in feature["polygons"])


def get_country_at(lat: float, lng: float) -> str | None:
    x, y = _js_round(lng * _SCALE), _js_round(lat * _SCALE)
    return next((f["id"] for f in load("shapes", "countries.json") if _contains(f, x, y)), None)


def get_subdivision_at(lat: float, lng: float) -> dict | None:
    x, y = _js_round(lng * _SCALE), _js_round(lat * _SCALE)
    feature = next((f for f in load("shapes", "subdivisions.json") if _contains(f, x, y)), None)
    if not feature:
        return None
    subdivision = get_subdivision(f"{feature['country']}.{feature['code']}") if feature["code"] else None
    return {
        "country": feature["country"],
        "iso": feature["iso"],
        "name": subdivision.name if subdivision else (get_subdivision_name(feature["iso"]) if feature["iso"] else None),
        "subdivision": subdivision,
    }
