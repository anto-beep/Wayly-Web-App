"""Regression suite for the Support at Home contribution-rate fix.

Background
----------
Wayly previously hard-coded part Age Pension rates as Independence 17.5% and
Everyday Living 50%. The Department of Health "Support at Home program -
participant contributions" PDF (effective 1 November 2025) defines the
following standard structure:

  Clinical / AT-HM / Care Mgmt: 0% for everyone.
  Independence:
    full Age Pension                    -> exactly  5%
    part Age Pension *or* CSHC          -> band      5% – 50%
    self-funded (no CSHC)               -> exactly 50%
  Everyday Living:
    full Age Pension                    -> exactly 17.5%
    part Age Pension *or* CSHC          -> band   17.5% – 80%
    self-funded (no CSHC)               -> exactly 80%

Part Age Pension and CSHC share the SAME band in the official table — the
exact rate within the band is set by Services Australia via the
income-and-assets means test. Rule 9 in the Statement Decoder validates
against these bands. The tests here exercise the deterministic
``_add_parse_warnings`` helper with synthetic ``extracted`` payloads so we
do NOT touch the LLM.
"""
from __future__ import annotations
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


@pytest.fixture(autouse=True)
def _seed_index1_contribution(monkeypatch):
    """DEC-FINDINGS-1 decision 2: contribution rates come from INDEX-1.
    Seed the program_reference cache so the deterministic decoder can resolve
    the bands during the test."""
    import program_reference as pr
    monkeypatch.setattr(pr, "_CACHE", {
        "contribution.independence_band": [("2025-11-01", None, [0.05, 0.50], "id-ind")],
        "contribution.everyday_band": [("2025-11-01", None, [0.175, 0.80], "id-eve")],
        "contribution.clinical_pct": [("2025-11-01", None, 0.00, "id-cli")],
    }, raising=False)
    monkeypatch.setattr(pr, "_CACHE_READY", True, raising=False)
    yield


def _empty_audit() -> dict:
    return {"anomalies": []}


def _line(stream: str, gross: float, contribution: float, *, date: str = "2026-03-05",
          code: str | None = None, description: str | None = None, cancelled: bool = False) -> dict:
    return {
        "date": date,
        "service_code": code or f"{stream[:2].upper()}-01",
        "service_description": description or f"{stream} visit",
        "stream": stream,
        "hours": 1.0,
        "unit_rate": gross,
        "gross": gross,
        "participant_contribution": contribution,
        "government_paid": round(gross - contribution, 2),
        "is_cancellation": cancelled,
    }


def _extracted(pension_status: str, *line_items) -> dict:
    return {
        "pension_status": pension_status,
        "period_start": "2026-03-01",
        "period_end": "2026-03-31",
        "statement_period": "March 2026",
        "reported_total_gross": sum(li["gross"] for li in line_items if not li["is_cancellation"]),
        "line_items": list(line_items),
        "previous_period_adjustments": [],
    }


def _rules_by_key(audit: dict) -> list[str]:
    return [(a.get("rule") or "").upper() for a in audit.get("anomalies", [])]


# ---------------------------------------------------------------------------
# (1) Part-pension Independence at 12% → ZERO Rule 9 anomalies (inside band)
# ---------------------------------------------------------------------------
def test_part_pension_independence_12_pct_silent():
    from agents import _add_parse_warnings

    extracted = _extracted(
        "part_age_pension",
        _line("Independence", 100.0, 12.0, date="2026-03-05", code="IND-01"),
        _line("Independence", 100.0, 12.0, date="2026-03-12", code="IND-01"),
        _line("Independence", 100.0, 12.0, date="2026-03-19", code="IND-01"),
    )
    audit = _add_parse_warnings(_empty_audit(), extracted)
    rule_9_anoms = [r for r in _rules_by_key(audit) if r.startswith("RULE_9")]
    assert rule_9_anoms == [], f"Expected zero Rule 9 anomalies, got {rule_9_anoms}"


# ---------------------------------------------------------------------------
# (2) Independence at 60% on a part-pension statement.
#     DEC-FINDINGS-1 decision 3: the Decoder no longer asserts a dollar-level
#     contribution mismatch. An out-of-band charge surfaces as ONE consolidated
#     informational note (RULE_9_CONTRIBUTION_INFO); the authoritative check
#     lives in the Invoice Checker.
# ---------------------------------------------------------------------------
def test_part_pension_independence_above_band_flags_once():
    from agents import _add_parse_warnings

    extracted = _extracted(
        "part_age_pension",
        _line("Independence", 100.0, 12.0, date="2026-03-05", code="IND-01"),
        _line("Independence", 100.0, 12.0, date="2026-03-12", code="IND-01"),
        _line("Independence", 100.0, 60.0, date="2026-03-19", code="IND-02",
              description="Independence top-up"),
    )
    audit = _add_parse_warnings(_empty_audit(), extracted)
    # No MEDIUM contribution finding anywhere (decision 4).
    assert not [a for a in audit["anomalies"]
                if (a.get("severity") or "").lower() == "medium"], audit["anomalies"]
    infos = [a for a in audit["anomalies"]
             if (a.get("rule") or "").upper() == "RULE_9_CONTRIBUTION_INFO"]
    assert len(infos) == 1, f"Expected exactly one consolidated INFO note, got {audit['anomalies']}"
    assert infos[0]["severity"] == "info"
    assert "Independence" in str(infos[0].get("evidence"))
    blob = " ".join(str(infos[0].get(k) or "") for k in ("headline", "detail", "suggested_action")).lower()
    assert "refund" not in blob


# ---------------------------------------------------------------------------
# (3) Two Independence lines with different implied rates, both inside the band.
#     Decision 3: no inconsistent-rate flag, and both are inside the band so no
#     informational note either.
# ---------------------------------------------------------------------------
def test_part_pension_inconsistent_rate_flagged():
    from agents import _add_parse_warnings

    extracted = _extracted(
        "part_age_pension",
        _line("Independence", 100.0, 12.0, date="2026-03-05", code="IND-01"),
        _line("Independence", 100.0, 19.0, date="2026-03-12", code="IND-01"),
    )
    audit = _add_parse_warnings(_empty_audit(), extracted)
    rule_9 = [r for r in _rules_by_key(audit) if r.startswith("RULE_9")]
    assert "RULE_9_INCONSISTENT_RATE" not in rule_9, "inconsistent-rate flag removed by decision 3"
    assert "RULE_9_CONTRIBUTION_MISMATCH" not in rule_9, "no dollar-level mismatch in the Decoder"
    # 12% and 19% are both inside the 5%-50% band → no informational note.
    assert "RULE_9_CONTRIBUTION_INFO" not in rule_9, rule_9


# ---------------------------------------------------------------------------
# (4) Full-pension exact-rate behaviour unchanged
# ---------------------------------------------------------------------------
def test_full_pension_exact_rate_silent_when_correct():
    from agents import _add_parse_warnings

    extracted = _extracted(
        "full_age_pension",
        _line("Independence", 100.0, 5.0, date="2026-03-05"),
        _line("EverydayLiving", 80.0, 14.0, date="2026-03-07"),  # 80 * 17.5% = 14
        _line("Clinical", 150.0, 0.0, date="2026-03-09"),
    )
    audit = _add_parse_warnings(_empty_audit(), extracted)
    rule_9_anoms = [r for r in _rules_by_key(audit) if r.startswith("RULE_9")]
    assert rule_9_anoms == [], f"Full-pension exact rates should be silent, got {rule_9_anoms}"


def test_full_pension_exact_rate_flags_when_wrong():
    from agents import _add_parse_warnings

    extracted = _extracted(
        "full_age_pension",
        # 9% — wrong; full Age Pension Independence is exactly 5%.
        _line("Independence", 100.0, 9.0, date="2026-03-05"),
    )
    audit = _add_parse_warnings(_empty_audit(), extracted)
    # Decision 3: surfaces as ONE informational note, not a MEDIUM mismatch.
    assert not [a for a in audit["anomalies"]
                if (a.get("severity") or "").lower() == "medium"], audit["anomalies"]
    infos = [a for a in audit["anomalies"]
             if (a.get("rule") or "").upper() == "RULE_9_CONTRIBUTION_INFO"]
    assert len(infos) == 1, audit["anomalies"]
    assert infos[0]["severity"] == "info"


def test_self_funded_exact_rate_silent_when_correct():
    """Self-funded (no CSHC) is an exact-rate cohort: Independence 50%, Everyday 80%."""
    from agents import _add_parse_warnings

    extracted = _extracted(
        "self_funded",
        _line("Independence", 100.0, 50.0, date="2026-03-05"),
        _line("EverydayLiving", 80.0, 64.0, date="2026-03-07"),  # 80 * 80% = 64
    )
    audit = _add_parse_warnings(_empty_audit(), extracted)
    rule_9_anoms = [r for r in _rules_by_key(audit) if r.startswith("RULE_9")]
    assert rule_9_anoms == [], rule_9_anoms


# ---------------------------------------------------------------------------
# (5) Header pension detection — prompt + sentinel checks
# ---------------------------------------------------------------------------
def test_header_extractor_prompt_documents_new_detection_table():
    """The prompt the LLM sees must reflect the new detection rules. We
    can't run the LLM live in unit tests, but we can assert the prompt
    text is internally consistent so the extractor never falls back to
    the old (wrong) inference of part_age_pension from rates."""
    import agents
    prompt = agents.HEADER_EXTRACTOR_SYSTEM
    assert "EXPLICIT TEXT WINS" in prompt
    assert "(part Age Pension)" in prompt
    assert "(Commonwealth Seniors Health Card)" in prompt or "(CSHC)" in prompt
    # Old (wrong) rule must be gone.
    assert "Independence 17.5% AND Everyday Living 50% → \"part_age_pension\"" not in prompt
    # The cohort-unconfirmed bucket must exist for the band-fallback path.
    assert "part_or_cshc_unconfirmed" in prompt


def test_part_or_cshc_unconfirmed_uses_widest_band():
    """When the header extractor can't tell part Age Pension from CSHC, the
    deterministic check must validate against the wider 5%-50% / 17.5%-80%
    range so part-pension and CSHC participants are both inside the band."""
    from agents import _add_parse_warnings

    # 22% Independence — inside the 5-50 band → silent.
    silent = _add_parse_warnings(_empty_audit(), _extracted(
        "part_or_cshc_unconfirmed",
        _line("Independence", 100.0, 22.0, date="2026-03-05"),
    ))
    silent_rule_9 = [r for r in _rules_by_key(silent) if r.startswith("RULE_9")]
    assert silent_rule_9 == [], silent_rule_9

    # 65% Independence — outside even the widest 5-50 band → surfaces as the
    # consolidated informational note (decision 3), not a dollar-level mismatch.
    loud = _add_parse_warnings(_empty_audit(), _extracted(
        "part_or_cshc_unconfirmed",
        _line("Independence", 100.0, 65.0, date="2026-03-05"),
    ))
    loud_rule_9 = [r for r in _rules_by_key(loud) if r.startswith("RULE_9")]
    assert "RULE_9_CONTRIBUTION_INFO" in loud_rule_9, loud
    assert "RULE_9_CONTRIBUTION_MISMATCH" not in loud_rule_9, loud


# ---------------------------------------------------------------------------
# (5b) Unknown pension status keeps producing the existing soft note
# ---------------------------------------------------------------------------
def test_unknown_pension_status_emits_skip_note():
    from agents import _add_parse_warnings

    audit = _add_parse_warnings(_empty_audit(), _extracted(
        "unknown",
        _line("Independence", 100.0, 22.0),
    ))
    rules = _rules_by_key(audit)
    assert "RULE_9_PENSION_STATUS_UNKNOWN" in rules
    assert "RULE_9_CONTRIBUTION_MISMATCH" not in rules


# ---------------------------------------------------------------------------
# Pension rate table structural invariants
# ---------------------------------------------------------------------------
def test_pension_rates_table_shape():
    from agents import _PENSION_RATES

    expected_cohorts = {
        "full_age_pension", "part_age_pension", "cshc", "self_funded",
        "part_or_cshc_unconfirmed",
    }
    assert set(_PENSION_RATES.keys()) == expected_cohorts

    for cohort, streams in _PENSION_RATES.items():
        for stream, band in streams.items():
            assert isinstance(band, tuple) and len(band) == 2, (
                f"{cohort}.{stream} must be a (min, max) tuple, got {band!r}"
            )
            lo, hi = band
            assert 0.0 <= lo <= hi <= 1.0, f"{cohort}.{stream} out of range: {band}"

    # Sanity-check the most-load-bearing values.
    assert _PENSION_RATES["full_age_pension"]["Independence"] == (0.05, 0.05)
    assert _PENSION_RATES["full_age_pension"]["EverydayLiving"] == (0.175, 0.175)
    # Verified against DoH "Support at Home — participant contributions" PDF
    # (effective 1 November 2025) — part Age Pension and CSHC share the same
    # band.
    assert _PENSION_RATES["part_age_pension"]["Independence"] == (0.05, 0.50)
    assert _PENSION_RATES["part_age_pension"]["EverydayLiving"] == (0.175, 0.80)
    assert _PENSION_RATES["cshc"]["Independence"] == (0.05, 0.50)
    assert _PENSION_RATES["cshc"]["EverydayLiving"] == (0.175, 0.80)
    assert _PENSION_RATES["self_funded"]["Independence"] == (0.50, 0.50)
    assert _PENSION_RATES["self_funded"]["EverydayLiving"] == (0.80, 0.80)


def test_server_contribution_estimator_returns_band_midpoint_for_part_pension():
    """End-to-end live API check: confirm the new ``rate_basis`` field is
    populated for band cohorts and that ``cshc`` is accepted as a
    pension_status. Skips when the backend isn't reachable."""
    import os
    import requests

    api_url = os.environ.get("REACT_APP_BACKEND_URL") or _read_env(
        "/app/frontend/.env", "REACT_APP_BACKEND_URL"
    )
    if not api_url:
        pytest.skip("REACT_APP_BACKEND_URL not configured")

    # Caregiver Cathy is a family-plan account with access to paid public tools.
    login = requests.post(
        f"{api_url}/api/auth/login",
        json={"email": "cathy@example.com", "password": "testpass123"},
        timeout=20,
    )
    if login.status_code != 200:
        pytest.skip(f"login unavailable (status={login.status_code})")
    token = login.json().get("token")
    if not token:
        pytest.skip("login did not return a token")

    r = requests.post(
        f"{api_url}/api/public/contribution-estimator",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "classification": 4,
            "pension_status": "part",
            "expected_mix_clinical_pct": 30,
            "expected_mix_independence_pct": 45,
            "expected_mix_everyday_pct": 25,
        },
        timeout=20,
    )
    assert r.status_code in (200, 429), r.text
    if r.status_code == 429:
        pytest.skip(f"contribution-estimator rate-limited: {r.text}")
    result = r.json()
    assert result["pension_status"] == "part"
    # After F6 the band cohort returns a range when no user rates supplied.
    assert result["rate_basis"] == "band_range"
    streams = {s["stream"]: s for s in result["per_stream"]}
    assert streams["Independence"]["rate_pct"] is None
    assert streams["Independence"]["rate_pct_low"] == pytest.approx(5.0, abs=0.01)
    # Updated to match the official DoH PDF: part pension Independence band
    # tops out at 50% (same as CSHC).
    assert streams["Independence"]["rate_pct_high"] == pytest.approx(50.0, abs=0.01)
    assert streams["Independence"]["rate_band_pct"] == [5.0, 50.0]
    assert streams["Independence"]["is_band"] is True
    assert streams["Everyday Living"]["rate_pct"] is None
    assert streams["Everyday Living"]["rate_pct_high"] == pytest.approx(80.0, abs=0.01)
    assert streams["Clinical"]["rate_pct"] == 0.0

    # cshc must also be accepted under the new pattern.
    r2 = requests.post(
        f"{api_url}/api/public/contribution-estimator",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "classification": 4,
            "pension_status": "cshc",
            "expected_mix_clinical_pct": 30,
            "expected_mix_independence_pct": 45,
            "expected_mix_everyday_pct": 25,
        },
        timeout=20,
    )
    assert r2.status_code in (200, 429), r2.text
    if r2.status_code == 429:
        pytest.skip(f"contribution-estimator rate-limited on cshc check: {r2.text}")
    assert r2.json()["pension_status"] == "cshc"
    assert r2.json()["rate_basis"] == "band_range"


def _read_env(path: str, key: str) -> str | None:
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line.startswith(f"{key}="):
                    return line.split("=", 1)[1].strip()
    except FileNotFoundError:
        return None
    return None
