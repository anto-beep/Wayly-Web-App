"""PPC milestone tracking — live HTTP endpoint tests.

Exercises GET /api/ppc/milestones and POST /api/ppc/milestones/mark added
Feb 2026 for the savings-milestone banner on ``/tools/price-checker/history``.
"""
from __future__ import annotations

import os

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mobile-parity-sweep.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CATHY_EMAIL = "cathy@example.com"
CATHY_PASSWORD = "testpass123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": CATHY_EMAIL, "password": CATHY_PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Cannot log in as cathy: {r.status_code} {r.text[:200]}")
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


class TestPpcMilestones:
    def test_get_requires_auth(self):
        r = requests.get(f"{API}/ppc/milestones", timeout=10)
        assert r.status_code in (401, 403)

    def test_get_returns_all_keys(self, client):
        r = client.get(f"{API}/ppc/milestones", timeout=10)
        assert r.status_code == 200
        body = r.json()
        for key in ("crossed_100", "crossed_250", "crossed_500", "crossed_1000"):
            assert key in body

    def test_mark_persists_crossing(self, client):
        # Seed a savings scenario worth > $100 first (SEC audit — Feb 2026
        # eligibility gate). Two saved checks: $200/hour then $50/hour on
        # the same service+provider ⇒ tracked delta = $150 ⇒ crosses $100.
        import uuid, time
        service = "personal_care"
        provider = f"aud-{uuid.uuid4().hex[:8]}"
        r1 = client.post(f"{API}/ppc/checks", json={
            "service": service, "provider_display_name": provider, "rate": 200.0, "unit": "hour",
        }, timeout=10)
        assert r1.status_code in (200, 201), r1.text
        time.sleep(0.05)
        r2 = client.post(f"{API}/ppc/checks", json={
            "service": service, "provider_display_name": provider, "rate": 50.0, "unit": "hour",
        }, timeout=10)
        assert r2.status_code in (200, 201), r2.text

        r = client.post(f"{API}/ppc/milestones/mark", json={"threshold": 100}, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["crossed_100"] is not None

        r2 = client.get(f"{API}/ppc/milestones", timeout=10)
        assert r2.status_code == 200
        assert r2.json()["crossed_100"] is not None

    def test_mark_rejects_ineligible(self, client):
        # Ensure no residual savings from other tests. Wipe via mongo direct.
        import asyncio, os
        from motor.motor_asyncio import AsyncIOMotorClient
        async def _clean():
            c = AsyncIOMotorClient(os.environ["MONGO_URL"])
            db = c[os.environ["DB_NAME"]]
            # Cathy's user_id must match — resolve via her token's account payload.
            me = client.get(f"{API}/auth/me", timeout=10).json()
            uid = me.get("id") or me.get("user_id")
            if uid:
                await db.ppc_saved_checks.delete_many({"user_id": uid})
                await db.ppc_milestones.delete_many({"user_id": uid})
        asyncio.run(_clean())
        # With no saved checks, marking any threshold must fail with 400.
        r = client.post(f"{API}/ppc/milestones/mark", json={"threshold": 100}, timeout=10)
        assert r.status_code == 400, r.text
        assert "Not eligible" in r.text

    def test_mark_rejects_invalid_threshold(self, client):
        r = client.post(f"{API}/ppc/milestones/mark", json={"threshold": 999}, timeout=10)
        assert r.status_code == 400
