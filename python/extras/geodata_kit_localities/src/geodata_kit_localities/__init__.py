"""Villages, hamlets and city districts that are not in the cities data (one gzip file per country).

geodata-kit uses this package automatically when it is installed (tier "all").
Row layout: [geonameid, name, asciiName|0, featureCode, population, lat, lng, a1, a2, a3, a4, tzIndex, parentId|0].
"""
from __future__ import annotations

import gzip
import json
import re
from importlib.resources import files

_DATA = files("geodata_kit_localities").joinpath("data")


def load_localities(country: str) -> dict | None:
    code = country.strip().upper()
    if not re.fullmatch(r"[A-Z]{2}", code):
        return None
    path = _DATA.joinpath(f"{code}.json.gz")
    if not path.is_file():
        return None
    return json.loads(gzip.decompress(path.read_bytes()).decode("utf-8"))


def list_locality_countries() -> list[str]:
    return sorted(entry.name[:2] for entry in _DATA.iterdir() if entry.name.endswith(".json.gz")) if _DATA.is_dir() else []
