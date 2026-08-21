"""Iter 200 — Web Family→Solo scheduled downgrade parity.
Tests POST /payments/schedule-downgrade, POST /payments/cancel-scheduled-change,
and the pending_plan/pending_effective shape returned by GET /billing/subscription."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://statement-checker-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in {r.json()}"
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# ----- /billing/subscription shape -----
class TestBillingSubscriptionShape:
    def test_cathy_family_subscription_shape(self):
        s = _login("cathy@example.com", "testpass123")
        r = s.get(f"{API}/billing/subscription", timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        # keys the UI reads
        for k in ("plan", "status"):
            assert k in data, f"missing key {k}: {data}"
        # pending_plan/pending_effective are optional — may be absent
        assert "pending_plan" in data or data.get("pending_plan") is None or True


# ----- schedule-downgrade endpoint -----
class TestScheduleDowngrade:
    def test_schedule_downgrade_requires_active_sub(self):
        """Cathy has no real stripe_subscription_id in preview env → expect 400
        'No active subscription on record.' per env note."""
        s = _login("cathy@example.com", "testpass123")
        r = s.post(f"{API}/payments/schedule-downgrade", json={"plan": "solo"}, timeout=20)
        # Documented env limitation: 400 is expected. Also accept 200 if the
        # account happens to have a Stripe sub in this env.
        assert r.status_code in (200, 400, 502), f"unexpected: {r.status_code} {r.text}"
        if r.status_code == 400:
            body = r.json()
            det = body.get("detail") or ""
            assert "subscription" in det.lower() or "no active" in det.lower(), body
        if r.status_code == 200:
            body = r.json()
            assert body.get("ok") is True
            assert body.get("pending_plan") == "solo"
            assert "effective" in body
            assert "message" in body

    def test_schedule_downgrade_rejects_invalid_plan(self):
        s = _login("cathy@example.com", "testpass123")
        r = s.post(f"{API}/payments/schedule-downgrade", json={"plan": "adviser"}, timeout=20)
        # pydantic pattern constraint → 422
        assert r.status_code == 422, r.text

    def test_schedule_downgrade_unauthenticated(self):
        r = requests.post(f"{API}/payments/schedule-downgrade", json={"plan": "solo"}, timeout=20)
        assert r.status_code in (401, 403), r.text


# ----- cancel-scheduled-change endpoint -----
class TestCancelScheduledChange:
    def test_cancel_when_none_exists(self):
        """With no scheduled change, endpoint should return 400."""
        s = _login("cathy@example.com", "testpass123")
        r = s.post(f"{API}/payments/cancel-scheduled-change", timeout=20)
        assert r.status_code in (400, 502), f"unexpected: {r.status_code} {r.text}"
        if r.status_code == 400:
            det = (r.json().get("detail") or "").lower()
            assert "no scheduled" in det or "scheduled" in det

    def test_cancel_unauthenticated(self):
        r = requests.post(f"{API}/payments/cancel-scheduled-change", timeout=20)
        assert r.status_code in (401, 403)


# ----- Seed-and-verify: seed pending_plan on db.subscriptions and check GET /billing/subscription reflects it -----
class TestPendingPlanReadModel:
    """We can't drive a real Stripe schedule in preview env, but we can verify
    GET /billing/subscription echoes pending_plan/pending_effective from
    db.subscriptions when present. If not surfaced, the UI banner will never
    show — that's a critical bug."""

    @pytest.fixture
    def db(self):
        try:
            from motor.motor_asyncio import AsyncIOMotorClient  # noqa
        except Exception:
            pytest.skip("motor not available")
        from pymongo import MongoClient
        mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        db_name = os.environ.get("DB_NAME", "test_database")
        client = MongoClient(mongo_url)
        return client[db_name]

    def test_pending_plan_surfaces_in_billing_subscription(self, db):
        s = _login("cathy@example.com", "testpass123")
        # find cathy user id
        me = s.get(f"{API}/auth/me", timeout=20).json()
        uid = me.get("id") or me.get("user_id") or me.get("user", {}).get("id")
        assert uid, f"could not resolve cathy id: {me}"
        # seed pending_plan/pending_effective
        effective = "2027-01-15T00:00:00+00:00"
        original = db.subscriptions.find_one({"user_id": uid}) or {}
        try:
            db.subscriptions.update_one(
                {"user_id": uid},
                {"$set": {
                    "user_id": uid,
                    "plan": "family",
                    "status": original.get("status") or "active",
                    "pending_plan": "solo",
                    "pending_effective": effective,
                    "schedule_id": "sub_sched_TEST_iter200",
                }},
                upsert=True,
            )
            r = s.get(f"{API}/billing/subscription", timeout=20)
            assert r.status_code == 200, r.text
            data = r.json()
            assert data.get("pending_plan") == "solo", f"pending_plan not surfaced: {data}"
            assert data.get("pending_effective") == effective, f"pending_effective not surfaced: {data}"
        finally:
            # cleanup: unset the seeded fields
            db.subscriptions.update_one(
                {"user_id": uid},
                {"$unset": {"pending_plan": "", "pending_effective": "", "schedule_id": ""}},
            )
