"""Compute the top wins a caregiver has racked up during their Wayly trial.

Used by the trial-lifecycle scheduler to inject personalised "look what
you've achieved" bullets into the day-5 and day-6 nudge emails.

A "win" is any qualifying activity across the trial window:
  - Statement decoded (from ``statements`` where processed=True)
  - Invoice checked (from ``invoices``)
  - Money flagged as questions-to-raise or higher (sum of ``$`` on Tier 3/4
    invoice findings, a proxy for money the caregiver may claw back)
  - Care Plan reviewed (``care_plan_reviews``)
  - Letter drafted (``letters`` or ``letter_drafts``)
  - Contribution estimate saved (``contribution_estimates``)
  - Provider price check saved (``ppc_checks``)
  - Household participants onboarded (``participants``)

Returns at most 3 wins, sorted by "narrative punch" (money-flagged first,
then counts). Each win is a dict with ``label`` and ``value_display``.
"""
from __future__ import annotations

from typing import Any, Dict, List


async def _safe_count(db, collection: str, query: dict) -> int:
    try:
        coll = getattr(db, collection, None)
        if coll is None:
            return 0
        return await coll.count_documents(query)
    except Exception:
        return 0


async def _sum_flagged_money(db, user_id: str) -> float:
    """Sum ``$`` on Tier 3+/4 invoice findings for a user's invoices."""
    total = 0.0
    try:
        cur = db.invoices.find(
            {"user_id": user_id, "state": "active"},
            {"_id": 0, "reconciliation": 1},
        )
        async for doc in cur:
            recon = doc.get("reconciliation") or {}
            for f in recon.get("findings") or []:
                if int(f.get("tier") or 0) >= 3:
                    total += float((f.get("observed") or {}).get("delta") or 0)
    except Exception:
        return 0.0
    return abs(round(total, 2))


def _fmt_aud(v: float) -> str:
    return f"${v:,.2f}"


async def compute_trial_wins(db, user: dict) -> List[Dict[str, Any]]:
    """Return up to 3 wins for the given user. Empty list if the user
    hasn't done anything meaningful yet, the caller is expected to fall
    back to generic copy in that case."""
    user_id = user.get("id") or user.get("user_id")
    household_id = user.get("household_id")

    candidates: List[Dict[str, Any]] = []

    # 1. Money flagged is the highest-punch win, leads the list if present.
    flagged = await _sum_flagged_money(db, user_id)
    if flagged >= 1.0:
        candidates.append({
            "kind": "flagged_money",
            "label": f"You flagged {_fmt_aud(flagged)} of billing worth questioning",
            "weight": 100 + flagged,
        })

    # 2. Statements decoded
    stmt_count = await _safe_count(
        db, "statements", {"user_id": user_id, "processed": True},
    )
    if stmt_count == 0 and household_id:
        stmt_count = await _safe_count(
            db, "statements", {"household_id": household_id, "processed": True},
        )
    if stmt_count > 0:
        candidates.append({
            "kind": "statements_decoded",
            "label": f"You decoded {stmt_count} statement{'s' if stmt_count != 1 else ''} line by line",
            "weight": 60 + stmt_count,
        })

    # 3. Invoices checked
    invoice_count = await _safe_count(
        db, "invoices", {"user_id": user_id, "state": "active"},
    )
    if invoice_count > 0:
        candidates.append({
            "kind": "invoices_checked",
            "label": f"You ran {invoice_count} invoice{'s' if invoice_count != 1 else ''} through the Invoice Checker",
            "weight": 55 + invoice_count,
        })

    # 4. Care plans reviewed
    cp_count = await _safe_count(
        db, "care_plan_reviews", {"user_id": user_id},
    )
    if cp_count > 0:
        candidates.append({
            "kind": "care_plans_reviewed",
            "label": f"You reviewed {cp_count} care plan{'s' if cp_count != 1 else ''} for gaps",
            "weight": 40 + cp_count,
        })

    # 5. Letters drafted
    letter_count = 0
    for coll in ("letters", "letter_drafts"):
        letter_count += await _safe_count(db, coll, {"user_id": user_id})
    if letter_count > 0:
        candidates.append({
            "kind": "letters_drafted",
            "label": f"You drafted {letter_count} letter{'s' if letter_count != 1 else ''} to your provider",
            "weight": 35 + letter_count,
        })

    # 6. Contribution estimates saved
    est_count = await _safe_count(db, "contribution_estimates", {"user_id": user_id})
    if est_count > 0:
        candidates.append({
            "kind": "contribution_estimates",
            "label": f"You mapped out {est_count} contribution scenario{'s' if est_count != 1 else ''}",
            "weight": 30 + est_count,
        })

    # 7. Participants onboarded (household)
    if household_id:
        part_count = await _safe_count(
            db, "participants", {"household_id": household_id, "status": {"$in": ["ACTIVE", None]}},
        )
        if part_count > 0:
            candidates.append({
                "kind": "participants_onboarded",
                "label": f"You set up {part_count} participant profile{'s' if part_count != 1 else ''}",
                "weight": 25 + part_count,
            })

    candidates.sort(key=lambda w: -w["weight"])
    return candidates[:3]


def wins_to_html(wins: List[Dict[str, Any]]) -> str:
    """Render the wins as a plain-styled HTML unordered list. Returns an
    empty string if the wins list is empty so the caller can fall back
    to generic copy."""
    if not wins:
        return ""
    items = "".join(f"<li style='margin:6px 0'>{w['label']}</li>" for w in wins)
    return (
        "<p style='margin:16px 0 6px'><strong>Here's what you've already unlocked "
        "on Wayly:</strong></p>"
        f"<ul style='margin:0 0 12px 20px;padding:0;color:#0F5648'>{items}</ul>"
    )
