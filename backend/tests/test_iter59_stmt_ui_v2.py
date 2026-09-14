"""
Iter59 regression checks for STMT-UI-1 v2 backend changes.

Covers:
- GET /api/statements returns `has_note` per row (body stripped)
- GET /api/statements/{id} returns `user_note` + `has_note`
- PATCH /api/statements/{id}/note sets/updates/clears note
- PATCH validates payload types + 1024 char cap
- Note round-trip: PATCH then list reflects has_note=true
- Cathy family user should NOT be blocked by paywall on PATCH note (unless she is)
"""
import os
import uuid
import requests
import pytest


def _load_backend_url():
    url = os.environ.get("REACT_APP_BACKEND_URL", "").strip()
    if not url:
        try:
            with open("/app/frontend/.env") as fh:
                for ln in fh:
                    if ln.startswith("REACT_APP_BACKEND_URL="):
                        url = ln.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    return url.rstrip("/")


BASE_URL = _load_backend_url()
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"


def _login(email: str, password: str):
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        return None
    tok = r.json().get("token")
    if not tok:
        return None
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def cathy_session():
    s = _login("cathy@example.com", "testpass123")
    if s is None:
        pytest.skip("Cathy login failed")
    return s


@pytest.fixture(scope="module")
def cathy_statement_id(cathy_session):
    """Grab the first statement id in Cathy's register."""
    r = cathy_session.get(f"{BASE_URL}/api/statements", timeout=30)
    assert r.status_code == 200, r.text[:400]
    data = r.json()
    items = data if isinstance(data, list) else data.get("items", [])
    if not items:
        pytest.skip("Cathy has no statements to test notes on")
    return items[0]["id"]


class TestListShapeHasNote:
    def test_list_rows_include_has_note_boolean(self, cathy_session):
        r = cathy_session.get(f"{BASE_URL}/api/statements", timeout=30)
        assert r.status_code == 200
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) > 0
        for row in rows:
            assert "has_note" in row, f"list row missing has_note: keys={list(row.keys())}"
            assert isinstance(row["has_note"], bool)
            # Body must be stripped from list responses (may serialize as null via Pydantic,
            # but never carry the actual private note text)
            body = row.get("user_note")
            assert body in (None, ""), f"list row must NOT include user_note body; got={body!r}"


class TestDetailShapeUserNote:
    def test_detail_includes_user_note_and_has_note(self, cathy_session, cathy_statement_id):
        r = cathy_session.get(f"{BASE_URL}/api/statements/{cathy_statement_id}", timeout=30)
        assert r.status_code == 200
        doc = r.json()
        assert "user_note" in doc, "detail must include user_note (may be null)"
        assert "has_note" in doc
        assert isinstance(doc["has_note"], bool)


class TestPatchNoteEndpoint:
    def test_patch_set_get_and_clear_roundtrip(self, cathy_session, cathy_statement_id):
        sid = cathy_statement_id
        note = f"TEST_note_{uuid.uuid4().hex[:8]} · queried the domestic assistance charge"

        # PATCH: set
        r = cathy_session.patch(
            f"{BASE_URL}/api/statements/{sid}/note",
            json={"user_note": note},
            timeout=30,
        )
        assert r.status_code == 200, f"PATCH set failed {r.status_code}: {r.text[:400]}"
        data = r.json()
        assert data["user_note"] == note
        assert data["has_note"] is True
        assert data["id"] == sid
        assert "updated_at" in data

        # GET detail → note persisted
        r2 = cathy_session.get(f"{BASE_URL}/api/statements/{sid}", timeout=30)
        assert r2.status_code == 200
        detail = r2.json()
        assert detail["user_note"] == note
        assert detail["has_note"] is True

        # List: has_note=true on this row
        r3 = cathy_session.get(f"{BASE_URL}/api/statements", timeout=30)
        assert r3.status_code == 200
        row = next((x for x in r3.json() if x["id"] == sid), None)
        assert row is not None
        assert row["has_note"] is True

        # PATCH: clear (null)
        r4 = cathy_session.patch(
            f"{BASE_URL}/api/statements/{sid}/note",
            json={"user_note": None},
            timeout=30,
        )
        assert r4.status_code == 200
        cleared = r4.json()
        assert cleared["user_note"] is None
        assert cleared["has_note"] is False

        # GET → user_note null / has_note false
        r5 = cathy_session.get(f"{BASE_URL}/api/statements/{sid}", timeout=30)
        assert r5.status_code == 200
        d5 = r5.json()
        assert (d5.get("user_note") in (None, "")) and d5["has_note"] is False

    def test_patch_empty_string_clears(self, cathy_session, cathy_statement_id):
        r = cathy_session.patch(
            f"{BASE_URL}/api/statements/{cathy_statement_id}/note",
            json={"user_note": "   "},
            timeout=30,
        )
        assert r.status_code == 200
        assert r.json()["has_note"] is False

    def test_patch_rejects_non_string(self, cathy_session, cathy_statement_id):
        r = cathy_session.patch(
            f"{BASE_URL}/api/statements/{cathy_statement_id}/note",
            json={"user_note": 123},
            timeout=30,
        )
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text[:200]}"

    def test_patch_rejects_over_1024_chars(self, cathy_session, cathy_statement_id):
        big = "a" * 1025
        r = cathy_session.patch(
            f"{BASE_URL}/api/statements/{cathy_statement_id}/note",
            json={"user_note": big},
            timeout=30,
        )
        assert r.status_code == 400
        # And it must NOT persist
        r2 = cathy_session.get(f"{BASE_URL}/api/statements/{cathy_statement_id}", timeout=30)
        assert r2.status_code == 200
        assert r2.json().get("user_note") != big

    def test_patch_404_for_unknown_statement(self, cathy_session):
        r = cathy_session.patch(
            f"{BASE_URL}/api/statements/{uuid.uuid4().hex}/note",
            json={"user_note": "x"},
            timeout=30,
        )
        assert r.status_code in (404, 400)

    def test_patch_requires_auth(self, cathy_statement_id):
        r = requests.patch(
            f"{BASE_URL}/api/statements/{cathy_statement_id}/note",
            json={"user_note": "x"},
            timeout=30,
        )
        assert r.status_code in (401, 403)

    def test_patch_boundary_exactly_1024_ok(self, cathy_session, cathy_statement_id):
        boundary = "b" * 1024
        r = cathy_session.patch(
            f"{BASE_URL}/api/statements/{cathy_statement_id}/note",
            json={"user_note": boundary},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:300]
        assert r.json()["has_note"] is True
        # cleanup
        cathy_session.patch(
            f"{BASE_URL}/api/statements/{cathy_statement_id}/note",
            json={"user_note": None},
            timeout=30,
        )


# ---------- Regression: existing endpoints still work ----------
class TestRegressionEndpoints:
    def test_list_endpoint_works(self, cathy_session):
        r = cathy_session.get(f"{BASE_URL}/api/statements", timeout=30)
        assert r.status_code == 200

    def test_archived_endpoint_works(self, cathy_session):
        r = cathy_session.get(f"{BASE_URL}/api/statements/archived", timeout=30)
        assert r.status_code == 200

    def test_detail_audit_log_works(self, cathy_session, cathy_statement_id):
        r = cathy_session.get(f"{BASE_URL}/api/statements/{cathy_statement_id}/audit-log", timeout=30)
        assert r.status_code == 200
