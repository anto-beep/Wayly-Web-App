"""SUP-0/1/2/3 Wayly Support Ticketing — end-to-end backend tests.

Covers user flow (POST/GET tickets, consent, public-only thread, replies, CSAT)
and admin flow (list/reply/notes/status/defects/link/resolve/triage-agree).
Triage gating (SUPPORT_TRIAGE_ENABLED=false) is also asserted on the DB level.
"""
import os
import time
import uuid
import pytest
import requests
from pymongo import MongoClient

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://mobile-parity-sweep.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

USER_EMAIL = "cathy@example.com"
USER_PASS = "testpass123"
ADMIN_EMAIL = "admin@wayly.com.au"
ADMIN_PASS = "Admin!2026"

# DB handle for guarantee-level assertions
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
_mc = MongoClient(MONGO_URL)
db = _mc[DB_NAME]


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
    return r


@pytest.fixture(scope="module")
def user_token():
    r = _login(USER_EMAIL, USER_PASS)
    if r.status_code != 200:
        pytest.skip(f"user login failed: {r.status_code} {r.text[:200]}")
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def user_b_token():
    # Create a fresh user B
    email = f"TEST_userb_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/signup", json={
        "name": "TEST User B", "email": email, "password": "TestPass1!",
        "plan": "family",
    }, timeout=15)
    if r.status_code not in (200, 201):
        pytest.skip(f"signup user B failed: {r.status_code} {r.text[:200]}")
    data = r.json()
    return data.get("access_token") or data.get("token")


@pytest.fixture(scope="module")
def admin_token():
    import pyotp
    candidates = [
        (ADMIN_EMAIL, ADMIN_PASS),
        ("hello@wayly.com.au", "Admin!2026"),
        ("a.chiware2@gmail.com", "Admin!2026"),
    ]
    last_err = None
    for email, pw in candidates:
        try:
            r = requests.post(f"{API}/admin/auth/login",
                              json={"email": email, "password": pw}, timeout=15)
            if r.status_code != 200:
                last_err = f"{email}: {r.status_code} {r.text[:200]}"
                continue
            d = r.json()
            if d.get("token"):
                return d["token"]
            if d.get("requires_2fa_setup") and d.get("setup_token") and d.get("secret"):
                code = pyotp.TOTP(d["secret"]).now()
                r2 = requests.post(f"{API}/admin/auth/2fa/enable",
                                   json={"setup_token": d["setup_token"], "code": code},
                                   timeout=15)
                if r2.status_code == 200 and r2.json().get("token"):
                    return r2.json()["token"]
                last_err = f"{email} 2fa-enable: {r2.status_code} {r2.text[:200]}"
            elif d.get("requires_2fa"):
                last_err = f"{email}: TOTP required (no secret available in test)"
        except Exception as e:
            last_err = f"{email}: {e}"
    pytest.skip(f"admin login failed: {last_err}")


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# USER FLOW
# ---------------------------------------------------------------------------
class TestCreateTicket:
    def test_create_basic(self, user_token):
        payload = {
            "tool_name": "statement_decoder",
            "tool_version": "v1",
            "tool_input": {"x": 1},
            "tool_output": {"y": 2},
            "category": "figure_incorrect",
            "user_note": "TEST basic ticket",
            "consent_to_share_statement": False,
        }
        r = requests.post(f"{API}/support/tickets", json=payload, headers=_h(user_token), timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        t = body["ticket"]
        assert t["reference"].startswith("WAY-") and len(t["reference"]) == 8
        assert t["status"] == "received"
        assert t["category"] == "figure_incorrect"
        pytest.ticket_id_basic = t["id"]
        pytest.ticket_ref_basic = t["reference"]

        # Verify snapshot row exists
        snap = db.sup_tool_snapshots.find_one({"ticket_id": t["id"]})
        assert snap is not None
        # Verify created event
        ev = db.sup_events.find_one({"ticket_id": t["id"], "event_type": "created"})
        assert ev is not None

    def test_no_attachment_without_consent(self, user_token):
        payload = {
            "tool_name": "statement_decoder", "tool_input": {}, "tool_output": {},
            "category": "figure_incorrect",
            "consent_to_share_statement": False,
            "statement_id": "any-fake-id",
        }
        r = requests.post(f"{API}/support/tickets", json=payload, headers=_h(user_token), timeout=15)
        assert r.status_code == 200
        tid = r.json()["ticket"]["id"]
        atts = list(db.sup_attachments.find({"ticket_id": tid, "type": "original_statement"}))
        assert atts == []

    def test_consent_records_version(self, user_token):
        payload = {
            "tool_name": "statement_decoder", "tool_input": {}, "tool_output": {},
            "category": "figure_incorrect",
            "consent_to_share_statement": True,
        }
        r = requests.post(f"{API}/support/tickets", json=payload, headers=_h(user_token), timeout=15)
        assert r.status_code == 200
        tid = r.json()["ticket"]["id"]
        doc = db.sup_tickets.find_one({"id": tid})
        assert doc["consent_text_version"] == "support-consent-v1"
        assert doc["consent_at"] is not None
        # consent_recorded event
        ev = db.sup_events.find_one({"ticket_id": tid, "event_type": "consent_recorded"})
        assert ev is not None


class TestMonotonicReferences:
    def test_three_in_order(self, user_token):
        refs = []
        for i in range(3):
            payload = {
                "tool_name": "budget_calculator", "tool_input": {}, "tool_output": {},
                "category": "other", "user_note": f"TEST monotonic {i}",
            }
            r = requests.post(f"{API}/support/tickets", json=payload, headers=_h(user_token), timeout=15)
            assert r.status_code == 200
            refs.append(r.json()["ticket"]["reference"])
        nums = [int(r.split("-")[1]) for r in refs]
        assert nums == sorted(nums)
        assert nums[1] == nums[0] + 1
        assert nums[2] == nums[1] + 1
        for ref in refs:
            assert len(ref.split("-")[1]) == 4  # zero-padded


class TestListIsolation:
    def test_user_b_does_not_see_user_a_tickets(self, user_token, user_b_token):
        # User A has tickets from above
        rb = requests.get(f"{API}/support/tickets", headers=_h(user_b_token), timeout=15)
        assert rb.status_code == 200
        ids_b = {t["id"] for t in rb.json()["tickets"]}
        assert pytest.ticket_id_basic not in ids_b


class TestPublicThreadFilter:
    def test_internal_note_never_in_user_thread(self, user_token, admin_token):
        tid = pytest.ticket_id_basic
        # admin posts internal note
        r1 = requests.post(f"{API}/admin/support/tickets/{tid}/notes",
                           json={"body": "TEST internal note do not leak"},
                           headers=_h(admin_token), timeout=15)
        assert r1.status_code == 200, r1.text
        # admin posts public reply
        r2 = requests.post(f"{API}/admin/support/tickets/{tid}/reply",
                           json={"body": "TEST public reply visible"},
                           headers=_h(admin_token), timeout=15)
        assert r2.status_code == 200, r2.text
        # user fetches detail
        rd = requests.get(f"{API}/support/tickets/{tid}", headers=_h(user_token), timeout=15)
        assert rd.status_code == 200
        thread = rd.json()["thread"]
        bodies = [m["body"] for m in thread]
        assert any("public reply visible" in b for b in bodies)
        assert not any("internal note do not leak" in b for b in bodies)
        for m in thread:
            assert m.get("visibility") == "public"


class TestUserReply:
    def test_user_can_reply_when_awaiting(self, user_token):
        tid = pytest.ticket_id_basic
        # Status should be 'awaiting_user' from admin reply above
        r = requests.post(f"{API}/support/tickets/{tid}/messages",
                          json={"body": "TEST user reply"},
                          headers=_h(user_token), timeout=15)
        assert r.status_code == 200, r.text
        doc = db.sup_tickets.find_one({"id": tid})
        assert doc["status"] == "under_review"


class TestCsat:
    def test_csat_not_allowed_unresolved(self, user_token):
        tid = pytest.ticket_id_basic
        r = requests.post(f"{API}/support/tickets/{tid}/csat",
                          json={"csat_score": 5},
                          headers=_h(user_token), timeout=15)
        assert r.status_code == 409


# ---------------------------------------------------------------------------
# ADMIN FLOW
# ---------------------------------------------------------------------------
class TestAdminAuth:
    def test_admin_requires_auth(self):
        r = requests.get(f"{API}/admin/support/tickets", timeout=15)
        assert r.status_code in (401, 403)

    def test_admin_list_returns(self, admin_token):
        r = requests.get(f"{API}/admin/support/tickets", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "tickets" in d and isinstance(d["tickets"], list)
        assert d["total"] >= 1

    def test_admin_filters(self, admin_token):
        r = requests.get(f"{API}/admin/support/tickets?status=received",
                         headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        for t in r.json()["tickets"]:
            assert t["status"] == "received"


class TestAdminResolveFlow:
    def test_resolve_with_summary(self, admin_token, user_token):
        # Create a fresh ticket to resolve
        r = requests.post(f"{API}/support/tickets",
                          json={"tool_name": "price_checker", "tool_input": {}, "tool_output": {},
                                "category": "other", "user_note": "TEST to resolve"},
                          headers=_h(user_token), timeout=15)
        tid = r.json()["ticket"]["id"]
        r2 = requests.post(f"{API}/admin/support/tickets/{tid}/status",
                           json={"status": "resolved", "resolution_summary": "TEST resolution explanation"},
                           headers=_h(admin_token), timeout=15)
        assert r2.status_code == 200, r2.text
        doc = db.sup_tickets.find_one({"id": tid})
        assert doc["status"] == "resolved"
        assert doc["resolved_at"]
        # public resolution message
        msg = db.sup_messages.find_one({"ticket_id": tid, "body": "TEST resolution explanation"})
        assert msg and msg["visibility"] == "public"
        # CSAT now allowed
        rc = requests.post(f"{API}/support/tickets/{tid}/csat",
                           json={"csat_score": 4, "csat_comment": "ok"},
                           headers=_h(user_token), timeout=15)
        assert rc.status_code == 200
        # second CSAT must 409
        rc2 = requests.post(f"{API}/support/tickets/{tid}/csat",
                            json={"csat_score": 5},
                            headers=_h(user_token), timeout=15)
        assert rc2.status_code == 409


class TestDefects:
    def test_create_defect(self, admin_token):
        r = requests.post(f"{API}/admin/support/defects",
                          json={"title": "TEST defect figure", "tool_name": "statement_decoder",
                                "severity": "high"},
                          headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()["defect"]
        assert d["reference"].startswith("DEF-") and len(d["reference"]) == 8
        pytest.defect_id = d["id"]
        pytest.defect_ref = d["reference"]

    def test_link_ticket(self, admin_token, user_token):
        # Create a ticket to link
        r = requests.post(f"{API}/support/tickets",
                          json={"tool_name": "statement_decoder", "tool_input": {}, "tool_output": {},
                                "category": "figure_incorrect", "user_note": "TEST link"},
                          headers=_h(user_token), timeout=15)
        tid = r.json()["ticket"]["id"]
        pytest.linked_ticket_id = tid
        r2 = requests.post(f"{API}/admin/support/tickets/{tid}/link-defect",
                           json={"defect_id": pytest.defect_id},
                           headers=_h(admin_token), timeout=15)
        assert r2.status_code == 200, r2.text
        ev = db.sup_events.find_one({"ticket_id": tid, "event_type": "linked_to_defect"})
        assert ev is not None

    def test_resolve_defect_cascades(self, admin_token):
        r = requests.post(f"{API}/admin/support/defects/{pytest.defect_id}/resolve",
                          json={"resolution_note": "TEST defect fixed", "notify_reporters": True},
                          headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["tickets_resolved"] >= 1
        doc = db.sup_tickets.find_one({"id": pytest.linked_ticket_id})
        assert doc["status"] == "resolved"


class TestTriageGate:
    def test_no_triage_rows_written(self):
        # SUPPORT_TRIAGE_ENABLED=false → no sup_triage rows should exist for any
        # of the tickets we just created. Just check the global count is zero
        # (or that none reference our test ticket_ids).
        count = db.sup_triage.count_documents({})
        assert count == 0, f"expected zero triage rows, got {count}"

    def test_triage_agree_404_when_no_row(self, admin_token):
        tid = pytest.ticket_id_basic
        r = requests.post(f"{API}/admin/support/tickets/{tid}/triage/agree",
                          json={"human_agreed": True},
                          headers=_h(admin_token), timeout=15)
        assert r.status_code == 404
