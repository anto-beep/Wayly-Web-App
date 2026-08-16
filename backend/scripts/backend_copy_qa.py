#!/usr/bin/env python3
"""Wayly backend copy-QA gate (Dec 2026 refit §1.4 / §11).

Scans backend Python source for user-facing copy violations: em-dashes,
en-dashes, banned vocabulary, and "Care-plan Changes" lowercase variants.

We don't try to parse every string literal, that's brittle and over-fits the
AST. Instead, we look at LINES that are clearly user-facing:
  - HTTPException(detail=..., ...)
  - Lines inside any *.py file inside / containing the strings
        "email_tool_result", "send_email", "body_html=", "tool_name=",
        "summary=", "message=", "Q: ", "A: "
  - All lines in /app/backend/lib/pdf_reports.py (PDF reports → user reads)
  - All lines in /app/backend/email_service.py

Anything that looks user-facing is checked against the rule set.

Run:  python3 scripts/backend_copy_qa.py [--fix-em-dashes]
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# ---- rule set ---------------------------------------------------------
# UI-2 Rule 2.2, no em/en dashes in user-facing copy.
EM_DASH_RE = re.compile(r"[,]")           # em + en
# UI-2 Rule 2.7, banned vocabulary (extended from the original 2 to the full 10).
BANNED_WORDS = re.compile(
    r"\b(navigate|unlock|leverage|seamless|embark|delve|robust|harness|empower|percentage|per ?cent)\b",
    re.IGNORECASE,
)
LOWERCASE_CAREPLAN = re.compile(r"[Cc]are-?plan changes(?! [a-z]+)")  # "care-plan changes" / "Care-plan changes"
# UI-2 Rule 2.1, no "you're" or "we'll" in user-facing copy.
CONTRACTION_RE = re.compile(r"\b(?:[Yy]ou'?re|[Ww]e'?ll)\b")
# UI-2 Rule 2.3, never apostrophe on "frontend" or "backend".
FRONTBACK_APOS_RE = re.compile(r"\b(?:front|back)-?end'?s\b", re.IGNORECASE)
# UI-2 Rule 2.6, no ISO YYYY-MM month rendering in notification/email bodies.
MONTH_ISO_RE = re.compile(r"\{month_iso\}|\b(19|20)\d{2}-(0[1-9]|1[0-2])\b(?!-)")
# UI-2 Rule 2.5, no "$X YY cents" or "$X.YY cents" broken currency renderings.
BAD_CURRENCY_RE = re.compile(r"\$\d+(?: \d+)+ ?cents?\b|\$\d+\.\d+ cents?\b|\$\d+ dollars\b")

# Lines that are obviously user-facing.
USER_FACING_MARKERS = (
    "HTTPException",
    "detail=",
    "body_html=",
    "tool_name=",
    "headline=",
    "summary=",
    "message=",
    "subject=",
    "Q:",
    "A:",
    "system_prompt",     # LLM system prompts (brief §0.3 / §11 treat these as user-facing)
    "SYSTEM_PROMPT",
    "user_prompt",
    "instructions=",
)

# Files where every line is treated as user-facing.
# UI-2 Rule 9.10, extended to cover every email + notification template.
ALWAYS_USER_FACING = {
    "lib/pdf_reports.py",
    "lib/pdf_branding.py",
    "email_service.py",
    "digest_service.py",
    "smoke_status.py",
    "agents.py",   # LLM prompts (shape user-facing answers)
    "scenario_engine/alerts.py",   # notification bodies
    "scenario_engine/workflows.py",  # guided workflow copy
    "document_extract.py",  # OCR error messages users see
}

# Files to skip entirely (tests, dev scripts, migrations).
SKIP_DIRS = {"tests", "__pycache__", "venv", "node_modules", "scripts"}


def is_user_facing_line(line: str) -> bool:
    return any(m in line for m in USER_FACING_MARKERS)


def scan_file(path: Path, root: Path, fix_em_dashes: bool = False) -> list[dict]:
    rel = str(path.relative_to(root))
    if any(d in rel.split("/") for d in SKIP_DIRS):
        return []
    text = path.read_text(encoding="utf-8")
    lines = text.split("\n")
    always_check = any(rel.endswith(s) for s in ALWAYS_USER_FACING)
    hits: list[dict] = []
    for i, line in enumerate(lines, start=1):
        s = line.lstrip()
        if s.startswith("#") or s.startswith('"""') or s.startswith("'''"):
            continue
        if not always_check and not is_user_facing_line(line):
            continue
        if EM_DASH_RE.search(line):
            hits.append({"file": rel, "line": i, "rule": "em_dash", "snippet": line.strip()})
        if BANNED_WORDS.search(line):
            hits.append({"file": rel, "line": i, "rule": "banned_word", "snippet": line.strip()})
        if LOWERCASE_CAREPLAN.search(line):
            hits.append({"file": rel, "line": i, "rule": "careplan_case", "snippet": line.strip()})
        if CONTRACTION_RE.search(line):
            hits.append({"file": rel, "line": i, "rule": "contraction_youre_well", "snippet": line.strip()})
        if FRONTBACK_APOS_RE.search(line):
            hits.append({"file": rel, "line": i, "rule": "frontend_backend_apostrophe", "snippet": line.strip()})
        # month_iso rendering is only a violation in the "ALWAYS" set (i.e.
        # user-facing bodies), internal audit trails may keep the ISO form.
        # Skip dedupe_key / source={"month": ...} tuples, those are internal.
        if always_check and MONTH_ISO_RE.search(line) and "f\"" in line \
                and "dedupe_key" not in line and "\"month\"" not in line:
            hits.append({"file": rel, "line": i, "rule": "raw_month_iso", "snippet": line.strip()})
        if BAD_CURRENCY_RE.search(line):
            hits.append({"file": rel, "line": i, "rule": "broken_currency", "snippet": line.strip()})
    if fix_em_dashes and hits:
        # Replace em/en dashes ON user-facing lines only. Preserve indentation.
        new_lines = []
        for i, line in enumerate(lines, start=1):
            if any(h["line"] == i and h["rule"] == "em_dash" for h in hits):
                new_lines.append(EM_DASH_RE.sub(",", line))
            else:
                new_lines.append(line)
        path.write_text("\n".join(new_lines), encoding="utf-8")
    return hits


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--fix-em-dashes", action="store_true", help="Auto-replace em/en dashes with ', '")
    ap.add_argument("--root", default="/app/backend", help="Backend root")
    args = ap.parse_args()

    root = Path(args.root)
    all_hits: list[dict] = []
    files = sorted(root.rglob("*.py"))
    for f in files:
        hits = scan_file(f, root, fix_em_dashes=args.fix_em_dashes)
        all_hits.extend(hits)

    print(f"Wayly backend copy-QA: scanned {len(files)} files under {root}")
    if not all_hits:
        print("\n✓ No violations found.")
        return 0

    by_rule: dict[str, list[dict]] = {}
    for h in all_hits:
        by_rule.setdefault(h["rule"], []).append(h)
    print(f"\n✗ {len(all_hits)} violation(s):")
    for rule, items in by_rule.items():
        print(f"\n  {rule} ({len(items)})")
        for it in items[:25]:
            print(f"    {it['file']}:{it['line']}  {it['snippet'][:140]}")
        if len(items) > 25:
            print(f"    ... and {len(items) - 25} more")
    return 1


if __name__ == "__main__":
    sys.exit(main())
