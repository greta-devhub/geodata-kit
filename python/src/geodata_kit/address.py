"""Address formats, regions, postal-code rules, formatting and parsing."""
from __future__ import annotations

import functools
import re

from ._data import load
from .countries import format_country, normalize_country_code, resolve_country
from .fold import clean_input, edit_distance, fold

_FIELD_BY_LETTER = {"N": "name", "O": "organization", "A": "addressLines", "D": "dependentLocality", "C": "city",
                    "S": "region", "Z": "postalCode", "X": "sortingCode"}


def _formats() -> dict:
    return load("address", "formats.json")


def _record(country: str) -> dict | None:
    code = normalize_country_code(country)
    return _formats().get(code) if code else None


def _fields(letters: str) -> list[str]:
    return [_FIELD_BY_LETTER[letter] for letter in letters if letter in _FIELD_BY_LETTER]


def get_address_format(country: str) -> dict | None:
    record = _record(country)
    if not record:
        return None
    lines = []
    for line in record["format"].split("%n"):
        fields = [_FIELD_BY_LETTER[m] for m in re.findall(r"%([A-Z])", line) if m in _FIELD_BY_LETTER]
        if fields:
            lines.append(fields)
    return {
        "lines": lines,
        "pattern": record["format"],
        "latin_pattern": record["latinFormat"],
        "required": _fields(record["required"]),
        "upper_case": _fields(record["upperCase"]),
        "region_label": record["regionLabel"],
        "locality_label": record["localityLabel"],
        "postal_label": record["postal"]["label"] if record["postal"] else None,
    }


def get_required_address_fields(country: str) -> list[str]:
    format_ = get_address_format(country)
    return format_["required"] if format_ else []


def list_regions(country: str) -> list[dict]:
    record = _record(country)
    return [dict(region) for region in record["regions"]] if record else []


def resolve_region(value: str, country: str) -> dict | None:
    key = fold(clean_input(value))
    if not key:
        return None
    upper = clean_input(value).upper()
    for region in list_regions(country):
        if region["key"].upper() == upper or region.get("iso") == upper or fold(region["name"]) == key or (
                region.get("latinName") and fold(region["latinName"]) == key):
            return region
    return None


def is_valid_region(value: str, country: str) -> bool:
    return resolve_region(value, country) is not None


# ─── Postal codes ─────────────────────────────────────────────────────────

def _js_pattern(source: str) -> str:
    """The postal patterns are JavaScript regexes; the subset they use is valid Python too."""
    return source


@functools.cache
def _patterns(country: str) -> tuple[re.Pattern, ...]:
    record = _formats()[country]
    postal = record["postal"]
    result = []
    if postal and postal["pattern"]:
        result.append(re.compile(rf"^(?:{_js_pattern(postal['pattern'])})$", re.I))
    if postal and postal["secondaryPattern"]:
        source = postal["secondaryPattern"]
        inner = source[1:] if source.startswith("^") else source
        inner = inner[:-1] if inner.endswith("$") else inner
        try:
            result.append(re.compile(rf"^(?:{inner})$", re.I))
        except re.error:
            pass
    return tuple(result)


def get_postal_code_rules(country: str) -> dict | None:
    code = normalize_country_code(country)
    record = _formats().get(code) if code else None
    if not record or not record["postal"]:
        return None
    postal = record["postal"]
    return {"pattern": _patterns(code)[0].pattern, "layouts": list(postal["layouts"]), "examples": list(postal["examples"]),
            "prefixes": list(postal["prefixes"]), "label": postal["label"]}


def _render_layout(layout: str, compact: str) -> str | None:
    slots = re.sub(r"[^#@A-Z0-9]", "", layout)
    if len(slots) != len(compact):
        return None
    output, index = [], 0
    for symbol in layout:
        if symbol in "#@" or re.fullmatch(r"[A-Z0-9]", symbol):
            character = compact[index]
            index += 1
            if symbol == "#" and not character.isdigit():
                return None
            if symbol == "@" and not re.fullmatch(r"[A-Z]", character):
                return None
            if re.fullmatch(r"[A-Z0-9]", symbol) and symbol != character:
                return None
            output.append(character)
        else:
            output.append(symbol)
    return "".join(output)


def normalize_postal_code(value: str, country: str) -> str | None:
    """("D-80331", "DE") → "80331"; ("sw1a1aa", "GB") → "SW1A 1AA"; invalid → None."""
    code = normalize_country_code(country)
    record = _formats().get(code) if code else None
    if not record or not record["postal"] or not isinstance(value, str):
        return None
    postal = record["postal"]
    text = re.sub(r"^〒\s*", "", clean_input(value).upper())
    for prefix in sorted(postal["prefixes"], key=len, reverse=True):
        if text.startswith(prefix) and len(text) > len(prefix):
            text = text[len(prefix):].strip()
            break
    valid = lambda candidate: any(p.match(candidate) for p in _patterns(code))  # noqa: E731
    compact = re.sub(r"[\s-]", "", text)
    for layout in postal["layouts"]:
        rendered = _render_layout(layout, compact)
        if rendered and valid(rendered):
            return rendered
    for example in postal["examples"]:
        if len(re.sub(r"[\s-]", "", example)) != len(compact):
            continue
        rendered, index = [], 0
        for character in example:
            if re.fullmatch(r"[\s-]", character):
                rendered.append(character)
            else:
                rendered.append(compact[index])
                index += 1
        if valid("".join(rendered)):
            return "".join(rendered)
    if valid(text):
        return text
    if valid(compact):
        return compact
    return None


def is_valid_postal_code(value: str, country: str) -> bool:
    return normalize_postal_code(value, country) is not None


# ─── Formatting ───────────────────────────────────────────────────────────

def format_address(address: dict, options: dict | None = None, *, from_country: str | None = None,
                   include_country: bool = False, latin: bool = False) -> list[str]:
    """Envelope lines in the destination country's layout. `address` uses the TypeScript field names
    (name, organization, addressLines or line1/line2, dependentLocality, city, region, postalCode, sortingCode, country)."""
    if options:
        from_country = options.get("from", from_country)
        include_country = options.get("includeCountry", include_country)
        latin = options.get("latin", latin)
    raw_country = address.get("country")
    country = normalize_country_code(raw_country) or (resolve_country(raw_country).code if resolve_country(raw_country) else None)
    if not country:
        raise ValueError(f"Unknown country: {raw_country}")
    record = _formats()[country]
    pattern = record["latinFormat"] if latin and record["latinFormat"] else record["format"]
    upper = set(_fields(record["upperCase"]))
    region = address.get("region") or ""
    if region:
        found = resolve_region(region, country)
        region = found["key"] if found else region
    postal_code = address.get("postalCode") or ""
    if postal_code:
        postal_code = normalize_postal_code(postal_code, country) or postal_code
    street = [line for line in (address.get("addressLines") or [address.get("line1"), address.get("line2")]) if line and line.strip()]
    values = {"name": address.get("name") or "", "organization": address.get("organization") or "", "addressLines": "\n".join(street),
              "dependentLocality": address.get("dependentLocality") or "", "city": address.get("city") or "", "region": region,
              "postalCode": postal_code, "sortingCode": address.get("sortingCode") or ""}
    lines: list[str] = []
    for template in pattern.split("%n"):
        def substitute(match: re.Match) -> str:
            field = _FIELD_BY_LETTER.get(match.group(1))
            if not field:
                return ""
            value = values[field].strip()
            return value.upper() if field in upper else value
        line = re.sub(r"%([A-Z])", substitute, template)
        line = re.sub(r"\s+,", ",", line)
        line = re.sub(r",\s*$", "", line)
        line = re.sub(r"^\s*[,-]\s*", "", line)
        line = re.sub(r"[ \t]{2,}", " ", line).strip()
        if not line or line in ("-", "〒") or re.fullmatch(r"[A-Z]{1,3}-", line):
            continue
        lines.extend(part.strip() for part in line.split("\n") if part.strip())
    sender = None
    if from_country:
        sender = normalize_country_code(from_country) or (resolve_country(from_country).code if resolve_country(from_country) else None)
    if include_country or (sender and sender != country):
        lines.append(format_country(country, upper_case=True))
    return lines


# ─── Parsing ──────────────────────────────────────────────────────────────

def _find_postal_code(line: str, country: str) -> tuple[str, int, int] | None:
    postal = _formats()[country]["postal"]
    if not postal:
        return None
    sources = [s for s in (postal["pattern"], re.sub(r"\$$", "", re.sub(r"^\^", "", postal["secondaryPattern"] or ""))) if s]
    prefixes = "|".join(re.escape(prefix) for prefix in postal["prefixes"])
    for source in sources:
        try:
            regex = re.compile(rf"(?:^|[\s,])(?:(?:{prefixes})\s?)?({source})(?=$|[\s,])", re.I)
        except re.error:
            continue
        match = regex.search(line)
        if match:
            code = normalize_postal_code(match.group(1), country)
            if code:
                return code, match.start(), match.end()
    return None


def parse_address(text: str, options: dict | None = None, *, country: str | None = None) -> dict:
    """Splits a free-text address into lines, postal code, city, region and country (see the TypeScript docs)."""
    if options:
        country = options.get("country", country)
    result = {"lines": [], "postal_code": None, "city": None, "region": None, "country": None, "postal_check": "not-checked"}
    if not isinstance(text, str):
        return result
    multiline = "\n" in text
    lines = [clean_input(line) for line in (re.split(r"\r?\n", text) if multiline else re.split(r"\s*,\s*", text))]
    lines = [line for line in lines if line]
    if not lines:
        return result
    code = None
    if country:
        code = normalize_country_code(country) or (resolve_country(country).code if resolve_country(country) else None)
    last = resolve_country(lines[-1])
    if last and len(lines) > 1 and (not code or last.code == code):
        code = last.code
        lines = lines[:-1]
    result["country"] = code
    if not code:
        result["lines"] = lines
        return result
    record = _formats()[code]
    region_after_city = re.search(r"%C[^%]*%S", record["format"]) is not None

    city_index = -1
    for index in range(len(lines) - 1, -1, -1):
        found = _find_postal_code(lines[index], code)
        if not found:
            continue
        result["postal_code"] = found[0]
        rest = clean_input(f"{lines[index][:found[1]]} {lines[index][found[2]:]}")
        rest = re.sub(r"^[,\s-]+|[,\s-]+$", "", rest)
        if rest:
            lines[index] = rest
            city_index = index
        else:
            del lines[index]
            city_index = index - 1
        break
    if city_index < 0 and len(lines) > 1:
        city_index = len(lines) - 1

    if city_index >= 0:
        city_text = lines[city_index]
        if record["regions"] or region_after_city:
            words = city_text.split()
            for take in range(min(3, len(words) - 1), 0, -1):
                candidate = " ".join(words[-take:]).strip(",")
                region = resolve_region(candidate, code)
                if region:
                    result["region"] = region["key"]
                    city_text = re.sub(r"[,\s]+$", "", " ".join(words[:-take]))
                    break
        result["city"] = city_text or None
        del lines[city_index]
    result["lines"] = lines

    if result["postal_code"]:
        try:
            from geodata_kit_postal import find_places_by_postal_code
        except ImportError:
            find_places_by_postal_code = None
        if find_places_by_postal_code:
            places = find_places_by_postal_code(result["postal_code"], code)
            city = result["city"]
            if not places:
                result["postal_check"] = "unknown"
            elif city and any(fold(p["name"]) == fold(city) or fold(p["name"]).startswith(fold(city) + " ") for p in places):
                result["postal_check"] = "confirmed"
            else:
                loose = lambda value: fold(value).replace("ue", "u").replace("oe", "o").replace("ae", "a")  # noqa: E731
                key = loose(city) if city else ""
                allowed = max(1, min(2, len(key) // 4))
                close = next((p for p in places if not key or edit_distance(loose(p["name"]), key, allowed) <= allowed), None)
                if close:
                    result["city"] = close["name"]
                    result["postal_check"] = "corrected"
                else:
                    result["postal_check"] = "unknown"
    return result
