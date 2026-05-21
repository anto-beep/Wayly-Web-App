"""Deterministic acceptance tests for the Dorothy Anderson June 2026 Round 2 fixes.

Bypasses the LLM extractor and feeds a hand-crafted extracted JSON into
`audit_statement` to verify the deterministic post-passes fire correctly.

Run with: python3 /app/backend/tests/test_dorothy_fixes.py
"""
import asyncio
import sys

sys.path.insert(0, "/app/backend")

from agents import audit_statement, _strip_summary_artifacts, _dedupe_line_items


def _build_extracted() -> dict:
    return {
        "household_id": "test-hh",
        "statement_period": "June 2026",
        "period_start": "2026-06-01",
        "period_end": "2026-06-30",
        "participant_name": "Dorothy Margaret Anderson",
        "provider_name": "Bluebell Care Services Pty Ltd",
        "provider_abn": "47 832 614 209",
        "classification_level": 4,
        "pension_status": "full_age_pension",
        "quarterly_budget_total": 7424.00,
        "care_management_deducted": 268.29,
        "care_management_rate_pct": 11.0,
        "reported_total_gross": 2952.21,
        "reported_total_participant_contribution": 138.82,
        "reported_total_government_paid": 2813.39,
        "budget_remaining_at_quarter_end": 1482.62,
        "stream_used_this_month": {
            "Clinical": 734.00,
            "Independence": 981.00,
            "EverydayLiving": 522.00,
        },
        "line_items": [
            # Clinical — 4 nursing + 1 podiatry brokered
            {"date": "03-Jun", "service_code": "RN-001", "stream": "Clinical",
             "service_description": "Registered Nurse Visit", "unit_rate": 148.0, "hours": 1.0,
             "gross": 148.00, "participant_contribution": 0.0, "government_paid": 148.0,
             "worker_name": "Nurse Priya Kaur"},
            {"date": "10-Jun", "service_code": "RN-001", "stream": "Clinical",
             "service_description": "Registered Nurse Visit", "unit_rate": 148.0, "hours": 1.0,
             "gross": 148.00, "participant_contribution": 0.0, "government_paid": 148.0,
             "worker_name": "Nurse Priya Kaur"},
            {"date": "17-Jun", "service_code": "RN-001", "stream": "Clinical",
             "service_description": "Registered Nurse Visit", "unit_rate": 148.0, "hours": 1.0,
             "gross": 148.00, "participant_contribution": 0.0, "government_paid": 148.0,
             "worker_name": "Nurse David Obi",
             "provider_notes": "NOTE: Usual worker Nurse Kaur on leave. Replacement arranged — Nurse David Obi. Participant notified 06:45am same morning."},
            {"date": "24-Jun", "service_code": "RN-001", "stream": "Clinical",
             "service_description": "Registered Nurse Visit", "unit_rate": 148.0, "hours": 1.0,
             "gross": 148.00, "participant_contribution": 0.0, "government_paid": 148.0,
             "worker_name": "Nurse Priya Kaur"},
            {"date": "17-Jun", "service_code": "PD-001", "stream": "Clinical",
             "service_description": "Podiatry — nail care and foot assessment",
             "unit_rate": 142.0, "hours": 1.0,
             "gross": 142.00, "participant_contribution": 0.0, "government_paid": 142.0,
             "is_brokered": True,
             "provider_notes": "Provider: Geelong Foot Clinic (brokered). Published podiatry rate: $135.00/hr. Brokered rate: $142.00/hr. Premium: $7.00/hr above published rate."},
            # Independence — 9 PC + 2 TR-003 dup on 12-Jun + 1 home maint 26-Jun
            *[
                {"date": d, "service_code": "PC-001", "stream": "Independence",
                 "service_description": "Personal Care — shower assist",
                 "unit_rate": 63.0, "hours": 1.0, "gross": 63.00,
                 "participant_contribution": 3.15, "government_paid": 59.85,
                 "worker_name": "Linda Caruso"}
                for d in ["02-Jun", "04-Jun", "09-Jun", "16-Jun", "18-Jun", "23-Jun", "25-Jun", "30-Jun"]
            ],
            {"date": "11-Jun", "service_code": "PC-001", "stream": "Independence",
             "service_description": "Personal Care — shower assist",
             "unit_rate": 63.0, "hours": 1.0, "gross": 63.00,
             "participant_contribution": 3.15, "government_paid": 59.85,
             "worker_name": "Yuki Matsuda",
             "provider_notes": "NOTE: Linda Caruso on annual leave. Replacement worker Yuki Matsuda attended. No prior notice provided to participant."},
            {"date": "12-Jun", "service_code": "TR-003", "stream": "Independence",
             "service_description": "Community Transport — return trip to Geelong Specialist Centre",
             "unit_rate": 89.0, "hours": 1.0, "gross": 89.00,
             "participant_contribution": 4.45, "government_paid": 84.55,
             "provider_notes": "Cardiology outpatient appointment"},
            {"date": "12-Jun", "service_code": "TR-003", "stream": "Independence",
             "service_description": "Community Transport — return trip to Geelong Specialist Centre",
             "unit_rate": 89.0, "hours": 1.0, "gross": 89.00,
             "participant_contribution": 4.45, "government_paid": 84.55,
             "provider_notes": "Two identical transport charges on 12 June. Pending verification. Please verify with provider whether duplicate entry."},
            {"date": "26-Jun", "service_code": "HM-002", "stream": "Independence",
             "service_description": "Garden maintenance — lawn mowing, pruning",
             "unit_rate": 65.0, "hours": 2.0, "gross": 130.00,
             "participant_contribution": 6.50, "government_paid": 123.50,
             "worker_name": "Bluebell Maintenance Team",
             "flags_in_original": "Stream classification under review (Independence vs Everyday Living)"},
            # Everyday Living — 4 cleaning + 1 meal prep
            *[
                {"date": d, "service_code": "DM-001", "stream": "EverydayLiving",
                 "service_description": "Domestic Assistance — house cleaning",
                 "unit_rate": 58.0, "hours": 2.0, "gross": 116.00,
                 "participant_contribution": 20.30, "government_paid": 95.70,
                 "worker_name": "Linda Caruso"}
                for d in ["05-Jun", "12-Jun", "19-Jun", "26-Jun"]
            ],
            {"date": "10-Jun", "service_code": "MC-001", "stream": "EverydayLiving",
             "service_description": "Meal Preparation — weekly batch cooking",
             "unit_rate": 58.0, "hours": 1.0, "gross": 58.00,
             "participant_contribution": 10.15, "government_paid": 47.85,
             "worker_name": "Linda Caruso"},
            # Care Management line
            {"date": "30-Jun", "service_code": "CM-01", "stream": "CareMgmt",
             "service_description": "Care management fee (June)",
             "unit_rate": 268.29, "hours": 1.0, "gross": 268.29,
             "participant_contribution": 0.0, "government_paid": 268.29},
            # AT-HM line item for current-period grab rails claim
            {"date": "22-Jun", "service_code": "ATHM-2026-0041", "stream": "ATHM",
             "service_description": "Bathroom grab rails (partial — supply & installation)",
             "unit_rate": 480.00, "hours": 1.0, "gross": 480.00,
             "participant_contribution": 0.0, "government_paid": 480.00,
             "provider_notes": "Invoice INV-GR-2206 dated 22 June 2026. Installer: Safety First Home Modifications."},
        ],
        "at_hm_commitments": [
            {
                "ref": "ATHM-2026-0041",
                "item_description": "Bathroom grab rails (supply and installation)",
                "approval_date": "",
                "expiry_date": "2027-02-14",
                "amount_approved": 1200.00,
                "amount_claimed": 480.00,
                "amount_remaining": 720.00,
                "amount_claimed_this_period": 480.00,
                "status": "active",
            },
            {
                "ref": "ATHM-2026-0039",
                "item_description": "Shower chair",
                "approval_date": "",
                "expiry_date": "",
                "amount_approved": 385.00,
                "amount_claimed": 385.00,
                "amount_remaining": 0.00,
                "amount_claimed_this_period": 0.00,
                "status": "completed",
            },
        ],
        "previous_period_adjustments": [
            {
                "ref": "ADJ-2026-05-003",
                "description": "Personal care 28 May 2026 — adjusted from 1.5h to 1.0h",
                "original_charge": 94.50,
                "corrected_charge": 63.00,
                "credit_amount": 31.50,
                "original_paid_by": "government",
                "credit_applied_to": "government",
            },
        ],
        "provider_notes_raw": [
            "Care management this month: 11.0% of monthly gross services ($268.29 on $2,438.00 of services). Will be reconciled at quarter end.",
            "We have identified a possible duplicate entry for community transport on 12 June. Both entries have been included on this statement pending your review.",
            "Linda Caruso was on approved annual leave from 10–12 June 2026. Replacement worker Yuki Matsuda attended on 11 June. We acknowledge that advance notice was not provided to Dorothy or the family as required under the Statement of Rights.",
            "Dorothy attended a cardiology outpatient review on 12 June. The review identified a medication adjustment. The nursing team has been briefed.",
            "AT-HM commitment ATHM-2026-0041 — first stage of bathroom grab rail installation completed on 22 June. Remaining balance $720.00 covers the final installation scheduled for August 2026. Expires 14 February 2027.",
            "Garden maintenance (HM-002, 26 June) is currently included under the Independence stream. We are reviewing whether this service should be classified under Everyday Living stream.",
        ],
    }


def _run_audit():
    extracted = _build_extracted()

    async def run():
        items = _strip_summary_artifacts(extracted["line_items"])
        items, dropped = _dedupe_line_items(items)
        extracted["line_items"] = items
        print(f"Pre-audit: line_items={len(items)}, dropped_dedupe={dropped}")
        return await audit_statement(extracted, household_id="test-hh"), extracted

    return asyncio.run(run())


def test_dorothy_round2():
    audit, extracted = _run_audit()
    anomalies = audit.get("anomalies", [])
    info_notes = audit.get("informational_notes", [])

    print("\n=== ANOMALIES EMITTED ===")
    for a in anomalies:
        print(f"  [{a.get('severity'):6s}] {a.get('rule'):42s} {a.get('headline')}")
    print("\n=== INFORMATIONAL NOTES ===")
    for n in info_notes:
        print(f"  {n.get('kind')}: {n.get('summary')}")

    # Helper counters
    by_rule = {}
    for a in anomalies:
        by_rule.setdefault((a.get("rule") or "").upper(), []).append(a)

    # === Acceptance checks ===
    results = []

    # FIX 1 — Exactly ONE duplicate transport flag
    dup_flags = by_rule.get("RULE_3_DUPLICATE_EXACT", [])
    ok = len(dup_flags) == 1
    results.append(("Fix 1 — duplicate transport: exactly 1 flag", ok, f"{len(dup_flags)} flag(s)"))

    # FIX 2 — Exactly TWO worker substitution flags, on 11-Jun (PC-001) and 17-Jun (RN-001).
    sub_flags = by_rule.get("RULE_6_WORKER_SUBSTITUTION", [])
    sub_keys = set()
    for sf in sub_flags:
        blob = (sf.get("detail") or "") + " " + " ".join(str(e) for e in (sf.get("evidence") or []))
        if "11-Jun" in blob and "PC-001" in blob:
            sub_keys.add("11-Jun/PC-001")
        if "17-Jun" in blob and "RN-001" in blob:
            sub_keys.add("17-Jun/RN-001")
    ok = (len(sub_flags) == 2) and sub_keys == {"11-Jun/PC-001", "17-Jun/RN-001"}
    results.append((
        "Fix 2 — worker substitutions: exactly 2 (11-Jun PC, 17-Jun RN)",
        ok,
        f"{len(sub_flags)} flag(s), keys={sub_keys}",
    ))

    # FIX 2b — No sub flag on 12-Jun
    bad_sub_12jun = any(
        "12-Jun" in ((sf.get("detail") or "") + " " + " ".join(str(e) for e in (sf.get("evidence") or [])))
        or "12 jun" in ((sf.get("detail") or "")).lower()
        for sf in sub_flags
    )
    results.append(("Fix 2 — NO worker sub flag on 12-Jun (transport)", not bad_sub_12jun, "" if not bad_sub_12jun else "12-Jun sub flag present"))

    # FIX 3 — No AT-HM coding-mismatch / hallucinated AT-001 flag
    bad_at001 = any(
        "AT-001" in ((a.get("detail") or "") + " " + " ".join(str(e) for e in (a.get("evidence") or [])))
        for a in anomalies
    )
    results.append(("Fix 3 — NO hallucinated AT-001 flag", not bad_at001, "" if not bad_at001 else "AT-001 referenced"))

    # FIX 4 — No anomaly references ATHM-2026-0039 (completed shower chair)
    bad_shower = any(
        "ATHM-2026-0039" in ((a.get("detail") or "") + " " + (a.get("headline") or "") + " " + " ".join(str(e) for e in (a.get("evidence") or [])))
        for a in anomalies
    )
    results.append(("Fix 4 — NO flag referencing completed shower chair (ATHM-2026-0039)", not bad_shower, ""))

    # FIX 4b — Informational note for the ACTIVE grab rails commitment (ATHM-2026-0041)
    grab_rail_note = [
        n for n in info_notes
        if n.get("kind") == "at_hm_active_commitment" and "ATHM-2026-0041" in (n.get("ref") or "")
    ]
    results.append(("Fix 4 — Active grab rails informational note present", len(grab_rail_note) >= 1, f"{len(grab_rail_note)} note(s)"))

    # FIX 4c — No informational note for the completed shower chair
    bad_shower_note = any(
        (n.get("ref") or "") == "ATHM-2026-0039" for n in info_notes if isinstance(n, dict)
    )
    results.append(("Fix 4 — NO informational note for completed shower chair", not bad_shower_note, ""))

    # FIX 5 — Care management excess EXACTLY $20.82 (±$0.10)
    cm_flags = by_rule.get("RULE_1B_CARE_MGMT_MONTHLY", [])
    ok_cm = (len(cm_flags) == 1) and abs(float(cm_flags[0].get("dollar_impact") or 0) - 20.82) < 0.10
    cm_val = cm_flags[0].get("dollar_impact") if cm_flags else None
    results.append(("Fix 5 — Care mgmt excess = $20.82 (±$0.10)", ok_cm, f"got ${cm_val}"))

    # FIX 7 — PPA NOT in anomalies, but IS in informational_notes.
    rule10_anom = by_rule.get("RULE_10_PREVIOUS_PERIOD_ADJUSTMENTS", [])
    ppa_notes = [n for n in info_notes if n.get("kind") == "previous_period_adjustment"]
    results.append(("Fix 7 — PPA NOT in anomalies array", len(rule10_anom) == 0, f"{len(rule10_anom)} RULE_10 anomaly"))
    results.append(("Fix 7 — PPA IS in informational_notes", len(ppa_notes) >= 1, f"{len(ppa_notes)} note(s)"))

    # FIX 6 — Implicitly verified by deterministic checks above:
    # our test feeds reported_total_gross = $2,952.21 and audit must preserve that.
    summary = audit.get("statement_summary") or {}
    reported_in_summary = summary.get("total_gross") or summary.get("total_gross_services")
    try:
        ok_total = abs(float(reported_in_summary) - 2952.21) < 0.50
    except Exception:
        ok_total = False
    results.append(("Fix 6 — statement_summary.total_gross = $2,952.21", ok_total, f"got ${reported_in_summary}"))

    # FIX 1 — Global dedup: no duplicate rule_prefix+date+code anomalies remain.
    import re as _re
    sig = {}
    DATE_RE = _re.compile(r"\b(\d{4}-\d{2}-\d{2}|\d{1,2}[-\s][A-Za-z]{3,9})\b")
    CODE_RE = _re.compile(r"\b([A-Z]{2,5}-\d{2,4})\b")
    for a in anomalies:
        rule_prefix_m = _re.match(r"^(RULE_\d+)", (a.get("rule") or "").upper())
        rule_prefix = rule_prefix_m.group(1) if rule_prefix_m else (a.get("rule") or "")
        blob = (a.get("detail") or "") + " " + " ".join(str(e) for e in (a.get("evidence") or []))
        date_m = DATE_RE.search(blob)
        code_m = CODE_RE.search(blob)
        key = f"{rule_prefix}|{(date_m.group(1) if date_m else '').lower()}|{(code_m.group(1) if code_m else '').upper()}"
        sig.setdefault(key, []).append(a.get("rule"))
    dup_sigs = {k: v for k, v in sig.items() if len(v) > 1 and "|" in k and not k.endswith("||")}
    results.append(("Fix 1 — global dedup: no rule+date+code duplicates", len(dup_sigs) == 0, f"dups={dup_sigs}"))

    # Print results
    print("\n=== ACCEPTANCE CHECKS ===")
    all_ok = True
    for name, ok, info in results:
        flag = "PASS" if ok else "FAIL"
        all_ok = all_ok and ok
        print(f"  [{flag}] {name}  {info}")

    print("\n" + "=" * 60)
    print(("ALL ROUND 2 FIXES PASS" if all_ok else "SOME FIXES FAILED").center(60))
    print("=" * 60)
    return all_ok


if __name__ == "__main__":
    ok = test_dorothy_round2()
    sys.exit(0 if ok else 1)
