"""Country groups: continents, UN M49 regions, EU/EEA/Schengen/Eurozone/EFTA (dated) and business regions."""
from __future__ import annotations

import datetime as _dt
import functools
from typing import Iterable

from ._data import load
from .countries import _records, is_active, normalize_country_code, resolve_country, to_iso_date


@functools.cache
def _groups() -> dict[str, dict]:
    return {group["slug"]: group for group in load("core", "groups.json")}


def list_groups(kind: str | None = None) -> list[dict]:
    return [dict(g) for g in _groups().values() if not kind or g["kind"] == kind]


def get_group(slug: str) -> dict | None:
    group = _groups().get(slug.strip().lower())
    return dict(group) if group else None


def get_countries_in_group(slug: str, options: dict | None = None, *, at: str | _dt.date | None = None) -> list[str]:
    if options:
        at = options.get("at", at)
    group = _groups().get(slug.strip().lower())
    if not group:
        return []
    day = to_iso_date(at)
    return [m["code"] for m in group["members"] if is_active(m, day)]


def get_groups_of_country(code: str, options: dict | None = None, *, at: str | _dt.date | None = None,
                          kind: str | None = None) -> list[dict]:
    if options:
        at, kind = options.get("at", at), options.get("kind", kind)
    normalized = normalize_country_code(code)
    if not normalized:
        return []
    day = to_iso_date(at)
    return [dict(g) for g in _groups().values()
            if (not kind or g["kind"] == kind) and any(m["code"] == normalized and is_active(m, day) for m in g["members"])]


def is_in_group(code: str, slug: str, options: dict | None = None, *, at: str | _dt.date | None = None) -> bool:
    if options:
        at = options.get("at", at)
    normalized = normalize_country_code(code)
    return normalized is not None and normalized in get_countries_in_group(slug, at=at)


def expand_groups(items: Iterable[str], options: dict | None = None, *, at: str | _dt.date | None = None) -> list[str]:
    """['dach', 'FR', 'Polska'] → ['AT', 'CH', 'DE', 'LI', 'FR', 'PL']."""
    if options:
        at = options.get("at", at)
    result: list[str] = []
    for item in items:
        if item.strip().lower() in _groups():
            codes = get_countries_in_group(item, at=at)
        else:
            match = resolve_country(item)
            codes = [match.code] if match else []
        for code in codes:
            if code not in result:
                result.append(code)
    return result


def list_continents() -> list[dict]:
    return [{"code": g["code"], "name": g["name"], "slug": g["slug"]} for g in _groups().values() if g["kind"] == "continent"]


def get_continent(code: str) -> dict | None:
    normalized = normalize_country_code(code)
    if not normalized:
        return None
    continent = _records()[normalized]["continent"]
    return next((c for c in list_continents() if c["code"] == continent), None)


def get_m49_region(code: str) -> dict | None:
    normalized = normalize_country_code(code)
    if not normalized:
        return None
    names = load("core", "m49.json")
    m49 = _records()[normalized]["m49"]
    area = lambda value: {"code": value, "name": names.get(value, value)} if value else None  # noqa: E731
    return {
        "region": area(m49["region"]),
        "subregion": area(m49["subregion"]),
        "intermediate": area(m49["intermediate"]),
        "groupings": [area(value) for value in m49["groupings"]],
    }
