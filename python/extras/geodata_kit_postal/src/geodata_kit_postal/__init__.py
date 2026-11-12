"""Postal code → places and place → postal codes for 124 countries (GeoNames postal-code dump, CC BY 4.0).

GB, CA and NL carry the first part of the code only; full codes match by that part.
"""
from __future__ import annotations

import functools
import gzip
import json
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
    return places, by_code, lengths


def find_places_by_postal_code(code: str, country: str) -> list[dict]:
    data = _load(country)
    if not data:
        return []
    _, by_code, lengths = data
    key = _compact(re.sub(r"^[A-Z]{1,3}-(?=\d)", "", code.strip(), flags=re.I).lstrip("〒"))
    if key in by_code:
        return [dict(p) for p in by_code[key]]
    for length in lengths:
        if length < len(key) and key[:length] in by_code:
            return [dict(p) for p in by_code[key[:length]]]
    return []


def is_known_postal_code(code: str, country: str) -> bool:
    return bool(find_places_by_postal_code(code, country))


def find_postal_codes(options: dict | None = None, *, city: str | None = None, country: str | None = None,
                      subdivision: str | None = None) -> list[str]:
    if options:
        city, country, subdivision = options.get("city", city), options.get("country", country), options.get("subdivision", subdivision)
    data = _load(country or "")
    if not data or not city:
        return []
    key = fold_name(city)
    wanted = fold_name(subdivision) if subdivision else None
    codes = {p["postal_code"] for p in data[0] if fold_name(p["name"]) == key
             and (not wanted or wanted in (fold_name(p["subdivision_name"]), fold_name(p["subdivision_code"])))}
    return sorted(codes)


def list_postal_countries() -> list[str]:
    return sorted(entry.name[:2] for entry in _DATA.iterdir() if entry.name.endswith(".json.gz")) if _DATA.is_dir() else []
