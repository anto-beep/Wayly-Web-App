"""PERSONA-1 Phase 0, Audit Inventory Generator.

Fact-finding pass only. Produces a reviewable inventory of every place in the
codebase that hardcodes a persona assumption about the care recipient.

Usage
-----
    cd /app && python backend/scripts/persona1_audit.py

Writes ``docs/persona-1/audit-inventory.md`` (deterministic, sorted).

This script writes **no** remediation code. It only reads the tree, greps for
the patterns defined in PERSONA-1 Phase 0 Audit Spec, classifies each hit
using heuristics, and emits the required markdown deliverables.

Coverage
--------
Frontend: ``frontend/src/**`` (.jsx, .tsx, .js, .ts)
Backend copy-bearing: ``backend/**`` (.py, .html, .yaml, .yml, .md)
Excludes: node_modules, .git, __pycache__, build, .next, dist, lock files,
docs, memory, test_reports, storage/reports (generated PDFs).
"""
from __future__ import annotations

import os
import re
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Iterable

REPO = Path("/app")
OUT_DIR = REPO / "docs" / "persona-1"
OUT_FILE = OUT_DIR / "audit-inventory.md"

# --- Directories included in the scan. --------------------------------------
SCAN_ROOTS = [
    "frontend/src",
    "backend/routes",
    "backend/prompts",
    "backend/lib",
    "backend/report_templates",
    "backend",  # top-level python files (agents.py, server.py, ...)
]

# Globs excluded from ripgrep at the CLI level.
EXCLUDES = [
    "!node_modules/**",
    "!build/**",
    "!.git/**",
    "!__pycache__/**",
    "!dist/**",
    "!.next/**",
    "!yarn.lock",
    "!package-lock.json",
    "!docs/**",
    "!memory/**",
    "!test_reports/**",
    "!test_result.md",
    "!*_PROMPT.md",
    "!backend/storage/**",
    "!backend/tests/**",
    "!backend/scripts/persona1_audit.py",  # the auditor itself grepping for its own patterns
    "!frontend/build/**",
    "!frontend/scripts/**",
]

# --- Pass 1 (high precision) patterns. --------------------------------------
PASS1_PATTERNS = [
    r"your (parent|parents|mum|mummy|mom|dad|daddy|mother|father|loved one|loved ones|grandparent|grandma|grandpa|nan|pop)\b",
    r"(parent|parents|mother|father|mum|mom|dad)'s",
    r"(caring for|looking after) (your|their|a|the) (parent|mum|mom|dad|mother|father|loved one)",
]

# --- Pass 2 (broad) patterns. Triaged by heuristics below. ------------------
PASS2_PATTERNS = [
    r"\b(loved one|loved ones)\b",
    r"\b(caring for|looking after|on behalf of)\b",
    r"\b(mum|mummy|dad|daddy)\b",  # standalone salutations
]

# --- Pass 3 (backend copy generators). --------------------------------------
PASS3_ROOTS = [
    "backend/routes",
    "backend/prompts",
    "backend/lib",
    "backend/report_templates",
    "backend/reports_routes.py",
    "backend/email_service.py",
    "backend/agents.py",
    "backend/participant_profile.py",
]

# ----------------------------------------------------------------------------
# Classification heuristics.
# ----------------------------------------------------------------------------

TIER1_AREAS_BY_PATH = [
    (re.compile(r"backend/(reports_routes|agents|routes/(lf1|ce2|statements)|prompts|lib/(lf1|dec1|ppc_v2))"), "backend copy"),
    (re.compile(r"backend/report_templates"), "PDF"),
    (re.compile(r"backend/email_service"), "email"),
    (re.compile(r"frontend/src/pages/tools/(StatementDecoder|CarePlanReview|ContributionEstimator|PriceChecker|BudgetCalculator)"), "frontend UI"),
    (re.compile(r"frontend/src/components/(lf1|dec1|ce2)"), "frontend UI"),
]

AREA_BY_PATH = [
    (re.compile(r"StatementDecoder|dec1|DEC-?1", re.I), "DEC-1"),
    (re.compile(r"CarePlanReview|CPR-?1|cpr1", re.I), "CPR-1"),
    (re.compile(r"ContributionEstimator|CE-?2|ce2", re.I), "CE-2"),
    (re.compile(r"PriceChecker|PPC-?1|ppc", re.I), "PPC-1"),
    (re.compile(r"BudgetCalc|BUD-?1|bud1", re.I), "BUD-1"),
    (re.compile(r"LetterGeneration|LF-?1|lf1|letters", re.I), "LF-1"),
    (re.compile(r"Classification|classification[- ]?self", re.I), "Classification Self-Check"),
    (re.compile(r"family[- ]?coordinator", re.I), "Family Coordinator"),
    (re.compile(r"signup|Signup", re.I), "signup"),
    (re.compile(r"Account|account|profile", re.I), "account"),
    (re.compile(r"Landing|homepage|Home\.jsx|Marketing|Features|Pricing|for-", re.I), "homepage"),
    (re.compile(r"chsp|sah-levels|articles?|Content|Guide|Blog|SEO", re.I), "content/marketing"),
    (re.compile(r"Chat\.jsx|ask[- ]?wayly", re.I), "Ask Wayly"),
    (re.compile(r"report_templates|reports_routes", re.I), "reports"),
    (re.compile(r"email_service", re.I), "email"),
    (re.compile(r"participant_profile|Onboarding", re.I), "signup"),
]

def _classify_surface(path: str) -> str:
    p = path.lower()
    if p.startswith("frontend/"):
        return "frontend UI"
    if "report_templates" in p or "pdf" in p:
        return "PDF"
    if "email_service" in p or "email" in p:
        return "email"
    if "prompts/" in p or "agents.py" in p or "ask" in p:
        return "backend copy"
    return "backend copy"

def _classify_area(path: str) -> str:
    for pattern, area in AREA_BY_PATH:
        if pattern.search(path):
            return area
    return "other"

# False-positive filters, these substrings almost always indicate technical
# usage rather than user-facing copy.
FALSE_POSITIVE_SUBSTRINGS = [
    "parentNode", "parentElement", "parentId", "parent_id", "parent id",
    "parent component", "parent route", "parent class", "parent container",
    "parent selector", "parent tree", "parent map",
    "parent=", "parent:", "parent.", "parent[", "parent(",
    "Parent(", "Parent.", "Parent[",
    "grandparent selector",
    "class ",  # e.g. "class Mother(BaseModel)"
]

def _is_false_positive(line: str) -> tuple[bool, str]:
    lower = line.lower()
    for needle in FALSE_POSITIVE_SUBSTRINGS:
        if needle.lower() in lower:
            return True, f"technical: {needle.strip()}"
    # Comments / docstrings that describe structure not addressed to user.
    stripped = line.strip()
    if stripped.startswith(("#", "//", "*", '"""', "'''")) and "your parent" not in lower and "loved one" not in lower:
        return True, "comment/docstring"
    return False, ""

# ----------------------------------------------------------------------------
# Tier classification. Tier 1 lives in empathy-critical surfaces; Tier 2 is
# labels/short strings amenable to token substitution.
# ----------------------------------------------------------------------------

TIER1_AREAS = {"DEC-1", "LF-1", "CE-2", "CPR-1", "reports", "email"}

def _classify_tier(path: str, area: str, string: str) -> tuple[str, str]:
    """Returns (classification, proposed_remediation)."""
    fp, reason = _is_false_positive(string)
    if fp:
        return "False positive", reason
    lower_path = path.lower()
    lower_str = string.lower()
    # Email surfaces are always Tier 1 (empathy-critical correspondence).
    if "email" in lower_path or "resend" in lower_path or lower_path.endswith(".html"):
        return "Tier 1", "Tier-1 variant needed (email/PDF surface)"
    # "on behalf of" outside a legal-representative context is a caregiver
    # framing assumption, treat as Tier 1 rather than Ambiguous.
    if "on behalf of" in lower_str:
        return "Tier 1", "Tier-1 variant needed ('on behalf of' framing)"
    # A raw pronoun-only ambiguity, flag for human review.
    if area == "other" and len(string.strip()) < 30:
        return "Ambiguous", "context unclear, review manually"
    if area in TIER1_AREAS:
        return "Tier 1", "Tier-1 variant needed"
    # Tier 2 candidates: short strings suitable for token substitution.
    if len(string.strip()) < 80 and any(k in string.lower() for k in ("your parent", "your loved one", "your mum", "your dad", "your mother", "your father", "parent's", "mother's", "father's")):
        return "Tier 2", "token substitution: {subject}/{subject_possessive}"
    # Long-form article/marketing prose: needs Tier-1 authored variant.
    return "Tier 1", "Tier-1 variant needed (long-form copy)"

# ----------------------------------------------------------------------------
# Workstream target based on area.
# ----------------------------------------------------------------------------

WORKSTREAM_BY_AREA = {
    "DEC-1": "F",
    "LF-1": "G",
    "CE-2": "H",
    "PPC-1": "H",
    "CPR-1": "H",
    "BUD-1": "H",
    "Classification Self-Check": "H",
    "Family Coordinator": "H",
    "signup": "C",
    "account": "H",
    "homepage": "L",
    "content/marketing": "L",
    "Ask Wayly": "I",
    "reports": "J",
    "email": "K",
    "other": "H",
}

# ----------------------------------------------------------------------------
# Ripgrep runner.
# ----------------------------------------------------------------------------

def _run_rg(patterns: list[str], roots: list[str]) -> list[tuple[str, int, str]]:
    """Return list of (path, line, string) hits."""
    cmd = ["rg", "-n", "-i", "--no-heading"]
    for p in patterns:
        cmd.extend(["-e", p])
    for glob in EXCLUDES:
        cmd.extend(["--glob", glob])
    cmd.extend(roots)
    proc = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True)
    hits: list[tuple[str, int, str]] = []
    for raw in proc.stdout.splitlines():
        # Format: path:line:content
        m = re.match(r"^([^:]+):(\d+):(.*)$", raw)
        if not m:
            continue
        path, line, content = m.group(1), int(m.group(2)), m.group(3)
        hits.append((path, line, content))
    return hits

def _dedup(hits: Iterable[tuple[str, int, str]]) -> list[tuple[str, int, str]]:
    seen: set[tuple[str, int]] = set()
    out: list[tuple[str, int, str]] = []
    for h in hits:
        key = (h[0], h[1])
        if key in seen:
            continue
        seen.add(key)
        out.append(h)
    return sorted(out, key=lambda x: (x[0], x[1]))

# ----------------------------------------------------------------------------
# Main.
# ----------------------------------------------------------------------------

def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    valid_roots = [str(REPO / r) for r in SCAN_ROOTS if (REPO / r).exists()]
    # scanned-file counter (approx; used for coverage confirmation).
    scanned = 0
    for r in valid_roots:
        for _root, _dirs, files in os.walk(r):
            if any(seg in _root for seg in ("__pycache__", "/build/", "/.git/", "node_modules")):
                continue
            scanned += len(files)

    pass1 = _run_rg(PASS1_PATTERNS, [str(REPO / r) for r in SCAN_ROOTS if (REPO / r).exists()])
    pass2 = _run_rg(PASS2_PATTERNS, [str(REPO / r) for r in SCAN_ROOTS if (REPO / r).exists()])
    pass3_roots = [str(REPO / r) for r in PASS3_ROOTS if (REPO / r).exists()]
    pass3_patterns = [r"\b(he|she|him|her|his|hers)\b"]
    pass3 = _run_rg(pass3_patterns, pass3_roots) if pass3_roots else []

    combined = _dedup(list(pass1) + list(pass2) + list(pass3))

    rows: list[dict] = []
    ambig: list[dict] = []
    counts_by_surface: Counter[str] = Counter()
    counts_by_area: Counter[str] = Counter()
    counts_by_classification: Counter[str] = Counter()
    fp_reasons: Counter[str] = Counter()

    for idx, (path, line, string) in enumerate(combined, start=1):
        rel = os.path.relpath(path, REPO)
        surface = _classify_surface(rel)
        area = _classify_area(rel)
        classification, proposed = _classify_tier(rel, area, string)
        workstream = WORKSTREAM_BY_AREA.get(area, "H")

        counts_by_surface[surface] += 1
        counts_by_area[area] += 1
        counts_by_classification[classification] += 1
        if classification == "False positive":
            fp_reasons[proposed] += 1

        row = {
            "id": f"AUD-{idx:04d}",
            "file": rel,
            "line": line,
            "string": string.strip()[:200],
            "surface": surface,
            "area": area,
            "persona_assumption": _persona_assumption(string),
            "classification": classification,
            "proposed": proposed,
            "workstream": workstream,
            "notes": "",
        }
        rows.append(row)
        if classification == "Ambiguous":
            ambig.append(row)

    # --- Emit markdown. ------------------------------------------------------
    md: list[str] = []
    md.append("# PERSONA-1 Phase 0, Audit Inventory\n")
    md.append("**Status:** Audit gate. Fact-finding only. **No remediation code written.**\n")
    md.append("**Generator:** `backend/scripts/persona1_audit.py`\n\n")

    md.append("## Coverage\n")
    md.append("Scan roots:\n")
    for r in SCAN_ROOTS:
        exists = "✓" if (REPO / r).exists() else "✗"
        md.append(f"- {exists} `{r}`\n")
    md.append(f"\nFiles walked (approx, incl. non-code): **{scanned}**  \n")
    md.append(f"Total hits after dedup: **{len(rows)}**\n\n")
    md.append("Excluded globs: `node_modules`, `.git`, `__pycache__`, `build`, `dist`, `.next`, lock files, `docs`, `memory`, `test_reports`, `backend/storage`, `backend/tests`.\n\n")

    md.append("### Confirmed searched surfaces\n")
    md.append("- Frontend UI (React `.jsx/.tsx/.js/.ts` under `frontend/src`)\n")
    md.append("- Backend copy generators (`backend/agents.py`, `backend/reports_routes.py`, `backend/routes/*.py`)\n")
    md.append("- LF-1 letter templates (`backend/lib/lf1.py`, `backend/routes/lf1.py`)\n")
    md.append("- PDF templates (`backend/report_templates/*.html`)\n")
    md.append("- Resend email templates (`backend/email_service.py`)\n")
    md.append("- Ask Wayly prompt (search across backend prompts + `agents.py`)\n")
    md.append("- Marketing pages (`frontend/src/pages/Landing.jsx`, `Features.jsx`, `/for-*`, article content)\n\n")

    md.append("## Counts\n")
    md.append("**By classification**\n\n")
    for k, v in counts_by_classification.most_common():
        md.append(f"- {k}: {v}\n")
    md.append("\n**By surface**\n\n")
    for k, v in counts_by_surface.most_common():
        md.append(f"- {k}: {v}\n")
    md.append("\n**By area (top 15)**\n\n")
    for k, v in counts_by_area.most_common(15):
        md.append(f"- {k}: {v}\n")
    if fp_reasons:
        md.append("\n**False-positive reasons**\n\n")
        for k, v in fp_reasons.most_common(10):
            md.append(f"- {k}: {v}\n")
    md.append("\n")

    md.append("## Ambiguity Shortlist\n")
    if not ambig:
        md.append("_None flagged. All hits classified as Tier 1, Tier 2, or False positive._\n\n")
    else:
        md.append("These hits require Antony's decision before Workstream B begins. Please answer inline.\n\n")
        for i, r in enumerate(ambig[:60], start=1):
            md.append(f"{i}. `{r['file']}:{r['line']}`, `{r['string'][:140]}`  \n")
            md.append(f"   Decision needed: {r['proposed']}\n\n")
        if len(ambig) > 60:
            md.append(f"_+ {len(ambig) - 60} more ambiguous hits (see full table below)._\n\n")

    md.append("## Inventory Table\n\n")
    md.append("| id | file | line | string | surface | area | persona_assumption | classification | proposed_remediation | workstream | notes |\n")
    md.append("|---|---|---|---|---|---|---|---|---|---|---|\n")
    for r in rows:
        s = r["string"].replace("|", "\\|").replace("\n", " ")
        pa = r["persona_assumption"].replace("|", "\\|")
        md.append(
            f"| {r['id']} | `{r['file']}` | {r['line']} | `{s}` | {r['surface']} | {r['area']} | {pa} | {r['classification']} | {r['proposed']} | {r['workstream']} | {r['notes']} |\n"
        )

    md.append("\n## What Not To Do (from spec)\n")
    md.append("- No copy-token registry scaffolding here. That is Workstream D.\n")
    md.append("- No copy changes, no variable renames, no data-model edits.\n")
    md.append("- No guessing pronouns or gender. Anything unclear is flagged as Ambiguous.\n")

    OUT_FILE.write_text("".join(md), encoding="utf-8")
    print(f"Wrote {OUT_FILE}, {len(rows)} rows, {len(ambig)} ambiguous.")
    return 0


def _persona_assumption(line: str) -> str:
    lower = line.lower()
    if "your parent" in lower or "parent's" in lower:
        return "caregiver, care recipient = parent"
    if "your mum" in lower or "mum's" in lower or "your mummy" in lower:
        return "caregiver, care recipient = mother/mum"
    if "your dad" in lower or "dad's" in lower or "your daddy" in lower:
        return "caregiver, care recipient = father/dad"
    if "your mother" in lower or "mother's" in lower:
        return "caregiver, care recipient = mother"
    if "your father" in lower or "father's" in lower:
        return "caregiver, care recipient = father"
    if "loved one" in lower:
        return "caregiver, care recipient = 'loved one'"
    if "caring for" in lower or "looking after" in lower:
        return "caregiver-directed phrasing"
    if "on behalf of" in lower:
        return "third-party framing (representative)"
    return "hardcoded pronoun or reference to care recipient"


if __name__ == "__main__":
    sys.exit(main())
