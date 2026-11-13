"""Airports with an IATA or ICAO code, with the city they serve."""
from __future__ import annotations

import functools
from dataclasses import dataclass, field as _field

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
    subdivision1: str
    lat: float
    lng: float
    timezone: str
    city_id: int | None
    # Other IATA codes it is known by: EuroAirport (EAP) is also BSL and MLH. get_airport_by_iata finds it by any.
    alternate_iata: list[str] = _field(default_factory=list)


@functools.cache
def _airports() -> list[Airport]:
    data = load("airports.json")
    return [Airport(r[0], r[1], r[2] or None, r[3] or None, r[4], r[5], r[6], r[7], data["tz"][r[8]], r[9] or None,
                    r[10].split(" ") if len(r) > 10 and r[10] else []) for r in data["rows"]]


@functools.cache
def _by(field: str) -> dict[str, Airport]:
    result: dict[str, Airport] = {}
    for airport in _airports():
        value = getattr(airport, field)
        if value and value not in result:
            result[value] = airport
    if field == "iata":
        # Alternate codes after every main code, so they never take one.
        for airport in _airports():
            for code in airport.alternate_iata:
                result.setdefault(code, airport)
    return result


def get_airport_by_iata(code: str) -> Airport | None:
    """Airport by its main or an alternate IATA code: "BSL" → EuroAirport (EAP)."""
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
        if upper in (airport.iata, airport.icao) or upper in airport.alternate_iata:
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
