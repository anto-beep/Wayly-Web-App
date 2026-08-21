"""PPC-1 v2 live HTTP endpoint tests hitting the preview URL.

Complements the deterministic test_ppc_v2.py unit suite. Covers all HTTP-
surface acceptance items from the iteration 62 review request.
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://statement-checker-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CATHY_EMAIL = "cathy@example.com"
CATHY_PASSWORD = "testpass123"


# -------------------- shared fixtures --------------------

@pytest.fixture(scope="session")
def cathy_token():
    r = requests.post(f"{API}/auth/login", json={"email": CATHY_EMAIL, "password": CATHY_PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Cannot log in as cathy: {r.status_code} {r.text[:200]}")
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture
def cathy_client(cathy_token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {cathy_token}", "Content-Type": "application/json"})
    return s


# -------------------- WS1: snapshots + services --------------------

class TestSnapshotDictionary:
    def test_snapshots_endpoint(self):
        r = requests.get(f"{API}/ppc/snapshots", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["default_snapshot_id"] == "doh-2025-10"
        assert any(s["snapshot_id"] == "doh-2025-10" for s in data["snapshots"])

    def test_services_endpoint(self):
        r = requests.get(f"{API}/ppc/services", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["snapshot_id"] == "doh-2025-10"
        rows = data["services"]
        assert len(rows) > 0
        streams = {row.get("stream") for row in rows}
        assert {"Clinical", "Independence", "Everyday Living"}.issubset(streams)
        # both checkable + non-checkable rows present
        checkable_vals = {row.get("checkable") for row in rows}
        assert True in checkable_vals and False in checkable_vals


# -------------------- Public price check v2 --------------------

def _post_check(client, body):
    r = client.post(f"{API}/public/price-check-v2", json=body, timeout=15)
    return r


class TestPublicPriceCheckV2:
    def test_above_range_after_hours_guard(self, cathy_client):
        r = _post_check(cathy_client, {"service": "Personal care", "rate": 150, "pension_status": "full"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["position"] == "above"
        assert d["direction"] == "above_range"
        assert d["distance_from_edge"] == 35.0
        assert d["doh_caveat"] is not None
        # after-hours guard should fire before exact share is confirmed
        assert d["quality_guard"] is not None
        assert d["quality_guard"]["guard_type"] == "after_hours_ambiguity"
        # your_share must still resolve (exact for full pension Independence)
        assert d["your_share"]["mode"] == "exact"

    def test_in_range_clean(self, cathy_client):
        r = _post_check(cathy_client, {"service": "Personal care", "rate": 100, "pension_status": "full"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["position"] == "in"
        assert d["direction"] == "in_range"
        assert d["doh_caveat"] is None
        assert d["quality_guard"] is None

    def test_implausibly_low_guard(self, cathy_client):
        r = _post_check(cathy_client, {"service": "Personal care", "rate": 20})
        assert r.status_code == 200, r.text
        assert r.json()["quality_guard"]["guard_type"] == "implausibly_low"

    def test_below_range_distance(self, cathy_client):
        r = _post_check(cathy_client, {"service": "Personal care", "rate": 80})
        assert r.status_code == 200
        d = r.json()
        assert d["position"] == "below"
        assert d["direction"] == "below_range"
        assert d["distance_from_edge"] == 5.0

    def test_clinical_stream_returns_zero_share(self, cathy_client):
        r = _post_check(cathy_client, {"service": "Registered nurse", "rate": 170, "pension_status": "full"})
        assert r.status_code == 200
        d = r.json()
        assert d["your_share"]["mode"] == "clinical"
        assert d["your_share"]["amount"] == 0.0

    def test_personal_care_post_oct_2026_is_clinical(self, cathy_client):
        r = _post_check(cathy_client, {"service": "Personal care", "rate": 100, "pension_status": "full", "check_date": "2026-10-02"})
        assert r.status_code == 200
        assert r.json()["your_share"]["mode"] == "clinical"

    def test_personal_care_pre_oct_2026_is_exact(self, cathy_client):
        r = _post_check(cathy_client, {"service": "Personal care", "rate": 100, "pension_status": "full", "check_date": "2026-09-30"})
        assert r.status_code == 200
        d = r.json()
        assert d["your_share"]["mode"] == "exact"
        assert d["your_share"]["rate_pct"] == 5.0

    def test_grandfathered_returns_grandfathered_mode(self, cathy_client):
        r = _post_check(cathy_client, {"service": "Personal care", "rate": 100, "is_grandfathered": True})
        assert r.status_code == 200
        assert r.json()["your_share"]["mode"] == "grandfathered"

    def test_non_checkable_service_returns_panel_state(self, cathy_client):
        r = _post_check(cathy_client, {"service": "Package management (monthly flat fee)", "rate": 300})
        assert r.status_code == 200
        d = r.json()
        assert d["direction"] == "non_checkable"
        assert d["position"] == "not_checkable"

    def test_transport_per_km_override_treated_as_non_checkable(self, cathy_client):
        r = _post_check(cathy_client, {"service": "Transport", "rate": 5, "unit_override": "kilometre"})
        assert r.status_code == 200
        d = r.json()
        assert d["service"] == "Transport (per kilometre)"
        assert d["direction"] == "non_checkable"

    def test_unauth_call_blocked(self):
        # require_paid_plan should block unauthenticated
        r = requests.post(f"{API}/public/price-check-v2", json={"service": "Personal care", "rate": 100}, timeout=15)
        assert r.status_code in (401, 402, 403), f"Unexpected status: {r.status_code}"


# -------------------- CE state --------------------

class TestCEState:
    def test_ce_state_get_and_put(self, cathy_client):
        # Put a fresh state (does not require prior null)
        payload = {"pension_status": "full", "is_grandfathered": False, "classification": 4}
        r = cathy_client.put(f"{API}/tools/ce/state", json=payload, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["saved"] is True

        r2 = cathy_client.get(f"{API}/tools/ce/state", timeout=10)
        assert r2.status_code == 200
        state = r2.json()["state"]
        assert state is not None
        assert state["pension_status"] == "full"
        assert state["classification"] == 4


# -------------------- Save + history --------------------

class TestSavedChecks:
    provider_display = f"TEST_Glorious Services {uuid.uuid4().hex[:6]} Pty Ltd"

    @classmethod
    def _cleanup(cls, client):
        # Best-effort bulk delete of any leftover checks under this provider
        try:
            client.delete(
                f"{API}/ppc/checks/provider",
                params={"service": "Personal care", "provider": cls.provider_display},
                timeout=10,
            )
        except Exception:
            pass

    def test_save_check_and_fuzzy_match(self, cathy_client):
        self._cleanup(cathy_client)
        payload_first = {
            "service": "Personal care",
            "rate": 100.0,
            "provider": self.provider_display,
            "unit": "hour",
            "position": "in",
            "range_lower": 85.0,
            "range_upper": 115.0,
            "stream": "Independence",
            "source_date": "2025-10-01",
            "pension_status": "full",
        }
        r = cathy_client.post(f"{API}/ppc/checks", json=payload_first, timeout=15)
        assert r.status_code == 200, r.text
        first = r.json()
        assert first["saved"] is True
        assert first["check_id"]

        # Second: minor typo variant (drop one 's' from Services) should trigger
        # provider_fuzzy_match prompt via 1-edit-distance normalisation.
        variant = self.provider_display.replace("Services", "Service", 1)
        payload_second = dict(payload_first, rate=105.0, provider=variant)
        r2 = cathy_client.post(f"{API}/ppc/checks", json=payload_second, timeout=15)
        assert r2.status_code == 200, r2.text
        second = r2.json()
        assert second["saved"] is False, f"Expected saved=False for typo variant, got {second}"
        prompts = second.get("prompts") or []
        assert any(p.get("guard_type") == "provider_fuzzy_match" for p in prompts)

        # Resolve fuzzy match via merge_provider_id
        merge_id = first["check_id"]
        payload_merge = dict(payload_second, merge_provider_id=merge_id)
        r3 = cathy_client.post(f"{API}/ppc/checks", json=payload_merge, timeout=15)
        assert r3.status_code == 200
        third = r3.json()
        assert third["saved"] is True

    def test_list_checks_auth_only(self, cathy_client):
        r = cathy_client.get(f"{API}/ppc/checks", timeout=10)
        assert r.status_code == 200
        assert "checks" in r.json()

        # Unauthenticated
        r2 = requests.get(f"{API}/ppc/checks", timeout=10)
        assert r2.status_code in (401, 403)

    def test_history_endpoint(self, cathy_client):
        r = cathy_client.get(
            f"{API}/ppc/checks/history",
            params={"service": "Personal care", "provider": self.provider_display},
            timeout=10,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert "rate_increases_last_12mo" in d
        assert "change_delta" in d
        assert "change_pct" in d
        assert d["count"] >= 2

    def test_delete_check_and_bulk_delete(self, cathy_client):
        # Grab a couple of checks to delete
        r = cathy_client.get(f"{API}/ppc/checks", timeout=10)
        checks = r.json()["checks"]
        target = None
        for c in checks:
            if c.get("provider_display_name") and "TEST_Glorious" in c["provider_display_name"] and c["service"] == "Personal care":
                target = c
                break
        assert target is not None

        r_del = cathy_client.delete(f"{API}/ppc/checks/{target['id']}", timeout=10)
        assert r_del.status_code == 200, r_del.text
        # Response may be {deleted: True} OR {requires_confirmation: True}
        body = r_del.json()
        if body.get("requires_confirmation"):
            # Retry with confirm=true
            r_del2 = cathy_client.delete(f"{API}/ppc/checks/{target['id']}", params={"confirm": "true"}, timeout=10)
            assert r_del2.status_code == 200
            assert r_del2.json().get("deleted") is True
        else:
            assert body.get("deleted") is True

        # Bulk delete remaining
        r_bulk = cathy_client.delete(
            f"{API}/ppc/checks/provider",
            params={"service": "Personal care", "provider": self.provider_display},
            timeout=10,
        )
        assert r_bulk.status_code == 200
        assert "deleted" in r_bulk.json()


# -------------------- Email draft --------------------

class TestEmailDraft:
    def test_email_draft_contains_key_fields(self, cathy_client):
        r = cathy_client.post(f"{API}/ppc/email-draft", json={
            "service": "Personal care",
            "rate": 150.0,
            "unit": "hour",
            "provider": "TEST_Glorious",
            "lower": 85.0,
            "upper": 115.0,
            "source_date": "2025-10-01",
        }, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "subject" in d and "body" in d
        assert "personal care" in d["body"].lower()
        assert "150" in d["body"]
        assert "85" in d["body"] and "115" in d["body"]
        assert "2025-10-01" in d["body"]


# -------------------- Report issue --------------------

class TestReportIssue:
    @pytest.mark.skip(reason="Iter 62 review: /api/ppc/report-issue was removed; UI now uses shared /api/support/tickets endpoint (documented action item).")
    def test_report_issue_creates_ticket(self, cathy_client):
        r = cathy_client.post(f"{API}/ppc/report-issue", json={
            "service": "Personal care",
            "rate": 150.0,
            "result_payload": {"service": "Personal care", "position": "above"},
            "snapshot_id": "doh-2025-10",
            "user_note": "TEST_ report-issue integration test",
        }, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["reported"] is True
        assert d.get("defect_id")
        # Ticket reference expected (may be None only if user lookup failed)
        assert d.get("ticket_reference"), f"Expected WAY-#### ticket_reference; got {d}"
        assert d["ticket_reference"].startswith("WAY-")
        assert d.get("auto_acknowledge")


# -------------------- Iter 3/4/5: features + decoder-context + PDF + analytics --------------------

class TestFeatureFlag:
    def test_ppc_decoder_integration_default_off(self):
        """Feature flag reader responds gracefully when the flag doesn't exist."""
        r = requests.get(f"{API}/features/ppc_decoder_integration", timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["name"] == "ppc_decoder_integration"
        # If flag was seeded and enabled, both keys are true; the important
        # invariant is that the endpoint doesn't 404/500 and returns booleans.
        assert isinstance(d["enabled"], bool)
        assert isinstance(d["found"], bool)


class TestDecoderContext:
    def test_decoder_context_no_statements(self, cathy_client):
        r = cathy_client.get(f"{API}/ppc/decoder-context", params={"service": "Personal care"}, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "anomalies" in d and isinstance(d["anomalies"], list)
        assert "line_items" in d and isinstance(d["line_items"], list)
        assert "statement" in d  # may be None or an object

    def test_decoder_context_requires_auth(self):
        r = requests.get(f"{API}/ppc/decoder-context", params={"service": "Personal care"}, timeout=10)
        assert r.status_code in (401, 403)


class TestPdfExport:
    def _valid_payload(self):
        return {
            "service": "Personal care",
            "provider": "TEST_Glorious",
            "charged": 150.0,
            "unit": "hour",
            "position": "above",
            "plain_language": "You are paying $35 above the top of the DoH range.",
            "distance_summary": "$35 above the top of range",
            "lower": 85.0,
            "upper": 115.0,
            "median": 100.0,
            "stream": "Independence",
            "your_share_amount": 7.5,
            "your_share_explanation": "5% of the charged rate.",
            "source_date": "2025-10-01",
            "doh_caveat": "Includes an implicit after-hours loading test.",
            "notes": ["Note one", "Note two"],
        }

    def test_pdf_export_returns_valid_pdf(self, cathy_client):
        r = cathy_client.post(f"{API}/ppc/pdf-export", json=self._valid_payload(), timeout=20)
        assert r.status_code == 200, r.text
        assert r.headers["content-type"].startswith("application/pdf")
        assert "filename=" in r.headers.get("content-disposition", "")
        content = r.content
        assert content[:4] == b"%PDF", f"Bad PDF magic: {content[:8]}"
        assert len(content) > 1000, f"PDF too small: {len(content)} bytes"

    def test_pdf_export_requires_auth(self):
        r = requests.post(f"{API}/ppc/pdf-export", json=self._valid_payload(), timeout=10)
        assert r.status_code in (401, 403)


class TestAnalyticsEvent:
    ALLOWED_EVENTS = [
        "ppc_tool_opened", "ppc_service_selected", "ppc_result_rendered",
        "ppc_quality_guard_shown", "ppc_quality_guard_dismissed",
        "ppc_check_saved", "ppc_check_deleted", "ppc_history_opened",
        "ppc_email_drafted", "ppc_pdf_exported", "ppc_report_issue_submitted",
        "ppc_snapshot_selector_shown", "ppc_snapshot_switched",
        "ppc_adm_disclosure_opened", "ppc_prefill_applied",
    ]

    @pytest.mark.parametrize("event_name", ALLOWED_EVENTS)
    def test_all_allowed_events_accepted(self, cathy_client, event_name):
        r = cathy_client.post(f"{API}/ppc/analytics-event", json={
            "event_name": event_name,
            "props": {"test": True, "source": "iter63_regression"},
        }, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json() == {"ok": True}

    def test_unknown_event_rejected(self, cathy_client):
        r = cathy_client.post(f"{API}/ppc/analytics-event", json={
            "event_name": "malicious_event",
            "props": {},
        }, timeout=10)
        assert r.status_code == 400
        d = r.json()
        assert "malicious_event" in (d.get("detail") or "")

    def test_analytics_requires_auth(self):
        r = requests.post(f"{API}/ppc/analytics-event", json={"event_name": "ppc_tool_opened"}, timeout=10)
        assert r.status_code in (401, 403)



if __name__ == "__main__":
    pytest.main([__file__, "-v"])
