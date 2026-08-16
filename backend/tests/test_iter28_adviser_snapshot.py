"""Iteration 28 — Adviser per-client read-only access (snapshot + PDF review pack).

Covers:
- Auto-link on signup: pre-create adviser_clients row with status='invited' for an email,
  then signup that email → status flips to 'active' and linked_user_id set.
- Auto-link on household creation: after signup user creates household → linked_household_id set.
- POST /adviser/clients with email matching existing user populates linked_user_id + linked_household_id.
- GET /adviser/clients/{cid}/snapshot — 200 for linked, 409 client_not_linked, 404 for cross-adviser or unknown.
- GET /adviser/clients/{cid}/review-pack.pdf — 200 application/pdf, magic bytes %PDF-, content-disposition.
- Cross-adviser isolation (404).
- Snapshot updates last_seen_at to the most recent statement uploaded_at.
- Regression: existing CRUD endpoints still work.
"""
import os
import time
import io
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADVISER_EMAIL = "mark.adviser@example.com"
ADVISER_PASSWORD = "AdviserPass1!"
FAMILY_EMAIL = "cathy@example.com"
FAMILY_PASSWORD = "testpass123"


def _login_or_signup(email, password, name="Test", plan="free", role="caregiver"):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code == 200:
        return r.json()["token"], r.json()["user"]
    r = requests.post(
        f"{API}/auth/signup",
        json={"email": email, "password": password, "name": name, "role": role, "plan": plan},
        timeout=30,
    )
    assert r.status_code in (200, 201), f"signup failed: {r.status_code} {r.text}"
    return r.json()["token"], r.json()["user"]


def _ensure_plan(token, plan):
    h = {"Authorization": f"Bearer {token}"}
    me = requests.get(f"{API}/auth/me", headers=h, timeout=30).json()
    if (me.get("plan") or "").lower() != plan:
        r = requests.put(f"{API}/auth/plan", headers=h, json={"plan": plan}, timeout=30)
        assert r.status_code == 200, r.text


@pytest.fixture(scope="module")
def adviser():
    token, user = _login_or_signup(ADVISER_EMAIL, ADVISER_PASSWORD, name="Mark Adviser", plan="free")
    _ensure_plan(token, "adviser")
    h = {"Authorization": f"Bearer {token}"}
    # Wipe roster so we start clean
    existing = requests.get(f"{API}/adviser/clients", headers=h, timeout=30).json() or []
    for c in existing:
        requests.delete(f"{API}/adviser/clients/{c['id']}", headers=h, timeout=30)
    return {"token": token, "user": user, "h": h}


@pytest.fixture(scope="module")
def family():
    token, user = _login_or_signup(FAMILY_EMAIL, FAMILY_PASSWORD, name="Cathy", plan="free")
    _ensure_plan(token, "family")
    return {"token": token, "user": user, "h": {"Authorization": f"Bearer {token}"}}


# Second adviser for cross-isolation tests
@pytest.fixture(scope="module")
def adviser2():
    email = f"TEST_adv2_{int(time.time())}@example.com"
    token, user = _login_or_signup(email, "AdvPass2!", name="Adviser2", plan="free")
    _ensure_plan(token, "adviser")
    return {"email": email, "token": token, "user": user, "h": {"Authorization": f"Bearer {token}"}}


# ---------------------------------------------------------------------------
# A. Auto-link on signup + household creation
# ---------------------------------------------------------------------------

class TestAutoLinkOnSignup:
    def test_signup_flips_invited_to_active(self, adviser):
        adv = adviser
        unique = int(time.time())
        client_email = f"test_autolink_{unique}@example.com"
        # 1. Adviser invites a NEW (not-yet-existing) client
        r = requests.post(
            f"{API}/adviser/clients", headers=adv["h"],
            json={"client_name": "TEST AutoLink", "client_email": client_email},
            timeout=30,
        )
        assert r.status_code in (200, 201), r.text
        client_doc = r.json()
        cid = client_doc["id"]
        assert client_doc["status"] == "invited"
        assert client_doc.get("linked_user_id") in (None, "")
        assert client_doc.get("linked_household_id") in (None, "")

        # 2. The invited user signs up
        token, user = _login_or_signup(client_email, "TrialPass1!", name="AutoLink User", plan="solo")

        # 3. Adviser re-lists clients — row should now be active + linked_user_id set
        listing = requests.get(f"{API}/adviser/clients", headers=adv["h"], timeout=30).json()
        row = next((c for c in listing if c["id"] == cid), None)
        assert row, "client row missing after listing"
        assert row["status"] == "active", row
        assert row.get("linked_user_id") == user["id"], row
        # household not created yet → linked_household_id still None
        assert row.get("linked_household_id") in (None, "")

        # 4. The new user creates a household
        hr = requests.post(
            f"{API}/household",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "participant_name": "TEST Participant",
                "classification": 4,
                "provider_name": "TEST Provider",
                "grandfathered": False,
            },
            timeout=30,
        )
        assert hr.status_code in (200, 201), hr.text
        hh = hr.json()
        hh_id = hh.get("id") or hh.get("household_id") or hh.get("household", {}).get("id")
        assert hh_id, f"no household id in response: {hh}"

        # 5. Adviser re-lists clients — linked_household_id should now be set
        listing2 = requests.get(f"{API}/adviser/clients", headers=adv["h"], timeout=30).json()
        row2 = next((c for c in listing2 if c["id"] == cid), None)
        assert row2 and row2.get("linked_household_id") == hh_id, row2

        # stash for next tests
        pytest.linked_cid = cid
        pytest.linked_user_token = token
        pytest.linked_user_email = client_email
        pytest.linked_household_id = hh_id


# ---------------------------------------------------------------------------
# B. POST /adviser/clients with existing-user email → immediate link
# ---------------------------------------------------------------------------

class TestImmediateLinkOnCreate:
    def test_create_with_existing_user_and_household(self, adviser, family):
        adv = adviser
        unique = int(time.time())
        # Use cathy's email which already has a household
        r = requests.post(
            f"{API}/adviser/clients", headers=adv["h"],
            json={"client_name": f"TEST Cathy {unique}", "client_email": FAMILY_EMAIL},
            timeout=30,
        )
        assert r.status_code in (200, 201), r.text
        doc = r.json()
        assert doc["status"] == "active"
        assert doc.get("linked_user_id"), doc
        # Cathy should already have a household per seeded data
        assert doc.get("linked_household_id"), f"expected linked_household_id for pre-existing user with household: {doc}"
        pytest.cathy_cid = doc["id"]


# ---------------------------------------------------------------------------
# C. Snapshot endpoint
# ---------------------------------------------------------------------------

class TestSnapshot:
    def test_snapshot_unauthenticated_401(self):
        cid = getattr(pytest, "linked_cid", "anyid")
        r = requests.get(f"{API}/adviser/clients/{cid}/snapshot", timeout=30)
        assert r.status_code == 401, r.text

    def test_snapshot_family_user_403(self, family):
        cid = getattr(pytest, "linked_cid", "anyid")
        r = requests.get(f"{API}/adviser/clients/{cid}/snapshot", headers=family["h"], timeout=30)
        assert r.status_code == 403, r.text

    def test_snapshot_unknown_cid_404(self, adviser):
        r = requests.get(f"{API}/adviser/clients/doesnotexist/snapshot", headers=adviser["h"], timeout=30)
        assert r.status_code == 404, r.text

    def test_snapshot_not_linked_returns_409(self, adviser):
        # Create a fresh invited (not yet signed up) row
        unique = int(time.time())
        r = requests.post(
            f"{API}/adviser/clients", headers=adviser["h"],
            json={"client_name": "TEST NotLinked", "client_email": f"test_notlinked_{unique}@example.com"},
            timeout=30,
        )
        cid = r.json()["id"]
        rr = requests.get(f"{API}/adviser/clients/{cid}/snapshot", headers=adviser["h"], timeout=30)
        assert rr.status_code == 409, rr.text
        det = rr.json().get("detail") or {}
        assert det.get("error") == "client_not_linked", det
        # cleanup
        requests.delete(f"{API}/adviser/clients/{cid}", headers=adviser["h"], timeout=30)

    def test_snapshot_linked_returns_200(self, adviser):
        cid = getattr(pytest, "cathy_cid", None)
        assert cid, "needs cathy_cid from previous test"
        r = requests.get(f"{API}/adviser/clients/{cid}/snapshot", headers=adviser["h"], timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("client", "household", "metrics", "recent_statements", "members_count"):
            assert k in data, f"missing {k} in {list(data.keys())}"
        assert data["client"]["email"] == FAMILY_EMAIL
        assert "id" in data["household"]
        assert isinstance(data["recent_statements"], list)
        assert isinstance(data["members_count"], int)
        # metrics keys
        for mk in ("statements_count", "line_items_total", "anomalies_total", "spent_total_aud"):
            assert mk in data["metrics"]

    def test_snapshot_updates_last_seen_at(self, adviser):
        cid = getattr(pytest, "cathy_cid", None)
        if not cid:
            pytest.skip("no cathy_cid")
        # Trigger snapshot
        r = requests.get(f"{API}/adviser/clients/{cid}/snapshot", headers=adviser["h"], timeout=30)
        assert r.status_code == 200
        snap = r.json()
        recent = snap.get("recent_statements") or []
        if not recent:
            pytest.skip("no statements for cathy household")
        expected = recent[0].get("uploaded_at")
        listing = requests.get(f"{API}/adviser/clients", headers=adviser["h"], timeout=30).json()
        row = next((c for c in listing if c["id"] == cid), None)
        assert row, "client row missing"
        assert row.get("last_seen_at") == expected, f"last_seen_at={row.get('last_seen_at')} expected={expected}"


# ---------------------------------------------------------------------------
# D. PDF Review pack
# ---------------------------------------------------------------------------

class TestReviewPackPdf:
    def test_pdf_unauthenticated_401(self):
        cid = getattr(pytest, "cathy_cid", "anyid")
        r = requests.get(f"{API}/adviser/clients/{cid}/review-pack.pdf", timeout=30)
        assert r.status_code == 401

    def test_pdf_family_user_403(self, family):
        cid = getattr(pytest, "cathy_cid", "anyid")
        r = requests.get(f"{API}/adviser/clients/{cid}/review-pack.pdf", headers=family["h"], timeout=30)
        assert r.status_code == 403

    def test_pdf_unknown_cid_404(self, adviser):
        r = requests.get(f"{API}/adviser/clients/doesnotexist/review-pack.pdf", headers=adviser["h"], timeout=30)
        assert r.status_code == 404

    def test_pdf_not_linked_409(self, adviser):
        unique = int(time.time())
        r = requests.post(
            f"{API}/adviser/clients", headers=adviser["h"],
            json={"client_name": "TEST PdfNotLinked", "client_email": f"test_pdfnotlinked_{unique}@example.com"},
            timeout=30,
        )
        cid = r.json()["id"]
        rr = requests.get(f"{API}/adviser/clients/{cid}/review-pack.pdf", headers=adviser["h"], timeout=30)
        assert rr.status_code == 409
        det = rr.json().get("detail") or {}
        assert det.get("error") == "client_not_linked"
        requests.delete(f"{API}/adviser/clients/{cid}", headers=adviser["h"], timeout=30)

    def test_pdf_linked_200(self, adviser):
        cid = getattr(pytest, "cathy_cid", None)
        assert cid
        r = requests.get(f"{API}/adviser/clients/{cid}/review-pack.pdf", headers=adviser["h"], timeout=60)
        assert r.status_code == 200, r.text[:300]
        ct = r.headers.get("content-type") or ""
        assert "application/pdf" in ct.lower(), ct
        assert len(r.content) > 1500, f"pdf too small: {len(r.content)} bytes"
        # Magic bytes
        assert r.content[:5] == b"%PDF-", r.content[:8]
        cd = r.headers.get("content-disposition") or ""
        assert "attachment" in cd.lower()
        assert "wayly-review-pack-" in cd
        assert ".pdf" in cd


# ---------------------------------------------------------------------------
# E. Cross-adviser isolation
# ---------------------------------------------------------------------------

class TestCrossAdviserIsolation:
    def test_other_adviser_cannot_snapshot(self, adviser2):
        cid = getattr(pytest, "cathy_cid", None)
        if not cid:
            pytest.skip("no cid")
        r = requests.get(f"{API}/adviser/clients/{cid}/snapshot", headers=adviser2["h"], timeout=30)
        assert r.status_code == 404, r.text

    def test_other_adviser_cannot_pdf(self, adviser2):
        cid = getattr(pytest, "cathy_cid", None)
        if not cid:
            pytest.skip("no cid")
        r = requests.get(f"{API}/adviser/clients/{cid}/review-pack.pdf", headers=adviser2["h"], timeout=30)
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# F. Regression: existing CRUD still works
# ---------------------------------------------------------------------------

class TestCrudRegression:
    def test_summary_list_create_patch_delete(self, adviser):
        h = adviser["h"]
        s = requests.get(f"{API}/adviser/summary", headers=h, timeout=30)
        assert s.status_code == 200 and s.json().get("plan") == "adviser"
        unique = int(time.time())
        cr = requests.post(
            f"{API}/adviser/clients", headers=h,
            json={"client_name": "TEST CRUD", "client_email": f"test_crud_{unique}@example.com", "notes": "n"},
            timeout=30,
        )
        assert cr.status_code in (200, 201)
        cid = cr.json()["id"]
        pr = requests.patch(f"{API}/adviser/clients/{cid}", headers=h, json={"notes": "updated"}, timeout=30)
        assert pr.status_code == 200 and pr.json().get("notes") == "updated"
        dr = requests.delete(f"{API}/adviser/clients/{cid}", headers=h, timeout=30)
        assert dr.status_code == 200


# ---------------------------------------------------------------------------
# Final cleanup
# ---------------------------------------------------------------------------

def test_zzz_cleanup(adviser):
    h = adviser["h"]
    listing = requests.get(f"{API}/adviser/clients", headers=h, timeout=30).json() or []
    for c in listing:
        em = (c.get("client_email") or "")
        if em.startswith("test_") or em == FAMILY_EMAIL:
            requests.delete(f"{API}/adviser/clients/{c['id']}", headers=h, timeout=30)
