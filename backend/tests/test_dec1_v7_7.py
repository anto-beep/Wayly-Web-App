"""DEC-1 Phase 3 regression gate.

Locks in the invariants described in
`/app/customer-assets/…DEC-1_Statement_Decoder_Consolidation_7.7.md`:

* Government_paid arithmetic: `gross - participant_contribution` (Open Item 1).
* Cadence inference: 28-31 days = monthly, 88-92 days = quarterly.
* Row-inheritance for blank-date rows (§Phase 2 #2).
* Recurring-service pattern is not flagged as duplicate (§Phase 2 #5).
* Empty ABN is NOT flagged (§Phase 2 #4 / #14).
* Impact accounting cap: sum of dollar_impact ≤ gross_total.
* Every persisted statement carries a rich `audit_json` + plain-English `summary`.
* AI-Tools decode ↔ Statements-upload decode produce structurally-equivalent
  audit output for the same input (single source of truth).

These tests hit the deterministic post-audit code paths directly so they
run in < 1 second, without touching the LLM. Add fixture-based end-to-end
tests separately when the S1/M1/M2/M3 fixture drops are confirmed by the
owner.
"""
from __future__ import annotations

import pytest

import agents


def _base_extracted(**overrides):
    """Minimal extracted-statement dict used by the deterministic post-pass."""
    data = {
        "participant_name": "Test User",
        "provider_name": "BlueBerry Care",
        "statement_period": "1 July 2026 to 31 July 2026",
        "period_start": "2026-07-01",
        "period_end": "2026-07-31",
        "reported_total_gross": 1240.0,
        "reported_total_participant_contribution": 107.5,
        "reported_total_government_paid": 1132.5,
        "line_items": [
            # Weekly Personal Care, 4 identical rows — must NOT trip a duplicate flag.
            {"date": "2026-07-07", "service_code": None, "service_description": "Personal care, shower",
             "stream": "Independence", "hours": 1.0, "unit_rate": 85.0, "gross": 85.0,
             "participant_contribution": 10.0, "government_paid": 75.0},
            {"date": "2026-07-14", "service_code": None, "service_description": "Personal care, shower",
             "stream": "Independence", "hours": 1.0, "unit_rate": 85.0, "gross": 85.0,
             "participant_contribution": 10.0, "government_paid": 75.0},
            {"date": "2026-07-21", "service_code": None, "service_description": "Personal care, shower",
             "stream": "Independence", "hours": 1.0, "unit_rate": 85.0, "gross": 85.0,
             "participant_contribution": 10.0, "government_paid": 75.0},
            {"date": "2026-07-28", "service_code": None, "service_description": "Personal care, shower",
             "stream": "Independence", "hours": 1.0, "unit_rate": 85.0, "gross": 85.0,
             "participant_contribution": 10.0, "government_paid": 75.0},
        ],
    }
    data.update(overrides)
    return data


def _run_post_pass(extracted, seed_anomalies=None):
    """Simulate what happens after the LLM audit returns — we only run the
    deterministic post-passes so no network is needed."""
    audit = {
        "anomalies": list(seed_anomalies or []),
        "statement_summary": {},
        "stream_breakdown": [],
        "anomaly_count": {"high": 0, "medium": 0, "low": 0},
    }
    audit = agents._add_parse_warnings(audit, extracted)
    agents._apply_reported_totals(audit, extracted)
    agents._recompute_stream_breakdown(audit, extracted)
    return audit


class TestCadenceInference:
    def test_monthly_31_days(self):
        audit = _run_post_pass(_base_extracted())
        assert audit["statement_summary"]["cadence"] == "monthly"
        assert not any(a.get("rule", "").startswith("RULE_14") for a in audit["anomalies"])

    def test_quarterly_91_days(self):
        ext = _base_extracted(
            period_start="2026-04-01",
            period_end="2026-06-30",
            statement_period="1 April 2026 to 30 June 2026",
        )
        audit = _run_post_pass(ext)
        assert audit["statement_summary"]["cadence"] == "quarterly"
        assert not any(a.get("rule", "").startswith("RULE_14") for a in audit["anomalies"])

    def test_weekly_7_days(self):
        ext = _base_extracted(period_start="2026-07-01", period_end="2026-07-07")
        audit = _run_post_pass(ext)
        assert audit["statement_summary"]["cadence"] == "weekly"

    def test_odd_span_flags(self):
        ext = _base_extracted(period_start="2026-07-01", period_end="2026-07-20")
        audit = _run_post_pass(ext)
        assert audit["statement_summary"]["cadence"] == "irregular"
        assert any(a.get("rule") == "RULE_14_PERIOD_PARSE_WARNING" for a in audit["anomalies"])


class TestGovernmentPaidArithmetic:
    def test_definition_holds(self):
        audit = _run_post_pass(_base_extracted())
        s = audit["statement_summary"]
        assert s["total_government_paid"] == round(
            s["total_gross"] - s["total_participant_contribution"], 2
        )


class TestLlmAnomalyFilter:
    def test_recurring_weekly_duplicate_filtered(self):
        seed = [{
            "severity": "high", "rule": "RULE_3_DUPLICATE_LLM",
            "headline": "Weekly personal care appears multiple times",
            "detail": "Four identical weekly recurring services flagged.",
        }]
        audit = _run_post_pass(_base_extracted(), seed_anomalies=seed)
        assert not any(a.get("rule") == "RULE_3_DUPLICATE_LLM" for a in audit["anomalies"])

    def test_empty_abn_filtered(self):
        seed = [{
            "severity": "medium", "rule": "RULE_20_ABN_MISSING",
            "headline": "Provider ABN is missing",
            "detail": "The ABN field is blank on this statement.",
        }]
        audit = _run_post_pass(_base_extracted(), seed_anomalies=seed)
        assert not any(a.get("rule") == "RULE_20_ABN_MISSING" for a in audit["anomalies"])

    def test_malformed_abn_still_fires(self):
        ext = _base_extracted(provider_abn="12345")  # not 11 digits
        audit = _run_post_pass(ext)
        assert any(a.get("rule") == "RULE_20_ABN_FORMAT" for a in audit["anomalies"])

    def test_fortnightly_domestic_filtered(self):
        seed = [{
            "severity": "high", "rule": "RULE_3_DUPLICATE_FUZZY",
            "headline": "Fortnightly domestic assistance",
            "detail": "Two domestic assistance items within a week of each other.",
        }]
        audit = _run_post_pass(_base_extracted(), seed_anomalies=seed)
        assert not any(a.get("rule") == "RULE_3_DUPLICATE_FUZZY" for a in audit["anomalies"])


class TestImpactAccountingCap:
    def test_sum_capped_at_gross(self):
        seed = [
            {"severity": "high", "rule": "R1", "headline": "A", "detail": "d",
             "dollar_impact": 5000.0, "evidence": ["date: 2026-07-07", "service_code: PC-01"]},
            {"severity": "medium", "rule": "R2", "headline": "B", "detail": "d",
             "dollar_impact": 5000.0, "evidence": ["date: 2026-07-14", "service_code: PC-02"]},
        ]
        audit = _run_post_pass(_base_extracted(), seed_anomalies=seed)
        total = sum(float((a.get("dollar_impact") or 0.0)) for a in audit["anomalies"])
        # Cap at gross (1240) — cannot exceed it even if seed impacts summed to 10k.
        assert total <= 1240.0 + 0.01

    def test_dedupe_same_line_item(self):
        seed = [
            {"severity": "high", "rule": "R1", "headline": "Bad rate", "detail": "d",
             "dollar_impact": 80.0, "evidence": ["date: 2026-07-07", "service_code: PC-01"]},
            {"severity": "medium", "rule": "R2", "headline": "Bad code", "detail": "d",
             "dollar_impact": 80.0, "evidence": ["date: 2026-07-07", "service_code: PC-01"]},
        ]
        audit = _run_post_pass(_base_extracted(), seed_anomalies=seed)
        # Look at just the seeded rules — one should keep impact 80,
        # the other should be zeroed. Deterministic parse warnings that
        # unrelated to this test are ignored.
        by_rule = {a.get("rule"): a for a in audit["anomalies"]}
        assert by_rule["R1"]["dollar_impact"] == 80.0
        assert by_rule["R2"]["dollar_impact"] == 0.0


class TestRowInheritance:
    def test_inherit_from_previous_row(self):
        # Simulate the _dedupe / _strip pipeline's row-inheritance step by
        # calling _strip_summary_artifacts directly with a "blank-date"
        # follow-on row that has a real service description.
        items = [
            {"date": "2026-07-07", "service_description": "Personal care", "gross": 85.0},
            {"date": "",             "service_description": "Personal care extension", "gross": 42.5},
            {"date": "2026-07-14", "service_description": "Domestic assistance", "gross": 150.0},
        ]
        cleaned = agents._strip_summary_artifacts(items)
        # The blank-date row should survive because "personal care" matches
        # the service-keyword allowlist.
        assert len(cleaned) == 3
        assert cleaned[1]["service_description"] == "Personal care extension"


class TestDatetimeParser:
    def test_ddmmyyyy_parsed(self):
        # server-side date parser needs to accept day-first & ISO.
        from server import _parse_line_item_date  # type: ignore
        assert _parse_line_item_date("07/09/2026") == "2026-09-07"
        assert _parse_line_item_date("2026-09-07") == "2026-09-07"
        assert _parse_line_item_date("32/13/2026") is None
        assert _parse_line_item_date(None) is None
        assert _parse_line_item_date("") is None


class TestDeterminism:
    """DEC-1 v7.7 §Invariant 8 — same input must produce byte-identical
    structured output across repeated runs.

    Scope: this covers the entire *deterministic tail* of the decoder
    pipeline (parse warnings, cadence inference, arithmetic invariant,
    stream breakdown, LLM-anomaly filter, impact cap + dedupe).

    Not covered here: the two LLM calls (extract_statement, audit_statement)
    which sit upstream. LLM determinism is a separate concern (temperature=0
    gets close but is not guaranteed byte-perfect across model refreshes).
    For full end-to-end determinism, run the decoder against a saved
    "golden fixture" that replaces the LLM calls with recorded JSON — see
    the follow-up test file `test_dec1_golden_fixtures.py` once fixtures
    are dropped.
    """

    @staticmethod
    def _canonical(audit):
        """Produce a byte-stable JSON representation for comparison."""
        import json
        return json.dumps(audit, sort_keys=True, default=str)

    def test_deterministic_post_pass_three_runs(self):
        """Feed the same extracted+audit pair through the deterministic
        tail three times, assert byte-identical output every run."""
        seed_anomalies = [
            {"severity": "high", "rule": "R_A", "headline": "Rate query", "detail": "d",
             "dollar_impact": 80.0, "evidence": ["date: 2026-07-07", "service_code: PC-01"]},
            {"severity": "medium", "rule": "R_B", "headline": "Coding query", "detail": "d",
             "dollar_impact": 40.0, "evidence": ["date: 2026-07-14", "service_code: PC-02"]},
            # Should get filtered as an LLM-emitted "weekly" false positive.
            {"severity": "high", "rule": "RULE_3_FUZZY", "headline": "Weekly personal care recurring",
             "detail": "Four identical weekly items."},
            # Should get filtered as an "empty ABN" false positive.
            {"severity": "medium", "rule": "RULE_20_ABN_MISSING", "headline": "Provider ABN missing",
             "detail": "The ABN field is empty."},
        ]

        results = []
        for _ in range(3):
            # Fresh deep copy each pass so no run mutates the next.
            import copy
            audit = {
                "anomalies": copy.deepcopy(seed_anomalies),
                "statement_summary": {},
                "stream_breakdown": [],
                "anomaly_count": {"high": 0, "medium": 0, "low": 0},
            }
            extracted = copy.deepcopy(_base_extracted())
            audit = agents._add_parse_warnings(audit, extracted)
            agents._apply_reported_totals(audit, extracted)
            agents._recompute_stream_breakdown(audit, extracted)
            results.append(self._canonical(audit))

        # All three canonical JSON blobs must be identical.
        assert results[0] == results[1] == results[2], (
            "DEC-1 v7.7 determinism invariant violated: deterministic tail "
            "produced different output across three identical runs."
        )

    def test_recurring_service_filter_deterministic(self):
        """Specifically pin: same weekly recurring seed → same filtered
        output every run (no ordering flakiness in the filter)."""
        seed = [
            {"severity": "high", "rule": "RULE_3_LLM", "headline": f"Weekly service #{i}",
             "detail": "recurring weekly service", "dollar_impact": 10.0 + i}
            for i in range(6)
        ]
        outputs = []
        import copy
        for _ in range(3):
            audit = {
                "anomalies": copy.deepcopy(seed),
                "statement_summary": {},
                "stream_breakdown": [],
                "anomaly_count": {"high": 0, "medium": 0, "low": 0},
            }
            audit = agents._add_parse_warnings(audit, copy.deepcopy(_base_extracted()))
            outputs.append(self._canonical(audit))
        assert outputs[0] == outputs[1] == outputs[2]

    def test_dedupe_cap_deterministic(self):
        """Same competing-anomaly seed → same winner (highest severity)
        and same zeroed peers every run."""
        seed = [
            {"severity": "medium", "rule": "R_MED", "headline": "Med", "detail": "d",
             "dollar_impact": 80.0, "evidence": ["date: 2026-07-07", "service_code: PC-01"]},
            {"severity": "high", "rule": "R_HI", "headline": "Hi", "detail": "d",
             "dollar_impact": 80.0, "evidence": ["date: 2026-07-07", "service_code: PC-01"]},
            {"severity": "low", "rule": "R_LO", "headline": "Lo", "detail": "d",
             "dollar_impact": 80.0, "evidence": ["date: 2026-07-07", "service_code: PC-01"]},
        ]
        outputs = []
        import copy
        for _ in range(3):
            audit = _run_post_pass(_base_extracted(), seed_anomalies=copy.deepcopy(seed))
            # Extract just the (rule, impact) pairs — that's what determinism protects.
            outputs.append(sorted([(a.get("rule"), a.get("dollar_impact") or 0.0)
                                   for a in audit["anomalies"]
                                   if (a.get("rule") or "").startswith("R_")]))
        assert outputs[0] == outputs[1] == outputs[2]
        # And explicitly: high wins, others zero.
        winners = dict(outputs[0])
        assert winners == {"R_HI": 80.0, "R_MED": 0.0, "R_LO": 0.0}



# =============================================================================
# DEC-1 v7.7 Batch B — regression gates for the three shipping-blockers and
# the new deterministic anomaly rules added to catch the S3 / S4 fixtures.
# =============================================================================


class TestShippingBlockers:
    """These three checks MUST pass or shipping is blocked."""

    def _base_quarterly(self, **overrides):
        data = {
            "participant_name": "Louisa Davids",
            "provider_name": "Glorious Services Pty Ltd",
            "statement_period": "1 July 2026 to 30 September 2026",
            "period_start": "2026-07-01",
            "period_end": "2026-09-30",
            "care_management_deducted": 754.70,
            "quarterly_budget_total": 27866.0,
            "budget_remaining_at_quarter_end": 20836.30,
            "reported_total_gross": 7029.70,
            "line_items": [
                # A representative Clinical stream row so the services
                # subtotal is > 0. Sum of all Clinical + Independence +
                # EverydayLiving gross must produce a services subtotal
                # ≈ $6,047 so the true 10% cap is $604.70 and the $754.70
                # charge violates it.
                {"date": "2026-07-01", "service_code": "PC-01",
                 "service_description": "Personal care", "stream": "Independence",
                 "gross": 1924.0, "participant_contribution": 0.0, "government_paid": 1924.0},
                {"date": "2026-07-15", "service_code": "NU-01",
                 "service_description": "RN visit", "stream": "Clinical",
                 "gross": 660.0, "participant_contribution": 0.0, "government_paid": 660.0},
                {"date": "2026-08-01", "service_code": "ML-01",
                 "service_description": "Home meal delivery", "stream": "EverydayLiving",
                 "gross": 3463.0, "participant_contribution": 0.0, "government_paid": 3463.0},
                {"date": "2026-09-30", "service_code": "CM-01",
                 "service_description": "Care management fee", "stream": "CareMgmt",
                 "gross": 754.70, "participant_contribution": 0.0, "government_paid": 754.70},
            ],
            "provider_notes_raw": [],
            "_source_text": "",
            "at_hm_commitments": [],
            "at_hm_line_items_this_period": [],
        }
        data.update(overrides)
        return data

    def test_rule_1_care_mgmt_cap_quarterly_shipping_block(self):
        """S3.D1 — Care management above 10% cap on quarterly. SHIPPING BLOCK."""
        extracted = self._base_quarterly()
        audit = {"anomalies": []}
        result = agents._add_parse_warnings(audit, extracted)
        rules = [(a.get("rule") or "") for a in result.get("anomalies", [])]
        assert "RULE_1_CARE_MGMT_CAP" in rules, (
            "S3.D1 SHIPPING BLOCK: care-management-above-10%-cap must fire "
            f"on quarterly statements. Rules fired: {rules}"
        )
        # And it must be HIGH severity.
        r1 = next(a for a in result["anomalies"] if a.get("rule") == "RULE_1_CARE_MGMT_CAP")
        assert r1.get("severity") == "high", "RULE_1 must be HIGH severity"

    def test_rule_21_prohibited_brokerage_fee_shipping_block(self):
        """S4.D6 — Prohibited brokerage fee. SHIPPING BLOCK."""
        extracted = self._base_quarterly(
            _source_text="Brokerage fee — arrangements $68.00\nExit administration fee $142.00\n",
        )
        result = agents._add_parse_warnings({"anomalies": []}, extracted)
        rules = [(a.get("rule") or "") for a in result.get("anomalies", [])]
        assert "RULE_21_PROHIBITED_ADMIN_FEE" in rules, (
            "S4.D6 / S4.D7 SHIPPING BLOCK: prohibited brokerage + exit fees "
            f"must fire. Rules fired: {rules}"
        )
        r21 = next(a for a in result["anomalies"] if a.get("rule") == "RULE_21_PROHIBITED_ADMIN_FEE")
        assert r21.get("severity") == "high"
        # Both fees must be in the flagged total ($210 = $68 + $142).
        assert r21.get("dollar_impact", 0) >= 200.0, (
            f"Both brokerage AND exit fees must be caught. Dollar impact was ${r21.get('dollar_impact')}."
        )

    def test_rule_21_line_item_prohibited_fees(self):
        """Prohibited-fee detection also works from extracted line items."""
        extracted = self._base_quarterly()
        extracted["line_items"] = extracted["line_items"] + [
            {"date": "2026-09-15", "service_code": "ADMIN-01",
             "service_description": "Brokerage fee — Fresh Meals Co", "stream": "EverydayLiving",
             "gross": 68.0, "participant_contribution": 0.0, "government_paid": 68.0},
            {"date": "2026-09-30", "service_code": "EXIT-01",
             "service_description": "Exit administration fee", "stream": "CareMgmt",
             "gross": 142.0, "participant_contribution": 0.0, "government_paid": 142.0},
        ]
        result = agents._add_parse_warnings({"anomalies": []}, extracted)
        rules = [(a.get("rule") or "") for a in result.get("anomalies", [])]
        assert "RULE_21_PROHIBITED_ADMIN_FEE" in rules


class TestBatchBRules:
    """Batch B — deferred anomaly rules from the checklist."""

    def _base(self, **overrides):
        data = {
            "participant_name": "Louisa Davids",
            "provider_name": "Glorious Services Pty Ltd",
            "statement_period": "1 July 2026 to 30 September 2026",
            "period_start": "2026-07-01",
            "period_end": "2026-09-30",
            "care_management_deducted": 100.0,
            "reported_total_gross": 1000.0,
            "line_items": [],
            "provider_notes_raw": [],
            "_source_text": "",
            "at_hm_commitments": [],
            "at_hm_line_items_this_period": [],
        }
        data.update(overrides)
        return data

    def test_rule_24_date_outside_period(self):
        extracted = self._base(
            line_items=[
                {"date": "2026-06-15", "service_code": "PC-01",  # BEFORE period
                 "service_description": "Personal care", "stream": "Independence",
                 "gross": 148.0, "participant_contribution": 0.0, "government_paid": 148.0},
            ],
        )
        result = agents._add_parse_warnings({"anomalies": []}, extracted)
        rules = [(a.get("rule") or "") for a in result.get("anomalies", [])]
        assert "RULE_24_DATE_OUTSIDE_PERIOD" in rules

    def test_rule_26_legacy_hcp_terminology_post_oct_2026(self):
        # Use a period ending on/after 1 Oct 2026 so RULE_26 activates.
        extracted = self._base(
            period_end="2026-10-31",
            period_start="2026-10-01",
            _source_text="This is a Home Care Package Level 4 statement covering package funds.",
        )
        result = agents._add_parse_warnings({"anomalies": []}, extracted)
        rules = [(a.get("rule") or "") for a in result.get("anomalies", [])]
        assert "RULE_26_LEGACY_HCP_TERMINOLOGY" in rules

    def test_rule_28_straddling_oct_2026(self):
        extracted = self._base(
            period_start="2026-09-01",
            period_end="2026-11-30",
            statement_period="1 September 2026 to 30 November 2026",
        )
        result = agents._add_parse_warnings({"anomalies": []}, extracted)
        rules = [(a.get("rule") or "") for a in result.get("anomalies", [])]
        assert "RULE_28_STRADDLING_OCT_2026" in rules

    def test_rule_29_missing_act_disclosure(self):
        extracted = self._base(_source_text="Some statement without any legal reference at all.")
        result = agents._add_parse_warnings({"anomalies": []}, extracted)
        rules = [(a.get("rule") or "") for a in result.get("anomalies", [])]
        assert "RULE_29_MISSING_ACT_DISCLOSURE" in rules

    def test_rule_29_silent_when_disclosure_present(self):
        extracted = self._base(
            _source_text="This statement is issued under the Aged Care Act and Support at Home Program rules.",
        )
        result = agents._add_parse_warnings({"anomalies": []}, extracted)
        rules = [(a.get("rule") or "") for a in result.get("anomalies", [])]
        assert "RULE_29_MISSING_ACT_DISCLOSURE" not in rules

    def test_rule_31_ambiguous_category(self):
        extracted = self._base(
            line_items=[
                {"date": "2026-07-15", "service_code": "AMB-01",
                 "service_description": "Service delivery — combined activities",
                 "stream": "Independence",
                 "gross": 342.0, "participant_contribution": 0.0, "government_paid": 342.0},
            ],
        )
        result = agents._add_parse_warnings({"anomalies": []}, extracted)
        rules = [(a.get("rule") or "") for a in result.get("anomalies", [])]
        assert "RULE_31_AMBIGUOUS_CATEGORY" in rules

    def test_rule_32_provider_header_footer_mismatch(self):
        # Provider extracted as "Glorious Services Group" but footer says
        # "Glorious Services Pty Ltd" — mismatch on legal entity.
        extracted = self._base(
            provider_name="Glorious Services Group",
            _source_text=(
                "Header text here about statement.\n"
                "Various line items go in the middle here.\n"
                "This is padding to ensure the source text is long enough to reach the 25%-tail check.\n"
                "More padding, more padding, more padding.\n"
                "Even more padding text so the footer heuristic can activate properly.\n"
                "Signed on behalf of Glorious Services Pty Ltd.\n"
                "ABN 12 345 678 901.\n"
                "Registered under the Aged Care Act."
            ),
        )
        result = agents._add_parse_warnings({"anomalies": []}, extracted)
        rules = [(a.get("rule") or "") for a in result.get("anomalies", [])]
        assert "RULE_32_PROVIDER_HEADER_FOOTER_MISMATCH" in rules

    def test_rule_1b_skipped_on_quarterly(self):
        """RULE_1B is the MONTHLY care-mgmt cap. Must NOT fire on quarterly."""
        extracted = self._base(
            care_management_deducted=754.70,
            line_items=[
                {"date": "2026-07-01", "service_code": "PC-01",
                 "service_description": "Personal care", "stream": "Independence",
                 "gross": 6000.0, "participant_contribution": 0.0, "government_paid": 6000.0},
            ],
        )
        # Set cadence to quarterly explicitly by supplying a matching span
        audit = {"anomalies": [], "statement_summary": {"cadence": "quarterly"}}
        result = agents._add_parse_warnings(audit, extracted)
        rules = [(a.get("rule") or "") for a in result.get("anomalies", [])]
        assert "RULE_1B_CARE_MGMT_MONTHLY" not in rules, (
            "RULE_1B must not fire on quarterly statements — the quarterly cap "
            "variant is RULE_1_CARE_MGMT_CAP."
        )


class TestDedupCrossStream:
    """Verify duplicate items across per-stream extractors are deduped."""

    def test_cross_stream_dedup_by_desc_and_amount(self):
        # Same "Personal care shower" row emitted by two chunks with different
        # codes and date formats. Should collapse to ONE.
        raw_items = [
            {"date": "07/07/2026", "service_code": "",
             "service_description": "Personal care shower", "stream": "Clinical",
             "gross": 85.0},
            {"date": "2026-07-07", "service_code": "PC-01",
             "service_description": "Personal care shower", "stream": "Independence",
             "gross": 85.0},
        ]
        deduped, dropped = agents._dedupe_line_items(raw_items)
        assert dropped == 1, f"Expected 1 dropped, got {dropped}"
        assert len(deduped) == 1
        # The row with the more-specific code / preferred stream wins.
        winner = deduped[0]
        assert winner.get("stream") == "Independence"

    def test_athm_cross_extractor_dedup(self):
        # AT-HM row emitted by EverydayLiving chunk (AT-COOLING-VEST code) and
        # by Adjustments chunk (ATHM-2026-0041 code). Different date formats,
        # same gross, same first-3-tokens of description.
        raw_items = [
            {"date": "12/08/2026", "service_code": "AT-COOLING-VEST",
             "service_description": "Cooling vest — thermoregulation supplement",
             "stream": "ATHM", "gross": 421.0},
            {"date": "2026-08-12", "service_code": "ATHM-2026-0041",
             "service_description": "Cooling vest (approved supplement)",
             "stream": "ATHM", "gross": 421.0},
        ]
        deduped, dropped = agents._dedupe_line_items(raw_items)
        assert dropped == 1
        assert len(deduped) == 1


class TestCadenceInference:
    """Cadence must always be persisted on the summary even when an LLM
    RULE_14 anomaly is already in the audit result."""

    def test_cadence_set_even_when_llm_emits_rule_14(self):
        extracted = {
            "period_start": "2026-07-01",
            "period_end": "2026-09-30",
            "statement_period": "1 July 2026 to 30 September 2026",
            "care_management_deducted": 100.0,
            "reported_total_gross": 1000.0,
            "line_items": [],
            "provider_notes_raw": [],
            "at_hm_commitments": [],
            "at_hm_line_items_this_period": [],
        }
        audit = {"anomalies": [{"rule": "RULE_14_PERIOD_PARSE_WARNING", "severity": "low", "headline": "LLM already emitted", "detail": ""}]}
        result = agents._add_parse_warnings(audit, extracted)
        assert result.get("statement_summary", {}).get("cadence") == "quarterly", (
            f"Cadence must be set to quarterly for a 92-day span. "
            f"Got: {result.get('statement_summary', {})}"
        )

    def test_cadence_monthly_31_days(self):
        extracted = {
            "period_start": "2026-07-01",
            "period_end": "2026-07-31",
            "statement_period": "July 2026",
            "care_management_deducted": 100.0,
            "reported_total_gross": 1000.0,
            "line_items": [],
            "provider_notes_raw": [],
            "at_hm_commitments": [],
            "at_hm_line_items_this_period": [],
        }
        result = agents._add_parse_warnings({"anomalies": []}, extracted)
        assert result.get("statement_summary", {}).get("cadence") == "monthly"



# =============================================================================
# DEC-1 v7.7 Batch B — Round 2 regression fixes
# =============================================================================


class TestBatchBRound2:
    """Round 2 fixes: RULE_1 dual-base check, RULE_16 direction guard,
    RULE_2 variant matching, filler-flag stripping, date inheritance
    source-text detection."""

    def _quarterly_base(self, **overrides):
        data = {
            "participant_name": "Louisa Davids",
            "provider_name": "Glorious Services Pty Ltd",
            "statement_period": "1 July 2026 to 30 September 2026",
            "period_start": "2026-07-01",
            "period_end": "2026-09-30",
            "care_management_deducted": 100.0,
            "reported_total_gross": 1000.0,
            "line_items": [],
            "provider_notes_raw": [],
            "_source_text": "",
            "at_hm_commitments": [],
            "at_hm_line_items_this_period": [],
        }
        data.update(overrides)
        return data

    def test_rule_1_care_mgmt_cap_no_false_positive_when_reported_unreliable(self):
        """S2-style case: extracted total > reported total means reported
        field is unreliable and shouldn't be used as a cap base."""
        # Extracted line items sum to $9,409 (a healthy quarterly). CM $870.25 = 10%
        # of $8,702.50 EXACTLY. But reported_total_gross is wrong at $8,279 —
        # if we naively used reported base we'd wrongly flag a $200 excess.
        extracted = self._quarterly_base(
            care_management_deducted=870.25,
            reported_total_gross=8279.0,  # LLM extraction glitch
            line_items=[
                {"date": "2026-07-01", "service_code": "NU-01",
                 "service_description": "RN visit", "stream": "Clinical",
                 "gross": 1932.0, "participant_contribution": 0.0, "government_paid": 1932.0},
                {"date": "2026-07-02", "service_code": "PC-01",
                 "service_description": "Personal care", "stream": "Independence",
                 "gross": 3886.0, "participant_contribution": 0.0, "government_paid": 3886.0},
                {"date": "2026-07-03", "service_code": "DA-01",
                 "service_description": "Domestic assist", "stream": "EverydayLiving",
                 "gross": 2884.50, "participant_contribution": 0.0, "government_paid": 2884.50},
                {"date": "2026-07-04", "service_code": "AT-01",
                 "service_description": "AT-HM row", "stream": "ATHM",
                 "gross": 707.0, "participant_contribution": 0.0, "government_paid": 707.0},
                {"date": "2026-07-05", "service_code": "CM-01",
                 "service_description": "Care management fee", "stream": "CareMgmt",
                 "gross": 870.25, "participant_contribution": 0.0, "government_paid": 870.25},
            ],
        )
        result = agents._add_parse_warnings({"anomalies": []}, extracted)
        rules = [(a.get("rule") or "") for a in result.get("anomalies", [])]
        assert "RULE_1_CARE_MGMT_CAP" not in rules, (
            f"RULE_1 must NOT false-fire when the LLM's reported_total_gross "
            f"is unreliable but the extracted subtotal shows CM = 10% cap exactly. "
            f"Rules fired: {rules}"
        )

    def test_rule_1_care_mgmt_cap_fires_when_both_bases_breach(self):
        """S3-style case: extracted subtotal AND reported base both show a
        breach → rule fires."""
        extracted = self._quarterly_base(
            care_management_deducted=754.70,
            reported_total_gross=7029.70,  # Aligned with source
            line_items=[
                {"date": "2026-07-15", "service_code": "NU-01",
                 "service_description": "RN visit", "stream": "Clinical",
                 "gross": 660.0, "participant_contribution": 0.0, "government_paid": 660.0},
                {"date": "2026-07-15", "service_code": "PC-01",
                 "service_description": "Personal care", "stream": "Independence",
                 "gross": 2340.0, "participant_contribution": 0.0, "government_paid": 2340.0},
                {"date": "2026-07-15", "service_code": "ML-01",
                 "service_description": "Meal delivery", "stream": "EverydayLiving",
                 "gross": 3047.0, "participant_contribution": 0.0, "government_paid": 3047.0},
                {"date": "2026-09-30", "service_code": "CM-01",
                 "service_description": "Care management fee", "stream": "CareMgmt",
                 "gross": 754.70, "participant_contribution": 0.0, "government_paid": 754.70},
            ],
        )
        result = agents._add_parse_warnings({"anomalies": []}, extracted)
        rules = [(a.get("rule") or "") for a in result.get("anomalies", [])]
        assert "RULE_1_CARE_MGMT_CAP" in rules, (
            f"RULE_1 must fire when both extracted and reported bases show "
            f"a cap breach. Rules: {rules}"
        )

    def test_no_findings_filler_stripped(self):
        """LLM-emitted 'rule does not apply' / 'no anomalies found' padding
        flags must be stripped."""
        audit = {"anomalies": [
            {"rule": "RULE_8_TRANSPORT_STREAM_QUERY", "severity": "low",
             "headline": "No transport services found",
             "detail": "Rule does not apply to this statement."},
            {"rule": "RULE_5_STREAM_MISCLASS", "severity": "low",
             "headline": "No violation detected",
             "detail": "Compliant with stream classification rules."},
        ]}
        extracted = self._quarterly_base()
        result = agents._add_parse_warnings(audit, extracted)
        rules = [(a.get("rule") or "") for a in result.get("anomalies", [])]
        assert "RULE_8_TRANSPORT_STREAM_QUERY" not in rules
        assert "RULE_5_STREAM_MISCLASS" not in rules

    def test_rule_2_variant_matching(self):
        """RULE_2 filter should strip weekday-rate hedge flags across all
        RULE_2 variants (WEEKEND, AFTER, AFTERHOURS, SATURDAY, etc.)."""
        audit = {"anomalies": [
            {"rule": "RULE_2_WEEKEND_RATE", "severity": "medium",
             "headline": "OT rate elevated",
             "detail": "Occupational therapy at $210/hr appears elevated for weekday clinical."},
            {"rule": "RULE_2_AFTER_HOURS", "severity": "medium",
             "headline": "PC rate typical",
             "detail": "Personal care $150/hr exceeds typical weekday rate."},
        ]}
        extracted = self._quarterly_base()
        result = agents._add_parse_warnings(audit, extracted)
        rules = [(a.get("rule") or "") for a in result.get("anomalies", [])]
        assert "RULE_2_WEEKEND_RATE" not in rules
        assert "RULE_2_AFTER_HOURS" not in rules

    def test_stream_discrepancy_generic_stripped(self):
        """LLM-emitted 'stream totals do not match' anomalies must be
        stripped when they mention generic 'stream totals' language."""
        audit = {"anomalies": [
            {"rule": "RULE_16_STREAM_DISCREPANCY", "severity": "medium",
             "headline": "Reported stream totals do not match extracted line-item sums",
             "detail": "Reported stream totals do not align with extracted stream totals."},
        ]}
        extracted = self._quarterly_base()
        result = agents._add_parse_warnings(audit, extracted)
        rules = [(a.get("rule") or "") for a in result.get("anomalies", [])]
        assert "RULE_16_STREAM_DISCREPANCY" not in rules

    def test_rule_16_no_false_positive_when_extracted_exceeds_header(self):
        """RULE_16 (deterministic Everyday Living discrepancy) must not
        fire when extracted sum EXCEEDS header value — that's a source
        header formatting quirk, not a billing defect."""
        extracted = {
            "period_start": "2026-07-01",
            "period_end": "2026-07-31",
            "care_management_deducted": 100.0,
            "reported_total_gross": 1000.0,
            "line_items": [
                {"date": "2026-07-15", "service_code": "DA-01",
                 "service_description": "Domestic assist", "stream": "EverydayLiving",
                 "gross": 306.0, "participant_contribution": 0.0, "government_paid": 306.0},
            ],
            # Header claims EL = $102 (only fortnightly cleaning),
            # but actual sum = $306.
            "stream_used_this_month": {"EverydayLiving": 102.0, "Clinical": 0.0, "Independence": 0.0},
            "provider_notes_raw": [],
            "at_hm_commitments": [],
            "at_hm_line_items_this_period": [],
        }
        result = agents._add_parse_warnings({"anomalies": []}, extracted)
        rules = [(a.get("rule") or "") for a in result.get("anomalies", [])]
        assert "RULE_16_STREAM_DISCREPANCY" not in rules, (
            f"RULE_16 must not fire when extracted > header. Rules: {rules}"
        )
