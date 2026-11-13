"""Airports with an IATA or ICAO code, with the city they serve."""
from __future__ import annotations

import functools
from dataclasses import dataclass

from ._data import load
from .countries import normalize_country_code
from .fold import clean_input, fold


@dataclass(frozen=True)
class Airport:
    geoname_id: int
    name: str
    iata: str | None
    icao: str | None
    country: str
    admin1: str
    lat: float
    lng: float
    timezone: str
    city_id: int | None


@functools.cache
def _airports() -> list[Airport]:
    data = load("airports.json")
    return [Airport(r[0], r[1], r[2] or None, r[3] or None, r[4], r[5], r[6], r[7], data["tz"][r[8]], r[9] or None) for r in data["rows"]]


@functools.cache
def _by(field: str) -> dict[str, Airport]:
    result: dict[str, Airport] = {}
    for airport in _airports():
        value = getattr(airport, field)
        if value and value not in result:
            result[value] = airport
    return result


def get_airport_by_iata(code: str) -> Airport | None:
    return _by("iata").get(code.strip().upper())


def get_airport_by_icao(code: str) -> Airport | None:
    return _by("icao").get(code.strip().upper())


def list_airports(country: str) -> list[Airport]:
    code = normalize_country_code(country)
    return sorted((a for a in _airports() if a.country == code), key=lambda a: a.name) if code else []


def search_airports(query: str, options: dict | None = None, *, country: str | None = None, limit: int = 10) -> list[Airport]:
    if options:
        country, limit = options.get("country", country), options.get("limit", limit)
    cleaned = clean_input(query)
    if not cleaned:
        return []
    upper, key = cleaned.upper(), fold(cleaned)
    code = normalize_country_code(country) if country else None
    scored = []
    for airport in _airports():
        if code and airport.country != code:
            continue
        name = fold(airport.name)
        if upper in (airport.iata, airport.icao):
            score = 0
        elif name.startswith(key):
            score = 1
        elif any(word.startswith(key) for word in name.split(" ")):
            score = 2
        else:
            continue
        scored.append((score, 0 if airport.iata else 1, airport.name, airport))
    scored.sort(key=lambda item: item[:3])
    return [item[3] for item in scored[:limit]]
