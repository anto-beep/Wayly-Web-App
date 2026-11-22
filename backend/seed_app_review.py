"""Seed / repair the Apple App Review demo account. Idempotent.

Run manually:   cd /app/backend && python seed_app_review.py
Also invoked on backend startup (delayed, best-effort) so PRODUCTION is
provisioned automatically on the next deploy/Publish.

Why this exists:
    Apple App Review (Guideline 2.1a) rejected the app because the demo
    account they were given (samburke@test.com) was on an INACTIVE / read-only
    plan with no household, so every tool was locked and onboarding could not
    be completed. This script guarantees that exact account is always:
      - email-verified and unlocked
      - on an ACTIVE Family plan (far-future period end, never lapses)
      - already onboarded with a care recipient + a sample statement
    so the reviewer lands straight in a populated, fully-usable app.

Idempotent: safe to run on every boot. It upgrades the account if it already
exists and only creates the household/participant/statement when missing.
"""
import os
import asyncio
from datetime import datetime, timezone, timedelta

import requests
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

EMAIL = "samburke@test.com"
PASSWORD = "CarTest123$"
NAME = "Sam Burke"
PLAN = "family"

BASE_URL = (os.environ.get("SEED_BASE_URL") or "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

# Mirrors exactly what the mobile onboarding submits to POST /api/participants.
PARTICIPANT = {
    "first_name": "Margaret",
    "last_name": "Burke",
    "dob": "1945-06-18",
    "classification_level": 4,
    "pension_status": "part_pension",
    "provider_name": "Benetas Home Care",
    "statement_delivery": "email",
    "authorisation_confirmed": True,
    "preferred_name": "Margaret",
    "suburb": "Camberwell",
    "state": "VIC",
    "is_grandfathered_hcp": "no",
    "caregiver_relationship": "son",
}


def _sample_statement(household_id: str) -> dict:
    """A realistic October 2026 Support at Home statement for the demo."""
    from models import Statement, StatementLineItem, Anomaly
    items = [
        StatementLineItem(date="2026-10-03", service_code="PC-01", service_name="Personal care — morning visit",
                          stream="Clinical", units=8, unit_price=72.0, total=576.0,
                          government_paid=518.4, contribution_paid=57.6),
        StatementLineItem(date="2026-10-07", service_code="DOM-02", service_name="Domestic assistance",
                          stream="Everyday Living", units=4, unit_price=61.5, total=246.0,
                          government_paid=196.8, contribution_paid=49.2),
        StatementLineItem(date="2026-10-11", service_code="NUR-01", service_name="Clinical nursing visit",
                          stream="Clinical", units=2, unit_price=129.0, total=258.0,
                          government_paid=258.0, contribution_paid=0.0),
        StatementLineItem(date="2026-10-15", service_code="CM-01", service_name="Care management",
                          stream="Care Management", units=1, unit_price=180.0, total=180.0,
                          government_paid=180.0, contribution_paid=0.0),
        StatementLineItem(date="2026-10-20", service_code="TPT-03", service_name="Transport to appointment",
                          stream="Independence", units=3, unit_price=44.0, total=132.0,
                          government_paid=105.6, contribution_paid=26.4),
    ]
    anomalies = [
        Anomaly(severity="warning", title="Transport rate above the indicative range",
                detail="Transport is billed at $44.00 per trip, above the typical provider range for this service. Worth confirming how this rate was set.",
                suggested_action="Ask your provider how this transport rate was calculated.",
                rule="price_outlier", dollar_impact=18.0),
        Anomaly(severity="info", title="Care management within expected limits",
                detail="Care management charges are within the expected monthly amount for this classification.",
                rule="care_mgmt_cap"),
    ]
    s = Statement(
        household_id=household_id,
        filename="October 2026 statement (sample).pdf",
        period_label="October 2026",
        line_items=items,
        summary=("Sample October 2026 Support at Home statement for the demo account. "
                 "Five line items across the Clinical, Everyday Living, Care Management "
                 "and Independence streams, with one flagged charge to review."),
        anomalies=anomalies,
        anomaly_dollar_impact_total=18.0,
        input_method="text_paste",
        origin_route="statements_upload",
        document_pages=1,
        raw_text_preview="Support at Home monthly statement — Margaret Burke — October 2026 ...",
    )
    return s.model_dump()


async def main() -> None:
    from auth import hash_password
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    now = datetime.now(timezone.utc)

    # 1. User: create if missing, else ensure verified / active / unlocked.
    user = await db.users.find_one({"email": EMAIL})
    if not user:
        import secrets
        uid = secrets.token_urlsafe(12)
        await db.users.insert_one({
            "id": uid, "email": EMAIL, "password_hash": hash_password(PASSWORD),
            "name": NAME, "role": "caregiver", "plan": PLAN, "household_id": None,
            "is_admin": False, "totp_enabled": False, "failed_login_count": 0,
            "lockout_until": None, "email_verified": True,
            "email_verified_at": now.isoformat(), "created_at": now.isoformat(),
        })
        print(f"[seed] created user {EMAIL}")
    else:
        uid = user["id"]
        await db.users.update_one({"email": EMAIL}, {"$set": {
            "plan": PLAN, "email_verified": True, "failed_login_count": 0,
            "lockout_until": None, "totp_enabled": False,
        }})
        print(f"[seed] ensured user {EMAIL} (verified / active / unlocked)")

    # 2. Active subscription (far-future end so it never lapses mid-review).
    period_end = (now + timedelta(days=3650)).isoformat()
    sub_set = {
        "user_id": uid, "plan": PLAN, "status": "active", "had_trial": True,
        "trial_ends_at": None, "current_period_end": period_end,
        "cancel_at_period_end": False, "updated_at": now.isoformat(),
    }
    existing_sub = await db.subscriptions.find_one({"user_id": uid})
    if existing_sub:
        await db.subscriptions.update_one({"user_id": uid}, {"$set": sub_set})
        print("[seed] subscription set to ACTIVE")
    else:
        from uuid import uuid4
        sub_set.update({"id": uuid4().hex, "created_at": now.isoformat(), "stripe_session_id": None})
        await db.subscriptions.insert_one(sub_set)
        print("[seed] active subscription created")
    client.close()

    # 3. Household + participant via the REAL onboarding endpoint (guarantees
    #    all the nested data-model invariants are satisfied).
    try:
        token = None
        for attempt in range(4):
            try:
                r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=45)
                r.raise_for_status()
                token = r.json().get("token")
                if token:
                    break
            except Exception as le:
                print(f"[seed] login attempt {attempt + 1} failed: {le!r}")
                await asyncio.sleep(5)
        if not token:
            raise RuntimeError("could not obtain login token after retries")
        h = {"Authorization": f"Bearer {token}"}
        pj = {}
        try:
            pr = requests.get(f"{API}/participants", headers=h, timeout=30)
            pj = pr.json() if pr.ok else {}
        except Exception:
            pj = {}
        items = pj.get("items") if isinstance(pj, dict) else pj
        if not items:
            cp = requests.post(f"{API}/participants", headers=h, json=PARTICIPANT, timeout=60)
            if cp.ok:
                print("[seed] created household + participant:", cp.json().get("id"))
            else:
                print("[seed] participant create failed:", cp.status_code, cp.text[:300])
        else:
            print(f"[seed] participant already present ({len(items)})")
        # Clear any half-finished onboarding draft so the reviewer lands on the dashboard.
        try:
            requests.delete(f"{API}/onboarding/draft", headers=h, timeout=15)
        except Exception:
            pass
    except Exception as e:
        print("[seed] onboarding seed failed:", repr(e))

    # 4. Sample statement (direct insert), only when the household has none.
    try:
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        u = await db.users.find_one({"email": EMAIL}, {"_id": 0, "household_id": 1})
        hid = (u or {}).get("household_id")
        if hid:
            if not await db.statements.find_one({"household_id": hid}):
                await db.statements.insert_one(_sample_statement(hid))
                print("[seed] inserted sample statement")
            else:
                print("[seed] statement already present")
        else:
            print("[seed] no household_id yet; skipped statement")
        client.close()
    except Exception as e:
        print("[seed] statement seed failed:", repr(e))

    print("[seed] done")


if __name__ == "__main__":
    asyncio.run(main())
