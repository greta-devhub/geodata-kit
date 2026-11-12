"""Cities (GeoNames cities500 in tier bands), localities (optional package), location parsing and city timezones."""
from __future__ import annotations

import functools
import math
import re
from dataclasses import dataclass, field, replace

from ._data import exists, list_dir, load
from .countries import get_country, normalize_country_code, resolve_country
from .fold import clean_input, fold
from .subdivisions import Subdivision, resolve_subdivision
from .timezones import get_primary_timezone

BANDS = (15000, 5000, 1000, 500)
_TIER_RANK = {15000: 0, 5000: 1, 1000: 2, 500: 3, "locality": 4}
_FEATURE_RANK = {"PPLC": 0, "PPLG": 1, "PPLA": 2, "PPLA2": 3, "PPLA3": 4, "PPLA4": 5, "PPLA5": 6, "PPL": 7, "PPLS": 8,
                 "PPLF": 9, "PPLR": 9, "PPLL": 10, "PPLX": 11}


@dataclass(frozen=True)
class City:
    geoname_id: int
    name: str
    ascii_name: str
    country: str
    admin1: str
    admin2: str
    admin3: str
    admin4: str
    feature_code: str
    population: int
    lat: float
    lng: float
    timezone: str
    tier: int | str
    kind: str
    unlocode: str | None
    wikidata_id: str | None
    alternate_names: tuple[str, ...] = field(default=())
    parent_id: int | None = None
    distance_km: float | None = None


def _rank(city: City):
    return (-city.population, _FEATURE_RANK.get(city.feature_code, 12), city.geoname_id)


def _in_tier(city: City, tier) -> bool:
    return tier == "all" or _TIER_RANK[city.tier] <= _TIER_RANK[tier]


class _Store:
    def __init__(self) -> None:
        self.bands: set[int] = set()
        self.cities: list[City] = []
        self.by_id: dict[int, City] = {}
        self.main: dict[str, list[City]] = {}
        self.alternate: dict[str, list[City]] = {}


_stores: dict[str, _Store] = {}


def _load_band(country: str, band: int) -> None:
    store = _stores.setdefault(country, _Store())
    if band in store.bands:
        return
    store.bands.add(band)
    if not exists("cities", country, f"{band}.json"):
        return
    data = load("cities", country, f"{band}.json")
    for row in data["rows"]:
        city = City(row[0], row[1], row[2] or row[1], country, row[7], row[8], row[9], row[10], row[3], row[4], row[5], row[6],
                    data["tz"][row[11]], band, "city", row[13] or None, row[14] or None, tuple(row[12] or ()), None)
        store.cities.append(city)
        store.by_id[city.geoname_id] = city
        store.main.setdefault(fold(city.name), []).append(city)
        if city.ascii_name != city.name:
            store.main.setdefault(fold(city.ascii_name), []).append(city)
    store.alternate = {}
    for city in store.cities:
        for name in city.alternate_names:
            key = fold(name)
            if key not in store.main:
                store.alternate.setdefault(key, []).append(city)


def _load_country(country: str, tier) -> _Store:
    wanted = BANDS if tier == "all" else BANDS[: BANDS.index(tier) + 1]
    for band in wanted:
        _load_band(country, band)
    return _stores[country]


def preload_cities(countries, options: dict | None = None, *, tier=500) -> None:
    if options:
        tier = options.get("tier", tier)
    for code in countries:
        normalized = normalize_country_code(code)
        if normalized:
            _load_country(normalized, tier)


def _all_country_codes() -> list[str]:
    return [name for name in list_dir("cities") if re.fullmatch(r"[A-Z]{2}", name)]


# ─── Localities (optional package) ───────────────────────────────────────

def has_localities() -> bool:
    try:
        import geodata_kit_localities  # noqa: F401
        return True
    except ImportError:
        return False


@functools.cache
def _localities(country: str) -> dict[str, list[City]] | None:
    try:
        from geodata_kit_localities import load_localities
    except ImportError:
        return None
    data = load_localities(country)
    if not data:
        return None
    index: dict[str, list[City]] = {}
    for row in data["rows"]:
        city = City(row[0], row[1], row[2] or row[1], country, row[7], row[8], row[9], row[10], row[3], row[4], row[5], row[6],
                    data["tz"][row[11]], "locality", "neighbourhood" if row[3] == "PPLX" else "locality", None, None, (), row[12] or None)
        index.setdefault(fold(city.name), []).append(city)
        if city.ascii_name != city.name:
            index.setdefault(fold(city.ascii_name), []).append(city)
    return index


# ─── Lookups ──────────────────────────────────────────────────────────────

def _to_country(country) -> str | None:
    if not country:
        return None
    normalized = normalize_country_code(country)
    if normalized:
        return normalized
    match = resolve_country(country)
    return match.code if match else None


def _subdivision_filter(country: str, subdivision):
    if not subdivision:
        return None
    resolved = resolve_subdivision(subdivision, country) if isinstance(subdivision, str) else subdivision
    if not resolved or resolved.country != country:
        return lambda city: False
    depth = len(resolved.path.split("."))
    return lambda city: ".".join([city.admin1, city.admin2, city.admin3, city.admin4][:depth]) == resolved.path


def _clean_city_name(text: str) -> str:
    text = re.sub(r"\b[A-Z]{1,3}-\d{3,6}\b", " ", clean_input(text))
    text = re.sub(r"(^|\s)\d{3,6}(?=\s|$)", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _opt(options: dict | None, key: str, default=None):
    if not options:
        return default
    snake = re.sub(r"([A-Z])", lambda m: "_" + m.group(1).lower(), key)
    return options.get(key, options.get(snake, default))


def find_city(name: str, options: dict | None = None, *, country: str | None = None, subdivision=None, tier=500) -> City | None:
    """Best match for a place name in a country (exact/ASCII name, then alternate names; ranked by population)."""
    country = _opt(options, "country", country)
    subdivision = _opt(options, "subdivision", subdivision)
    tier = _opt(options, "tier", tier)
    candidates = _find_candidates(name, country, subdivision, tier)
    return candidates[0] if candidates else None


def _find_candidates(name: str, country, subdivision, tier) -> list[City]:
    code = _to_country(country)
    if not code or not isinstance(name, str):
        return []
    key = fold(_clean_city_name(name))
    if not key:
        return []
    keep = _subdivision_filter(code, subdivision)
    store = _load_country(code, tier)

    def pick(found):
        return sorted((c for c in found or [] if _in_tier(c, tier) and (not keep or keep(c))), key=_rank)

    matches = pick(store.main.get(key)) or pick(store.alternate.get(key))
    if not matches and tier == "all":
        index = _localities(code)
        if index:
            matches = sorted((c for c in index.get(key, []) if not keep or keep(c)), key=_rank)
    return matches


def search_cities(query: str, options: dict | None = None, *, country=None, subdivision=None, min_population=None, tier=500, limit=10) -> list[City]:
    country = _opt(options, "country", country)
    subdivision = _opt(options, "subdivision", subdivision)
    min_population = _opt(options, "minPopulation", min_population)
    tier = _opt(options, "tier", tier)
    limit = _opt(options, "limit", limit)
    key = fold(clean_input(query))
    if not key:
        return []
    codes = [c for c in [_to_country(country)] if c] if country else _all_country_codes()
    results: dict[int, City] = {}
    for code in codes:
        store = _load_country(code, tier)
        keep = _subdivision_filter(code, subdivision)
        for index in (store.main, store.alternate):
            for name, cities in index.items():
                if not name.startswith(key) and f" {key}" not in name:
                    continue
                for city in cities:
                    if not _in_tier(city, tier) or (keep and not keep(city)):
                        continue
                    if min_population is not None and city.population < min_population:
                        continue
                    results[city.geoname_id] = city
    exact = lambda c: 0 if fold(c.name) == key or fold(c.ascii_name) == key else 1  # noqa: E731
    return sorted(results.values(), key=lambda c: (exact(c), *_rank(c)))[:limit]


def list_cities(options: dict | None = None, *, country=None, subdivision=None, min_population=None, tier=500) -> list[City]:
    country = _opt(options, "country", country)
    subdivision = _opt(options, "subdivision", subdivision)
    min_population = _opt(options, "minPopulation", min_population)
    tier = _opt(options, "tier", tier)
    code = _to_country(country)
    if not code:
        return []
    store = _load_country(code, tier)
    keep = _subdivision_filter(code, subdivision)
    return sorted((c for c in store.cities if _in_tier(c, tier) and (not keep or keep(c))
                   and (min_population is None or c.population >= min_population)), key=_rank)


@functools.cache
def _id_index() -> tuple[dict[int, str], dict[str, str]]:
    data = load("cities", "index.json")
    by_id: dict[int, str] = {}
    for country, deltas in data["ids"].items():
        current = 0
        for delta in deltas:
            current += delta
            by_id[current] = country
    return by_id, data["wikidata"]


def get_city(geoname_id: int) -> City | None:
    country = _id_index()[0].get(geoname_id)
    return _load_country(country, 500).by_id.get(geoname_id) if country else None


def get_city_by_unlocode(code: str) -> City | None:
    upper = re.sub(r"\s+", "", code).upper()
    country = normalize_country_code(upper[:2])
    if not country or len(upper) != 5:
        return None
    matches = sorted((c for c in _load_country(country, 500).cities if c.unlocode == upper), key=_rank)
    return matches[0] if matches else None


def get_place_by_wikidata_id(wikidata_id: str) -> City | None:
    qid = wikidata_id.strip().upper()
    country = _id_index()[1].get(qid)
    if not country:
        return None
    return next((c for c in _load_country(country, 500).cities if c.wikidata_id == qid), None)


# ─── Free-text locations ──────────────────────────────────────────────────

def _split_location(text: str) -> list[str]:
    return [part.strip() for part in re.split(r"\s*[,;|/]\s*|\s+-\s+|\s*\(\s*|\s*\)\s*", clean_input(text)) if part.strip()]


def parse_location(text: str, options: dict | None = None, *, country=None, tier=500) -> dict:
    """"Berlin, Germany", "München (DE)", "San Francisco, CA" → {"city", "subdivision", "country"}."""
    country = _opt(options, "country", country)
    tier = _opt(options, "tier", tier)
    empty = {"city": None, "subdivision": None, "country": _to_country(country)}
    if not isinstance(text, str) or not clean_input(text):
        return empty
    parts = _split_location(text)

    def attempt(code: str, rest: list[str]):
        subdivision: Subdivision | None = None
        city_parts: list[str] = []
        for index, part in enumerate(rest):
            if index > 0 and not subdivision:
                found = resolve_subdivision(part, code)
                if found:
                    subdivision = found
                    continue
            match = resolve_country(part)
            if index > 0 and match and match.code == code:
                continue
            city_parts.append(part)
        for candidate in (city_parts[0] if city_parts else None, " ".join(city_parts)):
            if not candidate:
                continue
            city = find_city(candidate, country=code, subdivision=subdivision, tier=tier) or (
                None if subdivision else find_city(candidate, country=code, tier=tier))
            if city:
                return {"city": city, "subdivision": subdivision or (resolve_subdivision(city.admin1, code) if city.admin1 else None), "country": code}
        return {"city": None, "subdivision": subdivision, "country": code} if subdivision else None

    given = _to_country(country)
    if given:
        return attempt(given, parts) or {**empty, "country": given}
    if len(parts) == 1 and " " in parts[0]:
        words = parts[0].split(" ")
        for take in range(min(3, len(words) - 1), 0, -1):
            match = resolve_country(" ".join(words[-take:]))
            if match and match.matched_by != "alpha2":
                parts = [" ".join(words[:-take]), " ".join(words[-take:])]
                break
    if len(parts) > 1:
        last = parts[-1]
        match = resolve_country(last)
        if match:
            result = attempt(match.code, parts[:-1])
            if (result and result["city"]) or match.matched_by != "alpha2":
                return result or {**empty, "country": match.code}
        for code in ("US", "CA", "AU", "BR", "MX", "IN", "DE", "AT", "CH", "IT", "ES", "GB", "FR", "NL", "BE"):
            if not resolve_subdivision(last, code):
                continue
            result = attempt(code, parts)
            if result and result["city"]:
                return result
        if match:
            return {**empty, "country": match.code}
    only = resolve_country(parts[0])
    return {**empty, "country": only.code} if only and len(parts) == 1 else empty


# ─── Timezones ────────────────────────────────────────────────────────────

def resolve_city_timezone(location: dict | None = None, options: dict | None = None, *, city=None, subdivision=None,
                          country=None, tier="all") -> dict | None:
    """IANA timezone for a location: city in country (+subdivision), localities, biggest city of the subdivision, then the country."""
    if location:
        city, subdivision, country = location.get("city", city), location.get("subdivision", subdivision), location.get("country", country)
    tier = _opt(options, "tier", tier)
    code = _to_country(country)
    city_name = clean_input(city) if city else ""
    subdivision_input = subdivision
    if city_name and (re.search(r"[,;(/|]", city_name) or not code):
        parsed = parse_location(city_name, country=code, tier=tier)
        code = code or parsed["country"]
        if parsed["city"]:
            place = parsed["city"]
            return {"timezone": place.timezone, "matched_by": "city" if place.kind == "city" else "locality", "place": place}
        subdivision_input = subdivision_input or parsed["subdivision"]
        split = _split_location(city_name)
        city_name = split[0] if split else ""
    if not code or not get_country(code):
        return None
    if city_name:
        place = find_city(city_name, country=code, subdivision=subdivision_input, tier=tier) or (
            find_city(city_name, country=code, tier=tier) if subdivision_input else None)
        if place:
            return {"timezone": place.timezone, "matched_by": "city" if place.kind == "city" else "locality", "place": place}
    if subdivision_input:
        resolved = resolve_subdivision(subdivision_input, code) if isinstance(subdivision_input, str) else subdivision_input
        if resolved:
            cities = list_cities(country=code, subdivision=resolved, tier=500)
            if cities:
                return {"timezone": cities[0].timezone, "matched_by": "subdivision", "place": cities[0]}
    zone = get_primary_timezone(code)
    return {"timezone": zone, "matched_by": "country", "place": None} if zone else None


# ─── Coordinates ──────────────────────────────────────────────────────────

def distance_km(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    to_rad = math.pi / 180
    h = math.sin((b_lat - a_lat) * to_rad / 2) ** 2 + math.cos(a_lat * to_rad) * math.cos(b_lat * to_rad) * math.sin((b_lng - a_lng) * to_rad / 2) ** 2
    return 2 * 6371.0088 * math.asin(min(1.0, math.sqrt(h)))


def find_nearest_cities(lat: float, lng: float, options: dict | None = None, *, country=None, tier=None, limit=5,
                        max_distance_km=None) -> list[City]:
    country = _opt(options, "country", country)
    tier = _opt(options, "tier", tier) or (500 if country else 15000)
    limit = _opt(options, "limit", limit)
    max_distance_km = _opt(options, "maxDistanceKm", max_distance_km)
    codes = [c for c in [_to_country(country)] if c] if country else _all_country_codes()
    results = []
    for code in codes:
        for city in _load_country(code, tier).cities:
            if not _in_tier(city, tier) or abs(city.lat - lat) > 10:
                continue
            distance = distance_km(lat, lng, city.lat, city.lng)
            if max_distance_km is None or distance <= max_distance_km:
                results.append(replace(city, distance_km=round(distance, 2)))
    return sorted(results, key=lambda c: c.distance_km)[:limit]
