"""Small text helpers shared across routes."""
from __future__ import annotations
import re
from typing import Optional

_WORD_SPLIT = re.compile(r"([\s\-]+)")


def title_case_name(value: Optional[str]) -> Optional[str]:
    """Capitalise the first letter of each word in a person's name while
    leaving any existing internal capitals intact.

    "peter smith"  -> "Peter Smith"
    "mcdonald"     -> "Mcdonald"      (only the first letter is touched)
    "McDonald"     -> "McDonald"      (already capitalised, left as-is)
    "o'brien"      -> "O'brien"
    "van dijk"     -> "Van Dijk"
    """
    if not value or not isinstance(value, str):
        return value
    parts = _WORD_SPLIT.split(value.strip())
    out = []
    for p in parts:
        if not p or _WORD_SPLIT.fullmatch(p):
            out.append(p)
        else:
            out.append(p[:1].upper() + p[1:])
    return "".join(out)
