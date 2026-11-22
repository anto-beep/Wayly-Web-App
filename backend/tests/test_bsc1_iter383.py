"""BSC-1 iter383 — service-catalogue parity w/ PPC + compute w/ manual price."""
import os
import pytest
import requests

def _load_url():
    for p in ("/app/frontend/.env",):
        try:
            for ln in open(p):
                if ln.startswith("REACT_APP_BACKEND_URL="):
                    return ln.split("=", 1)[1].strip().rstrip("/")
        except Exception:
            pass
    return os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

BASE = _load_url()

CRED = {"email": "cathy@example.com", "password": "testpass123"}


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login", json=CRED, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def pid(session):
    r = session.get(f"{BASE}/api/participants", timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    plist = data if isinstance(data, list) else data.get("participants") or data.get("items") or []
    assert plist, f"No participants: {data}"
    # Prefer Dorothy
    chosen = next((p for p in plist if "dorothy" in (p.get("first_name", "") + " " + p.get("name", "")).lower()), plist[0])
    return chosen["id"]


def test_bsc1_catalogue_matches_ppc(session):
    r1 = session.get(f"{BASE}/api/bsc1/service-catalogue", timeout=30)
    assert r1.status_code == 200, r1.text
    cat = r1.json().get("services", [])
    r2 = session.get(f"{BASE}/api/ppc/services", timeout=30)
    assert r2.status_code == 200, r2.text
    ppc = r2.json().get("services", []) if isinstance(r2.json(), dict) else r2.json()
    assert len(cat) == 31, f"BSC-1 catalogue has {len(cat)} services, expected 31"
    assert len(ppc) == 31, f"PPC has {len(ppc)} services, expected 31"
    # Parity: service_id = service_code; name = service
    cat_codes = sorted(s["service_id"] for s in cat)
    ppc_codes = sorted(s["service_code"] for s in ppc)
    assert cat_codes == ppc_codes, "service codes differ"
    for s in cat:
        assert "name" in s and s["name"]
        assert "unit" in s
        assert "unit_price" in s


def test_bsc1_compute_empty(session, pid):
    r = session.post(f"{BASE}/api/bsc1/compute",
                     json={"participant_id": pid, "changes": []}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "hero" in d and "status" in d["hero"] and "answer" in d["hero"]
    assert len(d["quarters"]) == 4
    assert "baseline" in d and len(d["baseline"]["quarters"]) == 4
    assert "funding" in d and "contribution" in d and "confidence" in d


def test_bsc1_compute_add_service_manual_price(session, pid):
    # Add service with manual price 95.00/hour at 2 hours x 2 per week
    change = {
        "id": "c1",
        "type": "add_service",
        "service_id": "DOM_CLEAN_STD",
        "name": "Domestic Assistance",
        "unit_price": 95.0,
        "quantity": 2,
        "frequency_per_week": 2,
    }
    r = session.post(f"{BASE}/api/bsc1/compute",
                     json={"participant_id": pid, "changes": [change]}, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    deltas = d.get("change_deltas", [])
    assert deltas and deltas[0].get("delta_aud") is not None
    # 95 * 2 * 2 * 13 = 4940
    assert abs(deltas[0]["delta_aud"] - 4940.0) < 0.05, f"expected 4940, got {deltas[0]['delta_aud']}"
    assert d.get("delta_vs_baseline_aud") is not None


def test_bsc1_scenario_lifecycle(session, pid):
    body = {
        "name": "TEST_iter383_scenario",
        "changes": [{"id": "c1", "type": "add_service", "service_id": "DOM_CLEAN_STD",
                     "name": "Domestic Assistance", "unit_price": 90.0, "quantity": 1,
                     "frequency_per_week": 1}],
    }
    r = session.post(f"{BASE}/api/bsc1/participants/{pid}/scenarios", json=body, timeout=30)
    assert r.status_code == 200, r.text
    sid = r.json()["scenario"]["id"]

    r2 = session.get(f"{BASE}/api/bsc1/participants/{pid}/scenarios", timeout=30)
    assert r2.status_code == 200
    found = any(s["id"] == sid for s in r2.json()["scenarios"])
    assert found

    r3 = session.delete(f"{BASE}/api/bsc1/scenarios/{sid}", timeout=30)
    assert r3.status_code == 200 and r3.json().get("deleted") is True
