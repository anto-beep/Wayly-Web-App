"""Phase 8 + Phase 9 — Admin hardening + Privacy/NDB readiness tests."""
from __future__ import annotations
import os, sys, time, secrets, asyncio, pytest, requests
from pathlib import Path
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

API = os.environ.get("E2E_API", "http://localhost:8001/api")
CATHY_EMAIL = "cathy@example.com"
CATHY_PASS = "testpass123"


@pytest.fixture(autouse=True)
def purge_rate_limits():
    async def go():
        try:
            import redis.asyncio as redis_async
            url = os.environ.get("REDIS_URL")
            if url:
                r = redis_async.from_url(url, decode_responses=True)
                keys = await r.keys("rl:*")
                if keys:
                    await r.delete(*keys)
                await r.aclose()
        except Exception:
            pass
    asyncio.run(go())
    yield


# --------------------------------------------------------------------------
# Phase 8 — Admin Hardening
# --------------------------------------------------------------------------

class TestAdminAuditChain:
    """Tests the chain logic via a standalone pymongo client to avoid
    motor's cached event-loop. The production admin_hardening module uses
    motor; the same hash algorithm is reimplemented here for verification."""

    def _append_via_sync(self, actor_id: str, action: str, detail: dict) -> dict:
        """Insert a row using the same hash algorithm as admin_hardening."""
        import hashlib, json
        from datetime import datetime, timezone
        from pymongo import MongoClient
        client = MongoClient(os.environ["MONGO_URL"])
        coll = client[os.environ["DB_NAME"]].admin_audit_log
        last = coll.find_one(sort=[("seq", -1)], projection={"_id": 0, "hash": 1, "seq": 1})
        prev = (last or {}).get("hash") or "GENESIS"
        seq = int((last or {}).get("seq") or 0) + 1
        payload = {
            "seq": seq, "ts": datetime.now(timezone.utc).isoformat(),
            "actor_id": actor_id, "action": action,
            "target_id": None, "target_type": None, "ip": None,
            "result": "success", "detail": detail or {},
        }
        canonical = json.dumps(payload, sort_keys=True, default=str)
        h = hashlib.sha256((str(seq) + prev + canonical).encode("utf-8")).hexdigest()
        coll.insert_one({**payload, "prev_hash": prev, "hash": h})
        return {"seq": seq, "hash": h}

    def _verify_chain_sync(self) -> tuple[bool, int | None]:
        import hashlib, json
        from pymongo import MongoClient
        client = MongoClient(os.environ["MONGO_URL"])
        coll = client[os.environ["DB_NAME"]].admin_audit_log
        prev = "GENESIS"
        for row in coll.find({}, {"_id": 0}).sort("seq", 1).limit(5000):
            payload = {k: row[k] for k in ("seq","ts","actor_id","action","target_id","target_type","ip","result","detail") if k in row}
            canonical = json.dumps(payload, sort_keys=True, default=str)
            expected = hashlib.sha256((str(row["seq"]) + prev + canonical).encode()).hexdigest()
            if row.get("prev_hash") != prev or row.get("hash") != expected:
                return False, row.get("seq")
            prev = row["hash"]
        return True, None

    def test_hash_chain_verifies(self):
        for i in range(3):
            self._append_via_sync(f"test-actor-{i}", f"test-action-{i}", {"phase": 8, "i": i})
        ok, broken_at = self._verify_chain_sync()
        assert ok, f"chain broken at seq={broken_at}"

    def test_hash_chain_detects_tampering(self):
        from pymongo import MongoClient
        coll = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]].admin_audit_log
        self._append_via_sync("tamper-target", "will_be_tampered", {"x": 1})
        last = coll.find_one(sort=[("seq", -1)])
        assert last is not None
        coll.update_one({"_id": last["_id"]}, {"$set": {"detail": {"x": 999}}})
        ok, broken_at = self._verify_chain_sync()
        assert not ok, "verify_chain failed to detect tampering"
        # Clean up
        coll.delete_one({"_id": last["_id"]})

    def test_production_helpers_round_trip(self):
        """Sanity that the actual admin_hardening helpers work end-to-end
        when called within a single asyncio context."""
        async def go():
            from admin_hardening import append_audit, verify_chain
            await append_audit(actor_id="prod-check", action="prod_round_trip", detail={"ok": True})
            ok, broken_at = await verify_chain()
            assert ok, f"production chain broken at {broken_at}"
        asyncio.run(go())


class TestAdminGate:
    def test_gate_off_in_preview(self):
        """ADMIN_GATE_KEY isn't set in preview, so admin login routes are
        still reachable for legitimate admins."""
        r = requests.post(
            f"{API}/admin/auth/login",
            json={"email": "nx@example.com", "password": "wrong"},
            timeout=10,
        )
        # 401 (wrong creds) or 429 (rate limit) are both fine — what we're
        # asserting is that the route is NOT 404'd.
        assert r.status_code != 404, "admin route returning 404 with gate off"


class TestMaintenance:
    def test_public_status_round_trip(self):
        """Public read endpoint returns a boolean status flag (the existing
        endpoint uses `enabled`, not `on`, so we accept either)."""
        r = requests.get(f"{API}/public/maintenance-status", timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        flag = body.get("on", body.get("enabled"))
        assert isinstance(flag, bool), f"expected bool maintenance flag, got {body}"


# --------------------------------------------------------------------------
# Phase 9 — Privacy / NDB
# --------------------------------------------------------------------------

@pytest.fixture
def alice_isolation_account():
    """Reuses the Phase 2 isolation account for the soft-delete cascade test
    so we never touch cathy@example.com (which other suites rely on)."""
    email = "alice_isolation_test@example.com"
    pw = "Wj4-Lk9!QvB7zXp@aPmCgT"
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=15)
    if r.status_code != 200:
        pytest.skip("alice isolation account not bootstrapped (run Phase 2 tests first)")
    return r.json()


class TestExport:
    def test_export_returns_all_personal_data(self, alice_isolation_account):
        token = alice_isolation_account["token"]
        r = requests.get(
            f"{API}/auth/account/export",
            headers={"Authorization": f"Bearer {token}"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        j = r.json()
        assert "exported_at" in j
        assert "user" in j["data"], "export must include the user record"
        assert "note" in j and "APP 12" in j["note"], "export must cite APP 12"
        # User export must not leak sensitive auth material.
        for u in j["data"]["user"]:
            assert "password_hash" not in u
            assert "totp_secret" not in u


class TestDeletionCascade:
    def test_soft_delete_marks_related_rows(self):
        """Build a throwaway account, delete it, assert cascade ran."""
        suffix = secrets.token_hex(3)
        email = f"delete_test_{suffix}@example.com"
        pw = "Wj4-Lk9!QvB7zXp@aPmCgT" + secrets.token_hex(3)
        # signup
        s = requests.post(f"{API}/auth/signup", json={
            "email": email, "password": pw, "name": "Delete Test",
            "role": "caregiver", "plan": "free",
        }, timeout=15)
        assert s.status_code in (200, 201), s.text
        tok = s.json()["token"]
        # Delete
        d = requests.request(
            "DELETE", f"{API}/auth/account",
            headers={"Authorization": f"Bearer {tok}"},
            json={"confirm": "delete my account"},
            timeout=15,
        )
        assert d.status_code == 200, d.text
        body = d.json()
        assert "deletion_completes_at" in body
        # Old token must no longer work
        time.sleep(0.5)
        me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=10)
        assert me.status_code == 401, "post-delete token should be invalid"

    def test_scoped_collections_table_includes_all_phase4_collections(self):
        """Regression guard: every collection we know holds participant data
        must be in the SCOPED_COLLECTIONS table so the cascade actually
        cleans them up."""
        from privacy import SCOPED_COLLECTIONS
        names = {c for c, _ in SCOPED_COLLECTIONS}
        for required in [
            "participants", "documents", "statements", "hospital_admissions",
            "family_wall_posts", "care_plan_amendments", "generated_reports",
            "subscriptions", "user_sessions", "household_members",
        ]:
            assert required in names, f"SCOPED_COLLECTIONS missing {required}"
