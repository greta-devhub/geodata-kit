"""Timezones per country and IANA name validation (legacy names accepted)."""
from __future__ import annotations

import functools

from ._data import load
from .countries import get_country


@functools.cache
def _lookup() -> dict[str, str]:
    data = load("core", "timezones.json")
    table = {zone.lower(): zone for zone in data["zones"]}
    table.update({alias.lower(): target for alias, target in data["aliases"].items()})
    return table


def get_country_timezones(code: str) -> list[str]:
    country = get_country(code)
    return list(country.timezones) if country else []


def get_primary_timezone(code: str) -> str | None:
    """Timezone of the country's most populous city."""
    country = get_country(code)
    if not country:
        return None
    return load("core", "primary-timezones.json").get(country.code) or (country.timezones[0] if country.timezones else None)


def is_timezone(value: object) -> bool:
    return isinstance(value, str) and value.strip().lower() in _lookup()


def canonical_timezone(value: str) -> str | None:
    """"Europe/Kiev" → "Europe/Kyiv"."""
    found = _lookup().get(value.strip().lower())
    if not found:
        return None
    data = load("core", "timezones.json")
    return found if found in set(data["zones"]) else data["aliases"].get(found, found)


def list_timezones() -> list[str]:
    return list(load("core", "timezones.json")["zones"])
