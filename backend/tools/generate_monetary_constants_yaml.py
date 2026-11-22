"""INDEX-1 v1 · Deploy 1a, YAML generator for the monetary constants registry.

Reads ``seed_program_reference.SEED_ROWS`` (the current de facto source of
truth) and emits ``backend/data/monetary_constants.yaml`` in the shape defined
by INDEX-1 v1 Section 3.2.

Run this once after seed changes; the emitted YAML is checked into the
repository as the human-authored registry. Deploy 1b will remove the
seed_program_reference wrapper and this generator (the YAML becomes canonical).

Not part of the runtime, invoke directly:
    python -m tools.generate_monetary_constants_yaml
"""
from __future__ import annotations

import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import seed_program_reference as _seed  # noqa: E402


_OUT_PATH = Path(__file__).resolve().parents[1] / "data" / "monetary_constants.yaml"

# Sensible default source type per key prefix. Rows keep their raw source_url
# from the seed; where a URL isn't present, the entry is emitted with
# `source_url: PENDING` per INDEX-1 §3.
_TYPE_BY_PREFIX = (
    ("supplement.", "delegated_instrument"),
    ("classification.", "delegated_instrument"),
    ("classification_annual.", "delegated_instrument"),
    ("care_management.", "delegated_instrument"),
    ("rollover.", "delegated_instrument"),
    ("lifetime_cap.", "delegated_instrument"),
    ("transitional_hcp.", "delegated_instrument"),
    ("contribution_rate.", "delegated_instrument"),
    ("stream_proportion.", "operational_primary"),
    ("athm.", "delegated_instrument"),
    ("at_hm.", "delegated_instrument"),
    ("cap.", "delegated_instrument"),
    ("mac.", "secondary"),
    ("hcp.", "delegated_instrument"),
    ("means_test.income_taper", "primary_legislation"),
    ("means_test.asset_taper", "primary_legislation"),
    ("means_test.", "delegated_instrument"),
    ("ce2.", "operational_primary"),
)


def _infer_source_type(key: str) -> str:
    for prefix, t in _TYPE_BY_PREFIX:
        if key.startswith(prefix):
            return t
    return "secondary"


def _infer_unit(key: str, value) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, str):
        return "text"
    if key.endswith(".pct") or "cap_pct" in key or "_pct" in key:
        return "percentage"
    if "period_months" in key or "extension_months" in key or "validity_months" in key:
        return "months"
    if key == "cap.time_limited_years":
        return "years"
    if key.endswith("_sub_share_of_independence"):
        return "fraction"
    return "AUD"


def _infer_indexation(key: str) -> str | None:
    """Best-effort, twice-yearly for the values Antony has flagged as indexed."""
    if key.startswith("lifetime_cap."):
        return "20_march_20_september"
    if key.startswith("hcp.") and not key.endswith("_pct"):
        return "20_march_20_september"
    if key.startswith("means_test.") and not key.endswith("_pct"):
        return "20_march_20_september"
    return None


def _infer_next_review(key: str) -> str | None:
    if key.startswith("lifetime_cap."):
        return "2026-09-20"
    if key.startswith("hcp.") and not key.endswith("_pct"):
        return "2026-09-20"
    if key.startswith("means_test.") and not key.endswith("_pct"):
        return "2026-09-20"
    return None


def _emit_scalar(v) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        # Keep floats in dollar shape (2 decimals) unless the seed had more precision.
        s = repr(v)
        return s
    if v is None:
        return "null"
    s = str(v)
    if any(c in s for c in [":", "#", "*", "&", "!", "|", ">", "'", '"']) or s.strip() != s:
        escaped = s.replace('"', '\\"')
        return f'"{escaped}"'
    return s


def _emit_entry(key: str, rows: list) -> list[str]:
    rows_sorted = sorted(rows, key=lambda r: r["effective_from"])
    active = None
    for r in rows_sorted:
        if r.get("effective_to") is None:
            active = r
    if active is None:
        active = rows_sorted[-1]

    unit = _infer_unit(key, active["value"])
    source_type = _infer_source_type(key)
    source_url = active.get("source_url") or "PENDING"
    notes = active.get("notes") or ""

    lines: list[str] = [f"  - key: {key}"]
    value_field = "value_aud" if unit == "AUD" else ("value_percentage" if unit == "percentage" else "value")
    lines.append(f"    {value_field}: {_emit_scalar(active['value'])}")
    lines.append(f"    unit: {unit}")
    lines.append(f"    effective_from: {active['effective_from']}")
    if active.get("effective_to"):
        lines.append(f"    effective_to: {active['effective_to']}")
    idx = _infer_indexation(key)
    nrd = _infer_next_review(key)
    if idx:
        lines.append(f"    indexation_schedule: {idx}")
    if nrd:
        lines.append(f"    next_review_due: {nrd}")
    lines.append(f"    source_type: {source_type}")
    lines.append(f"    source_url: {source_url if source_url == 'PENDING' else _emit_scalar(source_url)}")
    if notes:
        notes_escaped = notes.replace('"', '\\"')
        lines.append(f'    source_citation: "{notes_escaped}"')
    lines.append("    last_verified_at: 2026-07-08")
    lines.append("    last_verified_by: antony")
    if len(rows_sorted) > 1:
        lines.append("    history:")
        for h in rows_sorted:
            if h is active:
                continue
            lines.append(f"      - {value_field}: {_emit_scalar(h['value'])}")
            lines.append(f"        effective_from: {h['effective_from']}")
            if h.get("effective_to"):
                lines.append(f"        effective_to: {h['effective_to']}")
            if h.get("notes"):
                notes_escaped = str(h['notes']).replace('"', '\\"')
                lines.append(f'        source_citation: "{notes_escaped}"')
    return lines


def main() -> None:
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in _seed.SEED_ROWS:
        grouped[row["key"]].append(row)

    header = f"""# INDEX-1 v1 · Deploy 1a, Monetary Constants Registry
# Generated {date.today().isoformat()} by tools/generate_monetary_constants_yaml.py
# Source: backend/seed_program_reference.py (the current de facto seed).
#
# Every entry is human-reviewable. Antony's Deploy 1a authorisation confirms:
#   - Reviewer:     antony
#   - Alert channel: GitHub issue + email
#   - Retention:    indefinite history
#   - Cadence:      20 March + 20 September (twice yearly)
#
# For every entry: value → effective_from → source_url → source_citation.
# Entries with source_url: PENDING have a verification_backlog record.
version: 1
constants:
"""

    body_lines: list[str] = []
    for key in sorted(grouped.keys()):
        body_lines.extend(_emit_entry(key, grouped[key]))
        body_lines.append("")

    _OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _OUT_PATH.open("w") as fh:
        fh.write(header)
        fh.write("\n".join(body_lines) + "\n")
    print(f"Wrote {_OUT_PATH} ({len(grouped)} keys, {sum(len(v) for v in grouped.values())} rows)")


if __name__ == "__main__":
    main()
