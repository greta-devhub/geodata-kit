"""Point → country / first-level subdivision from boundary polygons.

The outlines are simplified, so three rules keep the answers right in coastal cities and small states:
near any border or coast the finer subdivision outlines decide, and where shapes overlap the smallest wins;
a territory too small for the data is stored as a marker and covers MARKER_KM around it;
a point just off the simplified coast gets the nearest land within NEAR_COAST_KM.
"""
from __future__ import annotations

import math

from ._data import load

# Coordinates are stored as integers in 1/1000 degree (about 111 m of latitude).
_SCALE = 1000
_KM_PER_UNIT = 0.1112

# A point this close to land still counts as that land: simplified coasts cut off harbours and small islands.
NEAR_COAST_KM = 5
# A shape no bigger than two grid cells is a marker for a territory too small for the data; it covers this distance around it.
MARKER_KM = 0.5
# Closer than this to any coarse country outline, the finer subdivision outlines decide.
_COARSE_EDGE_KM = 15


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


def _bbox_area(feature: dict) -> int:
    min_x, min_y, max_x, max_y = feature["bbox"]
    return (max_x - min_x) * (max_y - min_y)


def _is_marker(feature: dict) -> bool:
    min_x, min_y, max_x, max_y = feature["bbox"]
    return max_x - min_x <= 2 and max_y - min_y <= 2


def _distance_to_outline(feature: dict, x: int, y: int, limit_km: float) -> float:
    """Distance in km from the point to the outline of a shape; inf when its bounding box is farther than `limit_km`."""
    # One unit of longitude shrinks with latitude; near the poles the factor is clamped so the search box stays finite.
    shrink = max(0.05, math.cos((y / _SCALE) * (math.pi / 180)))
    limit = limit_km / _KM_PER_UNIT
    min_x, min_y, max_x, max_y = feature["bbox"]
    if x < min_x - limit / shrink or x > max_x + limit / shrink or y < min_y - limit or y > max_y + limit:
        return math.inf
    best = math.inf
    hypot = math.hypot
    for rings in feature["polygons"]:
        for ring in rings:
            if not ring:
                continue
            ax, ay = (ring[-2] - x) * shrink, ring[-1] - y
            for i in range(0, len(ring), 2):
                bx, by = (ring[i] - x) * shrink, ring[i + 1] - y
                dx, dy = bx - ax, by - ay
                length = dx * dx + dy * dy
                t = 0 if length == 0 else max(0, min(1, -(ax * dx + ay * dy) / length))
                distance = hypot(ax + t * dx, ay + t * dy)
                if distance < best:
                    best = distance
                ax, ay = bx, by
    return best * _KM_PER_UNIT


def _smallest_containing(features: list[dict], x: int, y: int) -> dict | None:
    """The smallest shape that contains the point (or marker that covers it): an enclave or microstate wins over what surrounds it."""
    best = None
    best_area = 0
    for feature in features:
        area = _bbox_area(feature)
        if best is not None and area >= best_area:
            continue
        if _contains(feature, x, y) or (_is_marker(feature) and _distance_to_outline(feature, x, y, MARKER_KM) < MARKER_KM):
            best, best_area = feature, area
    return best


def _nearest_within(features: list[dict], x: int, y: int, limit_km: float) -> dict | None:
    """The shape whose outline is nearest to the point, if within `limit_km`. Ties go to the first shape in the data."""
    best = None
    best_distance = limit_km
    for feature in features:
        distance = _distance_to_outline(feature, x, y, best_distance)
        if distance < best_distance:
            best, best_distance = feature, distance
    return best


def _to_grid(lat: float, lng: float) -> tuple[int, int] | None:
    """Integer grid position of a coordinate; None for invalid input. Longitudes wrap around, so 190 is the same as -170."""
    for value in (lat, lng):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            return None
    if lat < -90 or lat > 90:
        return None
    # fmod keeps the sign of the dividend, like the % operator in TypeScript.
    wrapped = math.fmod(math.fmod(lng + 180, 360) + 360, 360) - 180
    return _js_round(wrapped * _SCALE), _js_round(lat * _SCALE)


def get_country_at(lat: float, lng: float) -> str | None:
    """ISO alpha-2 code of the country at a point: (41.01, 28.98) → "TR".

    None on the open sea (more than NEAR_COAST_KM from land) and for invalid coordinates.
    """
    point = _to_grid(lat, lng)
    if not point:
        return None
    x, y = point
    countries = load("shapes", "countries.json")
    coarse = _smallest_containing(countries, x, y)
    # Well inside a country, far from every outline: the coarse data is enough and the bigger subdivision data stays unloaded.
    if coarse and not any(_distance_to_outline(country, x, y, _COARSE_EDGE_KM) < _COARSE_EDGE_KM for country in countries):
        return coarse["id"]
    subdivisions = load("shapes", "subdivisions.json")
    fine = _smallest_containing(subdivisions, x, y)
    if fine:
        return fine["country"]
    if coarse:
        return coarse["id"]
    near_subdivision = _nearest_within(subdivisions, x, y, NEAR_COAST_KM)
    near_country = _nearest_within(countries, x, y, NEAR_COAST_KM)
    if near_subdivision and near_country:
        a = _distance_to_outline(near_subdivision, x, y, NEAR_COAST_KM)
        b = _distance_to_outline(near_country, x, y, NEAR_COAST_KM)
        return near_subdivision["country"] if a <= b else near_country["id"]
    if near_subdivision:
        return near_subdivision["country"]
    return near_country["id"] if near_country else None


def get_subdivision_at(lat: float, lng: float) -> dict | None:
    """First-level subdivision at a point: (48.14, 11.58) → {"country": "DE", "iso": "DE-BY", "code": "02", "name": "Bavaria"}.

    None on the open sea (more than NEAR_COAST_KM from land), for invalid coordinates and where a country has no subdivision shapes.
    """
    point = _to_grid(lat, lng)
    if not point:
        return None
    x, y = point
    subdivisions = load("shapes", "subdivisions.json")
    feature = _smallest_containing(subdivisions, x, y) or _nearest_within(subdivisions, x, y, NEAR_COAST_KM)
    if not feature:
        return None
    return {"country": feature["country"], "iso": feature["iso"], "code": feature["code"], "name": feature.get("name")}
