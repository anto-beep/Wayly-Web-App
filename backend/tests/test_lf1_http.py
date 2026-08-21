"""LF-1 v1.2 Iteration 1 — HTTP integration tests.

Exercises every LF-1 REST endpoint over the public URL as cathy@example.com,
covering:
  - GET  /api/lf1/situations                  (12 items, sit 11 = guided, 12 = response_draft)
  - GET  /api/lf1/archetypes                  (7 archetypes, opan_footer + complaint mode flags)
  - GET  /api/lf1/directory/recipients        (>=10 seeded rows, tag filter)
  - GET  /api/lf1/directory/recipients/<key>  (mac / acqsc / ombudsman / 404)
  - GET  /api/lf1/safety                      (elder abuse + terms footer)
  - POST/GET/PATCH/DELETE /api/lf1/correspondence (+ autosave / inbound)

All test-created rows are removed via DELETE in a teardown loop.
"""
from __future__ import annotations

import os
import time
import datetime as _dt

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://statement-checker-3.preview.emergentagent.com").rstrip("/")

CATHY_EMAIL = "cathy@example.com"
CATHY_PASS = "testpass123"


# ---------------------------------------------------------------------------
# Auth fixture
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def cathy_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": CATHY_EMAIL, "password": CATHY_PASS}, timeout=60)
    if r.status_code != 200:
        pytest.skip(f"Cannot log in as cathy: {r.status_code} {r.text[:200]}")
    data = r.json()
    token = data.get("access_token") or data.get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    # Cookies are also set from the login response, so both auth modes work.
    return s


@pytest.fixture(scope="module")
def created_entries():
    ids = []
    yield ids


@pytest.fixture(scope="module", autouse=True)
def _cleanup(cathy_session, created_entries):
    yield
    for eid in created_entries:
        try:
            cathy_session.delete(f"{BASE_URL}/api/lf1/correspondence/{eid}", timeout=15)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Situations
# ---------------------------------------------------------------------------

def test_situations_returns_twelve():
    r = requests.get(f"{BASE_URL}/api/lf1/situations", timeout=20)
    assert r.status_code == 200
    situations = r.json()["situations"]
    assert isinstance(situations, list) and len(situations) == 12
    ids = [s["id"] for s in situations]
    assert ids == list(range(1, 13))
    m = {s["id"]: s for s in situations}
    assert m[11]["archetype"] == "guided_pathway"
    assert m[12]["archetype"] == "response_draft"


def test_archetypes_returns_seven_with_flags():
    r = requests.get(f"{BASE_URL}/api/lf1/archetypes", timeout=20)
    assert r.status_code == 200
    arch = r.json()["archetypes"]
    assert set(arch.keys()) == {
        "request", "dispute", "complaint", "escalation",
        "notification", "response_draft", "guided_pathway",
    }
    for k in ("complaint", "escalation", "guided_pathway"):
        assert arch[k]["supports_complaint_modes"] is True, k
    for k in ("request", "dispute", "notification", "response_draft"):
        assert arch[k]["supports_complaint_modes"] is False, k
    assert arch["complaint"]["opan_footer"] is True
    assert arch["escalation"]["opan_footer"] is True
    assert arch["request"]["opan_footer"] is False


# ---------------------------------------------------------------------------
# Directory
# ---------------------------------------------------------------------------

def test_directory_recipients_include_ten_keys():
    r = requests.get(f"{BASE_URL}/api/lf1/directory/recipients", timeout=20)
    assert r.status_code == 200
    rows = r.json()["recipients"]
    keys = {row["key"] for row in rows}
    for k in ("mac", "acqsc", "complaints_commissioner", "ombudsman",
              "opan", "opan_atsi", "elder_abuse_helpline", "police_emergency",
              "services_australia_aged_care", "public_advocate_generic"):
        assert k in keys, f"missing recipient key: {k}"


def test_directory_recipient_mac():
    r = requests.get(f"{BASE_URL}/api/lf1/directory/recipients/mac", timeout=20)
    assert r.status_code == 200
    row = r.json()
    assert row["phone"] == "1800 200 422"
    assert row["response_window_days"] == 28


def test_directory_recipient_acqsc_ombudsman():
    r = requests.get(f"{BASE_URL}/api/lf1/directory/recipients/acqsc", timeout=20)
    assert r.status_code == 200
    assert r.json()["response_window_days"] == 90

    r2 = requests.get(f"{BASE_URL}/api/lf1/directory/recipients/ombudsman", timeout=20)
    assert r2.status_code == 200
    assert r2.json()["response_window_days"] == 42


def test_directory_recipient_unknown_404():
    r = requests.get(f"{BASE_URL}/api/lf1/directory/recipients/unknown_key", timeout=20)
    assert r.status_code == 404


def test_directory_tag_filter_cc_default_returns_opan():
    r = requests.get(f"{BASE_URL}/api/lf1/directory/recipients", params={"tag": "cc_default"}, timeout=20)
    assert r.status_code == 200
    keys = {row["key"] for row in r.json()["recipients"]}
    assert "opan" in keys


# ---------------------------------------------------------------------------
# Safety
# ---------------------------------------------------------------------------

def test_safety_endpoint():
    r = requests.get(f"{BASE_URL}/api/lf1/safety", timeout=20)
    assert r.status_code == 200
    j = r.json()
    ea = j["elder_abuse"]
    assert ea["headline"]
    phones = [c["phone"] for c in ea["contacts"]]
    assert "1800 353 374" in phones
    assert "1800 700 600" in phones
    assert "000" in phones
    assert "not legal advice" in j["terms_footer"]


# ---------------------------------------------------------------------------
# Correspondence create / list / read
# ---------------------------------------------------------------------------

def test_create_correspondence_situation_1_auto_resolves(cathy_session, created_entries):
    r = cathy_session.post(f"{BASE_URL}/api/lf1/correspondence", json={"situation_id": 1}, timeout=20)
    assert r.status_code == 200, r.text
    entry = r.json()["entry"]
    assert entry["archetype"] == "request"
    assert entry["recipient_type"] == "mac"
    assert entry["status"] == "draft"
    assert entry["situation_id"] == 1
    assert entry["follow_up_date"], "follow_up_date should be populated"
    # 28 days from now
    fu = _dt.date.fromisoformat(entry["follow_up_date"])
    expected = (_dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(days=28)).date()
    assert abs((fu - expected).days) <= 1
    # 27+ fields present in the doc
    assert len(entry.keys()) >= 27
    created_entries.append(entry["id"])


def test_create_correspondence_bad_situation_400(cathy_session):
    r = cathy_session.post(f"{BASE_URL}/api/lf1/correspondence", json={"situation_id": 999}, timeout=20)
    assert r.status_code == 400


def test_create_correspondence_persists_sender_identity(cathy_session, created_entries):
    r = cathy_session.post(f"{BASE_URL}/api/lf1/correspondence", json={
        "situation_id": 1,
        "sender_identity": "family_caregiver",
        "sender_authority_basis": "Adult daughter",
    }, timeout=20)
    assert r.status_code == 200
    entry = r.json()["entry"]
    assert entry["sender_identity"] == "family_caregiver"
    assert entry["sender_authority_basis"] == "Adult daughter"
    created_entries.append(entry["id"])


def test_list_and_get_correspondence(cathy_session, created_entries):
    r = cathy_session.get(f"{BASE_URL}/api/lf1/correspondence", timeout=20)
    assert r.status_code == 200
    entries = r.json()["entries"]
    assert isinstance(entries, list)
    # Reverse-chron
    updated_ats = [e.get("updated_at") for e in entries if e.get("updated_at")]
    assert updated_ats == sorted(updated_ats, reverse=True)

    if created_entries:
        eid = created_entries[0]
        r2 = cathy_session.get(f"{BASE_URL}/api/lf1/correspondence/{eid}", timeout=20)
        assert r2.status_code == 200
        assert r2.json()["id"] == eid


# ---------------------------------------------------------------------------
# Autosave
# ---------------------------------------------------------------------------

def test_autosave_persists_content(cathy_session, created_entries):
    r = cathy_session.post(f"{BASE_URL}/api/lf1/correspondence", json={"situation_id": 6}, timeout=20)
    assert r.status_code == 200
    entry = r.json()["entry"]
    eid = entry["id"]
    created_entries.append(eid)

    a = cathy_session.patch(
        f"{BASE_URL}/api/lf1/correspondence/{eid}/autosave",
        json={"content_draft": "v1", "intake": {"note": "foo"}},
        timeout=20,
    )
    assert a.status_code == 200
    body = a.json()
    assert body["ok"] is True
    assert body["saved_at"]

    g = cathy_session.get(f"{BASE_URL}/api/lf1/correspondence/{eid}", timeout=20)
    assert g.status_code == 200
    assert g.json()["content_draft"] == "v1"
    assert g.json()["intake"]["note"] == "foo"


# ---------------------------------------------------------------------------
# Patch → draft versioning
# ---------------------------------------------------------------------------

def test_patch_transitions_status_and_versions(cathy_session, created_entries):
    r = cathy_session.post(f"{BASE_URL}/api/lf1/correspondence", json={"situation_id": 1}, timeout=20)
    eid = r.json()["entry"]["id"]
    created_entries.append(eid)

    p1 = cathy_session.patch(
        f"{BASE_URL}/api/lf1/correspondence/{eid}",
        json={"status": "sent", "content_final": "Final content", "sent_via": "email", "terms_ack": True},
        timeout=20,
    )
    assert p1.status_code == 200
    entry = p1.json()["entry"]
    assert entry["status"] == "sent"
    assert entry["sent_at"]
    assert entry["terms_ack"] is True
    assert len(entry["draft_versions"]) == 1
    assert entry["draft_versions"][0]["canonical"] is True
    assert entry["draft_versions"][0]["content"] == "Final content"

    # Second PATCH → second version, prior marked non-canonical
    p2 = cathy_session.patch(
        f"{BASE_URL}/api/lf1/correspondence/{eid}",
        json={"content_final": "Final content v2"},
        timeout=20,
    )
    assert p2.status_code == 200
    versions = p2.json()["entry"]["draft_versions"]
    assert len(versions) == 2
    assert versions[-1]["canonical"] is True
    assert versions[-1]["content"] == "Final content v2"
    assert versions[0]["canonical"] is False


# ---------------------------------------------------------------------------
# Inbound
# ---------------------------------------------------------------------------

def test_inbound_creates_reply_and_transitions_parent(cathy_session, created_entries):
    r = cathy_session.post(f"{BASE_URL}/api/lf1/correspondence", json={"situation_id": 3}, timeout=20)
    parent_id = r.json()["entry"]["id"]
    created_entries.append(parent_id)

    ib = cathy_session.post(
        f"{BASE_URL}/api/lf1/correspondence/{parent_id}/inbound",
        json={"inbound_source": "email", "content": "reply", "from_label": "MAC officer"},
        timeout=20,
    )
    assert ib.status_code == 200, ib.text
    child = ib.json()["entry"]
    assert child["direction"] == "inbound"
    assert child["replies_to"] == parent_id
    created_entries.append(child["id"])

    # Parent should now be status=responded
    g = cathy_session.get(f"{BASE_URL}/api/lf1/correspondence/{parent_id}", timeout=20)
    assert g.status_code == 200
    assert g.json()["status"] == "responded"


# ---------------------------------------------------------------------------
# Delete + audit
# ---------------------------------------------------------------------------

def test_delete_removes_entry(cathy_session, created_entries):
    r = cathy_session.post(f"{BASE_URL}/api/lf1/correspondence", json={"situation_id": 6}, timeout=20)
    eid = r.json()["entry"]["id"]

    d = cathy_session.delete(f"{BASE_URL}/api/lf1/correspondence/{eid}", timeout=20)
    assert d.status_code == 200
    assert d.json().get("deleted") is True

    g = cathy_session.get(f"{BASE_URL}/api/lf1/correspondence/{eid}", timeout=20)
    assert g.status_code == 404
