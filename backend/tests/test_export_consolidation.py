"""Iter220 — Export Consolidation: /public/exports/pdf + /public/exports/email + /lf1 email."""
import os
import requests
import pytest

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://statement-checker-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
EMAIL = "cathy@example.com"
PASSWORD = "testpass123"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=60)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    token = r.json().get("token") or r.json().get("access_token")
    assert token, "no token returned"
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


BUDGET_PAYLOAD = {
    "classification_label": "Class 4",
    "annual_total": 45000.0,
    "quarterly_usable": 10125.0,
    "care_management_quarterly": 1125.0,
    "rollover_cap": 1000.0,
    "streams": [
        {"stream": "Clinical care", "allocated": 15000.0},
        {"stream": "Independence", "allocated": 20000.0},
        {"stream": "Everyday living", "allocated": 10000.0},
    ],
    "lifetime_contributions": 5000.0,
    "lifetime_cap": 137917.01,
    "lifetime_pct": 3.6,
}

CONTRIB_PAYLOAD = {
    "contribution_weekly": 84.5, "contribution_annual": 4394.0, "contribution_quarterly": 1098.5,
    "government_share_annual": 40606.0, "government_share_percent": 90.2,
    "independence_rate": 15.0, "everyday_rate": 17.5, "is_no_worse_off": False,
    "applicable_lifetime_cap": 137917.01, "contribution_post_october_2026_weekly": 62.0,
    "range_mode": False, "is_fee_exempt": False,
}

CARE_PLAN_PAYLOAD = {
    "extraction": {"provider_name": "BlueBerry Care", "classification": 4, "services": []},
    "findings": [{"severity": "compliance", "title": "Missing goals",
                  "detail": "No measurable outcomes documented.", "confidence": "high"}],
}

INVOICE_PAYLOAD = {
    "provider_name": "BlueBerry Care", "provider_abn": "12345678901",
    "invoice_date": "2026-03-01", "due_date": "2026-03-15",
    "document_shape": "invoice",
    "reconciliation": {"total_billed": 400.0, "total_expected": 400.0, "variance": 0.0, "lines": []},
}


@pytest.mark.parametrize("tool,payload", [
    ("budget", BUDGET_PAYLOAD),
    ("contribution", CONTRIB_PAYLOAD),
    ("care-plan", CARE_PLAN_PAYLOAD),
    ("invoice", INVOICE_PAYLOAD),
])
def test_public_exports_pdf(session, tool, payload):
    r = session.post(f"{API}/public/exports/pdf",
                     json={"tool": tool, "payload": payload, "person_name": "TEST Cathy"},
                     timeout=60)
    assert r.status_code == 200, f"{tool}: {r.status_code} {r.text[:300]}"
    assert r.headers.get("content-type", "").startswith("application/pdf"), \
        f"{tool}: content-type={r.headers.get('content-type')}"
    assert r.content[:4] == b"%PDF", f"{tool}: not a PDF, got {r.content[:20]!r}"
    assert len(r.content) > 500, f"{tool}: PDF too small ({len(r.content)} bytes)"


def test_public_exports_pdf_unknown_tool(session):
    r = session.post(f"{API}/public/exports/pdf",
                     json={"tool": "nonsense", "payload": {}}, timeout=15)
    assert r.status_code == 400


@pytest.mark.parametrize("tool,payload", [
    ("budget", BUDGET_PAYLOAD),
    ("contribution", CONTRIB_PAYLOAD),
])
def test_public_exports_email(session, tool, payload):
    r = session.post(f"{API}/public/exports/email",
                     json={"tool": tool, "payload": payload, "person_name": "TEST Cathy"},
                     timeout=45)
    # Per review: 502 Resend-domain-rejection OR 200 (real/mocked) both PASS.
    assert r.status_code in (200, 502), f"{tool} email: {r.status_code} {r.text[:300]}"
    if r.status_code == 200:
        data = r.json()
        assert data.get("ok") is True


def test_lf1_correspondence_email_endpoint_exists(session):
    """Endpoint must exist. 404 means letter id invalid (fine), 405 means route missing (fail)."""
    # First create a letter so we have a real id
    catalog = session.get(f"{API}/lf1/situations", timeout=15)
    if catalog.status_code != 200:
        pytest.skip(f"lf1/situations unavailable: {catalog.status_code}")
    sits = catalog.json().get("situations") or catalog.json()
    if not sits:
        pytest.skip("no situations")
    sit = sits[0]
    create = session.post(f"{API}/lf1/correspondence",
                          json={"situation_id": sit.get("id") or sit.get("situation_id"),
                                "recipient_type": sit.get("default_recipient_type") or "provider"},
                          timeout=15)
    if create.status_code not in (200, 201):
        pytest.skip(f"could not create letter: {create.status_code} {create.text[:200]}")
    entry = (create.json().get("entry") or create.json())
    entry_id = entry.get("id") or entry.get("_id")
    assert entry_id, "no entry id"
    r = session.post(f"{API}/lf1/correspondence/{entry_id}/email", json={}, timeout=45)
    # Accept 200, 400 (no draft yet), 502 (resend), 503 (email deps) — as long as route exists
    assert r.status_code not in (404, 405), f"route missing: {r.status_code} {r.text[:200]}"
