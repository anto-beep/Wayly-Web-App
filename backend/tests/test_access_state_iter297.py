"""Iter 297 backend regression: /api/auth/me access_state for 3 canonical fixtures."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mobile-parity-6.preview.emergentagent.com").rstrip("/")

CASES = [
    ("cathy@example.com", "testpass123", "active"),
    ("trialactive@example.com", "AccessTest1!", "trial"),
    ("cancelled.vo@example.com", "AccessTest1!", "view_only"),
]


def _login(email, password):
    # Retry once for flaky timeouts
    for _ in range(2):
        try:
            r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=60)
            break
        except requests.exceptions.ReadTimeout:
            continue
    else:
        pytest.fail(f"login {email} timed out twice")
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in login response for {email}: {r.text[:200]}"
    return tok


@pytest.mark.parametrize("email,password,expected", CASES)
def test_access_state(email, password, expected):
    tok = _login(email, password)
    r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    assert r.status_code == 200, f"/auth/me failed for {email}: {r.status_code}"
    data = r.json()
    got = data.get("access_state") or data.get("user", {}).get("access_state")
    assert got == expected, f"{email}: expected access_state={expected}, got {got}. Full: {data}"
