"""Postal code → places and place → postal codes for 124 countries (licences: see NOTICE).

GB, CA and NL carry the first part of the code only; full codes match by that part.

Lookups forgive two common data problems: a numeric code that lost its leading zeros in a spreadsheet
("2134" for 02134), and, when geodata_kit is installed, a city name in another language ("Munich" for München).
"""
from __future__ import annotations

import functools
import gzip
import json
import math
import re
import unicodedata
from importlib.resources import files

_DATA = files("geodata_kit_postal").joinpath("data")
_SPECIAL = {"ß": "ss", "ł": "l", "đ": "d", "ð": "d", "ø": "o", "æ": "ae", "œ": "oe", "þ": "th", "ı": "i"}


def fold_name(text: str) -> str:
    """Same folding as geodata_kit.fold (kept identical)."""
    text = unicodedata.normalize("NFKD", re.sub("['’ʻʼ`´]", "", text))
    text = "".join(_SPECIAL.get(ch, ch) for ch in "".join(c for c in text if not unicodedata.category(c).startswith("M")).lower())
    spaced = "".join(ch if unicodedata.category(ch)[0] in "LN" else " " for ch in text)
    return " ".join({"saint": "st", "sainte": "ste"}.get(word, word) for word in spaced.split())


def _compact(code: str) -> str:
    return re.sub(r"[\s-]", "", code.upper())


@functools.cache
def _load(country: str):
    code = country.strip().upper()
    path = _DATA.joinpath(f"{code}.json.gz")
    if not re.fullmatch(r"[A-Z]{2}", code) or not path.is_file():
        return None
    rows = json.loads(gzip.decompress(path.read_bytes()).decode("utf-8"))["rows"]
    places = [{"postal_code": r[0], "name": r[1], "subdivision_name": r[2], "subdivision_code": r[3],
               "subdivision2_name": r[4], "subdivision3_name": r[5], "lat": r[6], "lng": r[7]} for r in rows]
    by_code: dict[str, list[dict]] = {}
    for place in places:
        by_code.setdefault(_compact(place["postal_code"]), []).append(place)
    lengths = sorted({len(key) for key in by_code}, reverse=True)
    # Length of the all-digit codes when they all have one length (US 5, DE 5, FR 5), else None.
    digit_lengths = {len(key) for key in by_code if re.fullmatch(r"[0-9]+", key)}
    fixed_digits = next(iter(digit_lengths)) if len(digit_lengths) == 1 else None
    return places, by_code, lengths, fixed_digits


def _lookup(data, code: str) -> list[dict]:
    _, by_code, lengths, fixed_digits = data
    key = _compact(re.sub(r"^[A-Z]{1,3}-(?=\d)", "", code.strip(), flags=re.I).lstrip("〒"))
    if key in by_code:
        return by_code[key]
    for length in lengths:
        if length < len(key) and key[:length] in by_code:
            return by_code[key[:length]]
    # Spreadsheets drop leading zeros: "2134" is Boston's 02134, "1067" is Dresden's 01067.
    if fixed_digits and re.fullmatch(r"[0-9]+", key) and fixed_digits - 2 <= len(key) < fixed_digits:
        return by_code.get(key.rjust(fixed_digits, "0"), [])
    return []


def find_places_by_postal_code(code: str, country: str) -> list[dict]:
    """Places with this postal code: ("80331", "DE") → München. Prefixes and spacing are ignored, and up to two lost
    leading zeros are restored in countries whose codes are all digits of one length: ("2134", "US") → the places of 02134."""
    data = _load(country)
    return [dict(place) for place in _lookup(data, code)] if data else []


def is_known_postal_code(code: str, country: str) -> bool:
    return bool(find_places_by_postal_code(code, country))


def _find_city(name: str, country: str):
    """The city from geodata_kit, when that package is installed and knows the name."""
    try:
        from geodata_kit import find_city
    except ImportError:
        return None
    try:
        return find_city(name, country=country)
    except Exception:
        return None


def _km_between(lat_a: float, lng_a: float, lat_b: float, lng_b: float) -> float:
    return math.hypot(lat_a - lat_b, (lng_a - lng_b) * math.cos(lat_a * math.pi / 180)) * 111.2


def find_postal_codes(options: dict | None = None, *, city: str | None = None, country: str | None = None,
                      subdivision: str | None = None) -> list[str]:
    """Postal codes of a place: city "Unterhaching", country "DE" → ["82008"].

    The postal data has each place under its local name. With geodata_kit installed, a name in another language
    works too ("Munich" finds the codes of München). Only places within 30 km of that city are taken, so a
    different town that shares one of its names is not mixed in.
    """
    if options:
        city, country, subdivision = options.get("city", city), options.get("country", country), options.get("subdivision", subdivision)
    data = _load(country or "")
    if not data or not isinstance(city, str):
        return []
    wanted = fold_name(subdivision) if subdivision else None

    def collect(keys: set[str], near=None) -> list[str]:
        codes = set()
        for place in data[0]:
            if fold_name(place["name"]) not in keys:
                continue
            if wanted and wanted not in (fold_name(place["subdivision_name"]), fold_name(place["subdivision_code"])):
                continue
            if near and _km_between(near.lat, near.lng, place["lat"], place["lng"]) > 30:
                continue
            codes.add(place["postal_code"])
        return sorted(codes)

    direct = collect({fold_name(city)})
    if direct:
        return direct
    found = _find_city(city, country)
    if not found:
        return []
    return collect({fold_name(name) for name in (found.name, found.ascii_name, *found.alternate_names)}, found)


def list_postal_countries() -> list[str]:
    return sorted(entry.name[:2] for entry in _DATA.iterdir() if entry.name.endswith(".json.gz")) if _DATA.is_dir() else []
