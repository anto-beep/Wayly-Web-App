"""Post-process LLM output to match Wayly's tone standard.

Two things:
  1. Strip em dash (U+2014,) and en dash (U+2013,). These are typographic
     signals of AI-generated prose that caregivers immediately notice. We
     replace them with a comma and a single space. Normal hyphens ("7-day",
     "self-check", "care-plan") are preserved.
  2. Provide the shared "Wayly tone" instruction block that human-readable
     prompts append to their system message.

Applied automatically inside :func:`backend.lib.llm_wrapper.chat_send` on
every model reply. Safe for JSON payloads: replacing an em dash inside a
string value with ", " produces a still-valid JSON string.
"""
from __future__ import annotations

import re

EM_DASH = "\u2014"
EN_DASH = "\u2013"

# Regex used to force the "%" glyph in any numeric percentage expression that
# the LLM might otherwise spell out. We handle: "18 percent", "18 percentage",
# "18 per cent", "18-percent", and "18.5 percentage points" (last one is a
# proper statistical term that keeps its "points" tail). Case-insensitive.
_PERCENT_WORD_RE = re.compile(
    r"(\d+(?:\.\d+)?)\s*[-\s]?\s*(percentage|percent|per\s?cent)(\s+points?)?",
    flags=re.IGNORECASE,
)

# Bullet fillers a few models emit and that read as AI slop when narrating.
# Not currently stripped, but centralised here for future tuning.
_KNOWN_AI_TICS = ("furthermore", "moreover", "in conclusion")


def enforce_percent_symbol(text: str) -> str:
    """Force the "%" glyph in numeric percentage expressions.

    Converts patterns like "18 percent", "18 percentage", "18 per cent" and
    "18-percent" to "18%". Preserves the grammatical "points" tail so
    "0.5 percentage points" becomes "0.5% points" (still valid technical
    English). Leaves standalone concept words alone (e.g. "the percentage of
    your budget"), because rewriting those without a number would break
    grammar. Safe on JSON payloads because it only mutates within string
    values.
    """
    if not text or not isinstance(text, str):
        return text

    def _sub(m: "re.Match[str]") -> str:
        num = m.group(1)
        tail = m.group(3) or ""
        return f"{num}%{tail}"

    return _PERCENT_WORD_RE.sub(_sub, text)


def strip_wayly_dashes(text: str) -> str:
    """Replace em and en dashes with ", ". Preserves plain hyphens.

    Handles the common ", " or ", " between words (yields ", "), and the
    less common word-glued "word,word" (yields "word, word"). Any leftover
    double spaces or double commas from the substitution are collapsed.
    """
    if not text or not isinstance(text, str):
        return text
    if EM_DASH not in text and EN_DASH not in text:
        return text
    out = text
    # Case 1: ", " or ", " with spaces on both sides -> ", "
    out = out.replace(f" {EM_DASH} ", ", ").replace(f" {EN_DASH} ", ", ")
    # Case 2: " ," or " ," (dash at end of word)
    out = out.replace(f" {EM_DASH}", ",").replace(f" {EN_DASH}", ",")
    # Case 3: ", " or ", " (dash at start of word)
    out = out.replace(f"{EM_DASH} ", ", ").replace(f"{EN_DASH} ", ", ")
    # Case 4: bare dash between words like "word,word"
    out = out.replace(EM_DASH, ", ").replace(EN_DASH, ", ")
    # Cleanups: collapse ", " and stray leading ", ".
    while ", " in out:
        out = out.replace(", ", ", ")
    while "  " in out:
        out = out.replace("  ", " ")
    if out.startswith(", "):
        out = out[2:]
    return out


# ---------------------------------------------------------------------------
# Shared tone instructions appended to human-readable system prompts.
# ---------------------------------------------------------------------------

WAYLY_TONE_INSTRUCTIONS = """
Wayly voice rules, apply to every sentence you generate:

1. Do not use em dashes (\u2014) or en dashes (\u2013). Use a comma or a full stop instead. Plain hyphens in compound words like "7-day" or "care-plan" are fine.
2. Write in simple everyday Australian English. Short sentences. One idea per sentence where you can.
3. Speak to the caregiver like a helpful neighbour. Warm, plain, and calm.
4. Do not use generic AI phrasing. Avoid "delve", "furthermore", "moreover", "in conclusion", "as an AI", or hedging like "it is important to note".
5. Personalise where you can. Use the participant's first name if you have it. Refer to specific dollar figures, dates and services from the input rather than abstract summaries.
6. Do not sound corporate. Do not sound like a template. Sound like a real person who knows what they are talking about.
7. Always use the "%" symbol for percentages. Never write "percent", "percentage", or "per cent" after a number (write "18%", not "18 percent" or "18 percentage"). The word "percentage" is only acceptable when referring to the general concept without a number attached, and even then prefer rewording to use "%" where natural.
""".strip()


def append_tone_rules(system_message: str) -> str:
    """Append the Wayly tone block to a system message, once."""
    if not system_message:
        return WAYLY_TONE_INSTRUCTIONS
    if "Wayly voice rules" in system_message:
        return system_message
    return f"{system_message.rstrip()}\n\n{WAYLY_TONE_INSTRUCTIONS}"
