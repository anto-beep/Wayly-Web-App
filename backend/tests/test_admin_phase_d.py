"""Phase D admin backend tests — Support tickets, Macros, Communications
(campaigns/audience preview, email templates, notification log, newsletter subscribers).
"""
import os
import pyotp
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.strip().split("=", 1)[1].rstrip("/")
                break

ADMIN_EMAIL = "hello@techglove.com.au"
ADMIN_PASSWORD = "AdminPass!2026"
USER_EMAIL = "cathy@example.com"
USER_PASSWORD = "testpass123"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

_mongo = MongoClient(MONGO_URL)
_db = _mongo[DB_NAME]


def _reset_admin_lock():
    _db.users.update_one(
        {"email": ADMIN_EMAIL},
        {"$set": {"failed_login_count": 0, "lockout_until": None}},
    )


@pytest.fixture(scope="session")
def admin_token():
    _reset_admin_lock()
    u = _db.users.find_one({"email": ADMIN_EMAIL}, {"totp_secret": 1, "id": 1})
    secret = u and u.get("totp_secret")
    assert secret, "Admin TOTP secret missing"
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("requires_2fa"), data
    code = pyotp.TOTP(secret).now()
    r2 = requests.post(f"{BASE_URL}/api/admin/auth/2fa/verify",
                       json={"temp_token": data["temp_token"], "code": code})
    assert r2.status_code == 200, r2.text
    return r2.json()["token"]


@pytest.fixture(scope="session")
def admin_id():
    u = _db.users.find_one({"email": ADMIN_EMAIL}, {"id": 1})
    return u["id"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def user_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": USER_EMAIL, "password": USER_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"User login failed: {r.text}")
    j = r.json()
    return j.get("token") or j.get("access_token")


@pytest.fixture(scope="session")
def user_headers(user_token):
    return {"Authorization": f"Bearer {user_token}"}


# Track created test data IDs for cleanup
_created = {"tickets": [], "macros": [], "campaigns": []}


@pytest.fixture(scope="session", autouse=True)
def cleanup():
    yield
    for tid in _created["tickets"]:
        _db.support_tickets.delete_many({"id": tid})
        _db.ticket_messages.delete_many({"ticket_id": tid})
    for mid in _created["macros"]:
        _db.ticket_macros.delete_many({"id": mid})
    for cid in _created["campaigns"]:
        _db.email_campaigns.delete_many({"id": cid})
        _db.notification_log.delete_many({"campaign_id": cid})


# --------------------- AUTH GATING ---------------------

PHASE_D_ADMIN_ENDPOINTS = [
    ("GET", "/api/admin/tickets"),
    ("GET", "/api/admin/ticket-reports"),
    ("GET", "/api/admin/macros"),
    ("GET", "/api/admin/email-templates"),
    ("GET", "/api/admin/notification-log"),
    ("GET", "/api/admin/newsletter-subscribers"),
    ("GET", "/api/admin/campaigns"),
]


@pytest.mark.parametrize("method,path", PHASE_D_ADMIN_ENDPOINTS)
def test_admin_endpoints_reject_non_admin(method, path, user_headers):
    r = requests.request(method, f"{BASE_URL}{path}", headers=user_headers)
    assert r.status_code in (401, 403), f"{path} -> {r.status_code}"


@pytest.mark.parametrize("method,path", PHASE_D_ADMIN_ENDPOINTS)
def test_admin_endpoints_reject_unauth(method, path):
    r = requests.request(method, f"{BASE_URL}{path}")
    assert r.status_code in (401, 403), f"{path} -> {r.status_code}"


# --------------------- USER TICKETS ---------------------

class TestUserTickets:
    def test_create_ticket(self, user_headers):
        r = requests.post(f"{BASE_URL}/api/tickets", headers=user_headers, json={
            "subject": "TEST_ ticket subject",
            "body": "TEST_ this is the initial body of my ticket >10 chars",
            "category": "billing",
            "priority": "P2",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok")
        t = data["ticket"]
        assert "id" in t
        assert t["subject"] == "TEST_ ticket subject"
        assert t["status"] == "open"
        assert t["priority"] == "P2"
        _created["tickets"].append(t["id"])
        # verify initial message logged
        msgs = list(_db.ticket_messages.find({"ticket_id": t["id"]}))
        assert len(msgs) >= 1
        TestUserTickets.tid = t["id"]

    def test_list_only_own_tickets(self, user_headers):
        r = requests.get(f"{BASE_URL}/api/tickets", headers=user_headers)
        assert r.status_code == 200
        data = r.json()
        assert "tickets" in data
        ids = [t["id"] for t in data["tickets"]]
        assert TestUserTickets.tid in ids
        # all tickets must belong to this user (cathy)
        cathy = _db.users.find_one({"email": USER_EMAIL}, {"id": 1})
        for t in data["tickets"]:
            assert t["user_id"] == cathy["id"]

    def test_get_own_ticket_hides_internal_notes(self, user_headers, admin_headers):
        # Admin adds an internal note
        r = requests.post(f"{BASE_URL}/api/admin/tickets/{TestUserTickets.tid}/messages",
                          headers=admin_headers,
                          json={"body": "TEST_ internal note hidden from user", "is_internal_note": True})
        assert r.status_code == 200, r.text
        # User fetches
        r2 = requests.get(f"{BASE_URL}/api/tickets/{TestUserTickets.tid}", headers=user_headers)
        assert r2.status_code == 200
        data = r2.json()
        bodies = [m["body"] for m in data["messages"]]
        assert all("internal note hidden" not in b for b in bodies)

    def test_get_other_users_ticket_404(self, user_headers):
        # Insert a foreign ticket directly
        import secrets
        foreign_tid = "TEST_foreign_" + secrets.token_urlsafe(6)
        _db.support_tickets.insert_one({
            "id": foreign_tid, "user_id": "some_other_user",
            "subject": "x", "status": "open", "priority": "P3",
        })
        _created["tickets"].append(foreign_tid)
        r = requests.get(f"{BASE_URL}/api/tickets/{foreign_tid}", headers=user_headers)
        assert r.status_code == 404

    def test_user_reply_resets_status_to_open(self, user_headers, admin_headers):
        # First, set status to waiting_on_user via admin
        r = requests.put(f"{BASE_URL}/api/admin/tickets/{TestUserTickets.tid}",
                         headers=admin_headers, json={"status": "waiting_on_user"})
        assert r.status_code == 200
        # User replies
        r2 = requests.post(f"{BASE_URL}/api/tickets/{TestUserTickets.tid}/messages",
                           headers=user_headers, json={"body": "TEST_ user reply"})
        assert r2.status_code == 200, r2.text
        t = _db.support_tickets.find_one({"id": TestUserTickets.tid})
        assert t["status"] == "open"


# --------------------- ADMIN TICKETS ---------------------

class TestAdminTickets:
    def test_list_tickets_with_filters(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/tickets?status=open",
                         headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        assert "rows" in data and "total" in data
        assert "page" in data and "page_size" in data
        for t in data["rows"]:
            assert t["status"] == "open"

    def test_list_unassigned(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/tickets?unassigned=true",
                         headers=admin_headers)
        assert r.status_code == 200
        for t in r.json()["rows"]:
            assert t.get("assigned_admin_id") in (None, "")

    def test_get_ticket_includes_internal_notes(self, admin_headers):
        tid = TestUserTickets.tid
        r = requests.get(f"{BASE_URL}/api/admin/tickets/{tid}", headers=admin_headers)
        assert r.status_code == 200
        data = r.json()
        notes = [m for m in data["messages"] if m.get("is_internal_note")]
        assert len(notes) >= 1, "admin should see internal notes"

    def test_update_ticket_resolved_sets_resolved_at(self, admin_headers):
        tid = TestUserTickets.tid
        r = requests.put(f"{BASE_URL}/api/admin/tickets/{tid}",
                         headers=admin_headers, json={"status": "resolved"})
        assert r.status_code == 200
        t = _db.support_tickets.find_one({"id": tid})
        assert t["status"] == "resolved"
        assert t.get("resolved_at")
        # restore to open for further tests
        _db.support_tickets.update_one({"id": tid}, {"$set": {"status": "open"}})

    def test_update_ticket_invalid_status(self, admin_headers):
        tid = TestUserTickets.tid
        r = requests.put(f"{BASE_URL}/api/admin/tickets/{tid}",
                         headers=admin_headers, json={"status": "bogus_status"})
        assert r.status_code == 400

    def test_admin_reply_sets_waiting_on_user(self, admin_headers):
        tid = TestUserTickets.tid
        r = requests.post(f"{BASE_URL}/api/admin/tickets/{tid}/messages",
                          headers=admin_headers,
                          json={"body": "TEST_ admin public reply", "is_internal_note": False})
        assert r.status_code == 200
        t = _db.support_tickets.find_one({"id": tid})
        assert t["status"] == "waiting_on_user"

    def test_admin_internal_note_no_status_change(self, admin_headers):
        tid = TestUserTickets.tid
        # ensure starting open
        _db.support_tickets.update_one({"id": tid}, {"$set": {"status": "open"}})
        r = requests.post(f"{BASE_URL}/api/admin/tickets/{tid}/messages",
                          headers=admin_headers,
                          json={"body": "TEST_ another internal note", "is_internal_note": True})
        assert r.status_code == 200
        t = _db.support_tickets.find_one({"id": tid})
        assert t["status"] == "open", "internal note must not change status"

    def test_ticket_reports(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/ticket-reports", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ("counts_by_status", "open_p1", "opened_7d", "resolved_7d", "oldest_unresolved"):
            assert k in d, f"missing {k}"
        assert isinstance(d["counts_by_status"], dict)
        for st in ("open", "in_progress", "waiting_on_user", "resolved", "closed"):
            assert st in d["counts_by_status"]


# --------------------- MACROS ---------------------

class TestMacros:
    def test_macro_crud(self, admin_headers):
        # CREATE
        r = requests.post(f"{BASE_URL}/api/admin/macros", headers=admin_headers,
                          json={"name": "TEST_macro", "body": "Hello {{first_name}}"})
        assert r.status_code == 200, r.text
        mid = r.json()["macro"]["id"]
        _created["macros"].append(mid)
        # LIST
        r = requests.get(f"{BASE_URL}/api/admin/macros", headers=admin_headers)
        assert r.status_code == 200
        ids = [m["id"] for m in r.json()["macros"]]
        assert mid in ids
        # UPDATE
        r = requests.put(f"{BASE_URL}/api/admin/macros/{mid}", headers=admin_headers,
                         json={"name": "TEST_macro_v2", "body": "Updated body"})
        assert r.status_code == 200
        m = _db.ticket_macros.find_one({"id": mid})
        assert m["name"] == "TEST_macro_v2"
        # DELETE
        r = requests.delete(f"{BASE_URL}/api/admin/macros/{mid}", headers=admin_headers)
        assert r.status_code == 200
        assert _db.ticket_macros.find_one({"id": mid}) is None


# --------------------- CAMPAIGNS ---------------------

class TestCampaigns:
    def test_preview_audience_all(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/admin/campaigns/preview-audience",
                          headers=admin_headers, json={"audience": {"type": "all"}})
        assert r.status_code == 200
        d = r.json()
        assert "count" in d and "sample" in d
        assert isinstance(d["sample"], list)
        assert len(d["sample"]) <= 5
        assert d["count"] >= 1

    def test_preview_audience_plan(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/admin/campaigns/preview-audience",
                          headers=admin_headers,
                          json={"audience": {"type": "plan", "plans": ["solo", "family"]}})
        assert r.status_code == 200
        d = r.json()
        assert "count" in d
        for u in d["sample"]:
            assert u.get("plan") in ("solo", "family")

    def test_create_campaign_draft(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/admin/campaigns", headers=admin_headers, json={
            "name": "TEST_campaign",
            "audience": {"type": "plan", "plans": ["family"]},
            "subject": "TEST_subject",
            "html_body": "<p>Hello {{first_name}}</p>",
        })
        assert r.status_code == 200, r.text
        c = r.json()["campaign"]
        assert c["status"] == "draft"
        _created["campaigns"].append(c["id"])
        TestCampaigns.cid = c["id"]

    def test_send_campaign(self, admin_headers):
        cid = TestCampaigns.cid
        r = requests.post(f"{BASE_URL}/api/admin/campaigns/{cid}/send",
                          headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "recipients" in d and "sent" in d
        c = _db.email_campaigns.find_one({"id": cid})
        assert c["status"] == "sent"
        assert c.get("sent_count", 0) >= 0
        # notification_log rows must be written
        rows = list(_db.notification_log.find({"campaign_id": cid}))
        # If recipients>0 rows must exist
        if d["recipients"] > 0:
            assert len(rows) >= 1

    def test_send_campaign_twice_returns_400(self, admin_headers):
        cid = TestCampaigns.cid
        r = requests.post(f"{BASE_URL}/api/admin/campaigns/{cid}/send",
                          headers=admin_headers)
        assert r.status_code == 400


# --------------------- EMAIL TEMPLATES + NOTIFICATION LOG + SUBSCRIBERS ---------------------

def test_email_templates(admin_headers):
    r = requests.get(f"{BASE_URL}/api/admin/email-templates", headers=admin_headers)
    assert r.status_code == 200
    d = r.json()
    assert "system" in d and "custom" in d
    assert len(d["system"]) == 11, f"expected 11 system templates, got {len(d['system'])}"


def test_notification_log(admin_headers):
    r = requests.get(f"{BASE_URL}/api/admin/notification-log", headers=admin_headers)
    assert r.status_code == 200
    d = r.json()
    assert "rows" in d and "total" in d
    assert "last_hour" in d
    lh = d["last_hour"]
    assert "sent" in lh and "failed" in lh and "failure_rate_pct" in lh


def test_newsletter_subscribers(admin_headers):
    r = requests.get(f"{BASE_URL}/api/admin/newsletter-subscribers", headers=admin_headers)
    assert r.status_code == 200
    d = r.json()
    assert "rows" in d and "total" in d
    assert "page" in d and "page_size" in d
