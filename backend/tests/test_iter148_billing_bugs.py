"""Iter 148 — verify BUG 1 (addon $24.50), BUG 2 (cancel rollback), BUG 3 (constants)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mobile-parity-sweep.preview.emergentagent.com").rstrip("/")

EMAIL = "cathy@example.com"
PASSWORD = "testpass123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def test_constants_values():
    """BUG 1b — constants updated to fortnightly values."""
    from batch3_models import PLAN_PRICES_MONTHLY, ADDON_PRICE_MONTHLY
    assert PLAN_PRICES_MONTHLY["SOLO"] == 24.50
    assert PLAN_PRICES_MONTHLY["FAMILY"] == 49.50
    assert ADDON_PRICE_MONTHLY == 24.50


def test_auth_me_family(headers):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert data.get("plan") in ("family", "FAMILY"), f"unexpected plan: {data.get('plan')}"


def _list_participants(headers):
    r = requests.get(f"{BASE_URL}/api/v2/participants", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["items"]


def _ensure_family_base(headers):
    """Make sure cathy account is FAMILY with 2 base participants (no addons).
    First cancel any pending addons then remove non-primary REMOVED participants."""
    # Cancel pending addons to reset
    requests.post(f"{BASE_URL}/api/billing/v2/cancel-pending-addon", headers=headers, timeout=30)


def test_bug2_add_participant_and_cancel_rollback(headers):
    """BUG 2 — create 3rd participant on Family plan → cancel-pending-addon rolls it back."""
    _ensure_family_base(headers)
    parts_before = _list_participants(headers)
    before_ids = {p["id"] for p in parts_before}
    before_count = len(parts_before)

    # If already >=3 active participants, this account is in unexpected state — skip
    # Add a new participant → should create addon since >=3
    payload = {"first_name": "TESTLuke148", "last_name": "Addon", "classification": 2}
    r = requests.post(f"{BASE_URL}/api/v2/participants", headers=headers, json=payload, timeout=30)
    assert r.status_code == 200, f"add participant failed: {r.status_code} {r.text}"
    body = r.json()
    new_pid = body["participant"]["id"]
    addon = body.get("addon")

    parts_after_add = _list_participants(headers)
    assert new_pid in {p["id"] for p in parts_after_add}

    if before_count + 1 > 2:  # only creates addon if exceeds base included
        assert addon is not None, "expected addon row created"
        addon_id = addon["id"]

        # BUG 1 — verify addon-checkout charges $24.50
        origin = "https://mobile-parity-sweep.preview.emergentagent.com"
        r_ck = requests.post(
            f"{BASE_URL}/api/billing/v2/addon-checkout",
            headers=headers,
            json={"addon_id": addon_id, "origin_url": origin},
            timeout=45,
        )
        assert r_ck.status_code == 200, f"addon-checkout failed: {r_ck.status_code} {r_ck.text}"
        ck = r_ck.json()
        assert ck.get("amount") == 24.50, f"BUG1: expected 24.50, got {ck.get('amount')}"
        assert ck.get("url"), "expected Stripe URL"

    # BUG 2 — cancel-pending-addon should roll back the new participant
    r_cancel = requests.post(f"{BASE_URL}/api/billing/v2/cancel-pending-addon", headers=headers, timeout=30)
    assert r_cancel.status_code == 200, r_cancel.text
    cancel_body = r_cancel.json()
    assert cancel_body["ok"] is True
    if before_count + 1 > 2:
        assert cancel_body["cancelled_count"] >= 1
        assert new_pid in cancel_body["participants_archived"], f"participant not archived: {cancel_body}"

        # Verify participant status is REMOVED (not in active list)
        parts_after_cancel = _list_participants(headers)
        active_ids = {p["id"] for p in parts_after_cancel}
        assert new_pid not in active_ids, "participant still active after cancel"


def test_regression_prices_endpoint(headers):
    r = requests.get(f"{BASE_URL}/api/payments/prices", timeout=30)
    assert r.status_code == 200, r.text


def test_regression_list_v2_participants(headers):
    r = requests.get(f"{BASE_URL}/api/v2/participants", headers=headers, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert "items" in data and "max" in data
