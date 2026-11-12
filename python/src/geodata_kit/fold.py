"""Text folding identical to the TypeScript fold(): the generator and both runtimes must agree."""
from __future__ import annotations

import re
import unicodedata

_SPECIAL = {"ß": "ss", "ł": "l", "đ": "d", "ð": "d", "ø": "o", "æ": "ae", "œ": "oe", "þ": "th", "ı": "i"}
_WORDS = {"saint": "st", "sainte": "ste"}
_APOSTROPHES = re.compile("['’ʻʼ`´]")


def fold(text: str) -> str:
    """Lookup key: lower case, no accents, no apostrophes or punctuation, single spaces, "saint" → "st".

    >>> fold("São Paulo")
    'sao paulo'
    >>> fold("St. Louis")
    'st louis'
    """
    without = unicodedata.normalize("NFKD", _APOSTROPHES.sub("", text))
    without = "".join(ch for ch in without if not unicodedata.category(ch).startswith("M")).lower()
    plain = "".join(_SPECIAL.get(ch, ch) for ch in without)
    spaced = "".join(ch if unicodedata.category(ch)[0] in "LN" else " " for ch in plain)
    return " ".join(_WORDS.get(word, word) for word in spaced.split())


_ZERO_WIDTH = re.compile("[​-‍﻿]")
_SPACES = re.compile(r"\s+")


def clean_input(text: str) -> str:
    """NFKC, zero-width characters removed, whitespace collapsed, trimmed."""
    return _SPACES.sub(" ", _ZERO_WIDTH.sub("", unicodedata.normalize("NFKC", text))).strip()


def edit_distance(a: str, b: str, maximum: int) -> int:
    """Levenshtein distance with an early exit once `maximum` is exceeded."""
    if abs(len(a) - len(b)) > maximum:
        return maximum + 1
    previous = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        current = [i]
        row_min = i
        for j in range(1, len(b) + 1):
            value = min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] != b[j - 1]))
            current.append(value)
            row_min = min(row_min, value)
        if row_min > maximum:
            return maximum + 1
        previous = current
    return previous[len(b)]
