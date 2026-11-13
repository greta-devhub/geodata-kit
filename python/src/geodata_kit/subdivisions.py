"""Subdivisions on four levels; level 1 with ISO 3166-2."""
from __future__ import annotations

import functools
from dataclasses import dataclass, field

from ._data import exists, load
from .countries import normalize_country_code
from .fold import clean_input, fold


@dataclass(frozen=True)
class Subdivision:
    country: str
    level: int
    code: str
    path: str
    iso: str | None
    name: str
    geoname_id: int
    population: int | None
    aliases: tuple[str, ...] = field(default=())


@functools.cache
def _level1() -> list[Subdivision]:
    return [Subdivision(r["country"], 1, r["code"], r["code"], r["iso"], r["name"], r["geonameId"], r["population"], tuple(r["aliases"]))
            for r in load("subdivisions", "level1.json")]


@functools.cache
def _by_country() -> dict[str, list[Subdivision]]:
    result: dict[str, list[Subdivision]] = {}
    for s in _level1():
        result.setdefault(s.country, []).append(s)
    return result


@functools.cache
def _by_iso() -> dict[str, Subdivision]:
    return {s.iso: s for s in _level1() if s.iso}


@functools.cache
def _index(country: str) -> dict[str, Subdivision]:
    index: dict[str, Subdivision] = {}
    ranked = sorted(_by_country().get(country, []), key=lambda s: -(s.population or 0))
    for s in ranked:
        index.setdefault(fold(s.name), s)
    for s in ranked:
        for alias in s.aliases:
            key = fold(alias)
            if key:
                index.setdefault(key, s)
    return index


def list_subdivisions(country: str) -> list[Subdivision]:
    code = normalize_country_code(country)
    return sorted(_by_country().get(code, []), key=lambda s: s.name) if code else []


def get_subdivision(code: str) -> Subdivision | None:
    upper = code.strip().upper()
    if upper in _by_iso():
        return _by_iso()[upper]
    if "." in code:
        country, _, rest = code.strip().partition(".")
        return next((s for s in _by_country().get(country.upper(), []) if s.code == rest), None)
    return None


def is_subdivision_code(value: object) -> bool:
    return isinstance(value, str) and value.strip().upper() in load("subdivisions", "iso.json")


def get_subdivision_name(iso: str) -> str | None:
    upper = iso.strip().upper()
    found = load("subdivisions", "iso.json").get(upper)
    return found or (_by_iso()[upper].name if upper in _by_iso() else None)


def resolve_subdivision(text: str | None, country: str | None = None) -> Subdivision | None:
    """"Bayern", "Bavaria", "BY", "DE-BY" → Bavaria. Without a country only full ISO codes resolve."""
    if not isinstance(text, str):
        return None
    cleaned = clean_input(text)
    if not cleaned:
        return None
    by_iso = _by_iso().get(cleaned.upper())
    if by_iso and (not country or by_iso.country == normalize_country_code(country)):
        return by_iso
    code = normalize_country_code(country) if country else None
    if not code:
        return None
    with_iso = _by_iso().get(f"{code}-{cleaned.upper()}")
    if with_iso:
        return with_iso
    by_code = next((s for s in _by_country().get(code, []) if s.code.upper() == cleaned.upper()), None)
    return by_code or _index(code).get(fold(cleaned))


@functools.cache
def _deep(country: str) -> dict | None:
    return load("subdivisions", "deep", f"{country}.json") if exists("subdivisions", "deep", f"{country}.json") else None


def _from_row(country: str, level: int, row: list) -> Subdivision:
    parts = row[0].split(".")
    return Subdivision(country, level, parts[-1], row[0], None, row[1], row[2], row[3] or None, tuple(row[4]) if len(row) > 4 else ())


def load_subdivisions(country: str, options: dict | None = None, *, level: int = 1, parent=None) -> list[Subdivision]:
    if options:
        level, parent = options.get("level", level), options.get("parent", parent)
    code = normalize_country_code(country)
    if not code:
        return []
    parent_path = None
    if parent:
        found = (get_subdivision(parent) or resolve_subdivision(parent, code)) if isinstance(parent, str) else parent
        if not found:
            return []
        parent_path = found.path
    if level == 1:
        return list_subdivisions(code)
    deep = _deep(code) or {}
    rows = deep.get(str(level), [])
    return sorted((_from_row(code, level, row) for row in rows if not parent_path or row[0].startswith(parent_path + ".")), key=lambda s: s.name)


def find_subdivision(text: str, country: str, options: dict | None = None, *, level: int | None = None) -> Subdivision | None:
    if options:
        level = options.get("level", level)
    code = normalize_country_code(country)
    if not code:
        return None
    if not level or level == 1:
        found = resolve_subdivision(text, code)
        if found or level == 1:
            return found
    key = fold(clean_input(text))
    deep = _deep(code)
    if not key or not deep:
        return None
    for current in ([level] if level else [2, 3, 4]):
        rows = deep.get(str(current), [])
        matches = [row for row in rows if fold(row[1]) == key] or [row for row in rows if len(row) > 4 and any(fold(a) == key for a in row[4])]
        if matches:
            matches.sort(key=lambda row: (-row[3], row[2]))
            return _from_row(code, current, matches[0])
    return None


def get_subdivision_chain(place) -> list[Subdivision]:
    """Bayern → Oberbayern → Landkreis München → Unterhaching, for anything with country and admin1..admin4."""
    get = (lambda key: place.get(key)) if isinstance(place, dict) else (lambda key: getattr(place, key, None))
    code = normalize_country_code(get("country") or "")
    admin1 = get("admin1")
    if not code or not admin1:
        return []
    chain = []
    level1 = get_subdivision(f"{code}.{admin1}")
    if level1:
        chain.append(level1)
    parts = [admin1, get("admin2"), get("admin3"), get("admin4")]
    deep = _deep(code)
    if not parts[1] or not deep:
        return chain
    for level in (2, 3, 4):
        if not parts[level - 1]:
            break
        path = ".".join(part or "" for part in parts[:level])
        row = next((r for r in deep.get(str(level), []) if r[0] == path), None)
        if row:
            chain.append(_from_row(code, level, row))
    return chain
