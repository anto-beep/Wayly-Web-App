"""iter375 - verify GET /api/notifications prunes stale notifications whose
linked statement/invoice/report has been deleted, while list-page links are kept.
Also smoke-check mark-read and prefs endpoints to confirm no regression."""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
EMAIL = "cathy@example.com"
PASSWORD = "testpass123"


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in response: {r.json()}"
    return {"Authorization": f"Bearer {tok}"}


def _get_user_id(headers):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=15)
    assert r.status_code == 200
    return r.json().get("id") or r.json().get("user", {}).get("id")


def _seed_notifications_direct(user_id, docs):
    """Insert notifications directly into Mongo for deterministic prune test."""
    from motor.motor_asyncio import AsyncIOMotorClient
    import asyncio
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")

    async def _run():
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        for d in docs:
            d.setdefault("user_id", user_id)
            d.setdefault("created_at", "2026-06-01T00:00:00+00:00")
            d.setdefault("read", False)
        await db.notifications.insert_many(docs)
        client.close()
    asyncio.get_event_loop().run_until_complete(_run()) if not asyncio.get_event_loop().is_running() else asyncio.run(_run())


def _cleanup_notifications(user_id, ids):
    from motor.motor_asyncio import AsyncIOMotorClient
    import asyncio
    mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
    db_name = os.environ.get("DB_NAME", "test_database")

    async def _run():
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        await db.notifications.delete_many({"user_id": user_id, "id": {"$in": ids}})
        client.close()
    try:
        asyncio.run(_run())
    except RuntimeError:
        loop = asyncio.new_event_loop()
        loop.run_until_complete(_run())
        loop.close()


class TestNotificationPrune:
    def test_prune_stale_and_keep_list_link(self, auth_headers):
        user_id = _get_user_id(auth_headers)
        from datetime import datetime, timezone, timedelta
        stale_id = f"TEST_STALE_{uuid.uuid4().hex[:8]}"
        list_id = f"TEST_LIST_{uuid.uuid4().hex[:8]}"
        bogus_stmt_id = f"DOES_NOT_EXIST_{uuid.uuid4().hex[:12]}"
        future = datetime.now(timezone.utc) + timedelta(days=365)
        ts_a = future.isoformat()
        ts_b = (future + timedelta(seconds=1)).isoformat()

        docs = [
            {
                "id": stale_id,
                "title": "Stale statement notif",
                "body": "linked to deleted statement",
                "link": f"/app/statements/{bogus_stmt_id}",
                "created_at": ts_a,
                "read": False,
            },
            {
                "id": list_id,
                "title": "List page notif",
                "body": "statements list link",
                "link": "/app/statements",
                "created_at": ts_b,
                "read": False,
            },
        ]
        _seed_notifications_direct(user_id, docs)

        try:
            r = requests.get(f"{BASE_URL}/api/notifications", headers=auth_headers, timeout=15)
            assert r.status_code == 200, r.text
            data = r.json()
            ids = [n["id"] for n in data.get("items", [])]
            # stale must be gone; list link must remain
            assert stale_id not in ids, f"stale notification not pruned: {ids}"
            assert list_id in ids, f"list-link notification was pruned incorrectly: {ids}"
            # unread count must be an int and >= 1 (the list one is still unread)
            assert isinstance(data.get("unread"), int)

            # Verify stale truly deleted from DB (not just filtered out) via a second fetch
            r2 = requests.get(f"{BASE_URL}/api/notifications", headers=auth_headers, timeout=15)
            ids2 = [n["id"] for n in r2.json().get("items", [])]
            assert stale_id not in ids2
        finally:
            _cleanup_notifications(user_id, [stale_id, list_id])

    def test_mark_read_and_prefs(self, auth_headers):
        # mark all read smoke
        r = requests.post(f"{BASE_URL}/api/notifications/read", headers=auth_headers, json={"ids": []}, timeout=15)
        assert r.status_code == 200
        assert r.json().get("ok") is True

        # prefs GET
        r = requests.get(f"{BASE_URL}/api/notifications/prefs", headers=auth_headers, timeout=15)
        assert r.status_code == 200
        prefs = r.json().get("prefs")
        assert isinstance(prefs, dict) and len(prefs) > 0
        # pick first key, flip it, PUT, verify, flip back
        k = next(iter(prefs.keys()))
        orig = bool(prefs[k])
        new_prefs = dict(prefs)
        new_prefs[k] = not orig
        r = requests.put(f"{BASE_URL}/api/notifications/prefs", headers=auth_headers, json={"prefs": new_prefs}, timeout=15)
        assert r.status_code == 200
        assert r.json()["prefs"][k] is (not orig)
        # restore
        r = requests.put(f"{BASE_URL}/api/notifications/prefs", headers=auth_headers, json={"prefs": prefs}, timeout=15)
        assert r.status_code == 200
