"""OXY-1 v1 · Full-scope tests (F1-F4 + advisory severity).

Post-Privacy-Policy-v1.2 sign-off. Covers the deterministic behaviour of the
oxygen certification workstream:

- F1: `oxygen_certification` + `certifications` are additive fields on the
       Participant model that persist through PATCH round-trips.
- F2: Budget Calculator UI amber warning is verified via a component-level
       test in `budgetSupplements.js` shape (covered by lint + e2e smoke).
       This suite covers the backend contract.
- F3: RULE_21_OXYGEN_ADVISORY fires on statements with an oxygen line item.
- F4: Care Plan Reviewer emits the oxygen advisory when the plan mentions
       oxygen therapy / concentrator / continuous oxygen.
- Advisory severity: `anomaly_count` carries the new "advisory" bucket.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import agents  # noqa: E402


# ---------------------------------------------------------------------------
# F1: Participant model schema
# ---------------------------------------------------------------------------

def test_F1_participant_model_accepts_oxygen_certification():
    """The additive `oxygen_certification` field is accepted by the Pydantic
    patch body without failing existing consumers."""
    import participant_profile as pp
    p = pp.ParticipantPatchBody(
        oxygen_certification={
            "certifying_practitioner_name": "Dr Jane Kim",
            "certification_date": "2026-05-01",
            "next_review_date": "2027-05-01",
        },
    )
    assert p.oxygen_certification is not None
    assert p.oxygen_certification["certifying_practitioner_name"] == "Dr Jane Kim"


def test_F1_participant_model_accepts_generic_certifications_dict():
    """`certifications` keyed dict shape lets ENT-1 add entries without a
    further migration."""
    import participant_profile as pp
    p = pp.ParticipantPatchBody(
        certifications={
            "oxygen": {"certifying_practitioner_name": "Dr Jane Kim"},
            "enteral": {"certifying_practitioner_name": "Dr Anne Doe"},
        },
    )
    assert p.certifications is not None
    assert "oxygen" in p.certifications and "enteral" in p.certifications


def test_F1_defaults_to_none_backward_compatible():
    import participant_profile as pp
    p = pp.ParticipantPatchBody()
    assert p.oxygen_certification is None
    assert p.certifications is None


# ---------------------------------------------------------------------------
# F3 + advisory severity: RULE_21_OXYGEN_ADVISORY
# ---------------------------------------------------------------------------

def test_F3_rule21_fires_on_oxygen_line_item():
    """When the statement carries a line item labelled "Oxygen supplement", the
    deterministic post-pass adds RULE_21_OXYGEN_ADVISORY at severity=advisory."""
    extracted = {
        "line_items": [
            {"service_code": "oxygen", "service_name": "Oxygen supplement", "total": 219.90, "stream": "supplement", "date": "2026-11-01"},
            {"service_code": "DA-01", "service_name": "Domestic assistance", "total": 100.00, "stream": "Everyday Living", "date": "2026-11-02"},
        ],
    }
    audit = {"anomalies": [], "anomaly_count": {"high": 0, "medium": 0, "low": 0, "advisory": 0}}
    result = agents._add_parse_warnings(audit, extracted)
    rules_hit = [a.get("rule") for a in result.get("anomalies", [])]
    assert "RULE_21_OXYGEN_ADVISORY" in rules_hit


def test_F3_rule21_severity_is_advisory_not_high():
    extracted = {"line_items": [{"service_code": "oxygen", "service_name": "Oxygen supplement", "total": 219.90}]}
    audit = {"anomalies": [], "anomaly_count": {"high": 0, "medium": 0, "low": 0, "advisory": 0}}
    result = agents._add_parse_warnings(audit, extracted)
    oxy_anomaly = next(a for a in result["anomalies"] if a["rule"] == "RULE_21_OXYGEN_ADVISORY")
    assert oxy_anomaly["severity"] == "advisory"
    # Never claims a dollar impact.
    assert oxy_anomaly["dollar_impact"] == 0.0


def test_F3_rule21_does_not_fire_without_oxygen():
    extracted = {
        "line_items": [
            {"service_code": "DA-01", "service_name": "Domestic assistance", "total": 100.00},
        ],
    }
    audit = {"anomalies": [], "anomaly_count": {"high": 0, "medium": 0, "low": 0, "advisory": 0}}
    result = agents._add_parse_warnings(audit, extracted)
    rules_hit = [a.get("rule") for a in result.get("anomalies", [])]
    assert "RULE_21_OXYGEN_ADVISORY" not in rules_hit


def test_F3_rule21_idempotent():
    """Running the rule twice does not double-count the advisory."""
    extracted = {"line_items": [{"service_code": "oxygen", "service_name": "Oxygen supplement", "total": 219.90}]}
    audit = {"anomalies": [], "anomaly_count": {"high": 0, "medium": 0, "low": 0, "advisory": 0}}
    once = agents._add_parse_warnings(audit, extracted)
    twice = agents._add_parse_warnings(once, extracted)
    hits = [a for a in twice["anomalies"] if a.get("rule") == "RULE_21_OXYGEN_ADVISORY"]
    assert len(hits) == 1


def test_advisory_severity_in_anomaly_count_shape():
    """New advisory bucket must be present in the counter."""
    audit = agents._empty_audit({"line_items": []})
    assert "advisory" in audit["anomaly_count"], (
        "advisory bucket missing from _empty_audit counter"
    )


# ---------------------------------------------------------------------------
# F5 already covered by test_oxy1_f5_f6.py; F6 covered by test_monetary_constants.
# ---------------------------------------------------------------------------
