"""
Iter 43 regression — field_modifications audit trail + notifications module extraction.
Tests:
1. PATCH /api/participants/{pid} stamps field_modifications.{field} = {actor_id, actor_name, at}
2. Notification routes (after extraction to backend/routes/notifications.py):
   - GET /api/notifications
   - POST /api/notifications/read (empty + with ids)
   - GET /api/notifications/prefs
   - PUT /api/notifications/prefs
   - Auth still enforced (401 without Bearer)
"""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mobile-exact-parity.preview.emergentagent.com").rstrip("/")
CATHY_EMAIL = "cathy@example.com"
CATHY_PASSWORD = "testpass123"
CATHY_PID = "0c538637-b0dd-4982-8f78-b32814c6a5eb"


@pytest.fixture(scope="module")
def cathy_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": CATHY_EMAIL, "password": CATHY_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(cathy_token):
    return {"Authorization": f"Bearer {cathy_token}"}


# -------------------- field_modifications audit trail --------------------
class TestFieldModifications:
    def test_patch_user_field_stamps_audit_trail(self, auth_headers):
        """PATCH with a user-supplied field should add an entry in field_modifications."""
        # Pick a benign field — care_manager_name (Tier-3, user-supplied)
        new_value = "Test Manager Iter43"
        r = requests.patch(
            f"{BASE_URL}/api/participants/{CATHY_PID}",
            json={"care_manager_name": new_value},
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code == 200, f"PATCH failed: {r.status_code} {r.text}"
        data = r.json()
        assert "field_modifications" in data, "Response missing field_modifications"
        fm = data["field_modifications"]
        assert "care_manager_name" in fm, f"care_manager_name not in trail: {list(fm.keys())}"
        entry = fm["care_manager_name"]
        assert entry.get("actor_name") == "Cathy", f"actor_name expected 'Cathy', got {entry}"
        assert "actor_id" in entry and entry["actor_id"], "actor_id missing/empty"
        assert "at" in entry and entry["at"], "at timestamp missing"
        # ISO timestamp sanity: matches YYYY-MM-DDTHH:MM:SS
        assert re.match(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", entry["at"]), \
            f"at not ISO format: {entry['at']}"

    def test_patch_system_fields_not_stamped(self, auth_headers):
        """SYSTEM_FIELDS (profile_completeness_pct, updated_at, classification etc.) should NOT be stamped."""
        # PATCH a single user field; capture trail; verify no system-field key was added
        r = requests.patch(
            f"{BASE_URL}/api/participants/{CATHY_PID}",
            json={"care_manager_name": "Test Manager System Check"},
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code == 200
        fm = r.json().get("field_modifications", {})
        for forbidden in ("profile_completeness_pct", "updated_at", "date_of_birth",
                          "classification", "statement_format"):
            assert forbidden not in fm, f"System field '{forbidden}' was incorrectly stamped"


# -------------------- notifications module (extracted to backend/routes/notifications.py) --------------------
class TestNotificationRoutes:
    def test_get_notifications_returns_list(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/notifications", headers=auth_headers, timeout=15)
        assert r.status_code == 200, f"GET /api/notifications failed: {r.status_code} {r.text}"
        data = r.json()
        # Accept either list or wrapped object {items, unread_count, ...}
        assert isinstance(data, (list, dict)), f"Unexpected shape: {type(data)}"

    def test_get_notifications_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/notifications", timeout=15)
        assert r.status_code in (401, 403), \
            f"Expected 401/403 without Bearer, got {r.status_code}"

    def test_post_read_empty_body(self, auth_headers):
        r = requests.post(
            f"{BASE_URL}/api/notifications/read",
            json={},
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code in (200, 204), \
            f"POST /api/notifications/read (empty) failed: {r.status_code} {r.text}"

    def test_post_read_with_ids_array(self, auth_headers):
        # Fetch first to get an id (if any)
        listing = requests.get(f"{BASE_URL}/api/notifications", headers=auth_headers, timeout=15).json()
        items = listing if isinstance(listing, list) else listing.get("items") or listing.get("notifications") or []
        ids = [n.get("id") for n in items if isinstance(n, dict) and n.get("id")][:1]
        payload = {"ids": ids} if ids else {"ids": ["nonexistent-id-iter43"]}
        r = requests.post(
            f"{BASE_URL}/api/notifications/read",
            json=payload,
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code in (200, 204), \
            f"POST /api/notifications/read (ids) failed: {r.status_code} {r.text}"

    def test_get_prefs(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/notifications/prefs", headers=auth_headers, timeout=15)
        assert r.status_code == 200, f"GET prefs failed: {r.status_code} {r.text}"
        data = r.json()
        assert isinstance(data, dict), f"prefs not dict: {type(data)}"

    def test_put_prefs(self, auth_headers):
        # GET first to know current shape, then PUT it back unchanged
        cur = requests.get(f"{BASE_URL}/api/notifications/prefs", headers=auth_headers, timeout=15).json()
        # Most pref payloads have boolean keys; if shape unknown, try minimal valid PUT
        if isinstance(cur, dict) and cur:
            payload = cur
        else:
            payload = {"email_enabled": True}
        r = requests.put(
            f"{BASE_URL}/api/notifications/prefs",
            json=payload,
            headers=auth_headers,
            timeout=15,
        )
        assert r.status_code in (200, 204), \
            f"PUT prefs failed: {r.status_code} {r.text}"

    def test_prefs_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/notifications/prefs", timeout=15)
        assert r.status_code in (401, 403), \
            f"Expected 401/403 without Bearer, got {r.status_code}"

    def test_post_read_decrements_unread_count(self, auth_headers):
        """If at least one unread notification exists, POST /read with its id should reduce unread count."""
        before = requests.get(f"{BASE_URL}/api/notifications", headers=auth_headers, timeout=15).json()
        items_before = before if isinstance(before, list) else (
            before.get("items") or before.get("notifications") or []
        )
        unread = [n for n in items_before if isinstance(n, dict) and not n.get("read", False)]
        if not unread:
            pytest.skip("No unread notifications to test decrement")
        target_id = unread[0].get("id")
        if not target_id:
            pytest.skip("Unread notification missing id")
        unread_before = len(unread)
        requests.post(
            f"{BASE_URL}/api/notifications/read",
            json={"ids": [target_id]},
            headers=auth_headers,
            timeout=15,
        )
        after = requests.get(f"{BASE_URL}/api/notifications", headers=auth_headers, timeout=15).json()
        items_after = after if isinstance(after, list) else (
            after.get("items") or after.get("notifications") or []
        )
        unread_after = len([n for n in items_after if isinstance(n, dict) and not n.get("read", False)])
        assert unread_after < unread_before, \
            f"Unread count did not decrement: before={unread_before}, after={unread_after}"
