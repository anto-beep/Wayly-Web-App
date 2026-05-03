"""Backend tests for Kindred — Support at Home concierge.

Covers:
- Auth (signup/login/me)
- Household create + get
- Statement upload (Claude-parsed) + list + detail
- Budget endpoint
- Chat (LLM)
- Family thread
- Audit log
- Participant today + concern flag
"""
import os
import io
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://aged-care-os.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

UNIQUE = str(int(time.time()))
NEW_USER_EMAIL = f"test+{UNIQUE}@example.com"
NEW_USER_PASS = "testpass123"
NEW_USER_NAME = "Test Caregiver"

EXISTING_EMAIL = "cathy@example.com"
EXISTING_PASS = "testpass123"

SAMPLE_CSV = (
    "Date,Service,Stream,Units,Unit Price,Total,Contribution Paid,Government Paid\n"
    "2026-04-05,Domestic assistance - cleaning,Everyday Living,2,75.50,151.00,25.00,126.00\n"
    "2026-04-12,Personal care - shower,Independence,1.5,82.00,123.00,20.00,103.00\n"
    "2026-04-15,Occupational therapy,Clinical,1,150.00,150.00,0.00,150.00\n"
    "2026-04-19,Domestic assistance - cleaning,Everyday Living,2,75.50,151.00,25.00,126.00\n"
    "2026-04-26,Domestic assistance - cleaning,Everyday Living,2,95.00,190.00,30.00,160.00\n"
)


@pytest.fixture(scope="module")
def existing_token():
    """Login with seeded cathy@example.com (already has household + statement)."""
    r = requests.post(f"{API}/auth/login", json={"email": EXISTING_EMAIL, "password": EXISTING_PASS}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Seed user login failed: {r.status_code} {r.text}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def existing_headers(existing_token):
    return {"Authorization": f"Bearer {existing_token}"}


@pytest.fixture(scope="module")
def new_user_state():
    """Holds token + ids for the fresh-signup flow."""
    return {}


# ---------- AUTH ----------
class TestAuth:
    def test_signup_new_user(self, new_user_state):
        r = requests.post(f"{API}/auth/signup", json={
            "email": NEW_USER_EMAIL, "password": NEW_USER_PASS,
            "name": NEW_USER_NAME, "role": "caregiver",
        }, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and isinstance(data["token"], str)
        assert data["user"]["email"] == NEW_USER_EMAIL
        assert data["user"]["role"] == "caregiver"
        assert data["user"]["household_id"] is None
        new_user_state["token"] = data["token"]
        new_user_state["user_id"] = data["user"]["id"]

    def test_signup_duplicate_rejected(self, new_user_state):
        r = requests.post(f"{API}/auth/signup", json={
            "email": NEW_USER_EMAIL, "password": NEW_USER_PASS, "name": "x", "role": "caregiver",
        }, timeout=15)
        assert r.status_code == 409

    def test_login_existing(self, existing_token):
        assert isinstance(existing_token, str) and len(existing_token) > 0

    def test_login_bad_password(self):
        r = requests.post(f"{API}/auth/login", json={
            "email": EXISTING_EMAIL, "password": "wrongpass",
        }, timeout=15)
        assert r.status_code == 401

    def test_me_returns_user(self, existing_headers):
        r = requests.get(f"{API}/auth/me", headers=existing_headers, timeout=15)
        assert r.status_code == 200
        u = r.json()
        assert u["email"] == EXISTING_EMAIL
        assert u["household_id"] is not None

    def test_me_unauth(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code in (401, 403)


# ---------- HOUSEHOLD ----------
class TestHousehold:
    def test_no_household_for_new_user(self, new_user_state):
        h = {"Authorization": f"Bearer {new_user_state['token']}"}
        r = requests.get(f"{API}/household", headers=h, timeout=15)
        assert r.status_code == 200
        assert r.json() in (None, {}) or r.json() is None

    def test_create_household(self, new_user_state):
        h = {"Authorization": f"Bearer {new_user_state['token']}"}
        payload = {
            "participant_name": "Mum",
            "classification": 4,
            "provider_name": "TestCare",
            "is_grandfathered": False,
        }
        r = requests.post(f"{API}/household", json=payload, headers=h, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["participant_name"] == "Mum"
        assert data["classification"] == 4
        assert data["owner_id"] == new_user_state["user_id"]
        new_user_state["household_id"] = data["id"]

    def test_get_household_after_create(self, new_user_state):
        h = {"Authorization": f"Bearer {new_user_state['token']}"}
        r = requests.get(f"{API}/household", headers=h, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data is not None
        assert data["id"] == new_user_state["household_id"]

    def test_create_household_duplicate_rejected(self, new_user_state):
        h = {"Authorization": f"Bearer {new_user_state['token']}"}
        payload = {"participant_name": "X", "classification": 1, "provider_name": "Y"}
        r = requests.post(f"{API}/household", json=payload, headers=h, timeout=15)
        assert r.status_code == 409


# ---------- STATEMENTS ----------
class TestStatements:
    def test_list_existing(self, existing_headers):
        r = requests.get(f"{API}/statements", headers=existing_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)

    def test_upload_csv_parses_via_claude(self, existing_headers):
        files = {"file": ("test_stmt.csv", io.BytesIO(SAMPLE_CSV.encode()), "text/csv")}
        r = requests.post(f"{API}/statements/upload", files=files,
                          headers=existing_headers, timeout=120)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "id" in data
        assert "line_items" in data and len(data["line_items"]) >= 3
        # Each line item should have a valid stream
        valid_streams = {"Clinical", "Independence", "Everyday Living"}
        for li in data["line_items"]:
            assert li["stream"] in valid_streams
        # Anomalies: rate-spike on cleaning OR duplicate
        # (rule-based runs vs historical median; if first stmt for new household it might be empty)
        assert isinstance(data["anomalies"], list)
        # Summary present
        assert data.get("summary")
        TestStatements.statement_id = data["id"]

    def test_get_statement_detail(self, existing_headers):
        sid = getattr(TestStatements, "statement_id", None)
        if not sid:
            pytest.skip("Upload not done")
        r = requests.get(f"{API}/statements/{sid}", headers=existing_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == sid


# ---------- BUDGET ----------
class TestBudget:
    def test_budget_current(self, existing_headers):
        r = requests.get(f"{API}/budget/current", headers=existing_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["classification"] == 4
        assert d["classification_label"] == "Classification 4"
        assert d["quarterly_total"] > 0
        assert "quarter_label" in d
        assert len(d["streams"]) == 3
        for s in d["streams"]:
            assert s["stream"] in ("Clinical", "Independence", "Everyday Living")
            assert "allocated" in s and "spent" in s and "remaining" in s and "pct" in s
        assert d["lifetime_cap"] > 0
        assert "lifetime_contributions" in d
        assert "lifetime_pct" in d


# ---------- CHAT ----------
class TestChat:
    def test_chat_post(self, existing_headers):
        r = requests.post(f"{API}/chat", json={"message": "How much do I have left this quarter?"},
                          headers=existing_headers, timeout=90)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "reply" in d and isinstance(d["reply"], str) and len(d["reply"]) > 0
        assert "session_id" in d

    def test_chat_history(self, existing_headers):
        r = requests.get(f"{API}/chat/history", headers=existing_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # at least 2 turns now (user + asst)
        assert len(data) >= 2


# ---------- FAMILY THREAD ----------
class TestFamilyThread:
    def test_post_message(self, existing_headers):
        r = requests.post(f"{API}/family-thread",
                          json={"body": "TEST_message at " + UNIQUE},
                          headers=existing_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["body"].startswith("TEST_message")
        TestFamilyThread.msg_id = d["id"]

    def test_list_messages(self, existing_headers):
        r = requests.get(f"{API}/family-thread", headers=existing_headers, timeout=15)
        assert r.status_code == 200
        msgs = r.json()
        assert any(m["body"].startswith("TEST_message") for m in msgs)


# ---------- AUDIT LOG ----------
class TestAudit:
    def test_audit_contains_events(self, existing_headers):
        r = requests.get(f"{API}/audit-log", headers=existing_headers, timeout=15)
        assert r.status_code == 200
        events = r.json()
        assert isinstance(events, list) and len(events) > 0
        actions = {e["action"] for e in events}
        # After running prior tests, expect at least some of these
        assert "STATEMENT_UPLOADED" in actions or "HOUSEHOLD_CREATED" in actions or "FAMILY_MESSAGE_POSTED" in actions
        # Sorted desc by created_at
        ts = [e["created_at"] for e in events]
        assert ts == sorted(ts, reverse=True)


# ---------- PARTICIPANT VIEW ----------
class TestParticipant:
    def test_today(self, existing_headers):
        r = requests.get(f"{API}/participant/today", headers=existing_headers, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["participant_name"]
        assert d["today_label"]
        assert d["appointment"]
        assert "quarter_remaining" in d
        assert "quarter_remaining_sentence" in d
        assert d["caregiver_name"]

    def test_concern_logs(self, existing_headers):
        r = requests.post(f"{API}/participant/concern",
                          json={"note": "TEST_concern"},
                          headers=existing_headers, timeout=15)
        assert r.status_code == 200
        # verify in audit + family thread
        a = requests.get(f"{API}/audit-log", headers=existing_headers, timeout=15).json()
        assert any(e["action"] == "CONCERN_FLAGGED" for e in a)
        m = requests.get(f"{API}/family-thread", headers=existing_headers, timeout=15).json()
        assert any("Concern flagged" in msg["body"] for msg in m)


# ---------- PUBLIC AI TOOLS (no auth, IP rate-limited 5/30days) ----------
def _ip(suffix: str) -> dict:
    """Generate a unique x-forwarded-for IP per test to avoid rate-limit collisions."""
    return {"x-forwarded-for": f"10.99.{abs(hash(suffix)) % 250}.{abs(hash(suffix + 'b')) % 250}"}


class TestPublicBudget:
    def test_budget_calc_basic(self):
        r = requests.post(f"{API}/public/budget-calc", json={
            "classification": 4, "is_grandfathered": False,
            "current_lifetime_balance": 0, "expected_annual_burn": None,
        }, headers=_ip("budget-basic"), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["classification"] == 4
        assert d["annual_total"] > 0
        assert d["quarterly_total"] > 0
        assert len(d["streams"]) == 3
        assert {s["stream"] for s in d["streams"]} == {"Clinical", "Independence", "Everyday Living"}
        assert d["lifetime_cap"] > 0
        assert d["years_to_cap"] is None

    def test_budget_calc_with_burn(self):
        r = requests.post(f"{API}/public/budget-calc", json={
            "classification": 6, "is_grandfathered": True,
            "current_lifetime_balance": 5000, "expected_annual_burn": 4000,
        }, headers=_ip("budget-burn"), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["classification"] == 6
        assert d["is_grandfathered"] is True
        assert d["lifetime_contributions"] == 5000
        assert d["years_to_cap"] is not None and d["years_to_cap"] > 0
        assert d["lifetime_pct"] >= 0

    def test_budget_calc_rejects_invalid_classification(self):
        r = requests.post(f"{API}/public/budget-calc", json={
            "classification": 99, "is_grandfathered": False,
            "current_lifetime_balance": 0,
        }, headers=_ip("budget-bad"), timeout=15)
        assert r.status_code == 422


class TestPublicPriceCheck:
    def test_price_high_above_cap(self):
        r = requests.post(f"{API}/public/price-check", json={
            "service": "Domestic assistance — cleaning", "rate": 120.0,
        }, headers=_ip("price-high"), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["verdict"] == "high"
        assert d["charged"] == 120.0
        assert d["median"] == 76.0
        assert d["cap"] == 82.0
        assert "cap" in d["verdict_label"].lower() or d["verdict_label"]
        assert d["suggested_action"]

    def test_price_fair(self):
        r = requests.post(f"{API}/public/price-check", json={
            "service": "Personal care", "rate": 84.0,
        }, headers=_ip("price-fair"), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["verdict"] == "fair"

    def test_price_low(self):
        r = requests.post(f"{API}/public/price-check", json={
            "service": "Occupational therapy", "rate": 100.0,
        }, headers=_ip("price-low"), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["verdict"] == "low"

    def test_price_unknown_service_falls_back(self):
        r = requests.post(f"{API}/public/price-check", json={
            "service": "Unknown service xyz", "rate": 50.0,
        }, headers=_ip("price-unknown"), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["verdict"] in ("fair", "high", "low")


class TestPublicDecode:
    SAMPLE = (
        "Statement period 1 Apr 2026 – 30 Apr 2026\n"
        "Date,Service,Stream,Units,Unit Price,Total,Contribution Paid,Government Paid\n"
        "2026-04-05,Domestic assistance,Everyday Living,2,75.50,151.00,25.00,126.00\n"
        "2026-04-12,Personal care,Independence,1.5,82.00,123.00,20.00,103.00\n"
        "2026-04-15,Occupational therapy,Clinical,1,150.00,150.00,0.00,150.00\n"
    )

    def test_decode_text(self):
        r = requests.post(f"{API}/public/decode-statement-text",
                          json={"text": self.SAMPLE},
                          headers=_ip("decode-text"), timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "summary" in d
        assert isinstance(d["line_items"], list) and len(d["line_items"]) >= 1
        for li in d["line_items"]:
            assert li["stream"] in ("Clinical", "Independence", "Everyday Living")
        assert isinstance(d["anomalies"], list)

    def test_decode_text_too_short(self):
        r = requests.post(f"{API}/public/decode-statement-text",
                          json={"text": "x"},
                          headers=_ip("decode-short"), timeout=15)
        assert r.status_code == 422

    def test_decode_file_upload(self):
        files = {"file": ("test.csv", io.BytesIO(self.SAMPLE.encode()), "text/csv")}
        r = requests.post(f"{API}/public/decode-statement",
                          files=files, headers=_ip("decode-file"), timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d["line_items"], list) and len(d["line_items"]) >= 1


class TestPublicRateLimit:
    def test_rate_limit_returns_429_after_5(self):
        ip_headers = {"x-forwarded-for": "10.66.66.66"}
        last_status = None
        for i in range(7):
            r = requests.post(f"{API}/public/price-check", json={
                "service": "Personal care", "rate": 80.0,
            }, headers=ip_headers, timeout=15)
            last_status = r.status_code
            if r.status_code == 429:
                # Should have been hit at the 6th request (after 5 success)
                assert i >= 5, f"Rate-limited too early at request {i+1}"
                msg = r.json().get("detail", "")
                assert "limit" in msg.lower() or "sign up" in msg.lower()
                return
        assert False, f"Expected 429 within 7 requests, last status={last_status}"
