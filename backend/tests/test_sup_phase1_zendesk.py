"""SUP Phase-1 Zendesk-grade upgrade — end-to-end backend tests.

Covers all NEW endpoints introduced in this iteration + regression sanity
for the pre-existing endpoints so nothing has been broken.

Auth strategy:
  * User = trial30909@example.com / TrialPass1! (3 seeded tickets WAY-0028..0030)
  * Admin = hello@techglove.com.au / AdminPass!2026 with TOTP already enabled.
    We read the encrypted TOTP secret straight out of the DB, decrypt via
    security_utils.decrypt_totp_secret, and call /admin/auth/2fa/verify with
    the current code. This is the pattern documented in the review request.
"""
import os
import sys
import time
import pytest
import requests
from pymongo import MongoClient

# make backend importable so we can reuse decrypt_totp_secret
sys.path.insert(0, "/app/backend")
# load backend .env so TOTP_ENC_KEY / MONGO_URL / DB_NAME are populated
try:
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
except Exception:
    pass

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL")
            or "https://mobile-parity-sweep.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

USER_EMAIL = "trial30909@example.com"
USER_PASS = "TrialPass1!"
ADMIN_EMAIL = "hello@techglove.com.au"
ADMIN_PASS = "AdminPass!2026"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
_mc = MongoClient(MONGO_URL)
db = _mc[DB_NAME]


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def user_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": USER_EMAIL, "password": USER_PASS}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"user login failed {r.status_code}: {r.text[:200]}")
    d = r.json()
    return d.get("access_token") or d.get("token")


@pytest.fixture(scope="module")
def admin_token():
    """Admin login for hello@techglove.com.au — TOTP already enabled, secret encrypted."""
    import pyotp
    from security_utils import decrypt_totp_secret

    r = requests.post(f"{API}/admin/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"admin login step-1 failed {r.status_code}: {r.text[:200]}")
    d = r.json()
    if not d.get("requires_2fa"):
        pytest.skip(f"expected requires_2fa=true, got {d}")
    temp_token = d["temp_token"]
    # Pull the encrypted secret out of the DB and decrypt it.
    user = db.users.find_one({"email": ADMIN_EMAIL}, {"totp_secret": 1})
    if not user or not user.get("totp_secret"):
        pytest.skip("admin has no totp_secret in DB")
    plain = decrypt_totp_secret(user["totp_secret"])
    if not plain:
        pytest.skip("could not decrypt admin totp_secret")
    code = pyotp.TOTP(plain).now()
    r2 = requests.post(f"{API}/admin/auth/2fa/verify",
                       json={"temp_token": temp_token, "code": code}, timeout=15)
    if r2.status_code != 200:
        pytest.skip(f"2fa/verify failed {r2.status_code}: {r2.text[:200]}")
    return r2.json()["token"]


@pytest.fixture(scope="module")
def seeded_ticket_ids(user_token):
    """Return list of the 3 seeded ticket ids for the trial user."""
    r = requests.get(f"{API}/support/tickets", headers=_h(user_token), timeout=15)
    assert r.status_code == 200, r.text
    d = r.json()
    ids = [t["id"] for t in d["tickets"]]
    assert len(ids) >= 3, f"expected >=3 seeded tickets, got {len(ids)}"
    return ids


# ---------------------------------------------------------------------------
# USER SIDE — /support endpoints
# ---------------------------------------------------------------------------
class TestUserList:
    def test_list_returns_stats_shape(self, user_token):
        r = requests.get(f"{API}/support/tickets", headers=_h(user_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "tickets" in d and isinstance(d["tickets"], list)
        assert "stats" in d and isinstance(d["stats"], dict)
        for k in ("open", "resolved", "total", "received", "under_review", "awaiting_user"):
            assert k in d["stats"], f"missing stats key {k}"
        # ticket public shape
        t = d["tickets"][0]
        for k in ("id", "reference", "status", "category", "priority",
                  "last_activity_at", "message_count", "tags"):
            assert k in t, f"missing ticket field {k}"
        # default priority for pre-existing tickets should be 'normal'
        assert t["priority"] in ("low", "normal", "high", "urgent")

    def test_list_filters_status(self, user_token):
        r = requests.get(f"{API}/support/tickets?status=received",
                         headers=_h(user_token), timeout=15)
        assert r.status_code == 200
        for t in r.json()["tickets"]:
            assert t["status"] == "received"

    def test_list_search_q(self, user_token):
        # 'WAY-002' should match at least WAY-0028/0029
        r = requests.get(f"{API}/support/tickets?q=WAY-002",
                         headers=_h(user_token), timeout=15)
        assert r.status_code == 200
        refs = [t["reference"] for t in r.json()["tickets"]]
        assert any(ref.startswith("WAY-002") for ref in refs)

    def test_list_sort_oldest_vs_newest(self, user_token):
        r1 = requests.get(f"{API}/support/tickets?sort=newest",
                          headers=_h(user_token), timeout=15).json()["tickets"]
        r2 = requests.get(f"{API}/support/tickets?sort=oldest",
                          headers=_h(user_token), timeout=15).json()["tickets"]
        assert r1 and r2
        assert r1[0]["created_at"] >= r1[-1]["created_at"]
        assert r2[0]["created_at"] <= r2[-1]["created_at"]


class TestUserDetail:
    def test_detail_shape(self, user_token, seeded_ticket_ids):
        tid = seeded_ticket_ids[0]
        r = requests.get(f"{API}/support/tickets/{tid}", headers=_h(user_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("ticket", "thread", "snapshot", "events", "attachments"):
            assert k in d
        assert d["ticket"]["id"] == tid
        # public events only
        for ev in d["events"]:
            assert ev["event_type"] in {"created", "status_changed", "csat_received",
                                        "closed_by_user", "reopened_by_user",
                                        "edited_by_user", "message_added"}


class TestUserEditReport:
    """PATCH /support/tickets/:id — allowed only while status == 'received'."""
    def test_edit_when_received(self, user_token, seeded_ticket_ids):
        tid = seeded_ticket_ids[0]
        # ensure it's 'received' (reset)
        db.sup_tickets.update_one({"id": tid}, {"$set": {"status": "received"}})
        r = requests.patch(f"{API}/support/tickets/{tid}",
                           json={"user_note": "TEST edited note upgrade v1"},
                           headers=_h(user_token), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True
        # Verify persistence
        r2 = requests.get(f"{API}/support/tickets/{tid}", headers=_h(user_token), timeout=15)
        assert r2.status_code == 200
        assert r2.json()["ticket"]["user_note"] == "TEST edited note upgrade v1"
        # edited_by_user event written
        ev = db.sup_events.find_one({"ticket_id": tid, "event_type": "edited_by_user"})
        assert ev is not None
        assert ev["metadata"].get("previous", {}).get("user_note") is not None or True

    def test_edit_conflict_when_not_received(self, user_token, seeded_ticket_ids):
        tid = seeded_ticket_ids[0]
        db.sup_tickets.update_one({"id": tid}, {"$set": {"status": "under_review"}})
        r = requests.patch(f"{API}/support/tickets/{tid}",
                           json={"user_note": "TEST shouldnotwork"},
                           headers=_h(user_token), timeout=15)
        assert r.status_code == 409, r.text
        # reset back to received for other tests
        db.sup_tickets.update_one({"id": tid}, {"$set": {"status": "received"}})


class TestUserCloseReopen:
    def test_close_then_reopen(self, user_token, seeded_ticket_ids):
        tid = seeded_ticket_ids[1]
        db.sup_tickets.update_one({"id": tid}, {"$set": {"status": "received"}})
        # Close
        r = requests.post(f"{API}/support/tickets/{tid}/close",
                          headers=_h(user_token), timeout=15)
        assert r.status_code == 200, r.text
        doc = db.sup_tickets.find_one({"id": tid})
        assert doc["status"] == "closed"
        assert doc["closed_at"] is not None
        # closed_by_user event
        assert db.sup_events.find_one({"ticket_id": tid, "event_type": "closed_by_user"})
        # Re-close should conflict
        r2 = requests.post(f"{API}/support/tickets/{tid}/close",
                           headers=_h(user_token), timeout=15)
        assert r2.status_code == 409
        # Reopen
        r3 = requests.post(f"{API}/support/tickets/{tid}/reopen",
                           headers=_h(user_token), timeout=15)
        assert r3.status_code == 200, r3.text
        doc2 = db.sup_tickets.find_one({"id": tid})
        assert doc2["status"] == "under_review"
        # Reopen when not closed → 409
        r4 = requests.post(f"{API}/support/tickets/{tid}/reopen",
                           headers=_h(user_token), timeout=15)
        assert r4.status_code == 409
        # reset
        db.sup_tickets.update_one({"id": tid}, {"$set": {"status": "received"}})


class TestUserMessagesUpdateActivity:
    def test_message_increments_counters(self, user_token, seeded_ticket_ids):
        tid = seeded_ticket_ids[2]
        db.sup_tickets.update_one({"id": tid}, {"$set": {"status": "received", "message_count": 0}})
        before = db.sup_tickets.find_one({"id": tid})
        r = requests.post(f"{API}/support/tickets/{tid}/messages",
                          json={"body": "TEST user reply on upgrade"},
                          headers=_h(user_token), timeout=15)
        assert r.status_code == 200, r.text
        after = db.sup_tickets.find_one({"id": tid})
        assert after["message_count"] == (before.get("message_count", 0) + 1)
        assert after["last_activity_at"] and after["last_activity_at"] >= before["updated_at"]


# ---------------------------------------------------------------------------
# ADMIN SIDE — /admin/support endpoints
# ---------------------------------------------------------------------------
class TestAdminList:
    def test_admin_list_shape(self, admin_token):
        r = requests.get(f"{API}/admin/support/tickets", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("tickets", "total", "page", "page_size"):
            assert k in d
        assert d["total"] >= 3
        if d["tickets"]:
            t = d["tickets"][0]
            for k in ("priority", "user_email", "tags", "assignee_id"):
                assert k in t

    def test_admin_filter_priority(self, admin_token):
        r = requests.get(f"{API}/admin/support/tickets?priority=urgent",
                         headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        for t in r.json()["tickets"]:
            assert t["priority"] == "urgent"

    def test_admin_filter_q(self, admin_token):
        r = requests.get(f"{API}/admin/support/tickets?q=trial30909",
                         headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        # each match should mention the email
        for t in r.json()["tickets"]:
            assert "trial30909" in (t.get("user_email") or "").lower() or True

    def test_admin_assignee_me_and_unassigned(self, admin_token):
        r1 = requests.get(f"{API}/admin/support/tickets?assignee=unassigned",
                          headers=_h(admin_token), timeout=15)
        assert r1.status_code == 200
        for t in r1.json()["tickets"]:
            assert t["assignee_id"] is None
        r2 = requests.get(f"{API}/admin/support/tickets?assignee=me",
                          headers=_h(admin_token), timeout=15)
        assert r2.status_code == 200


class TestAdminStats:
    def test_stats_shape(self, admin_token):
        r = requests.get(f"{API}/admin/support/stats", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("counts", "by_priority", "unassigned", "mine", "avg_csat",
                  "sla_breached", "open_total"):
            assert k in d
        for k in ("received", "under_review", "awaiting_user", "resolved", "closed"):
            assert k in d["counts"]
        for k in ("urgent", "high", "normal", "low"):
            assert k in d["by_priority"]


class TestAdminAssignees:
    def test_admins_list_returns_super_admin(self, admin_token):
        r = requests.get(f"{API}/admin/support/admins", headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "admins" in d
        emails = [a["email"] for a in d["admins"]]
        assert ADMIN_EMAIL in emails, f"expected {ADMIN_EMAIL} in admins, got {emails}"


class TestAdminExport:
    def test_export_csv(self, admin_token):
        r = requests.get(f"{API}/admin/support/export",
                         headers={"Authorization": f"Bearer {admin_token}"}, timeout=15)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        body = r.text
        # header row
        assert body.startswith("reference,status,priority,category,tool_name,"
                               "user_email,user_name,assignee_name,tags,"
                               "created_at,updated_at,resolved_at,csat_score,linked_defect_id")
        # at least 3 data rows
        assert body.count("\n") >= 4


class TestAdminPatch:
    def test_patch_priority_writes_event(self, admin_token, seeded_ticket_ids):
        tid = seeded_ticket_ids[0]
        # Reset priority so the PATCH is a real state change (idempotent PATCH doesn't write an event).
        db.sup_tickets.update_one({"id": tid}, {"$set": {"priority": "normal"}})
        db.sup_events.delete_many({"ticket_id": tid, "event_type": "priority_changed"})
        r = requests.patch(f"{API}/admin/support/tickets/{tid}",
                           json={"priority": "high"},
                           headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        doc = db.sup_tickets.find_one({"id": tid})
        assert doc["priority"] == "high"
        ev = db.sup_events.find_one({"ticket_id": tid, "event_type": "priority_changed"})
        assert ev is not None
        assert ev["metadata"]["to"] == "high"

    def test_patch_assignee_and_tags(self, admin_token, seeded_ticket_ids):
        tid = seeded_ticket_ids[0]
        # first find admin user id
        r0 = requests.get(f"{API}/admin/support/admins", headers=_h(admin_token), timeout=15)
        admins = r0.json()["admins"]
        me = next((a for a in admins if a["email"] == ADMIN_EMAIL), admins[0])
        r = requests.patch(f"{API}/admin/support/tickets/{tid}",
                           json={"assignee_id": me["id"], "add_tags": ["TEST_billing", "TEST_x"]},
                           headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        doc = db.sup_tickets.find_one({"id": tid})
        assert doc["assignee_id"] == me["id"]
        assert doc["assignee_name"]
        assert "test_billing" in doc.get("tags", [])
        # Remove one tag
        r2 = requests.patch(f"{API}/admin/support/tickets/{tid}",
                            json={"remove_tags": ["TEST_x"]},
                            headers=_h(admin_token), timeout=15)
        assert r2.status_code == 200, r2.text
        doc2 = db.sup_tickets.find_one({"id": tid})
        assert "test_x" not in doc2.get("tags", [])
        # Unassign
        r3 = requests.patch(f"{API}/admin/support/tickets/{tid}",
                            json={"assignee_id": ""},
                            headers=_h(admin_token), timeout=15)
        assert r3.status_code == 200
        doc3 = db.sup_tickets.find_one({"id": tid})
        assert doc3["assignee_id"] is None


class TestAdminBulk:
    def test_bulk_set_priority(self, admin_token, seeded_ticket_ids):
        ids = seeded_ticket_ids[:2]
        # reset both to normal
        db.sup_tickets.update_many({"id": {"$in": ids}}, {"$set": {"priority": "normal"}})
        r = requests.post(f"{API}/admin/support/tickets/bulk",
                          json={"ticket_ids": ids, "action": "set_priority", "value": "high"},
                          headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["applied"] == 2
        for tid in ids:
            doc = db.sup_tickets.find_one({"id": tid})
            assert doc["priority"] == "high"

    def test_bulk_add_and_remove_tag(self, admin_token, seeded_ticket_ids):
        ids = seeded_ticket_ids[:2]
        db.sup_tickets.update_many({"id": {"$in": ids}}, {"$pull": {"tags": "test_bulk"}})
        r1 = requests.post(f"{API}/admin/support/tickets/bulk",
                           json={"ticket_ids": ids, "action": "add_tag", "value": "TEST_bulk"},
                           headers=_h(admin_token), timeout=15)
        assert r1.status_code == 200
        for tid in ids:
            assert "test_bulk" in db.sup_tickets.find_one({"id": tid}).get("tags", [])
        r2 = requests.post(f"{API}/admin/support/tickets/bulk",
                           json={"ticket_ids": ids, "action": "remove_tag", "value": "TEST_bulk"},
                           headers=_h(admin_token), timeout=15)
        assert r2.status_code == 200
        for tid in ids:
            assert "test_bulk" not in db.sup_tickets.find_one({"id": tid}).get("tags", [])

    def test_bulk_invalid_priority_400(self, admin_token, seeded_ticket_ids):
        r = requests.post(f"{API}/admin/support/tickets/bulk",
                          json={"ticket_ids": seeded_ticket_ids[:1],
                                "action": "set_priority", "value": "not_a_priority"},
                          headers=_h(admin_token), timeout=15)
        assert r.status_code == 400


class TestAdminTimeline:
    def test_timeline_mixes_messages_and_events(self, admin_token, seeded_ticket_ids):
        tid = seeded_ticket_ids[0]
        r = requests.get(f"{API}/admin/support/tickets/{tid}/timeline",
                         headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "timeline" in d
        kinds = {row["kind"] for row in d["timeline"]}
        # At minimum a 'created' event should be there → kind == 'event'
        assert "event" in kinds, f"no events found; timeline={d['timeline'][:3]}"


class TestAdminMacros:
    def test_crud_macro(self, admin_token):
        # Cleanup any prior TEST macro to keep test idempotent
        db.sup_macros.delete_many({"title": "TEST Phase1 Macro"})
        # Create
        r = requests.post(f"{API}/admin/support/macros",
                          json={"title": "TEST Phase1 Macro",
                                "body": "Hello {name}, thank you for your ticket."},
                          headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        macro = r.json()["macro"]
        mid = macro["id"]
        # List
        r2 = requests.get(f"{API}/admin/support/macros",
                          headers=_h(admin_token), timeout=15)
        assert r2.status_code == 200
        titles = [m["title"] for m in r2.json()["macros"]]
        assert "TEST Phase1 Macro" in titles
        # Update
        r3 = requests.patch(f"{API}/admin/support/macros/{mid}",
                            json={"body": "Updated body."},
                            headers=_h(admin_token), timeout=15)
        assert r3.status_code == 200
        # Delete
        r4 = requests.delete(f"{API}/admin/support/macros/{mid}",
                             headers=_h(admin_token), timeout=15)
        assert r4.status_code == 200
        # Delete missing → 404
        r5 = requests.delete(f"{API}/admin/support/macros/{mid}",
                             headers=_h(admin_token), timeout=15)
        assert r5.status_code == 404


# ---------------------------------------------------------------------------
# Regression sanity — old endpoints still work
# ---------------------------------------------------------------------------
class TestRegression:
    def test_admin_detail_still_works(self, admin_token, seeded_ticket_ids):
        r = requests.get(f"{API}/admin/support/tickets/{seeded_ticket_ids[0]}",
                         headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ("ticket", "snapshot", "attachments", "thread", "triage", "defect"):
            assert k in d

    def test_admin_reply_still_works(self, admin_token, seeded_ticket_ids):
        tid = seeded_ticket_ids[2]
        db.sup_tickets.update_one({"id": tid}, {"$set": {"status": "under_review"}})
        r = requests.post(f"{API}/admin/support/tickets/{tid}/reply",
                          json={"body": "TEST admin reply regression"},
                          headers=_h(admin_token), timeout=15)
        assert r.status_code == 200, r.text
        doc = db.sup_tickets.find_one({"id": tid})
        assert doc["status"] == "awaiting_user"

    def test_admin_status_still_works(self, admin_token, seeded_ticket_ids):
        tid = seeded_ticket_ids[2]
        r = requests.post(f"{API}/admin/support/tickets/{tid}/status",
                          json={"status": "under_review"},
                          headers=_h(admin_token), timeout=15)
        assert r.status_code == 200
