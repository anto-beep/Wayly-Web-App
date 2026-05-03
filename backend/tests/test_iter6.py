"""Iteration 6 — Stripe billing, plan enforcement, Google auth, Resend live."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://aged-care-os.preview.emergentagent.com").rstrip("/")
CATHY_EMAIL = "cathy@example.com"
CATHY_PASS = "testpass123"
RESEND_VERIFIED = "a.chiware2@gmail.com"


@pytest.fixture(scope="module")
def cathy_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": CATHY_EMAIL, "password": CATHY_PASS}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(cathy_token):
    return {"Authorization": f"Bearer {cathy_token}"}


# ----- Billing -----
class TestBilling:
    def test_checkout_solo_authenticated(self, auth_headers):
        r = requests.post(
            f"{BASE_URL}/api/billing/checkout",
            json={"plan": "solo", "origin_url": "https://aged-care-os.preview.emergentagent.com"},
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200, f"got {r.status_code}: {r.text}"
        d = r.json()
        assert "url" in d and d["url"].startswith("https://checkout.stripe.com/"), d
        assert "session_id" in d and d["session_id"].startswith("cs_test_"), d
        # Save for status test
        TestBilling._sess = d["session_id"]

    def test_checkout_no_auth_returns_401(self):
        r = requests.post(
            f"{BASE_URL}/api/billing/checkout",
            json={"plan": "solo", "origin_url": "https://aged-care-os.preview.emergentagent.com"},
            timeout=15,
        )
        assert r.status_code in (401, 403), f"expected 401/403 got {r.status_code}"

    def test_checkout_invalid_plan(self, auth_headers):
        r = requests.post(
            f"{BASE_URL}/api/billing/checkout",
            json={"plan": "lifetime", "origin_url": "https://aged-care-os.preview.emergentagent.com"},
            headers=auth_headers, timeout=15,
        )
        assert r.status_code in (400, 422), f"expected 400/422 got {r.status_code}: {r.text}"

    def test_billing_status_unpaid(self, auth_headers):
        sid = getattr(TestBilling, "_sess", None)
        if not sid:
            pytest.skip("No session id from checkout test")
        r = requests.get(f"{BASE_URL}/api/billing/status/{sid}", headers=auth_headers, timeout=20)
        assert r.status_code == 200, f"got {r.status_code}: {r.text}"
        d = r.json()
        assert "status" in d and "payment_status" in d and "plan" in d
        assert (d.get("payment_status") or "").lower() != "paid", d
        assert d["plan"] == "solo"


# ----- Plan enforcement on Solo+ public tools -----
SOLO_PLUS_ENDPOINTS = [
    ("/api/public/price-check", {"service": "Personal care", "rate": 90.0}),
    ("/api/public/classification-check", {"answers": [2] * 12, "current_classification": 4}),
    ("/api/public/reassessment-letter", {
        "participant_name": "Dorothy",
        "current_classification": 4,
        "changes_summary": "house move, new neighbours, transport needs changed",
        "sender_name": "Cathy",
    }),
    ("/api/public/contribution-estimator", {
        "classification": 4, "pension_status": "part",
        "expected_mix_clinical_pct": 30, "expected_mix_independence_pct": 45, "expected_mix_everyday_pct": 25,
    }),
    ("/api/public/care-plan-review", {"text": "Goals: maintain independence at home. Services: cleaning weekly, podiatry monthly. Review date set for next year. Named worker preference noted." * 2}),
    ("/api/public/family-coordinator-chat", {"message": "What is the lifetime contribution cap?"}),
]


class TestPlanEnforcement:
    @pytest.mark.parametrize("path,payload", SOLO_PLUS_ENDPOINTS)
    def test_no_auth_returns_402(self, path, payload):
        r = requests.post(f"{BASE_URL}{path}", json=payload, timeout=15)
        assert r.status_code == 402, f"{path} expected 402 got {r.status_code}: {r.text[:200]}"
        body = r.json()
        # FastAPI wraps custom dict detail under "detail"
        det = body.get("detail") or body
        assert det.get("code") == "plan_required", f"{path} body: {body}"
        assert "tool" in det and "message" in det and "upgrade_url" in det

    def test_price_check_with_family_plan(self, auth_headers):
        r = requests.post(
            f"{BASE_URL}/api/public/price-check",
            json={"service": "Personal care", "rate": 90.0},
            headers=auth_headers, timeout=20,
        )
        assert r.status_code == 200, f"got {r.status_code}: {r.text}"
        d = r.json()
        assert d["service"] == "Personal care"
        assert "verdict" in d and "median" in d


# ----- Google session error handling -----
class TestGoogleAuth:
    def test_google_session_fake_id_returns_401(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/google-session",
            json={"session_id": "fake-synthetic-session-id-1234567890"},
            timeout=20,
        )
        assert r.status_code == 401, f"got {r.status_code}: {r.text}"

    def test_logout_with_token_returns_ok(self, auth_headers):
        r = requests.post(f"{BASE_URL}/api/auth/logout", headers=auth_headers, timeout=15)
        assert r.status_code == 200, f"got {r.status_code}: {r.text}"
        assert r.json().get("ok") is True


# ----- Resend live (verified address only) -----
class TestEmail:
    def test_contact_endpoint_returns_200(self):
        r = requests.post(
            f"{BASE_URL}/api/contact",
            json={"name": "Test", "email": RESEND_VERIFIED, "role": "caregiver", "intent": "general", "context": "iter6 test"},
            timeout=30,
        )
        assert r.status_code == 200, f"got {r.status_code}: {r.text}"
        d = r.json()
        assert d.get("ok") is True
        assert d.get("intent") == "general"

    def test_contact_with_other_email_still_200(self):
        r = requests.post(
            f"{BASE_URL}/api/contact",
            json={"name": "Test", "email": "noreply@example.com", "role": "caregiver", "intent": "demo"},
            timeout=30,
        )
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_email_result_to_verified_returns_ok_true(self):
        r = requests.post(
            f"{BASE_URL}/api/public/email-result",
            json={"email": RESEND_VERIFIED, "tool": "Price Check", "headline": "Result", "body_html": "<p>hi</p>"},
            timeout=30,
        )
        assert r.status_code == 200, f"got {r.status_code}: {r.text}"
        d = r.json()
        assert d.get("mocked") is False, f"expected live send (mocked=false), got {d}"
        assert d.get("ok") is True, f"expected ok=true to verified email, got {d}"

    def test_email_result_to_other_returns_ok_false(self):
        r = requests.post(
            f"{BASE_URL}/api/public/email-result",
            json={"email": "noreply@example.com", "tool": "Price Check", "headline": "Result", "body_html": "<p>hi</p>"},
            timeout=30,
        )
        assert r.status_code == 200
        d = r.json()
        assert d.get("mocked") is False
        assert d.get("ok") is False, f"Resend should reject non-verified in test mode: {d}"


# ----- Free tools regression (no auth, no plan) -----
class TestFreeToolsRegression:
    def test_decode_text_no_auth(self):
        r = requests.post(
            f"{BASE_URL}/api/public/decode-statement-text",
            json={"text": "Personal care 2025-01-05, 1 hour at $84.00, total $84.00"},
            timeout=60,
        )
        assert r.status_code in (200, 429), f"got {r.status_code}: {r.text[:200]}"

    def test_budget_calc_no_auth(self):
        r = requests.post(
            f"{BASE_URL}/api/public/budget-calc",
            json={"classification": 4, "is_grandfathered": False, "current_lifetime_balance": 5000, "expected_annual_burn": 8000},
            timeout=20,
        )
        assert r.status_code in (200, 429), f"got {r.status_code}: {r.text}"
        if r.status_code == 200:
            d = r.json()
            assert d["classification"] == 4 and "annual_total" in d
