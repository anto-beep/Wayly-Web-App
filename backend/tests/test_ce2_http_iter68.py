"""HTTP-level integration tests for CE-2 v1.1 Phase 3: HCP comparison + PDF.

Hits the public endpoint (REACT_APP_BACKEND_URL) so we test what the browser
sees, including any ingress/routing config.
"""
from __future__ import annotations

import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mobile-exact-parity.preview.emergentagent.com").rstrip("/")


BILL = {
    "assessment_status": "have_classification",
    "pension_status": "part_pension",
    "relationship": "single",
    "homeowner": True,
    "entry_path": "post_nov_2025",
    "classification": "class_5",
    "income_excluding_pension": 19029.18,
    "financial_assets": 10000,
    "service_mix": {"clinical": 30, "independence": 45, "everyday": 25},
    "effective_date": "2026-03-20",
    "person_name": "Bill",
}

JOHN = {
    "assessment_status": "have_classification",
    "pension_status": "full_pension",
    "relationship": "single",
    "homeowner": True,
    "entry_path": "hcp_pre_sep_2024",
    "hcp_paid_fees": False,
    "hcp_level_when_grandfathered": 3,
    "classification": "class_3",
    "service_mix": {"clinical": 30, "independence": 45, "everyday": 25},
    "effective_date": "2026-03-20",
    "person_name": "John",
}

DOROTHY_NPQ = {
    "assessment_status": "have_classification",
    "pension_status": "full_pension",
    "relationship": "single",
    "homeowner": True,
    "entry_path": "npq_pre_sep_2024",
    "classification": "class_4",
    "service_mix": {"clinical": 30, "independence": 45, "everyday": 25},
    "effective_date": "2026-03-20",
    "person_name": "Dorothy",
}

GRANDF_OVERRIDE = {
    "assessment_status": "have_classification",
    "pension_status": "full_pension",
    "relationship": "single",
    "homeowner": True,
    "entry_path": "hcp_post_sep_pre_nov_2025",
    "hcp_level_when_grandfathered": 2,
    "classification": "class_8",
    "service_mix": {"clinking": 30, "independence": 45, "everyday": 25},
    "effective_date": "2026-03-20",
    "person_name": "GrandfTest",
}


class TestCalculateHcpVisibility:
    def test_bill_post_nov_2025_toggle_mode(self):
        r = requests.post(f"{BASE_URL}/api/ce2/calculate", json=BILL, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["show_hcp_comparison"] == "toggle"
        hcp = d.get("hcp_comparison")
        assert hcp is not None
        assert hcp["hcp_level"] == 3
        assert hcp["basic_daily_fee_daily"] == 13.14
        # 13.14/day * 7 = 91.98/wk
        assert abs(hcp["hcp_weekly"] - 91.98) < 0.05
        assert hcp["itcf_daily"] == 0.0
        assert hcp["sah_annual"] > 0

    def test_john_fee_exempt_always_mode(self):
        r = requests.post(f"{BASE_URL}/api/ce2/calculate", json=JOHN, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["is_fee_exempt"] is True
        assert d["show_hcp_comparison"] == "always"
        hcp = d["hcp_comparison"]
        assert hcp["hcp_level"] == 3
        assert abs(hcp["hcp_weekly"] - 91.98) < 0.05
        assert hcp["sah_weekly"] == 0.0
        assert abs(hcp["delta_weekly"] - (-91.98)) < 0.05
        assert hcp["is_sah_cheaper"] is True

    def test_npq_never_mode(self):
        r = requests.post(f"{BASE_URL}/api/ce2/calculate", json=DOROTHY_NPQ, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["show_hcp_comparison"] == "never"
        assert d["hcp_comparison"] is None

    def test_grandfathered_level_override_wins(self):
        payload = dict(GRANDF_OVERRIDE)
        payload["service_mix"] = {"clinical": 30, "independence": 45, "everyday": 25}
        r = requests.post(f"{BASE_URL}/api/ce2/calculate", json=payload, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["show_hcp_comparison"] == "always"
        hcp = d["hcp_comparison"]
        assert hcp["hcp_level"] == 2  # override wins
        assert hcp["basic_daily_fee_daily"] == 12.78


class TestPdfEndpoint:
    def test_bill_pdf(self):
        r = requests.post(f"{BASE_URL}/api/ce2/pdf", json=BILL, timeout=30)
        assert r.status_code == 200, r.text[:500]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        cd = r.headers.get("content-disposition", "")
        assert "attachment" in cd
        assert "Bill_contribution_estimate.pdf" in cd
        assert r.content.startswith(b"%PDF")
        assert 2_000 < len(r.content) < 60_000
        # Wayly voice: no em/en dashes
        assert b"\xe2\x80\x94" not in r.content
        assert b"\xe2\x80\x93" not in r.content

    def test_john_pdf(self):
        r = requests.post(f"{BASE_URL}/api/ce2/pdf", json=JOHN, timeout=30)
        assert r.status_code == 200
        assert r.content.startswith(b"%PDF")
        cd = r.headers.get("content-disposition", "")
        assert "John_contribution_estimate.pdf" in cd
        # fee-exempt should NOT contain the "WHO PAYS WHAT" band
        assert b"WHO PAYS WHAT" not in r.content
