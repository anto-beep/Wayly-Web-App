"""LOOP-1 v1.1 add-ons.

Ships four features on top of the LOOP-1 v1 case framework:
  1. Cross-case pattern detection    (3+ open cases of the same type across an account)
  2. Case assignee UI backend         (assignee_user_id + household member roster)
  3. LCA-1 October Digest             (nightly sweep + weekly email of reclassification candidates)
  4. Case reminder nudges             (SLA-breach detector for letter_awaiting_reply cases)

All endpoints under /api/loop; all gated by the existing LOOP1_CASES_ENABLED flag.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel

logger = logging.getLogger("wayly.loop1.addons")

addons_router = APIRouter(prefix="/loop", tags=["loop1-addons"])

_db = None
_user_dep = None
_core1_assert_access = None
_loop1_open_case = None                     # from loop1
_loop1_scan_participant = None              # from loop1
_loop1_lca1_scan_for_participant = None     # from loop1
_send_email = None                          # optional email sender


def init_addons(*, db, user_dep, core1_assert_access, loop1_open_case,
                loop1_scan_participant, loop1_lca1_scan_for_participant,
                send_email=None):
    global _db, _user_dep, _core1_assert_access, _loop1_open_case
    global _loop1_scan_participant, _loop1_lca1_scan_for_participant, _send_email
    _db = db
    _user_dep = user_dep
    _core1_assert_access = core1_assert_access
    _loop1_open_case = loop1_open_case
    _loop1_scan_participant = loop1_scan_participant
    _loop1_lca1_scan_for_participant = loop1_lca1_scan_for_participant
    _send_email = send_email


def _flag_enabled() -> bool:
    return os.environ.get("LOOP1_CASES_ENABLED", "1") != "0"


async def _assert_flag():
    if not _flag_enabled():
        raise HTTPException(status_code=404, detail="Not found")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt) -> Optional[str]:
    if not dt:
        return None
    if isinstance(dt, str):
        return dt
    return dt.astimezone(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# 1. Cross-case pattern detection
# ---------------------------------------------------------------------------

PATTERN_THRESHOLD = 3  # 3+ open cases of same type triggers a pattern


async def _accessible_participant_ids(user: dict) -> List[str]:
    ids: List[str] = []
    uid = user.get("id")
    acct_id = None
    if uid:
        member = await _db.account_members.find_one({"user_id": uid, "status": "ACTIVE"}, {"_id": 0, "account_id": 1})
        if member:
            acct_id = member.get("account_id")
        if not acct_id:
            acct = await _db.accounts.find_one({"owner_user_id": uid}, {"_id": 0, "id": 1})
            if acct:
                acct_id = acct.get("id")
    hid = user.get("household_id")
    q_or = []
    if acct_id:
        q_or.append({"account_id": acct_id})
    if hid:
        q_or.append({"household_id": hid})
    if not q_or:
        return []
    async for p in _db.participants.find(
        {"$or": q_or, "is_archived": {"$ne": True}, "status": {"$ne": "REMOVED"}},
        {"_id": 0, "id": 1, "first_name": 1, "name": 1, "preferred_name": 1},
    ):
        ids.append(p["id"])
    return ids


PATTERN_HEADLINES = {
    "invoice_issue_review": "Multiple invoice issues in your household, worth checking your provider agreement.",
    "statement_anomaly_ready": "Multiple statement anomalies detected, a systemic billing issue may be at play.",
    "letter_awaiting_reply": "Several letters are waiting on replies, consider a follow-up plan.",
    "price_over_reference": "Multiple services above reference price, comparing providers may save on contributions.",
    "care_plan_review_findings": "Multiple care plans need review, a household re-plan session may help.",
    "reclassification_review": "Multiple participants may be eligible for reclassification before 1 October.",
}


@addons_router.get("/patterns")
async def list_patterns(request: Request):
    """Detect patterns across the caller's accessible participants.

    A pattern fires when >= PATTERN_THRESHOLD open cases of the same
    `case_type` exist across the household/account. Returns a list of
    pattern alerts each of which references the underlying case ids.
    """
    await _assert_flag()
    user = await _user_dep(request)
    pids = await _accessible_participant_ids(user)
    if not pids:
        return {"patterns": []}

    # Aggregate open cases by case_type across all accessible participants
    cur = _db.cases.aggregate([
        {"$match": {
            "participant_id": {"$in": pids},
            "status": {"$in": ["open", "in_progress", "waiting_on_provider"]},
        }},
        {"$group": {
            "_id": "$case_type",
            "count": {"$sum": 1},
            "case_ids": {"$push": "$id"},
            "participant_ids": {"$addToSet": "$participant_id"},
            "severities": {"$push": "$severity"},
        }},
        {"$match": {"count": {"$gte": PATTERN_THRESHOLD}}},
        {"$sort": {"count": -1}},
    ])

    patterns = []
    # Fetch the caller's active dismissals
    try:
        from routes.loop1_extras import get_dismissed_case_types_for_user
        dismissed = await get_dismissed_case_types_for_user(_db, user.get("id"))
    except Exception:
        dismissed = set()
    async for row in cur:
        case_type = row["_id"]
        if case_type in dismissed:
            continue
        sev_counts = {s: row["severities"].count(s) for s in set(row["severities"])}
        # Highest severity wins for the pattern chip
        pattern_sev = "high" if sev_counts.get("high", 0) else ("medium" if sev_counts.get("medium", 0) else "low")
        patterns.append({
            "case_type": case_type,
            "count": row["count"],
            "participant_count": len(row["participant_ids"]),
            "case_ids": row["case_ids"][:20],
            "severity": pattern_sev,
            "headline": PATTERN_HEADLINES.get(case_type, f"{row['count']} open {case_type.replace('_',' ')} cases across your household."),
        })
    return {"patterns": patterns, "threshold": PATTERN_THRESHOLD}


# ---------------------------------------------------------------------------
# 2. Case assignee UI backend
# ---------------------------------------------------------------------------


@addons_router.get("/cases/{cid}/assignee-candidates")
async def assignee_candidates(cid: str, request: Request):
    """Return the household members that can be assigned to a case."""
    await _assert_flag()
    user = await _user_dep(request)
    c = await _db.cases.find_one({"id": cid}, {"_id": 0, "participant_id": 1})
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    await _core1_assert_access(user, c["participant_id"])
    p = await _db.participants.find_one({"id": c["participant_id"]}, {"_id": 0, "household_id": 1, "account_id": 1})
    hid = p.get("household_id") if p else None
    acct_id = p.get("account_id") if p else None

    seen = set()
    candidates: List[Dict[str, Any]] = []
    if acct_id:
        async for m in _db.account_members.find(
            {"account_id": acct_id, "status": "ACTIVE"},
            {"_id": 0, "user_id": 1, "name": 1, "email": 1, "role": 1},
        ):
            uid = m.get("user_id")
            if not uid or uid in seen:
                continue
            seen.add(uid)
            candidates.append({"user_id": uid, "name": m.get("name"), "email": m.get("email"), "role": (m.get("role") or "caregiver").lower()})
    if hid:
        async for u in _db.users.find({"household_id": hid}, {"_id": 0, "id": 1, "name": 1, "email": 1, "role": 1}):
            if u.get("id") in seen:
                continue
            seen.add(u.get("id"))
            candidates.append({"user_id": u.get("id"), "name": u.get("name"), "email": u.get("email"), "role": u.get("role") or "caregiver"})
    return {"candidates": candidates}


# ---------------------------------------------------------------------------
# 3. LCA-1 October Digest, nightly sweep + weekly email
# ---------------------------------------------------------------------------


class LCA1SweepBody(BaseModel):
    dry_run: bool = False
    limit: int = 500


@addons_router.post("/lca1/sweep")
async def lca1_sweep(body: LCA1SweepBody, request: Request):
    """Run the LCA-1 reclassification scanner across every participant the
    caller can access (or every participant if the caller is staff).

    Idempotent, the LCA-1 scanner uses dedupe_key=`reclassification_review:oct2026:{pid}`
    so re-runs open zero new cases.

    Returns a summary of the sweep.
    """
    await _assert_flag()
    user = await _user_dep(request)

    # If staff, sweep everyone. Else scope.
    is_staff = (user.get("role") or "").lower() in ("staff", "admin", "super_admin")
    if is_staff:
        pids: List[str] = []
        async for p in _db.participants.find(
            {"is_archived": {"$ne": True}, "status": {"$ne": "REMOVED"}, "classification": {"$in": [2, 3]}},
            {"_id": 0, "id": 1},
        ).limit(body.limit):
            pids.append(p["id"])
    else:
        pids = await _accessible_participant_ids(user)

    opened = 0
    already_open = 0
    no_signal = 0
    per_participant: List[Dict[str, Any]] = []

    for pid in pids:
        # Skip if a reclassification_review case is already open (dedupe by key)
        existing = await _db.cases.find_one({
            "participant_id": pid,
            "dedupe_key": f"reclassification_review:oct2026:{pid}",
            "status": {"$in": ["open", "in_progress", "waiting_on_provider"]},
        }, {"_id": 0, "id": 1})
        if existing:
            already_open += 1
            per_participant.append({"participant_id": pid, "outcome": "already_open", "case_id": existing["id"]})
            continue
        if body.dry_run:
            # Just check signal
            p = await _db.participants.find_one({"id": pid}, {"_id": 0})
            band = (p or {}).get("classification") or (p or {}).get("classification_level")
            if band in (2, 3):
                per_participant.append({"participant_id": pid, "outcome": "would_scan"})
            continue
        result = await _loop1_lca1_scan_for_participant(pid)
        if result:
            opened += 1
            per_participant.append({"participant_id": pid, "outcome": "opened", "case_id": result.get("id")})
        else:
            no_signal += 1
            per_participant.append({"participant_id": pid, "outcome": "no_signal"})

    return {
        "swept": len(pids),
        "opened": opened,
        "already_open": already_open,
        "no_signal": no_signal,
        "dry_run": body.dry_run,
        "sample": per_participant[:30],
    }


class LCA1DigestBody(BaseModel):
    to_email: Optional[str] = None  # if None, send to the current user
    dry_run: bool = True


@addons_router.post("/lca1/digest")
async def lca1_digest(body: LCA1DigestBody, request: Request):
    """Send a weekly digest email of open reclassification_review cases in
    the caller's account. `dry_run` returns the digest body without sending.
    """
    await _assert_flag()
    user = await _user_dep(request)
    pids = await _accessible_participant_ids(user)
    if not pids:
        return {"sent": False, "reason": "no_accessible_participants"}

    # Collect open reclassification cases
    cases = []
    async for c in _db.cases.find(
        {
            "participant_id": {"$in": pids},
            "case_type": "reclassification_review",
            "status": {"$in": ["open", "in_progress", "waiting_on_provider"]},
        },
        {"_id": 0},
    ).sort("created_at", -1):
        cases.append(c)

    if not cases:
        return {"sent": False, "reason": "no_reclassification_cases"}

    # Enrich with participant names
    p_by_id: Dict[str, dict] = {}
    async for p in _db.participants.find({"id": {"$in": list({c["participant_id"] for c in cases})}}, {"_id": 0, "id": 1, "first_name": 1, "name": 1, "preferred_name": 1}):
        p_by_id[p["id"]] = p

    def _name(pid: str) -> str:
        p = p_by_id.get(pid, {})
        return p.get("preferred_name") or p.get("name") or p.get("first_name") or "your loved one"

    # Build a plain-text + minimal HTML digest
    lines = []
    html_rows = []
    for c in cases:
        n = _name(c["participant_id"])
        sig = (c.get("metadata") or {}).get("lca1_signal", {})
        ratio_pct = int((sig.get("spent_ratio", 0) or 0) * 100)
        band = sig.get("current_band")
        lines.append(f"- {n} (Level {band}), spent {ratio_pct}% of the quarterly ceiling with {sig.get('anomaly_count', 0)} anomal{'ies' if sig.get('anomaly_count', 0) != 1 else 'y'}.")
        html_rows.append(f"<tr><td>{n}</td><td>Level {band}</td><td>{ratio_pct}%</td><td>{sig.get('anomaly_count', 0)}</td></tr>")

    text_body = (
        "Aged care reclassification opportunity, ahead of 1 October 2026\n\n"
        f"You have {len(cases)} open reclassification review case{'s' if len(cases) != 1 else ''}:\n\n"
        + "\n".join(lines) +
        "\n\nRun a Classification Self-Check for each candidate in Wayly to confirm.\n"
        "Sign in: https://mobile-parity-sweep.preview.emergentagent.com/app\n"
    )
    html_body = f"""
<h2 style="font-family:Georgia,serif;color:#1a3a2e;">Reclassification opportunity, 1 October 2026</h2>
<p>Wayly identified {len(cases)} participant{'s' if len(cases) != 1 else ''} in your household who may benefit from a classification review before 1 October 2026:</p>
<table cellpadding="8" cellspacing="0" style="border-collapse:collapse;border:1px solid #e5e5e5;width:100%;">
<thead style="background:#f5f2eb;"><tr><th style="text-align:left;">Participant</th><th>Current level</th><th>Spend of ceiling</th><th>Anomalies</th></tr></thead>
<tbody>{''.join(html_rows)}</tbody>
</table>
<p>Run a Classification Self-Check for each candidate in Wayly to confirm.</p>
<p><a href="https://mobile-parity-sweep.preview.emergentagent.com/app" style="background:#1a3a2e;color:white;padding:10px 20px;text-decoration:none;border-radius:20px;">Open Wayly</a></p>
<p style="font-size:12px;color:#888;">You&rsquo;re receiving this because you manage participants on Wayly. Data stored in Australia (ap-southeast-2).</p>
"""

    to_email = body.to_email or user.get("email")
    if not to_email:
        return {"sent": False, "reason": "no_recipient_email"}

    if body.dry_run or not _send_email:
        return {
            "sent": False,
            "dry_run": True,
            "recipient": to_email,
            "case_count": len(cases),
            "subject": f"Reclassification opportunity, {len(cases)} participant{'s' if len(cases) != 1 else ''} to review",
            "text_body": text_body,
            "html_body": html_body,
        }

    try:
        await _send_email(
            to=to_email,
            subject=f"Reclassification opportunity, {len(cases)} participant{'s' if len(cases) != 1 else ''} to review",
            html=html_body,
            plain_text=text_body,
        )
        return {"sent": True, "recipient": to_email, "case_count": len(cases)}
    except Exception as e:
        logger.error("lca1 digest send failed: %s", e)
        return {"sent": False, "reason": "send_failed", "error": str(e)}


# ---------------------------------------------------------------------------
# 4. Case reminder nudges, SLA breach on letter_awaiting_reply
# ---------------------------------------------------------------------------


@addons_router.post("/nudges/sla-check")
async def sla_nudge_check(request: Request):
    """Scan open letter_awaiting_reply cases; if sla_deadline is past and no
    reminder has been fired in the last 5 days, fire a reminder (in-app note
    on the case + optional email).

    Returns a summary. Idempotent within 5-day cooldown window.
    """
    await _assert_flag()
    user = await _user_dep(request)
    is_staff = (user.get("role") or "").lower() in ("staff", "admin", "super_admin")
    if is_staff:
        pid_scope: Optional[List[str]] = None
    else:
        pid_scope = await _accessible_participant_ids(user)

    now = _now()
    reminder_cutoff = now - timedelta(days=5)

    q: Dict[str, Any] = {
        "case_type": "letter_awaiting_reply",
        "status": {"$in": ["open", "in_progress", "waiting_on_provider"]},
        "sla_deadline": {"$lte": now},
    }
    if pid_scope is not None:
        q["participant_id"] = {"$in": pid_scope}

    reminded = 0
    already = 0
    reminders: List[Dict[str, Any]] = []
    async for c in _db.cases.find(q, {"_id": 0}):
        # Check if we already fired a reminder recently
        recent = await _db.case_events.find_one({
            "case_id": c["id"],
            "event_type": "sla_reminder",
            "created_at": {"$gte": reminder_cutoff},
        }, {"_id": 0, "id": 1})
        if recent:
            already += 1
            continue

        # Fire reminder, write a case_event and a CORE-1 timeline event via loop1 helpers
        await _db.case_events.insert_one({
            "id": f"rem-{c['id']}-{int(now.timestamp())}",
            "case_id": c["id"],
            "event_type": "sla_reminder",
            "actor_type": "system",
            "note": f"Letter still awaiting reply past SLA deadline ({_iso(c.get('sla_deadline'))}). Consider a follow-up.",
            "created_at": now,
        })
        # Bump updated_at so the case surfaces to the top of lists
        await _db.cases.update_one({"id": c["id"]}, {"$set": {"updated_at": now}})
        reminded += 1
        reminders.append({"case_id": c["id"], "title": c.get("title"), "sla_deadline": _iso(c.get("sla_deadline"))})

    return {"reminded": reminded, "already_recently_reminded": already, "reminders": reminders[:30]}
