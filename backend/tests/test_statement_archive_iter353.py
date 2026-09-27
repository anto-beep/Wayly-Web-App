"""iter353 — statement archive/restore data-consistency test for cathy@example.com.

Verifies GET /api/budget/current streams-spent sum drops when a current-quarter
statement is archived, and restores when un-archived. Also verifies GET /api/statements
no longer lists an archived statement while archived.
"""

import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://final-verify-web.preview.emergentagent.com").rstrip("/")
EMAIL = "cathy@example.com"
PASSWORD = "testpass123"
STMT_ID = "d5267556-57c4-4925-90c7-13eca0ba24f3"


def _login(session):
    r = session.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:300]}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token, f"no token in response: {r.text[:300]}"
    session.headers.update({"Authorization": f"Bearer {token}"})
    return token


def _streams_spent_sum(session):
    r = session.get(f"{BASE_URL}/api/budget/current", timeout=30)
    assert r.status_code == 200, f"/budget/current failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    streams = data.get("streams") or []
    total = 0.0
    for s in streams:
        v = s.get("spent")
        if v is None:
            v = s.get("used") or 0
        try:
            total += float(v)
        except Exception:
            pass
    return round(total, 2), streams


def _list_statement_ids(session):
    r = session.get(f"{BASE_URL}/api/statements", timeout=30)
    assert r.status_code == 200, f"/statements failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    items = body if isinstance(body, list) else (body.get("statements") or body.get("items") or [])
    return [s.get("id") for s in items]


def test_archive_restore_flow_cathy_current_quarter():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    _login(session)

    # Baseline
    baseline_sum, baseline_streams = _streams_spent_sum(session)
    ids_before = _list_statement_ids(session)
    print(f"[BASELINE] streams_spent_sum={baseline_sum}, statements_count={len(ids_before)}, target_present={STMT_ID in ids_before}")
    assert baseline_sum > 0, "baseline streams spent sum should be > 0 for cathy"
    assert STMT_ID in ids_before, f"target statement {STMT_ID} not in cathy's list — cannot test archive"

    # Archive
    try:
        r_arch = session.delete(f"{BASE_URL}/api/statements/{STMT_ID}/archive", timeout=30)
        assert r_arch.status_code in (200, 204), f"archive failed: {r_arch.status_code} {r_arch.text[:300]}"
        print(f"[ARCHIVE] status={r_arch.status_code}")

        # Verify sum drops
        archived_sum, _ = _streams_spent_sum(session)
        print(f"[AFTER_ARCHIVE] streams_spent_sum={archived_sum}")
        assert archived_sum < baseline_sum, f"sum did NOT drop after archive: baseline={baseline_sum}, after={archived_sum}"

        # Verify statement removed from list
        ids_after = _list_statement_ids(session)
        assert STMT_ID not in ids_after, "archived statement still present in /statements list"
        print(f"[AFTER_ARCHIVE] statements_count={len(ids_after)}, target_absent=True")

    finally:
        # Always restore
        r_rest = session.post(f"{BASE_URL}/api/statements/{STMT_ID}/restore", timeout=30)
        assert r_rest.status_code in (200, 204), f"restore failed: {r_rest.status_code} {r_rest.text[:300]}"
        print(f"[RESTORE] status={r_rest.status_code}")

    # Verify sum restored
    restored_sum, _ = _streams_spent_sum(session)
    ids_final = _list_statement_ids(session)
    print(f"[AFTER_RESTORE] streams_spent_sum={restored_sum}, statements_count={len(ids_final)}, target_present={STMT_ID in ids_final}")
    assert abs(restored_sum - baseline_sum) < 0.01, f"sum after restore ({restored_sum}) != baseline ({baseline_sum})"
    assert STMT_ID in ids_final, "restored statement missing from /statements list"


if __name__ == "__main__":
    test_archive_restore_flow_cathy_current_quarter()
    print("PASS")
