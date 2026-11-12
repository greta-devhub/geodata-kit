"""Runs the language-neutral golden files in ../tests/golden/ against the Python package.

Function names are camelCase in the files (resolveCountry) and snake_case here (resolve_country);
paths into results are converted the same way (matchedBy → matched_by).
"""
from __future__ import annotations

import dataclasses
import json
import re
from pathlib import Path

import pytest

import geodata_kit
import geodata_kit_postal

GOLDEN = Path(__file__).resolve().parents[2] / "tests" / "golden"
# Not ported to Python: polygon timezones (geodata-kit-tz; use timezonefinder) and has_localities checks run elsewhere.
SKIP_FILES = {"tz.json"}


def snake(name: str) -> str:
    return re.sub(r"([A-Z])", lambda m: "_" + m.group(1).lower(), name)


def to_plain(value):
    if dataclasses.is_dataclass(value):
        return {field.name: to_plain(getattr(value, field.name)) for field in dataclasses.fields(value)}
    if isinstance(value, (list, tuple)):
        return [to_plain(item) for item in value]
    if isinstance(value, dict):
        return {key: to_plain(item) for key, item in value.items()}
    return value


def apply_path(value, path):
    if not path:
        return value
    parts = path.split(".")
    for index, part in enumerate(parts):
        if value is None:
            return None
        if part == "[]":
            rest = ".".join(parts[index + 1:])
            return [apply_path(item, rest or None) for item in value]
        if part == "length":
            value = len(value)
            continue
        value = value.get(part, value.get(snake(part))) if isinstance(value, dict) else None
    return value


def check(actual, case):
    expected = case["expect"]
    op = case.get("op", "eq")
    if op == "eq":
        assert actual == expected, f"expected {expected!r}, got {actual!r}"
    elif op == "includesAll":
        missing = [item for item in expected if item not in (actual or [])]
        assert not missing, f"missing {missing} in {actual}"
    elif op == "sameMembers":
        assert sorted(actual or []) == sorted(expected), f"expected members {sorted(expected)}, got {sorted(actual or [])}"
    elif op == "gte":
        assert actual >= expected, f"expected ≥ {expected}, got {actual}"
    elif op == "lte":
        assert actual <= expected, f"expected ≤ {expected}, got {actual}"
    elif op == "startsWith":
        assert isinstance(actual, str) and actual.startswith(expected), f"expected to start with {expected!r}, got {actual!r}"


def cases():
    for file in sorted(GOLDEN.glob("*.json")):
        if file.name in SKIP_FILES:
            continue
        for index, case in enumerate(json.loads(file.read_text(encoding="utf-8"))["cases"]):
            yield pytest.param(case, id=f"{file.stem}#{index}-{case['fn']}")


@pytest.mark.parametrize("case", list(cases()))
def test_golden(case):
    name = snake(case["fn"])
    fn = getattr(geodata_kit, name, None) or getattr(geodata_kit_postal, name, None)
    assert fn is not None, f"{name} is not exported"
    result = to_plain(fn(*case["args"]))
    check(apply_path(result, case.get("path")), case)
