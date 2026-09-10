"""Seed a DEC-1 publish-blocked statement for the demo account.

Why: the Statement Decoder publish-gate UI (decoder-publish-block,
decoder-low-confidence-banner, decoder-table-unverified-note) can only be
exercised end-to-end when an account has a decoded statement whose own numbers
do not reconcile (``audit_json.publishable == False``). Real fixtures never
contain one, so QA could only verify the blocked path by code inspection.

This script clones an existing rich statement for the target account and marks
it blocked: it injects a genuine per-line arithmetic mismatch, a gross
reconciliation gap, sets ``publishable=False`` with a ``publish_block`` payload,
and flags low extraction confidence. Idempotent: re-running replaces the demo
statement in place (fixed id derived from the household).

Usage:
    python3 /app/backend/scripts/seed_blocked_statement.py [email]

Defaults to cathy@example.com. Reads MONGO_URL / DB_NAME from backend/.env.
"""
from __future__ import annotations

import asyncio
import copy
import os
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")


def _iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def main(email: str) -> None:
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    user = await db.users.find_one({"email": email}, {"_id": 0, "id": 1, "household_id": 1})
    if not user:
        print(f"[seed] no user for {email}")
        return
    hid = user.get("household_id")
    if not hid:
        print(f"[seed] {email} has no household_id")
        return

    primary = await db.participants.find_one(
        {"household_id": hid, "is_primary": True, "status": {"$ne": "REMOVED"}},
        {"_id": 0, "id": 1, "first_name": 1, "name": 1},
    ) or await db.participants.find_one(
        {"household_id": hid, "status": {"$ne": "REMOVED"}}, {"_id": 0, "id": 1, "first_name": 1, "name": 1}
    )
    pid = (primary or {}).get("id")
    pname = (primary or {}).get("first_name") or (primary or {}).get("name") or "Dorothy"

    demo_id = f"blocked-demo-{hid[:8]}"

    # Find a rich source statement to clone (has both extracted_json + line items).
    source = None
    async for doc in db.statements.find({"household_id": hid, "id": {"$ne": demo_id}}, {"_id": 0}):
        ext = doc.get("extracted_json") or {}
        aud = doc.get("audit_json") or {}
        if isinstance(ext, dict) and isinstance(aud, dict) and (ext.get("line_items") or []):
            source = doc
            break
    if not source:
        print("[seed] no rich source statement to clone")
        return

    doc = copy.deepcopy(source)
    doc.pop("_id", None)
    doc["id"] = demo_id
    doc["household_id"] = hid
    doc["participant_id"] = pid
    doc["period_label"] = "1 October 2026 to 31 October 2026"
    doc["state"] = "active"
    doc["uploaded_at"] = _iso()
    doc["updated_at"] = _iso()
    doc["is_blocked_demo"] = True
    doc["input_method"] = "image_vision"  # low-confidence photo path reads naturally
    doc["archived_at"] = None
    doc["deleted_at"] = None
    doc["superseded_at"] = None
    doc["superseded_by"] = None

    ext = doc.get("extracted_json") or {}
    ext["participant_name"] = pname
    ext["period_start"] = "2026-10-01"
    ext["period_end"] = "2026-10-31"
    ext["statement_period"] = "1 October 2026 to 31 October 2026"
    ext["provider_name"] = ext.get("provider_name") or "BlueBerry Care"

    # Inject a genuine per-line arithmetic mismatch on the first non-cancellation
    # line: rate x units no longer equals the stated gross.
    line_items = [li for li in (ext.get("line_items") or []) if isinstance(li, dict)]
    mismatch_line = None
    for li in line_items:
        if not li.get("is_cancellation"):
            mismatch_line = li
            break
    if mismatch_line is None and line_items:
        mismatch_line = line_items[0]
    if mismatch_line is not None:
        mismatch_line["date"] = "2026-10-09"
        mismatch_line["service_description"] = "Domestic assistance (weekly clean)"
        mismatch_line["service_name"] = "Domestic assistance (weekly clean)"
        mismatch_line["stream"] = "EverydayLiving"
        mismatch_line["unit"] = "hr"
        mismatch_line["hours"] = 2.0
        mismatch_line["quantity"] = 2.0
        mismatch_line["unit_rate"] = 72.0
        mismatch_line["raw_rate_text"] = "$72.00/hr"
        mismatch_line["raw_qty_text"] = "2 hr"
        mismatch_line["gross"] = 244.0  # should be 144.00 -> $100 discrepancy
        mismatch_line["participant_contribution"] = 61.0
        mismatch_line["government_paid"] = 183.0
        mismatch_line["confidence"] = 0.55
        mismatch_line["is_cancellation"] = False

    ext["reported_total_gross"] = 1620.0  # deliberately does not reconcile

    reason = "This statement's own numbers do not reconcile, so a plain-English summary could be misleading."
    blocker_anomalies = [
        {
            "severity": "high",
            "rule": "RULE_G1_LINE_ARITHMETIC",
            "headline": "The maths on the 09/10/2026 \"Domestic assistance (weekly clean)\" line does not add up.",
            "detail": (
                "The statement shows $244.00 for \"Domestic assistance (weekly clean)\", but $72.00 times 2 is "
                "$144.00. That is a difference of $100.00, so the figure cannot be trusted until the provider "
                "confirms the correct amount."
            ),
            "dollar_impact": 100.0,
            "evidence": ["09/10/2026 Domestic assistance (weekly clean): stated $244.00 vs $72.00 x 2 = $144.00 (delta $100.00)"],
            "suggested_action": "Ask the provider to confirm the correct amount for this line.",
            "date": "2026-10-09",
        },
        {
            "severity": "high",
            "rule": "RULE_G2_GROSS_RECONCILE",
            "headline": "We could only account for $1,520.00 of the statement's $1,620.00 total.",
            "detail": (
                "Adding up everything we could read from this statement, services plus fees, comes to about "
                "$1,520.00, but its own total is $1,620.00. That gap is too large to leave out, so we cannot "
                "publish a reliable breakdown until the missing figures are confirmed."
            ),
            "dollar_impact": 100.0,
            "evidence": ["services and fees read $1,520.00; statement's own total $1,620.00; gap $100.00"],
            "suggested_action": "Re-check the statement against the original; some lines may be missing from the decoded figures.",
        },
    ]

    aud = doc.get("audit_json") or {}
    aud["anomalies"] = blocker_anomalies
    aud["anomaly_count"] = len(blocker_anomalies)
    aud["publishable"] = False
    aud["publish_block"] = {
        "reason": reason,
        "rules": ["RULE_G1_LINE_ARITHMETIC", "RULE_G2_GROSS_RECONCILE"],
        "items": [{"headline": a["headline"], "detail": a["detail"]} for a in blocker_anomalies],
    }
    aud["low_confidence"] = True
    aud["extraction_confidence"] = 0.55

    doc["extracted_json"] = ext
    doc["audit_json"] = aud
    # Top-level anomalies must satisfy the Anomaly model (title + info/warning/alert).
    doc["anomalies"] = [
        {
            "severity": "alert",
            "raw_severity": a["severity"],
            "title": a["headline"],
            "detail": a["detail"],
            "rule": a["rule"],
            "dollar_impact": a["dollar_impact"],
            "evidence": a["evidence"],
            "suggested_action": a.get("suggested_action"),
        }
        for a in blocker_anomalies
    ]
    doc["anomaly_count"] = len(blocker_anomalies)
    doc["anomaly_dollar_impact_total"] = round(sum(a["dollar_impact"] for a in blocker_anomalies), 2)
    doc["summary"] = reason

    await db.statements.delete_one({"id": demo_id})
    await db.statements.insert_one(doc)
    print(f"[seed] inserted blocked-demo statement id={demo_id} household={hid} participant={pid} ({pname})")


if __name__ == "__main__":
    target_email = sys.argv[1] if len(sys.argv) > 1 else "cathy@example.com"
    asyncio.run(main(target_email))
