"""Languages per country (national, regional, spoken), language names and resolution."""
from __future__ import annotations

import re

from ._data import load
from .countries import normalize_country_code, pick_locale
from .fold import clean_input, fold

_NATIONAL = {"official", "de_facto_official"}


def _data() -> dict:
    return load("core", "languages.json")


def _list_for(code: str) -> list[dict]:
    normalized = normalize_country_code(code)
    return _data()["countries"].get(normalized, []) if normalized else []


def _status_matches(language: dict, status) -> bool:
    if not status:
        return True
    wanted = status if isinstance(status, list) else [status]
    return any(language["status"] in _NATIONAL if entry == "national" else language["status"] == entry for entry in wanted)


def get_national_languages(code: str) -> list[dict]:
    """Official or de facto official languages, most spoken first."""
    return [dict(lang) for lang in _list_for(code) if lang["status"] in _NATIONAL]


def get_country_languages(code: str, options: dict | None = None, *, min_share: float | None = None, status=None) -> list[dict]:
    if options:
        min_share, status = options.get("minShare", min_share), options.get("status", status)
    return [dict(lang) for lang in _list_for(code)
            if _status_matches(lang, status) and (min_share is None or (lang["share"] or 0) >= min_share)]


def get_primary_language(code: str) -> str | None:
    national = [lang for lang in _list_for(code) if lang["status"] in _NATIONAL]
    official = [lang for lang in national if lang["status"] == "official"]
    chosen = (official or national or [None])[0]
    return chosen["code"] if chosen else None


def get_regional_languages(code: str) -> list[dict]:
    return [dict(lang) for lang in _list_for(code) if lang["status"] == "official_regional"]


def get_languages_of_subdivision(subdivision: str) -> list[dict]:
    iso = subdivision.strip().upper()
    country = iso[:2]
    codes = _data()["subdivisions"].get(iso)
    if not codes:
        return get_national_languages(country)
    country_list = _list_for(country)
    result = []
    for code in codes:
        entry = next((lang for lang in country_list if lang["code"] == code), None)
        result.append(dict(entry) if entry else {"code": code, "status": "official_regional", "share": None, "speakers": None})
    return sorted(result, key=lambda lang: -(lang["share"] if lang["share"] is not None else -1))


def get_default_locale(code: str) -> str | None:
    normalized = normalize_country_code(code)
    return _data()["defaultLocales"].get(normalized) if normalized else None


def get_countries_by_language(language: str, options: dict | None = None, *, status=None, min_share: float | None = None) -> list[dict]:
    if options:
        status, min_share = options.get("status", status), options.get("minShare", min_share)
    code = resolve_language(language) or language
    result = []
    for country, entries in _data()["countries"].items():
        entry = next((lang for lang in entries if lang["code"] == code), None)
        if not entry or not _status_matches(entry, status):
            continue
        if min_share is not None and (entry["share"] or 0) < min_share:
            continue
        result.append({"country": country, "status": entry["status"], "share": entry["share"]})
    return sorted(result, key=lambda item: (-(item["share"] if item["share"] is not None else -1), item["country"]))


def is_official_language(language: str, country: str, options: dict | None = None, *, subdivision: str | None = None) -> bool:
    if options:
        subdivision = options.get("subdivision", subdivision)
    code = resolve_language(language)
    if not code:
        return False
    if any(lang["code"] == code for lang in get_national_languages(country)):
        return True
    if subdivision:
        return any(lang["code"] == code for lang in get_languages_of_subdivision(subdivision))
    return False


def _language_base(tag: str) -> str:
    parts = tag.replace("_", "-").split("-")
    kept = [parts[0].lower()]
    kept += [part[0].upper() + part[1:].lower() for part in parts[1:] if re.fullmatch(r"[A-Za-z]{4}", part)]
    return "-".join(kept)


def resolve_language(text: str | None) -> str | None:
    """"German", "deutsch", "deu", "ger", "de-CH" → "de"; "Swiss German" → "gsw"."""
    if not isinstance(text, str):
        return None
    cleaned = clean_input(text)
    if not cleaned:
        return None
    data = _data()
    if re.fullmatch(r"[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})*", cleaned):
        base = _language_base(cleaned)
        if base in data["languages"]:
            return base
        primary = base.split("-")[0]
        if primary in data["languages"]:
            return primary
        if primary in data["codeAliases"]:
            return data["codeAliases"][primary]
    return data["aliases"].get(fold(cleaned))


def get_language_name(code: str, locale: str = "en") -> str | None:
    resolved = resolve_language(code)
    info = _data()["languages"].get(resolved) if resolved else None
    if not info:
        return None
    if locale == "endonym":
        return info["endonym"] or info["names"].get("en")
    return info["names"].get(pick_locale(locale)) or info["names"].get("en")


def get_language_scripts(code: str) -> list[str]:
    resolved = resolve_language(code)
    return list(_data()["languages"].get(resolved, {}).get("scripts", [])) if resolved else []
