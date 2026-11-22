"""Phase 3A.1 Unified Support Inbox + Phase 5A Marketing Spend + Command Centre MVP.

Tests the three new admin-only surfaces end-to-end against the shared backend.
Admin login is 2-step (password -> TOTP). TOTP secret is preview-only.
"""
from __future__ import annotations

import os
import time
import uuid
import pytest
import pyotp
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # read from /app/frontend/.env
    with open("/app/frontend/.env") as fh:
        for line in fh:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

ADMIN_EMAIL = "hello@wayly.com.au"
ADMIN_PASSWORD = "Admin!2026"
ADMIN_TOTP_SECRET = "M5A7R2XCCEXWYYKNJY55MVZYUHPYFA6W"


@pytest.fixture(scope="session")
def admin_token():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/admin/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"login step1 failed: {r.status_code} {r.text}"
    temp_token = r.json().get("temp_token")
    assert temp_token, f"no temp_token: {r.json()}"
    code = pyotp.TOTP(ADMIN_TOTP_SECRET).now()
    r2 = s.post(f"{BASE_URL}/api/admin/auth/2fa/verify",
                json={"temp_token": temp_token, "code": code}, timeout=20)
    if r2.status_code != 200:
        # tolerate clock drift — retry once after a short sleep
        time.sleep(2)
        code = pyotp.TOTP(ADMIN_TOTP_SECRET).now()
        r2 = s.post(f"{BASE_URL}/api/admin/auth/2fa/verify",
                    json={"temp_token": temp_token, "code": code}, timeout=20)
    assert r2.status_code == 200, f"2fa failed: {r2.status_code} {r2.text}"
    token = r2.json().get("token")
    assert token, f"no token: {r2.json()}"
    return token


@pytest.fixture
def admin_client(admin_token):
    s = requests.Session()
    s.headers.update({
        "Authorization": f"Bearer {admin_token}",
        "Content-Type": "application/json",
    })
    return s


# -----------------------------------------------------------------------------
# Unified Support Inbox
# -----------------------------------------------------------------------------
class TestSupportInbox:
    def test_inbox_default(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/support/inbox")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "rows" in data and "counts_by_source" in data and "meta" in data
        assert set(data["counts_by_source"].keys()) == {"ticket", "enquiry", "legacy"}
        sources_meta = {m["name"] for m in data["meta"]["sources"]}
        assert sources_meta == {"ticket", "enquiry", "legacy"}
        # No message bodies / internal notes should leak
        banned_keys = {"body", "message", "message_body", "internal_notes", "notes"}
        for row in data["rows"]:
            assert banned_keys.isdisjoint(row.keys()), f"leaked key: {row}"

    def test_inbox_filter_by_source_ticket(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/support/inbox", params={"source": "ticket"})
        assert r.status_code == 200
        data = r.json()
        for row in data["rows"]:
            assert row["source"] == "ticket"

    def test_inbox_filter_by_status_open(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/support/inbox", params={"status": "open"})
        assert r.status_code == 200
        for row in r.json()["rows"]:
            assert row["status_bucket"] == "open"

    def test_inbox_search(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/support/inbox", params={"q": "wayly"})
        assert r.status_code == 200

    def test_pagination(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/support/inbox",
                             params={"page": 1, "page_size": 5})
        assert r.status_code == 200
        data = r.json()
        assert data["page"] == 1 and data["page_size"] == 5
        assert len(data["rows"]) <= 5

    def test_legacy_not_double_counted(self, admin_client):
        """Migrated legacy tickets (WAY-0045/WAY-0046) should appear under 'ticket',
        not 'legacy'."""
        r = admin_client.get(f"{BASE_URL}/api/admin/support/inbox",
                             params={"page_size": 200})
        assert r.status_code == 200
        data = r.json()
        refs = {row.get("reference") for row in data["rows"] if row.get("source") == "ticket"}
        legacy_rows = [row for row in data["rows"] if row.get("source") == "legacy"]
        # Check WAY-0045/WAY-0046 appear as ticket source if present
        for ref in ("WAY-0045", "WAY-0046"):
            if ref in refs:
                # confirm they are NOT present under legacy
                assert not any(row.get("reference") == ref for row in legacy_rows), \
                    f"{ref} appears under legacy too (double-counted)"

    def test_unauthenticated_blocked(self):
        r = requests.get(f"{BASE_URL}/api/admin/support/inbox")
        assert r.status_code in (401, 403), f"unauthenticated got {r.status_code}"


# -----------------------------------------------------------------------------
# Marketing Spend Register
# -----------------------------------------------------------------------------
class TestMarketingSpend:
    created_expense_ids: list = []
    created_campaign_ids: list = []

    def test_categories_list(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/marketing/categories")
        assert r.status_code == 200, r.text
        data = r.json()
        # default categories seeded
        slugs = {c.get("slug") for c in data.get("categories", data if isinstance(data, list) else [])}
        assert any(slugs), "no categories seeded"

    def test_summary_this_month(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/marketing/summary",
                             params={"period": "this_month"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "totals" in data and "period" in data
        # currency AUD
        assert "aud" in str(data).lower() or data["totals"].get("currency", "AUD") == "AUD"

    def test_create_campaign(self, admin_client):
        payload = {
            "name": f"TEST_Campaign_{uuid.uuid4().hex[:6]}",
            "objective": "awareness",
            "planned_budget_aud": 1000.0,
            "owner": "TEST runner",
        }
        r = admin_client.post(f"{BASE_URL}/api/admin/marketing/campaigns", json=payload)
        assert r.status_code in (200, 201), r.text
        c = r.json()
        cid = c.get("id") or c.get("campaign_id") or (c.get("campaign") or {}).get("id")
        assert cid, f"no campaign id in response: {c}"
        TestMarketingSpend.created_campaign_ids.append(cid)

        # GET back
        r2 = admin_client.get(f"{BASE_URL}/api/admin/marketing/campaigns/{cid}")
        assert r2.status_code == 200
        assert r2.json().get("name") == payload["name"] or \
               (r2.json().get("campaign") or {}).get("name") == payload["name"]

    def test_create_expense_and_verify_summary(self, admin_client):
        # fetch a category slug first
        cats = admin_client.get(f"{BASE_URL}/api/admin/marketing/categories").json()
        cat_list = cats.get("categories") if isinstance(cats, dict) else cats
        assert cat_list, "no categories"
        slug = cat_list[0]["slug"]

        payload = {
            "activity_name": f"TEST_Expense_{uuid.uuid4().hex[:6]}",
            "channel": "google",
            "category_slug": slug,
            "vendor": "TEST_Vendor",
            "cost_inc_gst": 220.0,
            "cost_ex_gst": 200.0,
            "gst_amount": 20.0,
            "gst_treatment": "gst_inclusive",
            "status": "booked",
            "payment_status": "paid",
            "data_source": "manual",
        }
        r = admin_client.post(f"{BASE_URL}/api/admin/marketing/expenses", json=payload)
        assert r.status_code in (200, 201), r.text
        exp = r.json()
        eid = exp.get("id") or (exp.get("expense") or {}).get("id")
        assert eid, exp
        TestMarketingSpend.created_expense_ids.append(eid)

        # GET expense
        g = admin_client.get(f"{BASE_URL}/api/admin/marketing/expenses/{eid}")
        assert g.status_code == 200
        gg = g.json()
        activity = gg.get("activity_name") or (gg.get("expense") or {}).get("activity_name")
        assert activity == payload["activity_name"]

        # Listing
        lst = admin_client.get(f"{BASE_URL}/api/admin/marketing/expenses")
        assert lst.status_code == 200
        rows = lst.json().get("rows") or lst.json().get("expenses") or []
        assert any((row.get("id") == eid) for row in rows), "created expense not in list"

    def test_patch_expense(self, admin_client):
        if not TestMarketingSpend.created_expense_ids:
            pytest.skip("no expense created")
        eid = TestMarketingSpend.created_expense_ids[0]
        r = admin_client.patch(f"{BASE_URL}/api/admin/marketing/expenses/{eid}",
                               json={"vendor": "TEST_Vendor_Updated"})
        assert r.status_code == 200, r.text
        g = admin_client.get(f"{BASE_URL}/api/admin/marketing/expenses/{eid}").json()
        vendor = g.get("vendor") or (g.get("expense") or {}).get("vendor")
        assert vendor == "TEST_Vendor_Updated"

    def test_void_expense(self, admin_client):
        if not TestMarketingSpend.created_expense_ids:
            pytest.skip("no expense created")
        eid = TestMarketingSpend.created_expense_ids[0]
        r = admin_client.post(f"{BASE_URL}/api/admin/marketing/expenses/{eid}/void",
                              json={"reason": "TEST void by test harness"})
        assert r.status_code == 200, r.text
        g = admin_client.get(f"{BASE_URL}/api/admin/marketing/expenses/{eid}").json()
        exp = g.get("expense") or g
        assert exp.get("voided") is True or exp.get("status") == "cancelled"

    def test_csv_export(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/marketing/expenses/export.csv")
        assert r.status_code == 200, r.text
        assert "csv" in r.headers.get("content-type", "").lower() or r.text.startswith(",") or "," in r.text

    def test_rbac_non_admin_blocked(self):
        # No auth header
        r = requests.get(f"{BASE_URL}/api/admin/marketing/summary")
        assert r.status_code in (401, 403), f"unauth got {r.status_code}"
        r = requests.get(f"{BASE_URL}/api/admin/marketing/expenses")
        assert r.status_code in (401, 403)


# -----------------------------------------------------------------------------
# Command Centre
# -----------------------------------------------------------------------------
class TestCommandCentre:
    def test_summary_shape(self, admin_client):
        r = admin_client.get(f"{BASE_URL}/api/admin/command-centre/summary")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "blocks" in data
        for name in ("revenue", "growth", "support", "marketing", "alerts", "approvals"):
            assert name in data["blocks"], f"missing block: {name}"
            b = data["blocks"][name]
            assert "source" in b and "last_updated" in b and "status" in b and "data" in b
        assert "data_source_health" in data
        assert isinstance(data["data_source_health"], list)
        assert len(data["data_source_health"]) >= 3

    def test_unauth_blocked(self):
        r = requests.get(f"{BASE_URL}/api/admin/command-centre/summary")
        assert r.status_code in (401, 403)


# -----------------------------------------------------------------------------
# Cleanup
# -----------------------------------------------------------------------------
@pytest.fixture(scope="module", autouse=True)
def _cleanup(admin_token=None):
    yield
    # void any leftover test expenses (no hard delete - money never deleted)
    if admin_token is None:
        return
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {admin_token}"})
