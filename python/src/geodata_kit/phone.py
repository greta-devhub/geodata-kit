"""Phone numbers: parse, validate, classify, format.

Same rules as the TypeScript module.
"""
from __future__ import annotations

import functools
import json
import re
import unicodedata
from dataclasses import dataclass

from ._data import load


@dataclass(frozen=True)
class PhoneNumber:
    e164: str
    country: str | None
    calling_code: str
    national_number: str
    extension: str | None
    type: str
    is_valid: bool
    is_possible: bool


def _meta() -> dict:
    return load("phone", "metadata.json")


@functools.cache
def _full(pattern: str) -> re.Pattern:
    return re.compile(rf"(?:{pattern})\Z")


@functools.cache
def _prefix(pattern: str) -> re.Pattern:
    return re.compile(rf"(?:{pattern})")


def _fullmatch(pattern: str, text: str) -> bool:
    return _full(pattern).match(text) is not None


def _js_template(template: str) -> str:
    """"$1 $2" → r"\\g<1> \\g<2>" for re.sub."""
    return re.sub(r"\$(\d)", r"\\g<\1>", template.replace("\\", "\\\\"))


_EXTENSION = re.compile(r"(?:;ext=|[\s,]*(?:#|x|xtn|ext\.?|extension|extn|ext:|доб\.?|anexo)[\s.:]*)(\d{1,7})#?\s*$", re.I)


def _prepare(text: str):
    value = unicodedata.normalize("NFKC", text)
    value = "".join(str(ord(ch) - 0x0660) if "\u0660" <= ch <= "\u0669" else str(ord(ch) - 0x06F0) if "\u06f0" <= ch <= "\u06f9" else ch for ch in value).strip()
    value = re.sub(r"^tel:", "", value, flags=re.I)
    extension = None
    match = _EXTENSION.search(value)
    if match:
        extension = match.group(1)
        value = value[: match.start()]
    start = re.search(r"[+\d]", value)
    if not start:
        return None
    value = value[start.start():]
    plus = value.startswith("+")
    digits = re.sub(r"\D", "", value)
    if len(digits) < 2 or len(digits) > 17:
        return None
    return digits, plus, extension


def _regions_for(calling_code: str) -> list[str]:
    return _meta()["byCallingCode"].get(calling_code, [])


def _main(calling_code: str) -> dict | None:
    regions = _regions_for(calling_code)
    return _meta()["regions"][regions[0]] if regions else None


def _extract_calling_code(digits: str):
    if digits.startswith("0"):
        return None
    for length in range(1, min(3, len(digits)) + 1):
        candidate = digits[:length]
        if candidate in _meta()["byCallingCode"]:
            return candidate, digits[length:]
    return None


def _matches(national: str, desc: dict | None) -> bool:
    if not desc or not desc.get("pattern"):
        return False
    if desc["lengths"] and len(national) not in desc["lengths"]:
        return False
    return _fullmatch(desc["pattern"], national)


def _strip_national_prefix(national: str, meta: dict) -> str:
    prefix_pattern = meta.get("nationalPrefixForParsing") or meta.get("nationalPrefix")
    if not prefix_pattern:
        return national
    match = _prefix(prefix_pattern).match(national)
    if not match:
        return national
    general = meta["general"]["pattern"]
    viable_original = _fullmatch(general, national)
    groups = len(match.groups())
    transform = meta.get("nationalPrefixTransformRule")
    if not transform or groups == 0 or match.group(groups) is None:
        result = national[match.end():]
    else:
        result = re.sub(r"\$(\d)", lambda m: match.group(int(m.group(1))) or "", transform) + national[match.end():]
    if viable_original and not _fullmatch(general, result):
        return national
    lengths = meta["general"]["lengths"] + meta["general"]["localLengths"]
    minimum = min(lengths) if lengths else 2
    if len(result) < max(2, minimum):
        return national
    return result


_TYPE_ORDER = [("premiumRate", "premium_rate"), ("tollFree", "toll_free"), ("sharedCost", "shared_cost"), ("voip", "voip"),
               ("personalNumber", "personal_number"), ("pager", "pager"), ("uan", "uan"), ("voicemail", "voicemail")]


def _type_for(national: str, meta: dict) -> str:
    if not _matches(national, meta["general"]):
        return "unknown"
    types = meta["types"]
    for key, name in _TYPE_ORDER:
        if _matches(national, types.get(key)):
            return name
    fixed, mobile = types.get("fixedLine"), types.get("mobile")
    same = fixed and mobile and fixed["pattern"] == mobile["pattern"]
    if _matches(national, fixed):
        if same:
            return "fixed_line_or_mobile"
        return "fixed_line_or_mobile" if _matches(national, mobile) else "fixed_line"
    if not same and _matches(national, mobile):
        return "mobile"
    return "unknown"


def _region_for(calling_code: str, national: str) -> str | None:
    regions = _regions_for(calling_code)
    if len(regions) == 1:
        return regions[0] if _type_for(national, _meta()["regions"][regions[0]]) != "unknown" else None
    for region in regions:
        meta = _meta()["regions"][region]
        if meta.get("leadingDigits"):
            if _prefix(meta["leadingDigits"]).match(national):
                return region
        elif _type_for(national, meta) != "unknown":
            return region
    return None


def _build(calling_code: str, national: str, extension: str | None) -> PhoneNumber:
    region = _region_for(calling_code, national)
    meta = _meta()["regions"][region] if region else _main(calling_code)
    type_ = _type_for(national, meta) if region else "unknown"
    main = _main(calling_code)
    possible = len(national) in main["general"]["lengths"] or len(national) in main["general"]["localLengths"]
    return PhoneNumber(f"+{calling_code}{national}", region if region and not region.startswith("001") else None, calling_code,
                       national, extension, type_, type_ != "unknown", possible)


def parse_phone_number(text: str | None, default_country: str | None = None) -> PhoneNumber | None:
    """parse_phone_number("089 1234567", "DE").e164 == "+49891234567"."""
    if not isinstance(text, str):
        return None
    prepared = _prepare(text)
    if not prepared:
        return None
    digits, plus, extension = prepared
    region = default_country.strip().upper() if default_country else None
    default_meta = _meta()["regions"].get(region) if region else None
    if plus:
        extracted = _extract_calling_code(digits)
        if not extracted:
            return None
        calling_code, national = extracted
    else:
        international = default_meta.get("internationalPrefix") if default_meta else None
        after = _prefix(international).match(digits) if international else None
        extracted = _extract_calling_code(digits[after.end():]) if after and not digits[after.end():].startswith("0") else None
        if extracted:
            calling_code, national = extracted
        elif default_meta:
            calling_code, national = default_meta["callingCode"], digits
            if digits.startswith(calling_code):
                without = _strip_national_prefix(digits[len(calling_code):], default_meta)
                as_is = _strip_national_prefix(digits, default_meta)
                if _type_for(as_is, default_meta) == "unknown" and _type_for(without, default_meta) != "unknown":
                    national = digits[len(calling_code):]
        else:
            return None
    meta = default_meta if default_meta and default_meta["callingCode"] == calling_code else _main(calling_code)
    if not meta:
        return None
    national = _strip_national_prefix(national, meta)
    if len(national) < 2 or len(national) > 17:
        return None
    return _build(calling_code, national, extension)


def parse_phone_numbers(text: str | None, default_country: str | None = None) -> list[PhoneNumber]:
    """Several numbers in one field: comma/semicolon/newline separated or a JSON array."""
    if not isinstance(text, str) or not text.strip():
        return []
    trimmed = text.strip()
    if trimmed.startswith("["):
        try:
            parts = [str(item) for item in json.loads(trimmed)]
        except ValueError:
            parts = re.split(r"[,;\n|]", trimmed.strip("[]"))
    else:
        parts = re.split(r"\s*(?:[,;\n|]|\s/\s|\s{3,})\s*", trimmed)
    seen, result = set(), []
    for part in parts:
        number = parse_phone_number(part.strip("\"'"), default_country)
        if number and number.is_possible and number.e164 not in seen:
            seen.add(number.e164)
            result.append(number)
    return result


def is_valid_phone_number(text: str, default_country: str | None = None) -> bool:
    number = parse_phone_number(text, default_country)
    return bool(number and number.is_valid)


def is_possible_phone_number(text: str, default_country: str | None = None) -> bool:
    number = parse_phone_number(text, default_country)
    return bool(number and number.is_possible)


def get_phone_number_type(number, default_country: str | None = None) -> str:
    parsed = parse_phone_number(number, default_country) if isinstance(number, str) else number
    return parsed.type if parsed else "unknown"


def _choose_format(formats: list[dict], national: str) -> dict | None:
    for format_ in formats:
        if format_.get("leadingDigits") and not _prefix(format_["leadingDigits"]).match(national):
            continue
        if _fullmatch(format_["pattern"], national):
            return format_
    return None


_INTL_SEPARATORS = re.compile("[-\u2010-\u2015\u2212\u30fc\uff0d-\uff0f \u00a0\u00ad\u200b\u2060\u3000()\uff08\uff09\uff3b\uff3d.\\[\\]/~\u2053\u223c\uff5e]+")


def format_phone_number(number, format: str = "INTERNATIONAL", default_country: str | None = None) -> str | None:
    """E164 "+49891234567", INTERNATIONAL "+49 89 1234567", NATIONAL "089 1234567", RFC3966 "tel:+49-89-1234567"."""
    parsed = parse_phone_number(number, default_country) if isinstance(number, str) else number
    if not parsed:
        return None
    if format == "E164":
        return parsed.e164
    meta = _main(parsed.calling_code)
    national = parsed.national_number
    formatted = national
    if meta:
        if format == "NATIONAL":
            chosen = _choose_format(meta["formats"], national)
            if chosen:
                template = chosen["format"]
                if chosen.get("nationalPrefixRule"):
                    rule = chosen["nationalPrefixRule"]
                    template = re.sub(r"\$\d", lambda m: rule.replace("$NP", meta.get("nationalPrefix", "")).replace("$FG", m.group(0)), template, count=1)
                formatted = _full(chosen["pattern"]).sub(_js_template(template), national)
        else:
            has_intl = any("intlFormat" in entry for entry in meta["formats"])
            formats = ([{**entry, "format": entry.get("intlFormat", entry["format"])} for entry in meta["formats"] if entry.get("intlFormat") != "NA"]
                       if has_intl else meta["formats"])
            chosen = _choose_format(formats, national)
            if chosen:
                formatted = _full(chosen["pattern"]).sub(_js_template(chosen["format"]), national)
            formatted = _INTL_SEPARATORS.sub(" ", formatted).strip()
    extension = ""
    if parsed.extension:
        extension = f";ext={parsed.extension}" if format == "RFC3966" else f" {(meta or {}).get('preferredExtnPrefix', 'ext.').strip()} {parsed.extension}"
    if format == "NATIONAL":
        return f"{formatted}{extension}"
    if format == "RFC3966":
        return f"tel:+{parsed.calling_code}-{re.sub(r'[^0-9]+', '-', formatted)}{extension}"
    return f"+{parsed.calling_code} {formatted}{extension}"


def get_example_phone_number(country: str, type: str = "fixed_line") -> PhoneNumber | None:
    meta = _meta()["regions"].get(country.strip().upper())
    if not meta:
        return None
    key = re.sub(r"_(\w)", lambda m: m.group(1).upper(), type)
    example = meta["types"].get(key, {}).get("example")
    return _build(meta["callingCode"], example, None) if example else None


def list_phone_regions() -> list[str]:
    return list(_meta()["regions"].keys())
