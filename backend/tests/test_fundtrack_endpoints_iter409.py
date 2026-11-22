"""FUNDTRACK-1 / BSC-1 endpoint verification — iter409.

Checks that /api/budget/current, /api/bsc1/compute, /api/bc2/.../projection
all expose the canonical `ladder` with matching A..H figures (parity),
NET D, F=D-E, status, and projection fields.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/") or \
    "https://tool-showcase-wide--2w9s0vq0.preview.emergentagent.com"
EMAIL = "cathy@example.com"
PASSWORD = "testpass123"


@pytest.fixture(scope="module")
def auth_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    s.headers.update({"Authorization": f"Bearer {tok}", "Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def participant_id(auth_session):
    r = auth_session.get(f"{BASE_URL}/api/participants", timeout=30)
    assert r.status_code == 200, r.text
    items = r.json().get("items") or r.json()
    assert items
    pid = items[0].get("id") or items[0].get("_id")
    assert pid
    return pid


@pytest.fixture(scope="module")
def current_payload(auth_session, participant_id):
    r = auth_session.get(f"{BASE_URL}/api/budget/current", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def bsc1_payload(auth_session, participant_id):
    r = auth_session.post(
        f"{BASE_URL}/api/bsc1/compute",
        json={"participant_id": participant_id, "changes": []},
        timeout=60,
    )
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def bc2_payload(auth_session, participant_id):
    r = auth_session.get(
        f"{BASE_URL}/api/bc2/participants/{participant_id}/projection", timeout=30
    )
    assert r.status_code == 200, r.text
    return r.json()


# ---------- /budget/current ----------
def test_budget_current_has_ladder(current_payload):
    assert "ladder" in current_payload, f"keys={list(current_payload.keys())}"
    ladder = current_payload["ladder"]
    for k in ("figures", "labels", "quarter", "status", "projection", "confidence", "utilisation"):
        assert k in ladder, f"missing {k}"
    figs = ladder["figures"]
    for k in "ABCDEFGH":
        assert k in figs, f"figure {k} missing"


def test_budget_current_D_is_net(current_payload):
    ladder = current_payload["ladder"]
    D = float(ladder["figures"]["D"])
    qu = current_payload.get("quarterly_usable") or current_payload.get("quarterlyUsable")
    assert qu is not None, "quarterly_usable missing on /budget/current"
    assert abs(D - float(qu)) < 0.5, f"D={D} vs quarterly_usable={qu} (D must be NET)"


def test_budget_current_F_equals_D_minus_E(current_payload):
    f = current_payload["ladder"]["figures"]
    assert abs(float(f["F"]) - (float(f["D"]) - float(f["E"]))) < 0.5


def test_budget_current_G_zero_H_equals_F_on_current(current_payload):
    f = current_payload["ladder"]["figures"]
    # G is bookings-forward; on a plain dashboard view no scenario bookings → G=0, H=F
    assert float(f["G"]) == 0 or abs(float(f["G"])) < 0.5
    assert abs(float(f["H"]) - float(f["F"])) < 0.5


def test_budget_current_status_in_three_states(current_payload):
    st = current_payload["ladder"]["status"]
    assert st in ("underspend_risk", "on_track", "overspend_risk"), st


def test_budget_current_projection_method(current_payload):
    pj = current_payload["ladder"]["projection"]
    assert "method" in pj and "projected_total_aud" in pj


# ---------- /bsc1/compute (baseline) ----------
def test_bsc1_hero_and_ladder(bsc1_payload):
    assert "hero" in bsc1_payload
    assert "ladder" in bsc1_payload
    hero = bsc1_payload["hero"]
    assert hero["status"] in ("underspend_risk", "on_track", "overspend_risk")
    # D1/D8: hero uses left_for_care, forfeit, shortfall — NOT unspent_aud
    assert "left_for_care_aud" in hero
    assert "forfeit_aud" in hero
    assert "shortfall_aud" in hero
    assert "unspent_aud" not in hero, "hero should NOT expose raw unspent_aud"


def test_bsc1_parity_with_current(bsc1_payload, current_payload):
    a = bsc1_payload["ladder"]["figures"]
    b = current_payload["ladder"]["figures"]
    for k in "DEF":
        assert abs(float(a[k]) - float(b[k])) < 0.5, f"parity fail {k}: bsc1={a[k]} current={b[k]}"
    # baseline (no changes) → G=0, H=F
    assert abs(float(a["G"])) < 0.5
    assert abs(float(a["H"]) - float(a["F"])) < 0.5
    # status parity
    assert bsc1_payload["ladder"]["status"] == current_payload["ladder"]["status"]


# ---------- /bc2 projection ----------
def test_bc2_ladder_present_and_net(bc2_payload, current_payload):
    assert "ladder" in bc2_payload
    cq = bc2_payload.get("current_quarter") or {}
    qb = cq.get("quarterly_budget_aud")
    assert qb is not None, "current_quarter.quarterly_budget_aud missing"
    D = float(current_payload["ladder"]["figures"]["D"])
    # qb should be NET (≈ D) and NOT gross (D/0.9)
    gross = D / 0.9
    assert abs(float(qb) - D) < 1.0, f"quarterly_budget_aud {qb} not NET (expected ~{D})"
    assert abs(float(qb) - gross) > 1.0, f"quarterly_budget_aud {qb} appears to be GROSS"
    headroom = cq.get("headroom_aud")
    F = float(current_payload["ladder"]["figures"]["F"])
    assert headroom is not None and abs(float(headroom) - F) < 1.0, f"headroom {headroom} != F {F}"


# ---------- D3: projection pace-based when quarter is part-elapsed + spend>0 ----------
def test_projection_pace_based_when_applicable(current_payload):
    ladder = current_payload["ladder"]
    E = float(ladder["figures"]["E"])
    elapsed_pct = float(ladder["quarter"]["elapsed_pct"])
    pj = ladder["projection"]
    if E > 0 and 0.05 < elapsed_pct < 0.95:
        # linear_pace projection should differ from raw E
        assert pj["method"] == "linear_pace", f"method={pj['method']}"
        assert abs(float(pj["projected_total_aud"]) - E) > 0.5, "projection should differ from spend-so-far"


# ---------- D5: confidence derived ----------
def test_confidence_is_structured(current_payload):
    c = current_payload["ladder"]["confidence"]
    assert c["level"] in ("low", "medium", "high")
    assert "inputs" in c and isinstance(c["inputs"], (dict, list))
