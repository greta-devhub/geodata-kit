"""Address formats, regions, postal-code rules, formatting and parsing.

Every function takes the country as a code or a name ("DE", "Germany", "Deutschland") and returns
None, False or an empty list for one it does not know; none of them raises.
"""
from __future__ import annotations

import functools
import math
import re

from ._data import load
from .countries import format_country, normalize_country_code, resolve_country
from .fold import clean_input, edit_distance, fold

_FIELD_BY_LETTER = {"N": "name", "O": "organization", "A": "addressLines", "D": "dependentLocality", "C": "city",
                    "S": "region", "Z": "postalCode", "X": "sortingCode"}


def _formats() -> dict:
    return load("address", "formats.json")


def _country_code(country: str | None) -> str | None:
    """The one way every function reads its country argument: a code or a name in any bundled language, else None."""
    if not isinstance(country, str) or not country.strip():
        return None
    code = normalize_country_code(country)
    if code:
        return code
    match = resolve_country(country)
    return match.code if match else None


def _record(country: str | None) -> dict | None:
    code = _country_code(country)
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


# ─── Regions ──────────────────────────────────────────────────────────────

def _copy_region(region: dict) -> dict:
    copy = dict(region)
    if region.get("aliases") is not None:
        copy["aliases"] = list(region["aliases"])
    return copy


def list_regions(country: str) -> list[dict]:
    """Regions used in addresses (states, provinces, …), where the country's addresses contain one."""
    record = _record(country)
    return [_copy_region(region) for region in record["regions"]] if record else []


def _compact_key(text: str) -> str:
    """Names are compared without spaces or punctuation, so "Washington, D.C." equals "Washington DC"."""
    return fold(text).replace(" ", "")


@functools.cache
def _region_index(code: str) -> dict:
    """Lookup tables of a country's regions.

    by_key: key and ISO code. by_name: name, Latin name, aliases. by_base_name: names without the type words
    ("Co. Dublin" → "dublin"). type_words: words that only say what kind of region it is: the country's label
    ("county", "state"), the first word shared by all region names, "of".
    """
    record = _formats()[code]
    regions = record["regions"]
    type_words = {"of", *fold(record["regionLabel"].replace("_", " ")).split(" ")}
    first_words = {fold(region["name"]).split(" ")[0] for region in regions}
    shared = next(iter(first_words)) if len(regions) >= 3 and len(first_words) == 1 else None
    if shared:
        type_words.add(shared)
    by_key: dict[str, dict] = {}
    by_name: dict[str, dict] = {}
    by_base_name: dict[str, dict] = {}

    def add(mapping: dict[str, dict], key: str, region: dict) -> None:
        if key and key not in mapping:
            mapping[key] = region

    for region in regions:
        add(by_key, region["key"].upper(), region)
        if region.get("iso"):
            add(by_key, region["iso"], region)
    # Own names first, so an alias never takes a name that belongs to another region.
    for region in regions:
        add(by_name, _compact_key(region["name"]), region)
        if region.get("latinName"):
            add(by_name, _compact_key(region["latinName"]), region)
    for region in regions:
        for alias in region.get("aliases") or []:
            add(by_name, _compact_key(alias), region)
    for region in regions:
        for name in (region["name"], region.get("latinName"), *(region.get("aliases") or [])):
            if not name:
                continue
            add(by_base_name, "".join(word for word in fold(name).split(" ") if word not in type_words), region)
    return {"by_key": by_key, "by_name": by_name, "by_base_name": by_base_name, "type_words": type_words}


def _find_region(value: str, code: str) -> tuple[dict, str] | None:
    """A region of a known country, and whether the text was its key / ISO code ("key") or one of its names ("name")."""
    text = clean_input(value)
    record = _formats().get(code)
    if not text or not record or not record["regions"]:
        return None
    index = _region_index(code)
    by_key = index["by_key"].get(text.upper())
    if by_key:
        return by_key, "key"
    by_name = index["by_name"].get(_compact_key(text))
    if by_name:
        return by_name, "name"
    # "County Dublin", "State of California", "Dublin" for "Co. Dublin": the same name without the type words.
    base = "".join(word for word in fold(text).split(" ") if word not in index["type_words"])
    by_base = index["by_base_name"].get(base) if base else None
    return (by_base, "name") if by_base else None


def resolve_region(value: str, country: str) -> dict | None:
    """The region for a key, ISO code or name: ("California", "US") → CA.

    Names can be the local one, the Latin one or the English one ("Rome" → RM, "Washington, D.C." → DC), with or
    without the word for the kind of region ("County Dublin", "State of California", "Dublin" → "Co. Dublin").
    """
    code = _country_code(country)
    if not code or not isinstance(value, str):
        return None
    found = _find_region(value, code)
    return _copy_region(found[0]) if found else None


def is_valid_region(value: str, country: str) -> bool:
    return resolve_region(value, country) is not None


# ─── Postal codes ─────────────────────────────────────────────────────────

# The postal patterns are JavaScript regexes; the subset they use is valid Python too.
# ASCII mode keeps \d, \s and \w as narrow as they are in JavaScript.
_PATTERN_FLAGS = re.I | re.A


def _anchored(source: str | None) -> re.Pattern | None:
    if not source:
        return None
    inner = re.sub(r"\$$", "", re.sub(r"^\^", "", source))
    try:
        return re.compile(rf"^(?:{inner})$", _PATTERN_FLAGS)
    except re.error:
        return None


@functools.cache
def _checks(country: str) -> tuple[re.Pattern | None, re.Pattern | None, re.Pattern | None]:
    """Main pattern, second pattern and the code ranges of the regions (where a code must be inside them)."""
    record = _formats()[country]
    postal = record["postal"] or {}
    ranges = None
    if postal.get("byRegion"):
        ranges = re.compile("^(?:" + "|".join(region.get("postalPattern") or "" for region in record["regions"]) + ")", _PATTERN_FLAGS)
    return _anchored(postal.get("pattern")), _anchored(postal.get("secondaryPattern")), ranges


def _is_valid_code(candidate: str, country: str) -> bool:
    """True when a code in canonical spelling is valid for the country.

    The country's pattern decides. Its second pattern is used only as the data says: "either" where real codes
    need it, "both" where every real code passes both, which makes the stricter one safe. Where the data has the
    code ranges of every region, a code must start with one of them.
    """
    main, second, ranges = _checks(country)
    mode = (_formats()[country]["postal"] or {}).get("match")
    if not main:
        valid = bool(second and second.match(candidate))
    elif mode == "either":
        valid = bool(main.match(candidate) or (second and second.match(candidate)))
    elif mode == "both":
        valid = bool(main.match(candidate) and (second.match(candidate) if second else True))
    else:
        valid = bool(main.match(candidate))
    return valid and (not ranges or bool(ranges.match(re.sub(r"[\s-]", "", candidate))))


def get_postal_code_rules(country: str) -> dict | None:
    """Postal-code rules of a country, or None when it has no postal codes."""
    code = _country_code(country)
    record = _formats().get(code) if code else None
    if not record or not record["postal"]:
        return None
    postal = record["postal"]
    main, second, _ = _checks(code)
    return {"pattern": (main or second).pattern, "layouts": list(postal["layouts"]), "examples": list(postal["examples"]),
            "prefixes": list(postal["prefixes"]), "suffixes": list(postal.get("suffixes") or []), "label": postal["label"]}


@functools.cache
def _suffix_pattern(country: str, where: str) -> re.Pattern | None:
    """"CEDEX" or "CEDEX 08" at the end (or start) of a text, for a country whose real codes carry such a suffix."""
    words = (_formats()[country]["postal"] or {}).get("suffixes")
    if not words:
        return None
    body = rf"({'|'.join(words)})(?:\s+(\d{{1,2}}))?"
    return re.compile(rf"\s+{body}$" if where == "end" else rf"^{body}(?=$|[\s,])", _PATTERN_FLAGS)


def _render_layout(layout: str, compact: str) -> str | None:
    slots = re.sub(r"[^#@A-Z0-9]", "", layout)
    if len(slots) != len(compact):
        return None
    output, index = [], 0
    for symbol in layout:
        if symbol in "#@" or re.fullmatch(r"[A-Z0-9]", symbol):
            character = compact[index]
            index += 1
            if symbol == "#" and not re.fullmatch(r"[0-9]", character):
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
    """("D-80331", "DE") → "80331"; ("sw1a1aa", "GB") → "SW1A 1AA"; invalid → None.

    Valid means more than the right shape where the data knows more: a Dutch code cannot start with 0, a
    Spanish one starts with 01 to 52. For many countries only the shape is known.
    """
    code = _country_code(country)
    record = _formats().get(code) if code else None
    if not record or not record["postal"] or not isinstance(value, str):
        return None
    postal = record["postal"]
    text = re.sub(r"^〒\s*", "", clean_input(value).upper())
    for prefix in sorted(postal["prefixes"], key=len, reverse=True):
        if text.startswith(prefix) and len(text) > len(prefix):
            text = text[len(prefix):].strip()
            break
    # "75008 CEDEX 08": the code before the suffix must be valid on its own.
    suffix = _suffix_pattern(code, "end")
    found = suffix.search(text) if suffix else None
    if found:
        base = normalize_postal_code(text[:found.start()], code)
        return f"{base} {found.group(1).upper()}{' ' + found.group(2) if found.group(2) else ''}" if base else None
    valid = lambda candidate: _is_valid_code(candidate, code)  # noqa: E731
    compact = re.sub(r"[\s-]", "", text)
    for layout in postal["layouts"]:
        rendered = _render_layout(layout, compact)
        if rendered and valid(rendered):
            return rendered
    # Spacing taken from the official examples ("A65 F4E2" → a space after 3 characters).
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
    (name, organization, addressLines or line1/line2, dependentLocality, city, region, postalCode, sortingCode, country).
    An unknown country gives an empty list, not an error."""
    if options:
        from_country = options.get("from", from_country)
        include_country = options.get("includeCountry", include_country)
        latin = options.get("latin", latin)
    country = _country_code(address.get("country")) if isinstance(address, dict) else None
    if not country:
        return []
    record = _formats()[country]
    pattern = record["latinFormat"] if latin and record["latinFormat"] else record["format"]
    upper = set(_fields(record["upperCase"]))
    region = address.get("region") or ""
    if region:
        found = _find_region(region, country)
        region = found[0]["key"] if found else region
    postal_code = address.get("postalCode") or ""
    if postal_code:
        postal_code = normalize_postal_code(postal_code, country) or postal_code
    street = address.get("addressLines")
    if street is None:
        street = [address.get("line1"), address.get("line2")]
    street = [line for line in street if line and line.strip()]
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
    sender = _country_code(from_country)
    if include_country or (sender and sender != country):
        lines.append(format_country(country, upper_case=True))
    return lines


# ─── Parsing ──────────────────────────────────────────────────────────────

def _postal_lookup():
    """find_places_by_postal_code of the optional geodata_kit_postal package, or None when it is not installed."""
    try:
        from geodata_kit_postal import find_places_by_postal_code
    except ImportError:
        return None
    return find_places_by_postal_code


@functools.cache
def _search_patterns(country: str) -> tuple[re.Pattern, ...]:
    """Unanchored forms of the country's postal patterns, with the optional prefix in front."""
    postal = _formats()[country]["postal"]
    sources = [s for s in (postal["pattern"], re.sub(r"\$$", "", re.sub(r"^\^", "", postal["secondaryPattern"] or ""))) if s]
    prefixes = "|".join(re.escape(prefix) for prefix in postal["prefixes"])
    result = []
    for source in sources:
        try:
            result.append(re.compile(rf"(?:^|[\s,])(?:(?:{prefixes})\s?)?({source})(?=$|[\s,])", _PATTERN_FLAGS))
        except re.error:
            continue
    return tuple(result)


def _find_postal_code(line: str, country: str) -> tuple[str, int, int] | None:
    """Postal code inside a line: (canonical code, start, end)."""
    record = _formats().get(country)
    if not record or not record["postal"]:
        return None
    for regex in _search_patterns(country):
        match = regex.search(line)
        if match:
            code = normalize_postal_code(match.group(1), country)
            end = match.end()
            # A suffix right after the code belongs to it: "01001 CEDEX Bourg-en-Bresse".
            pattern = _suffix_pattern(country, "start") if code else None
            rest = line[end:]
            suffix = pattern.search(rest.lstrip()) if pattern else None
            if code and suffix:
                code = normalize_postal_code(f"{code} {suffix.group(0)}", country)
                end += len(rest) - len(rest.lstrip()) + len(suffix.group(0))
            if code:
                return code, match.start(), end
    return None


def _extract(input_lines: list[str], country: str) -> dict:
    """Postal code, region and city of an address in a known country.

    Uses the address data only, so the country detection can run it for every candidate country.
    `city_index` is where the street part of an unsplit city line goes back, if it is split later.
    """
    record = _formats()[country]
    lines = list(input_lines)
    result = {"lines": lines, "postal_code": None, "city": None, "region": None, "city_index": 0}

    # Postal code, searched from the bottom.
    city_line_index = -1
    for index in range(len(lines) - 1, -1, -1):
        found = _find_postal_code(lines[index], country)
        if not found:
            continue
        result["postal_code"] = found[0]
        rest = clean_input(f"{lines[index][:found[1]]} {lines[index][found[2]:]}")
        rest = re.sub(r"^[,\s-]+|[,\s-]+$", "", rest)
        if rest:
            lines[index] = rest
            city_line_index = index
        else:
            del lines[index]
            city_line_index = index - 1  # GB style: postcode on its own line under the town
        break
    if city_line_index < 0 and len(lines) > 1:
        city_line_index = len(lines) - 1
    if city_line_index < 0:
        return result

    city_text: str | None = lines[city_line_index]
    # French mail writes the suffix after the city: "75008 PARIS CEDEX 08".
    pattern = _suffix_pattern(country, "end") if result["postal_code"] and not re.search(r"\s[A-Z]{3,}", result["postal_code"]) else None
    suffix = pattern.search(city_text) if pattern else None
    if suffix and suffix.start() > 0:
        result["postal_code"] = normalize_postal_code(f"{result['postal_code']} {suffix.group(0).strip()}", country) or result["postal_code"]
        city_text = city_text[:suffix.start()].strip()
        lines[city_line_index] = city_text
    if record["regions"]:
        # Where the region is written right before the postal code, on its line (US "City, ST ZIP") or on the
        # line above (Ireland: county, then Eircode), text split on commas or lines leaves the region alone:
        # "…, San Francisco, CA 94103". The city is then the part before it, unless that part is a street
        # (it has a number).
        region_before_postal = re.search(r"%S(?:[^%]|%n)*%Z", record["format"]) is not None
        whole = _find_region(city_text, country) if region_before_postal else None
        before = lines[city_line_index - 1] if city_line_index > 0 else None
        if whole and before is not None and not re.search(r"[0-9]", before):
            result["region"] = whole[0]
            del lines[city_line_index]
            city_line_index -= 1
            city_text = lines[city_line_index]
        elif whole and whole[1] == "key":
            result["region"] = whole[0]
            city_text = None
        else:
            # The region as the last words of the city line: "San Francisco CA", "Austin, Texas".
            # When the whole text is also a region name but nothing before it can be the city, it is the
            # city itself ("350 Fifth Ave, New York 10118"); only a region key at its end still counts
            # ("WASHINGTON, DC": Washington DC is a name of the District).
            words = re.split(r"\s+", city_text)
            type_words = _region_index(country)["type_words"]
            for take in range(min(3, len(words) - 1), 0, -1):
                found = _find_region(re.sub(r"^,|,$", "", " ".join(words[-take:])), country)
                # What is left must be a name: "Co." in front of "Carlow" is part of the region, not a city.
                left = [word for word in fold(" ".join(words[:-take])).split(" ") if word and word not in type_words]
                if found and left and (not whole or found[1] == "key"):
                    result["region"] = found[0]
                    city_text = re.sub(r"[,\s]+$", "", " ".join(words[:-take]))
                    break
    result["city"] = city_text or None
    del lines[city_line_index]
    result["city_index"] = city_line_index
    return result


@functools.cache
def _prefix_countries() -> dict[str, str]:
    """Countries by a postal prefix that ends in a dash: "CH-" → CH, "D-" → DE, "A-" → AT."""
    result: dict[str, str] = {}
    for code, record in _formats().items():
        for entry in (record["postal"] or {}).get("prefixes") or []:
            if entry.endswith("-"):
                result.setdefault(entry.upper(), code)
    return result


@functools.cache
def _region_countries() -> tuple[str, ...]:
    """Countries whose addresses carry a region and whose data knows the postal ranges of regions."""
    return tuple(code for code, record in _formats().items()
                 if record["postal"] and "%S" in record["format"] and any(region.get("postalPattern") for region in record["regions"]))


@functools.cache
def _region_range(pattern: str) -> re.Pattern:
    return re.compile(rf"^(?:{pattern})", _PATTERN_FLAGS)


_PREFIX_IN_LINE = re.compile(r"(?:^|[\s,(])([A-Za-z]{1,3}-)(?=[A-Za-z0-9])")


def _detect_country(lines: list[str]) -> str | None:
    """The country of an address that does not name it, from what the address itself shows:

    1. a postal prefix in front of a code that is valid for that country ("CH-8001", "D-80331");
    2. a region next to a postal code from that region's range ("CA 94103" is California, "ON K1M 1M4" is
       Ontario). Exactly one country must fit.
    A bare postal code is never enough: "80331" fits dozens of countries.
    """
    for line in reversed(lines):
        for match in _PREFIX_IN_LINE.finditer(line):
            country = _prefix_countries().get(match.group(1).upper())
            if not country:
                continue
            found = _find_postal_code(line[match.start(1):], country)
            if found and found[1] == 0:
                return country
    with_region = []
    for country in _region_countries():
        extracted = _extract(lines, country)
        region, postal_code = extracted["region"], extracted["postal_code"]
        if region and region.get("postalPattern") and postal_code:
            with_region.append((country, region, postal_code))
    fitting = [country for country, region, postal_code in with_region if _in_region_range(postal_code, region)]
    if fitting:
        return fitting[0] if len(fitting) == 1 else None
    # A region and a code of the country's shape, but from another region's range ("CA 10001"): still that
    # country, where ranges are certain; parse_address flags it.
    shaped = [country for country, _, _ in with_region if (_formats()[country]["postal"] or {}).get("byRegion")]
    return shaped[0] if len(shaped) == 1 else None


def _in_region_range(postal_code: str, region: dict) -> bool:
    """True when the postal code is in the range of the region ("94103" in California)."""
    return bool(_region_range(region["postalPattern"]).match(re.sub(r"[\s-]", "", postal_code)))


def _city_after_code(record: dict) -> bool | None:
    """Whether the city follows the postal code on its line ("%Z %C": True), precedes it ("%C, %S %Z": False) or is on
    another line (None)."""
    line = next((part for part in record["format"].split("%n") if "%Z" in part), None)
    if not line or "%C" not in line:
        return None
    return line.index("%Z") < line.index("%C")


def _place_named(places: list[dict], city: str) -> dict | None:
    """A place of the postal code with this name: "Paris" or "Paris 01" for 75001."""
    key = fold(city)
    same = next((place for place in places if fold(place["name"]) == key), None)
    if same is None and key:
        same = next((place for place in places if fold(place["name"]).startswith(key + " ")), None)
    return same


def _postal_module():
    """The optional geodata_kit_postal package, or None when it is not installed."""
    try:
        import geodata_kit_postal
    except ImportError:
        return None
    return geodata_kit_postal


def _detect_country_by_place(lines: list[str]) -> str | None:
    """3. A postal code with one of its places where the country's format puts the city ("75001 Paris", "10117 Berlin";
    the line above a code that stands alone, for "London" over "SW1A 2AA").

    The code must be valid for the country and the place known there: a place of that very code with
    geodata_kit_postal, or a city of the country for a country the postal data does not cover. Exactly one country
    must fit; without geodata_kit_postal, common names ("Berlin" is also a village in Mexico) stay unresolved.
    """
    from .cities import find_city  # imported here: cities and address must not import each other at load time
    postal = _postal_module()
    covered = set(postal.list_postal_countries()) if postal else set()
    fitting = []
    for country, record in _formats().items():
        if not record["postal"]:
            continue
        found, index = None, len(lines) - 1
        while index >= 0:
            found = _find_postal_code(lines[index], country)
            if found:
                break
            index -= 1
        if not found:
            continue
        line = lines[index]
        before = re.sub(r"[,\s-]+$", "", clean_input(line[:found[1]]))
        after = re.sub(r"^[,\s-]+", "", clean_input(line[found[2]:]))
        order = _city_after_code(record)
        if order is True:
            city = after
        elif order is False:
            city = before
        else:
            city = lines[index - 1] if not before and not after and index > 0 else ""
        if not city or re.search(r"[0-9]", city):
            continue
        if postal and country in covered:
            known = _place_named(postal.find_places_by_postal_code(found[0], country), city) is not None
        else:
            try:
                known = find_city(city, country=country) is not None
            except Exception:
                known = False
        if known:
            fitting.append(country)
        if len(fitting) > 1:
            return None
    return fitting[0] if fitting else None


# Below this distance a postal place counts as the city written (a district, a neighbouring locality).
_MISMATCH_KM = 30


def _km_between(a: dict, b: dict) -> float:
    return math.hypot(a["lat"] - b["lat"], (a["lng"] - b["lng"]) * math.cos(a["lat"] * math.pi / 180)) * 111.2


def _city_locations(city: str, country: str, postal) -> list[dict]:
    """Where a city of the country lies: its own postal places, else the city found by find_city. Empty when unknown."""
    from .cities import find_city
    locations = []
    key = fold(city)
    for code in postal.find_postal_codes(city=city, country=country):
        places = postal.find_places_by_postal_code(code, country)
        named = [place for place in places if fold(place["name"]) == key]
        locations.extend(named or places)
    if locations:
        return locations
    try:
        found = find_city(city, country=country)
    except Exception:
        found = None
    return [{"lat": found.lat, "lng": found.lng}] if found else []


def _split_street_and_city(text: str, country: str, postal_code: str | None, region: dict | None) -> tuple[str, str] | None:
    """Splits "350 Fifth Avenue New York" into (street, city), for text that has no separator between them.

    The city is the longest ending that is a place of the postal code (geodata_kit_postal, when installed)
    or a city of the country. None when neither knows it.
    """
    words = re.split(r"\s+", text)
    if len(words) < 2:
        return None
    from .cities import find_city  # imported here: cities and address must not import each other at load time
    find_places = _postal_lookup()
    places = {fold(place["name"]) for place in find_places(postal_code, country)} if find_places and postal_code else set()
    subdivision = {"subdivision": region["iso"]} if region and region.get("iso") else {}
    for take in range(min(4, len(words) - 1), 0, -1):
        candidate = " ".join(words[-take:])
        known = fold(candidate) in places
        if not known:
            try:
                known = bool(find_city(candidate, country=country, **subdivision))
            except Exception:
                known = False
        if known:
            return re.sub(r"[,\s]+$", "", " ".join(words[:-take])), candidate
    return None


def parse_address(text: str, options: dict | None = None, *, country: str | None = None) -> dict:
    """Splits a free-text address into lines, postal code, city, region and country.

    Handles one-line ("Hauptstr. 1, D-80331 München, Deutschland") and multi-line input, prefixes such as "D-"
    and "CH-", and layouts where the region follows the city ("San Francisco CA 94103", "Austin, Texas 78701").

    The country is taken from `country`, else from a country name on the last line, else from the address
    itself: a postal prefix ("CH-8001 Zürich") or a region next to a postal code of that region ("San Francisco,
    CA 94103" → US, "Ottawa ON K1M 1M4" → CA). Without any of these every field is None and `lines` has the input.

    Text without separators ("350 Fifth Avenue New York NY 10118") is split into street and city with the city
    data and, when installed, geodata_kit_postal; a city neither knows keeps the street in `city`.
    """
    if options:
        country = options.get("country", country)
    given = country
    result = {"lines": [], "postal_code": None, "city": None, "region": None, "country": None, "postal_check": "not-checked",
              "expected_city": None, "expected_region": None}
    if not isinstance(text, str):
        return result
    multiline = "\n" in text
    lines = [clean_input(line) for line in (re.split(r"\r?\n", text) if multiline else re.split(r"\s*,\s*", text))]
    lines = [line for line in lines if line]
    if not lines:
        return result

    # 1. Country: given, named on the last line, or shown by the address itself.
    code = _country_code(country)
    last = resolve_country(lines[-1])
    if last and len(lines) > 1 and (not code or last.code == code):
        code = last.code
        lines = lines[:-1]
    if not code:
        code = _detect_country(lines)
    # A country the caller named but this package does not know is not replaced by a guess.
    if not code and given is None:
        code = _detect_country_by_place(lines)
    result["country"] = code
    if not code:
        result["lines"] = lines
        return result

    # 2. Postal code, region and city.
    extracted = _extract(lines, code)
    result["postal_code"] = extracted["postal_code"]
    result["region"] = extracted["region"]["key"] if extracted["region"] else None
    result["city"] = extracted["city"]
    result["lines"] = extracted["lines"]

    # 3. A city that starts with a number still has the street in front of it.
    if result["city"] and re.match(r"[0-9]", result["city"]):
        split = _split_street_and_city(result["city"], code, result["postal_code"], extracted["region"])
        if split:
            street, result["city"] = split
            if street:
                result["lines"].insert(extracted["city_index"], street)

    # 4. The region's postal range, where the data proves the ranges.
    record = _formats()[code]
    region = extracted["region"]
    region_mismatch = bool(result["postal_code"] and region and region.get("postalPattern") and (record["postal"] or {}).get("byRegion")
                           and not _in_region_range(result["postal_code"], region))
    if region_mismatch:
        result["postal_check"] = "mismatch"
        result["expected_region"] = next((entry["key"] for entry in record["regions"]
                                          if entry.get("postalPattern") and _in_region_range(result["postal_code"], entry)), None)

    # 5. Cross-check with geodata_kit_postal.
    find_places = _postal_lookup() if result["postal_code"] and not region_mismatch else None
    if find_places:
        places = find_places(result["postal_code"], code)
        city = result["city"]
        city_key = fold(city) if city else ""
        same = _place_named(places, city) if city else None
        if not places:
            result["postal_check"] = "unknown"
        elif city and same:
            result["postal_check"] = "confirmed"
            # An envelope line is often upper case ("WASHINGTON, DC 20500"): give the city its normal spelling back.
            if fold(same["name"]) == city_key and city == city.upper() and city != city.lower():
                result["city"] = same["name"]
        else:
            # Correct only a missing city or a near-spelling ("Muenchn" → "München"); a different name stays as
            # written. Compared with German transliterations undone too ("Muenchen" = "München").
            loose = lambda value: fold(value).replace("ue", "u").replace("oe", "o").replace("ae", "a")  # noqa: E731
            key = loose(city) if city else ""
            allowed = max(1, min(2, len(key) // 4))
            close = next((p for p in places if not key or edit_distance(loose(p["name"]), key, allowed) <= allowed), None)
            # The data must have this very code: a first part ("SW1A", GB's data) covers too wide an area, and post
            # towns there serve places far away.
            compact = lambda value: re.sub(r"[\s-]", "", value.upper())  # noqa: E731
            wanted = {compact(result["postal_code"]), compact(re.sub(r"-[0-9]+$", "", result["postal_code"]))}
            exact = any(compact(place["postal_code"]) in wanted for place in places)
            if close:
                result["city"] = close["name"]
                result["postal_check"] = "corrected"
            elif exact and city:
                # A city the data places, far from every place of the code: the code belongs elsewhere.
                locations = _city_locations(city, code, _postal_module())
                far = bool(locations) and all(_km_between(location, place) > _MISMATCH_KM for location in locations for place in places)
                result["postal_check"] = "mismatch" if far else "unknown"
                if far:
                    result["expected_city"] = places[0]["name"]
            else:
                result["postal_check"] = "unknown"
    return result
