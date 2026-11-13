"""Countries: lookup, validation, names, resolution, search and facts."""
from __future__ import annotations

import datetime as _dt
import functools
import locale as _locale_module  # noqa: F401  (kept for users who sort with locale)
import re
from dataclasses import dataclass
from typing import Iterable, Literal

from ._data import load
from .fold import clean_input, edit_distance, fold

MatchKind = Literal["alpha2", "alpha3", "numeric", "name", "alias", "subdivision", "retired"]


@dataclass(frozen=True)
class Country:
    code: str
    alpha3: str
    numeric: str
    name: str
    geoname_id: int
    capital: str | None
    area: float | None
    population: int | None
    continent: str
    tld: str | None
    calling_code: str | None
    currencies: tuple[str, ...]
    neighbours: tuple[str, ...]
    timezones: tuple[str, ...]
    demonym: str | None
    driving_side: str | None
    week_start: str
    weekend: tuple[str, str]
    measurement_system: str
    paper_size: str
    flag: str


@dataclass(frozen=True)
class CountryMatch:
    code: str
    matched_by: MatchKind
    input: str


@dataclass(frozen=True)
class Currency:
    code: str
    from_: str | None
    to: str | None
    tender: bool


def to_iso_date(value: str | _dt.date | None) -> str:
    if value is None:
        return _dt.date.today().isoformat()
    if isinstance(value, (_dt.date, _dt.datetime)):
        return value.isoformat()[:10]
    return str(value)[:10]


def is_active(entry: dict, day: str) -> bool:
    start, end = entry.get("from"), entry.get("to")
    return (not start or start <= day) and (not end or end >= day)


def get_flag_emoji(code: str) -> str:
    """Emoji flag from the regional-indicator letters of the code: "DE" → 🇩🇪."""
    upper = code.strip().upper()
    if not re.fullmatch(r"[A-Z]{2}", upper):
        return ""
    return "".join(chr(0x1F1E6 + ord(letter) - 65) for letter in upper)


@functools.cache
def _records() -> dict[str, dict]:
    return {record["code"]: record for record in load("core", "countries.json")}


@functools.cache
def _countries() -> dict[str, Country]:
    today = to_iso_date(None)
    result = {}
    for code, r in _records().items():
        result[code] = Country(
            code=code, alpha3=r["alpha3"], numeric=r["numeric"], name=r["name"], geoname_id=r["geonameId"],
            capital=r["capital"], area=r["area"], population=r["population"], continent=r["continent"], tld=r["tld"],
            calling_code=r["callingCode"],
            currencies=tuple(c["code"] for c in r["currencies"] if c["tender"] and is_active(c, today)),
            neighbours=tuple(r["neighbours"]), timezones=tuple(r["timezones"]), demonym=r["demonym"],
            driving_side=r["drivingSide"], week_start=r["weekStart"], weekend=tuple(r["weekend"]),
            measurement_system=r["measurementSystem"], paper_size=r["paperSize"], flag=get_flag_emoji(code),
        )
    return result


@functools.cache
def _by_alpha3() -> dict[str, str]:
    return {r["alpha3"]: code for code, r in _records().items()}


@functools.cache
def _by_numeric() -> dict[str, str]:
    return {r["numeric"]: code for code, r in _records().items()}


def _names() -> dict[str, dict[str, str]]:
    return load("core", "names.json")


def _aliases() -> dict:
    return load("core", "aliases.json")


def _retired() -> dict[str, list[str]]:
    return load("core", "retired.json")


# Codes ISO 3166 reserves for a territory without ever having assigned them ("exceptionally reserved"):
# "UK" for the United Kingdom, "EA" for Ceuta and Melilla, … A match through one of these is an alias, not a
# retired code.
_NEVER_ASSIGNED = frozenset({"AC", "CP", "CQ", "DG", "EA", "EU", "EZ", "IC", "TA", "UK", "UN"})


def display_locales() -> list[str]:
    return list(_names().keys())


def pick_locale(locale: str | None) -> str:
    if not locale:
        return "en"
    lower = locale.lower().replace("_", "-")
    available = display_locales()
    if lower in available:
        return lower
    base = lower.split("-")[0]
    return base if base in available else "en"


# ─── Codes ────────────────────────────────────────────────────────────────

def normalize_country_code(value: str | None) -> str | None:
    """Upper-cased, trimmed alpha-2 code if it is an assigned code of a country, else None.

    Reserved codes such as "UK" are not country codes and give None; resolve_country reads them ("UK" → GB).
    """
    if not isinstance(value, str):
        return None
    code = value.strip().upper()
    return code if code in _countries() else None


def is_country_code(value: object) -> bool:
    """True for a known alpha-2 code in upper case ("DE")."""
    return isinstance(value, str) and value in _countries()


def normalize_country_codes(values: Iterable[str | None]) -> dict[str, list[str]]:
    codes: list[str] = []
    invalid: list[str] = []
    for value in values:
        code = normalize_country_code(value)
        if code is None:
            if value is not None:
                invalid.append(str(value))
        elif code not in codes:
            codes.append(code)
    return {"codes": codes, "invalid": invalid}


def get_country(code: str) -> Country | None:
    normalized = normalize_country_code(code)
    return _countries()[normalized] if normalized else None


def list_countries(*, group: str | None = None, continent: str | None = None, language: str | None = None,
                   currency: str | None = None) -> list[Country]:
    """All countries sorted by code; filters combine with AND."""
    result = list(_countries().values())
    if continent:
        result = [c for c in result if c.continent == continent.upper()]
    if currency:
        result = [c for c in result if currency.upper() in c.currencies]
    if group:
        from .groups import get_countries_in_group
        members = set(get_countries_in_group(group))
        result = [c for c in result if c.code in members]
    if language:
        from .languages import get_countries_by_language
        allowed = {entry["country"] for entry in get_countries_by_language(language, status="national")}
        result = [c for c in result if c.code in allowed]
    return result


def get_successor_codes(retired_code: str) -> list[str]:
    """"CS" → ["RS", "ME"], "UK" → ["GB"]."""
    return list(_retired().get(retired_code.strip().upper(), []))


# ─── Names ────────────────────────────────────────────────────────────────

def get_country_name(code: str, locale: str = "en") -> str | None:
    normalized = normalize_country_code(code)
    if not normalized:
        return None
    return _names()[pick_locale(locale)].get(normalized) or _names()["en"].get(normalized)


def get_country_aliases(code: str) -> list[str]:
    normalized = normalize_country_code(code)
    return list(_aliases()["display"].get(normalized, [])) if normalized else []


def format_country(code: str, options: dict | None = None, *, locale: str | None = None, with_code: bool = False,
                   upper_case: bool = False) -> str | None:
    if options:
        locale = options.get("locale", locale)
        with_code = options.get("withCode", options.get("with_code", with_code))
        upper_case = options.get("upperCase", options.get("upper_case", upper_case))
    normalized = normalize_country_code(code)
    if not normalized:
        return None
    name = get_country_name(normalized, locale or "en")
    if upper_case:
        name = name.upper()
    return f"{name} ({normalized})" if with_code else name


# ─── Resolution ───────────────────────────────────────────────────────────

def _lookup_folded(key: str) -> tuple[str, MatchKind] | None:
    aliases = _aliases()
    if key in aliases["names"]:
        return aliases["names"][key], "name"
    if key in aliases["aliases"]:
        return aliases["aliases"][key], "alias"
    if key in aliases["subdivisions"]:
        return aliases["subdivisions"][key], "subdivision"
    return None


def _resolve_cleaned(text: str) -> tuple[str, MatchKind] | None:
    if re.fullmatch(r"[A-Za-z]{2}", text):
        upper = text.upper()
        if upper in _countries():
            return upper, "alpha2"
        successors = _retired().get(upper)
        if successors and len(successors) == 1:
            return successors[0], "alias" if upper in _NEVER_ASSIGNED else "retired"
    if re.fullmatch(r"[A-Za-z]{3}", text):
        code = _by_alpha3().get(text.upper())
        if code:
            return code, "alpha3"
    if re.fullmatch(r"\d{1,3}", text):
        code = _by_numeric().get(text.zfill(3))
        return (code, "numeric") if code else None
    return _lookup_folded(fold(text))


def resolve_country(text: str | None) -> CountryMatch | None:
    """Free text to a country: "de", "DEU", "276", "Deutschland", "UK", "England". No fuzzy matching."""
    if not isinstance(text, str):
        return None
    cleaned = clean_input(text)
    if not cleaned:
        return None
    direct = _resolve_cleaned(cleaned)
    if direct:
        return CountryMatch(direct[0], direct[1], text)
    variants: list[str] = []
    without_parenthetical = re.sub(r"\s*\([^)]*\)\s*$", "", cleaned).strip()
    for variant in (without_parenthetical,):
        variants += [variant, re.sub(r"[\s.,;:!?]+$", "", variant), re.sub(r"^the\s+", "", variant, flags=re.I)]
    for variant in dict.fromkeys(variants):
        if not variant or variant == cleaned:
            continue
        match = _resolve_cleaned(variant)
        if match:
            return CountryMatch(match[0], match[1], text)
    inside = re.search(r"\(([^)]+)\)\s*$", cleaned)
    if inside:
        match = _resolve_cleaned(inside.group(1).strip())
        if match:
            return CountryMatch(match[0], match[1], text)
    return None


def resolve_countries(texts: Iterable[str | None]) -> dict:
    """Resolves each distinct input once: {"resolved": {input: CountryMatch}, "unresolved": [inputs]}."""
    resolved: dict[str, CountryMatch] = {}
    unresolved: list[str] = []
    seen: set[str] = set()
    for text in texts:
        if not isinstance(text, str) or text in seen:
            continue
        seen.add(text)
        match = resolve_country(text)
        if match:
            resolved[text] = match
        elif clean_input(text):
            unresolved.append(text)
    return {"resolved": resolved, "unresolved": unresolved}


def suggest_countries(text: str, limit: int = 5) -> list[Country]:
    """"Did you mean" candidates (typos, ambiguous names). Never applied automatically.

    Best first: names that start with the input, then names that contain it as a word, then names within a few
    typos. A country's own name counts before an alias; ties go to the bigger population.
    """
    key = fold(clean_input(text))
    if not key:
        return []
    aliases = _aliases()
    # Every resolvable name with its country; `own` marks a country's names in the bundled languages (not its aliases).
    keys = [*((alias, code, True) for alias, code in aliases["names"].items()),
            *((alias, code, False) for alias, code in aliases["aliases"].items()),
            *((alias, code, False) for alias, code in aliases["subdivisions"].items())]
    # Allowed typos: 1 for short input, 2 up to 8 letters (a swapped pair is 2 edits), 3 above.
    max_distance = 1 if len(key) <= 4 else 2 if len(key) <= 8 else 3
    best: dict[str, float] = {}
    for alias, code, own in keys:
        if alias.startswith(key):
            score: float = 0.2 if own else 0.4
        elif key in alias.split(" "):
            score = 0.6 if own else 0.8
        else:
            score = edit_distance(key, alias, max_distance)
        if score <= max_distance and score < best.get(code, float("inf")):
            best[code] = score
    countries = _countries()
    ranked = sorted(best.items(), key=lambda item: (item[1], -(countries[item[0]].population or 0)))
    return [countries[code] for code, _ in ranked[:limit]]


# ─── Search ───────────────────────────────────────────────────────────────

def _collation_key(text: str) -> str:
    return fold(text)


def search_countries(query: str, *, groups: list[str] | None = None, locale: str = "en", limit: int | None = None) -> list[Country]:
    """Ranked search for pickers: exact code, then prefix, word prefix, substring; accents ignored."""
    candidates = list(_countries().values())
    if groups:
        from .groups import get_countries_in_group
        members = {code for slug in groups for code in get_countries_in_group(slug)}
        candidates = [c for c in candidates if c.code in members]
    needle = fold(clean_input(query))
    if not needle:
        return sort_countries(candidates, locale)[:limit]
    scored = []
    for country in candidates:
        name = get_country_name(country.code, locale)
        folded_name = fold(name)
        code = country.code.lower()
        others = [fold(country.name), country.alpha3.lower(), *(fold(alias) for alias in get_country_aliases(country.code))]
        score = None
        if code == needle or country.alpha3.lower() == needle:
            score = 0
        elif folded_name.startswith(needle) or code.startswith(needle) or any(o.startswith(needle) for o in others):
            score = 1
        elif any(word.startswith(needle) for word in folded_name.split(" ")):
            score = 2
        elif needle in folded_name or any(needle in o for o in others):
            score = 3
        if score is not None:
            scored.append((score, _collation_key(name), country))
    scored.sort(key=lambda item: (item[0], item[1]))
    return [country for _, _, country in scored][:limit]


def sort_countries(countries: Iterable, locale: str = "en") -> list:
    return sorted(countries, key=lambda c: _collation_key(get_country_name(c.code, locale) or c.code))


# ─── Facts ────────────────────────────────────────────────────────────────

def get_currencies(code: str, options: dict | None = None, *, at: str | _dt.date | None = None,
                   include_non_tender: bool = False) -> list[dict]:
    if options:
        at = options.get("at", at)
        include_non_tender = options.get("includeNonTender", include_non_tender)
    normalized = normalize_country_code(code)
    if not normalized:
        return []
    day = to_iso_date(at)
    return [dict(c) for c in _records()[normalized]["currencies"]
            if (include_non_tender or c["tender"]) and is_active(c, day)]


def get_currency(code: str) -> str | None:
    currencies = get_currencies(code)
    return currencies[0]["code"] if currencies else None


def _fact(field: str):
    def getter(code: str):
        country = get_country(code)
        return getattr(country, field) if country else None
    getter.__name__ = f"get_{field}"
    return getter


get_calling_code = _fact("calling_code")
get_tld = _fact("tld")
get_capital = _fact("capital")
get_area = _fact("area")
get_population = _fact("population")
get_demonym = _fact("demonym")
get_week_start = _fact("week_start")
get_measurement_system = _fact("measurement_system")
get_paper_size = _fact("paper_size")
get_driving_side = _fact("driving_side")


def get_neighbours(code: str) -> list[str]:
    country = get_country(code)
    return list(country.neighbours) if country else []


def get_countries_by_calling_code(calling_code: str) -> list[str]:
    digits = re.sub(r"\D", "", calling_code)
    return [c.code for c in _countries().values() if c.calling_code == digits]
