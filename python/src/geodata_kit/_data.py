"""Access to the generated JSON shipped inside the package (same files as the npm package)."""
from __future__ import annotations

import json
from functools import cache
from importlib.resources import files
from typing import Any

_ROOT = files("geodata_kit").joinpath("data")


@cache
def load(*parts: str) -> Any:
    """Parsed JSON at data/<parts>, cached for the life of the process."""
    return json.loads(_ROOT.joinpath(*parts).read_text(encoding="utf-8"))


def exists(*parts: str) -> bool:
    return _ROOT.joinpath(*parts).is_file()


def list_dir(*parts: str) -> list[str]:
    folder = _ROOT.joinpath(*parts)
    return sorted(entry.name for entry in folder.iterdir()) if folder.is_dir() else []
