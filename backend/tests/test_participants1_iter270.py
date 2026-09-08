"""PARTICIPANTS-1 backend tests (iter 270).
Covers /api/participants: list, add (+402 gating), patch, archive, deceased,
invite-login, AUTHZ (403 non-owner, 400 no household), and invariant safety.
Careful cleanup: leaves cathy with exactly 1 live participant (Dorothy)."""

import os
import time
import uuid
import asyncio
import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else None
# fall back to /app/frontend/.env
if not BASE_URL:
    from dotenv import dotenv_values
    fv = dotenv_values("/app/frontend/.env")
    BASE_URL = fv["REACT_APP_BACKEND_URL"].rstrip("/")


def _mongo_run(coro_factory):
    """Run an async coroutine that gets its own fresh Motor client + event loop."""
    async def _wrap():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        _db = client[os.environ["DB_NAME"]]
        try:
            return await coro_factory(_db)
        finally:
            client.close()
    return asyncio.run(_wrap())

CATHY = ("cathy@example.com", "testpass123")
SOLO_USER = ("test+1777810269@example.com", "SoloTest1!")  # base_plan solo, 1 participant


# --------------- helpers ---------------
def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    return r.json()["token"]


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def cathy_token():
    return _login(*CATHY)


@pytest.fixture(scope="module")
def solo_token():
    try:
        return _login(*SOLO_USER)
    except AssertionError:
        pytest.skip("Solo user unavailable")


@pytest.fixture(scope="module")
def mongo_db():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    return client[os.environ["DB_NAME"]]


def _list(tok):
    r = requests.get(f"{BASE_URL}/api/participants", headers=_hdr(tok), timeout=30)
    return r


def _add(tok, name, classification=None, provider=None):
    body = {"full_name": name}
    if classification is not None:
        body["classification"] = classification
    if provider is not None:
        body["provider_name"] = provider
    return requests.post(f"{BASE_URL}/api/participants", headers=_hdr(tok), json=body, timeout=30)


def _archive(tok, pid):
    return requests.post(f"{BASE_URL}/api/participants/{pid}/archive", headers=_hdr(tok), timeout=30)


def _deceased(tok, pid):
    return requests.post(f"{BASE_URL}/api/participants/{pid}/deceased", headers=_hdr(tok), timeout=30)


def _patch(tok, pid, **fields):
    return requests.patch(f"{BASE_URL}/api/participants/{pid}", headers=_hdr(tok), json=fields, timeout=30)


def _invite(tok, pid, email):
    return requests.post(f"{BASE_URL}/api/participants/{pid}/invite-login", headers=_hdr(tok),
                         json={"email": email}, timeout=30)


# ---------- Pre-cleanup: get cathy to exactly 1 live participant (Dorothy) ----------
@pytest.fixture(scope="module", autouse=True)
def pre_and_post_cleanup(cathy_token):
    r = _list(cathy_token)
    assert r.status_code == 200
    for p in r.json()["participants"]:
        if p.get("full_name") != "Dorothy" and not p.get("deceased_at"):
            _archive(cathy_token, p["id"])
    yield
    # Teardown: archive anything cathy has that isn't Dorothy
    r = _list(cathy_token)
    if r.status_code == 200:
        for p in r.json()["participants"]:
            if p.get("full_name") != "Dorothy":
                _archive(cathy_token, p["id"])


# --------------- Tests ---------------

class TestListAndCapacity:
    def test_list_shape_role_label_capacity(self, cathy_token):
        r = _list(cathy_token)
        assert r.status_code == 200
        data = r.json()
        assert "participants" in data and "capacity" in data
        cap = data["capacity"]
        assert cap["participants_included"] == 2
        assert cap["extra_available"] is True
        assert cap["plan"] == "family"
        # Should have exactly Dorothy (owner record) live now
        live = [p for p in data["participants"] if not p.get("deceased_at")]
        assert cap["participants_used"] == len(live)
        assert cap["can_add_free"] is True  # 1 < 2
        # Owner record role_label
        dorothy = next(p for p in data["participants"] if p["full_name"] == "Dorothy")
        assert dorothy["role_label"] == "account holder + participant"


class TestAddParticipant:
    def test_add_participant_under_cap(self, cathy_token):
        name = f"TEST_Extra_{uuid.uuid4().hex[:6]}"
        r = _add(cathy_token, name, classification=4, provider="TestProv")
        assert r.status_code == 200, r.text
        pr = r.json()
        assert pr["full_name"] == name
        assert pr["user_id"] is None  # managed-only
        assert pr["classification_status"] == "assessed"
        assert pr["provider_status"] == "selected"
        assert pr["role_label"] == "participant, no login yet"
        # Verify persistence via list
        r2 = _list(cathy_token)
        ids = {p["id"] for p in r2.json()["participants"]}
        assert pr["id"] in ids

    def test_add_third_blocks_billing_required(self, cathy_token):
        # Currently 2 live (Dorothy + the TEST_Extra above). Adding 3rd on family → 402 billing_required.
        r = _add(cathy_token, f"TEST_Third_{uuid.uuid4().hex[:6]}")
        assert r.status_code == 402, r.text
        detail = r.json()["detail"]
        assert detail["code"] == "billing_required"

    def test_solo_second_blocks_upgrade_required(self, solo_token):
        # Solo user already has 1 participant → second should 402 upgrade_required.
        r = _add(solo_token, f"TEST_SoloExtra_{uuid.uuid4().hex[:6]}")
        assert r.status_code == 402, r.text
        detail = r.json()["detail"]
        assert detail["code"] == "upgrade_required"


class TestPatchParticipant:
    def test_patch_updates_and_status_derivation(self, cathy_token):
        r = _list(cathy_token)
        extra = next(p for p in r.json()["participants"] if p["full_name"].startswith("TEST_Extra_"))
        pid = extra["id"]
        r2 = _patch(cathy_token, pid, full_name="TEST_Renamed", classification=6, provider_name="NewProv")
        assert r2.status_code == 200, r2.text
        # Verify via list
        r3 = _list(cathy_token)
        got = next(p for p in r3.json()["participants"] if p["id"] == pid)
        assert got["full_name"] == "TEST_Renamed"
        assert got["classification"] == 6
        assert got["classification_status"] == "assessed"
        assert got["provider_name"] == "NewProv"
        assert got["provider_status"] == "selected"

    def test_patch_rejected_on_archived(self, cathy_token):
        # Archive requires >=2 live. Currently 2 live. Archive the TEST_Renamed one, then patch should 400.
        r = _list(cathy_token)
        extra = next(p for p in r.json()["participants"] if p["full_name"] == "TEST_Renamed")
        pid = extra["id"]
        rar = _archive(cathy_token, pid)
        assert rar.status_code == 200, rar.text
        # patch archived → 400
        rp = _patch(cathy_token, pid, full_name="ShouldFail")
        assert rp.status_code == 400, rp.text


class TestArchive:
    def test_archive_blocks_only_live(self, cathy_token):
        # After the previous class Cathy has just Dorothy live. Archiving Dorothy → 400.
        r = _list(cathy_token)
        live = [p for p in r.json()["participants"] if not p.get("deceased_at") and not p.get("archived_at")]
        assert len(live) == 1
        dorothy = live[0]
        rar = _archive(cathy_token, dorothy["id"])
        assert rar.status_code == 400
        assert "only participant" in rar.json()["detail"].lower()

    def test_archive_clears_caregiver_links(self, cathy_token):
        # Add a temp participant, then archive it and verify caregiver_participant_links removed
        r = _add(cathy_token, f"TEST_LinkTest_{uuid.uuid4().hex[:6]}")
        assert r.status_code == 200
        pid = r.json()["id"]

        async def _seed(_db):
            await _db.caregiver_participant_links.insert_one({
                "id": str(uuid.uuid4()),
                "caregiver_membership_id": "fake_mem_" + uuid.uuid4().hex,
                "participant_record_id": pid,
                "created_at": "2026-06-01T00:00:00+00:00",
            })
        _mongo_run(_seed)

        r2 = _archive(cathy_token, pid)
        assert r2.status_code == 200

        async def _count(_db):
            return await _db.caregiver_participant_links.count_documents({"participant_record_id": pid})
        n = _mongo_run(_count)
        assert n == 0


class TestDeceased:
    def test_deceased_non_sole_no_bereavement(self, cathy_token):
        # Add temp so we have 2 live (Dorothy + temp). Mark temp deceased.
        r = _add(cathy_token, f"TEST_Deceased_{uuid.uuid4().hex[:6]}")
        assert r.status_code == 200
        pid = r.json()["id"]
        r2 = _deceased(cathy_token, pid)
        assert r2.status_code == 200, r2.text
        data = r2.json()
        assert data["bereavement_grace"] is False
        # Second call → 400
        r3 = _deceased(cathy_token, pid)
        assert r3.status_code == 400

    def test_deceased_sole_triggers_bereavement_grace(self):
        """Uses a throwaway family user so we do NOT touch cathy/Dorothy."""
        email = f"TEST_bereave_{uuid.uuid4().hex[:8]}@example.com"
        pwd = "Zn9v_Kq!Er7pAx#L"
        r = requests.post(f"{BASE_URL}/api/auth/signup", json={
            "email": email, "password": pwd, "name": "Bereave Test",
            "role": "caregiver", "plan": "family",
        }, timeout=30)
        assert r.status_code == 200, r.text
        tok = r.json()["token"]
        # Create household
        r2 = requests.post(f"{BASE_URL}/api/household", headers=_hdr(tok), json={
            "participant_name": "SolePart", "classification": 4, "provider_name": "TP",
        }, timeout=30)
        assert r2.status_code == 200, r2.text
        # Add a participant (create_household doesn't auto-build participant_record).
        ra = _add(tok, "SolePart", classification=4, provider="TP")
        assert ra.status_code == 200, ra.text
        pid = ra.json()["id"]
        # Mark deceased — sole live → bereavement_grace=true + households.bereavement_grace_expires_at set.
        rd = _deceased(tok, pid)
        assert rd.status_code == 200, rd.text
        assert rd.json()["bereavement_grace"] is True

        async def _fetch(_db):
            u = await _db.users.find_one({"email": email.lower()}, {"_id": 0, "household_id": 1})
            if not u:
                return None
            return await _db.households.find_one({"id": u["household_id"]}, {"_id": 0, "bereavement_grace_expires_at": 1})
        h = _mongo_run(_fetch)
        assert h and h.get("bereavement_grace_expires_at"), "bereavement_grace_expires_at should be set"

        # Cleanup: delete the throwaway household + PR + user
        async def _cleanup(_db):
            u = await _db.users.find_one({"email": email.lower()}, {"_id": 0, "id": 1, "household_id": 1})
            if u:
                await _db.participant_records.delete_many({"household_id": u.get("household_id")})
                await _db.households.delete_many({"id": u.get("household_id")})
                await _db.users.delete_one({"id": u["id"]})
        _mongo_run(_cleanup)


class TestInviteLogin:
    def test_invite_login_creates_invite_row(self, cathy_token):
        # Add fresh managed-only participant, invite a brand-new email
        r = _add(cathy_token, f"TEST_InviteTgt_{uuid.uuid4().hex[:6]}")
        assert r.status_code == 200
        pid = r.json()["id"]
        new_email = f"TEST_pinvite_{uuid.uuid4().hex[:8]}@example.com"
        ri = _invite(cathy_token, pid, new_email)
        assert ri.status_code == 200, ri.text
        inv = ri.json()
        assert inv["intended_role"] == "participant_login"
        assert inv["participant_record_id"] == pid
        assert inv["wayly_role"] == "participant_user"

        async def _find(_db):
            return await _db.invites.find_one({"token": inv["token"]}, {"_id": 0})
        row = _mongo_run(_find)
        assert row is not None
        assert row["intended_role"] == "participant_login"

    def test_invite_login_blocks_registered_email(self, cathy_token):
        r = _list(cathy_token)
        # Use a managed-only PR
        managed = [p for p in r.json()["participants"] if p.get("user_id") is None and not p.get("deceased_at")]
        if not managed:
            r2 = _add(cathy_token, f"TEST_InviteBlk_{uuid.uuid4().hex[:6]}")
            pid = r2.json()["id"]
        else:
            pid = managed[0]["id"]
        ri = _invite(cathy_token, pid, CATHY[0])  # cathy already registered
        assert ri.status_code == 409, ri.text
        assert ri.json()["detail"]["code"] == "email_registered"


class TestAuthorization:
    def test_no_household_400(self):
        # Signup fresh user with NO household
        email = f"TEST_nohouse_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{BASE_URL}/api/auth/signup", json={
            "email": email, "password": "Zn9v_Kq!Er7pAx#L", "name": "No House",
            "role": "caregiver", "plan": "family",
        }, timeout=30)
        assert r.status_code == 200
        tok = r.json()["token"]
        uid = r.json()["user"]["id"]
        rl = _list(tok)
        assert rl.status_code == 400, rl.text
        # Add attempt
        ra = _add(tok, "TEST_x")
        assert ra.status_code == 400
        # cleanup
        async def _cleanup(_db):
            await _db.users.delete_one({"id": uid})
        _mongo_run(_cleanup)

    def test_non_owner_403(self):
        """Signup a caregiver, attach to cathy's household as a member, then hit /participants → 403."""
        email = f"TEST_cg_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{BASE_URL}/api/auth/signup", json={
            "email": email, "password": "Zn9v_Kq!Er7pAx#L", "name": "Care Giver",
            "role": "caregiver", "plan": "family",
        }, timeout=30)
        assert r.status_code == 200
        cg_tok = r.json()["token"]
        cg_uid = r.json()["user"]["id"]

        async def _attach(_db):
            cathy = await _db.users.find_one({"email": CATHY[0]}, {"_id": 0, "household_id": 1})
            hid = cathy["household_id"]
            await _db.users.update_one({"id": cg_uid}, {"$set": {"household_id": hid}})
            return hid
        _mongo_run(_attach)

        rl = _list(cg_tok)
        assert rl.status_code == 403, rl.text
        ra = _add(cg_tok, "TEST_cg_add")
        assert ra.status_code == 403
        # cleanup: detach + delete throwaway user
        async def _cleanup(_db):
            await _db.users.delete_one({"id": cg_uid})
        _mongo_run(_cleanup)


class TestInvariants:
    def test_verify_invariants_ok(self):
        import sys
        sys.path.insert(0, "/app/backend")
        import data_model as dm

        async def _run(_db):
            return await dm.verify_invariants(_db)
        res = _mongo_run(_run)
        assert res["ok"] is True, f"violations: {res.get('violations')}"
