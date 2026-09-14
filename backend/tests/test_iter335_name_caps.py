"""iter335 – signup name capitalisation + participant name capitalisation"""
import os, time, requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://final-verify-web.preview.emergentagent.com").rstrip("/")

def _uniq():
    return str(int(time.time() * 1000))


def test_signup_capitalises_name_fields():
    email = f"TEST_iter335_caps_{_uniq()}@example.com"
    payload = {
        "email": email,
        "password": "Iter335-Aa!zzz",
        "name": "john smith",
        "first_name": "john",
        "last_name": "smith",
        "plan": "family",
    }
    r = requests.post(f"{BASE}/api/auth/signup", json=payload, timeout=30)
    assert r.status_code in (200, 201), f"signup failed: {r.status_code} {r.text}"
    body = r.json()
    user = body.get("user") or body
    assert user.get("name") == "John Smith", f"user.name expected 'John Smith' got {user.get('name')!r}"
    assert user.get("first_name") == "John", f"first_name got {user.get('first_name')!r}"
    assert user.get("last_name") == "Smith", f"last_name got {user.get('last_name')!r}"


def _login(email, password):
    r = requests.post(f"{BASE}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


def test_participant_create_capitalises_names():
    token = _login("cathy@example.com", "testpass123")
    h = {"Authorization": f"Bearer {token}"}
    payload = {
        "first_name": "louisa",
        "last_name": "davids",
        "relationship": "parent",
        "confirm_upgrade": True,
    }
    r = requests.post(f"{BASE}/api/v2/participants", json=payload, headers=h, timeout=30)
    assert r.status_code in (200, 201), f"participant create failed: {r.status_code} {r.text}"
    p = r.json()
    # try multiple shapes
    pdata = p.get("participant") or p
    fn = pdata.get("first_name") or pdata.get("firstName")
    ln = pdata.get("last_name") or pdata.get("lastName")
    assert fn == "Louisa", f"first_name expected 'Louisa' got {fn!r} — full body: {p}"
    assert ln == "Davids", f"last_name expected 'Davids' got {ln!r} — full body: {p}"
    # cleanup
    pid = pdata.get("id") or pdata.get("participant_id")
    if pid:
        requests.delete(f"{BASE}/api/v2/participants/{pid}", headers=h, timeout=15)
