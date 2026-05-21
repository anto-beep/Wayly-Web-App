"""Quick smoke test for the 5 Dorothy Anderson decoder fixes (iter31).

This bypasses the LLM extractor and directly feeds a hand-crafted extracted
JSON into `audit_statement` to verify the deterministic post-passes fire
correctly. Run with: python3 /app/backend/tests/test_dorothy_fixes.py
"""
import asyncio
import json
import sys
sys.path.insert(0, "/app/backend")

from agents import audit_statement, _strip_summary_artifacts, _dedupe_line_items


def test_dorothy_audit():
    extracted = {
        "household_id": "test-hh",
        "statement_period": "June 2026",
        "participant_name": "Dorothy Anderson",
        "provider": "Bluebell Care",
        "classification_level": 4,
        "quarterly_budget_total": 7424.00,
        "total_gross_services": 2952.21,
        "care_management_deducted": 268.29,
        "care_management_rate_pct": 11.0,  # provider charged 11% of monthly gross
        "line_items": [
            # Two TR-003 transport entries SAME DATE same rate — must both
            # survive dedupe so RULE_3_DUPLICATE_EXACT can flag them.
            {"date": "2026-06-12", "service_code": "TR-003", "stream": "Independence",
             "description": "Community transport — return to cardiology",
             "rate": 89.00, "gross": 89.00, "quantity": 1, "co_payment": 0.0,
             "provider_notes": "Possible duplicate — please verify"},
            {"date": "2026-06-12", "service_code": "TR-003", "stream": "Independence",
             "description": "Community transport — return to cardiology",
             "rate": 89.00, "gross": 89.00, "quantity": 1, "co_payment": 0.0,
             "provider_notes": "Possible duplicate — please verify"},
            # Worker substitution #1 — personal care 11 June, no notice.
            {"date": "2026-06-11", "service_code": "PC-001", "stream": "Independence",
             "description": "Personal care — shower assist", "rate": 65.00,
             "gross": 65.00, "quantity": 1, "co_payment": 3.25,
             "worker_name": "Yuki Matsuda",
             "provider_notes": "Usual worker Linda Caruso on leave — replacement Yuki Matsuda — no prior notice"},
            # Worker substitution #2 — nursing 17 June, < 24hr notice.
            {"date": "2026-06-17", "service_code": "RN-001", "stream": "Clinical",
             "description": "Wound dressing — RN visit", "rate": 120.00,
             "gross": 120.00, "quantity": 1, "co_payment": 0.0,
             "worker_name": "Nurse David Obi",
             "provider_notes": "Nurse Kaur replaced by Nurse David Obi — notified 06:45am same morning, less than 24 hours notice"},
            # Regular items
            {"date": "2026-06-05", "service_code": "PC-001", "stream": "Independence",
             "description": "Personal care — shower assist", "rate": 65.00,
             "gross": 65.00, "quantity": 1, "co_payment": 3.25},
        ],
        "previous_period_adjustments": [
            {
                "ref": "ADJ-MAY-001",
                "description": "Personal care 28 May — adjusted from 1.5h to 1.0h",
                "original_charge": 94.50,
                "corrected_charge": 63.00,
                "credit_amount": 31.50,         # arithmetic: 94.50 - 63.00 = 31.50 ✓
                "original_paid_by": "government",
                "credit_applied_to": "government",
            },
            {
                "ref": "ADJ-MAY-001-CONTRIB",
                "description": "Participant contribution credit for above",
                "original_charge": 4.73,
                "corrected_charge": 3.15,
                "credit_amount": 1.58,
                "original_paid_by": "participant",
                "credit_applied_to": "participant",
            },
        ],
        "provider_notes_raw": [
            "Care management this month: 11% of monthly gross services ($268.29 on $2,438.00 of services). Will be reconciled at quarter end.",
        ],
    }

    async def run():
        # Run the dedupe + summary-strip path on the line items first
        items = _strip_summary_artifacts(extracted["line_items"])
        items, dropped = _dedupe_line_items(items)
        extracted["line_items"] = items
        print(f"Pre-audit: line_items={len(items)}, dropped_dedupe={dropped}")
        return await audit_statement(extracted, household_id="test-hh")

    audit = asyncio.run(run())
    anomalies = audit.get("anomalies", [])
    rules = [a.get("rule") for a in anomalies]
    info = audit.get("informational_notes", [])

    print("\n=== ANOMALIES EMITTED ===")
    for a in anomalies:
        print(f"  [{a.get('severity'):6s}] {a.get('rule'):42s} {a.get('headline')}")
    print(f"\n=== INFORMATIONAL NOTES ===")
    for n in info:
        print(f"  {n.get('kind')}: {n.get('summary')}")

    # === Acceptance checks ===
    sub_flags = [a for a in anomalies if a.get("rule") == "RULE_6_WORKER_SUBSTITUTION"]
    dup_flags = [a for a in anomalies if a.get("rule") == "RULE_3_DUPLICATE_EXACT"]
    cm_flags = [a for a in anomalies if a.get("rule") == "RULE_1B_CARE_MGMT_MONTHLY"]
    rule10 = [a for a in anomalies if a.get("rule") == "RULE_10_PREVIOUS_PERIOD_ADJUSTMENTS"]
    ppa_info = [n for n in info if n.get("kind") == "previous_period_adjustment"]

    print("\n=== CHECKS ===")
    print(f"  Fix 1 — duplicate TR-003: {'PASS' if len(dup_flags) >= 1 else 'FAIL'} ({len(dup_flags)} flag(s))")
    print(f"  Fix 2 — worker substitutions: {'PASS' if len(sub_flags) == 2 else 'FAIL'} ({len(sub_flags)} flag(s), expected 2)")
    print(f"  Fix 3 — care mgmt monthly overcharge: {'PASS' if len(cm_flags) == 1 else 'FAIL'} ({len(cm_flags)} flag(s))")
    print(f"  Fix 4 — PPA NOT emitted as anomaly: {'PASS' if len(rule10) == 0 else 'FAIL'} ({len(rule10)} rule10 anomalies)")
    print(f"  Fix 4 — PPA informational note: {'PASS' if len(ppa_info) >= 1 else 'FAIL'} ({len(ppa_info)} note(s))")

    if cm_flags:
        cm = cm_flags[0]
        impact = cm.get("dollar_impact")
        print(f"\n  Care mgmt excess detected: ${impact:.2f} (expected ~$20.82)")

    return all([
        len(dup_flags) >= 1,
        len(sub_flags) == 2,
        len(cm_flags) == 1,
        len(rule10) == 0,
        len(ppa_info) >= 1,
    ])


if __name__ == "__main__":
    ok = test_dorothy_audit()
    print("\n" + ("=" * 50))
    print(("ALL FIXES PASS" if ok else "SOME FIXES FAILED").center(50))
    print("=" * 50)
    sys.exit(0 if ok else 1)
