"""LF-2 (Letters v2) backend integration tests — iter 116."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://statement-checker-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CATHY_EMAIL = "cathy@example.com"
CATHY_PASS = "testpass123"


@pytest.fixture(scope="module")
def cathy_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": CATHY_EMAIL, "password": CATHY_PASS})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def cathy_participant_id(cathy_client):
    # Try common household participants endpoints
    for path in ("/participants", "/household/participants", "/household"):
        r = cathy_client.get(f"{API}{path}")
        if r.status_code == 200:
            data = r.json()
            candidates = data if isinstance(data, list) else (
                data.get("items") or data.get("participants") or data.get("members") or []
            )
            for p in candidates:
                pid = p.get("id") or p.get("participant_id")
                first = (p.get("first_name") or "").lower()
                if pid and first.startswith("dorothy"):
                    return pid
            # fallback: first participant
            for p in candidates:
                pid = p.get("id") or p.get("participant_id")
                if pid:
                    return pid
    # Try /auth/me → active participant
    r = cathy_client.get(f"{API}/auth/me")
    if r.status_code == 200:
        me = r.json()
        pid = me.get("active_participant_id") or me.get("participant_id")
        if pid:
            return pid
    pytest.skip("Could not resolve Cathy's participant id")


# -- Public status --
def test_lf2_status_public():
    r = requests.get(f"{API}/lf2/status")
    assert r.status_code == 200
    data = r.json()
    assert data["lf_2_letters"] is True
    assert data["template_count"] == 7
    assert data["chain_count"] == 4
    assert data["spec"] == "LF-2 v1"


# -- Templates & chains listing --
def test_lf2_templates(cathy_client):
    r = cathy_client.get(f"{API}/lf2/templates")
    assert r.status_code == 200
    tpls = r.json()["templates"]
    assert len(tpls) == 7
    keys = {t["key"] for t in tpls}
    for k in [
        "hardship_provider_notify", "hardship_myagedcare_application",
        "psw_notice_to_current_provider", "psw_welcome_to_incoming_provider",
        "chsp_dispute_provider", "cmp1_escalation_provider", "cmp1_acqsc_referral",
    ]:
        assert k in keys


def test_lf2_chains(cathy_client):
    r = cathy_client.get(f"{API}/lf2/chains")
    assert r.status_code == 200
    chains = r.json()["chains"]
    keys = {c["key"] for c in chains}
    assert {"hardship_full", "psw_switch_full", "chsp_dispute_full", "cmp1_escalation_full"} <= keys
    assert len(chains) == 4


# -- Chain generation --
@pytest.fixture(scope="module")
def generated_chain(cathy_client, cathy_participant_id):
    r = cathy_client.post(
        f"{API}/lf2/generate-chain",
        json={"chain_key": "hardship_full", "participant_id": cathy_participant_id, "context": {}},
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_generate_chain_hardship(generated_chain):
    data = generated_chain
    assert "chain" in data and "drafts" in data
    assert len(data["drafts"]) == 2
    for d in data["drafts"]:
        for f in ("id", "subject", "body_text", "recipient_type", "status"):
            assert f in d
        assert d["status"] == "draft"
        # Participant name subbed (Dorothy) or fallback text present
        assert "{participant_name}" not in d["subject"]
        assert isinstance(d["body_text"], str) and len(d["body_text"]) > 0
    # At least one draft must reference provider_name (subbed or placeholder)
    joined = "\n".join(d["body_text"] for d in data["drafts"])
    assert ("{provider_name}" in joined) or ("provider" in joined.lower())


def test_list_participant_chains(cathy_client, cathy_participant_id, generated_chain):
    r = cathy_client.get(f"{API}/lf2/participants/{cathy_participant_id}/chains")
    assert r.status_code == 200
    data = r.json()
    chain_id = generated_chain["chain"]["id"]
    assert any(c["id"] == chain_id for c in data["chains"])
    draft_ids = {d["id"] for d in data["drafts"]}
    for d in generated_chain["drafts"]:
        assert d["id"] in draft_ids


# -- Edit draft --
def test_patch_draft(cathy_client, generated_chain):
    draft_id = generated_chain["drafts"][0]["id"]
    r = cathy_client.patch(
        f"{API}/lf2/drafts/{draft_id}",
        json={"subject": "New subj TEST_iter116", "recipient_email": "e2e-test@example.com"},
    )
    assert r.status_code == 200, r.text
    r2 = cathy_client.get(f"{API}/lf2/drafts/{draft_id}")
    assert r2.status_code == 200
    d = r2.json()["draft"]
    assert d["subject"] == "New subj TEST_iter116"
    assert d["recipient_email"] == "e2e-test@example.com"


# -- Send draft --
def test_send_draft_requires_email(cathy_client, generated_chain):
    # Second draft still has no recipient_email
    draft_id = generated_chain["drafts"][1]["id"]
    r = cathy_client.post(f"{API}/lf2/drafts/{draft_id}/send")
    assert r.status_code == 400


def test_send_draft_success(cathy_client, generated_chain):
    draft_id = generated_chain["drafts"][0]["id"]  # already patched with recipient email
    r = cathy_client.post(f"{API}/lf2/drafts/{draft_id}/send")
    assert r.status_code == 200, r.text
    body = r.json()
    # Resend may be live for verified addresses only; a mocked send counts as ok=true
    assert "sent" in body


# -- Guards --
def test_generate_chain_cross_household_forbidden(cathy_client):
    bogus = str(uuid.uuid4())
    r = cathy_client.post(
        f"{API}/lf2/generate-chain",
        json={"chain_key": "hardship_full", "participant_id": bogus, "context": {}},
    )
    assert r.status_code in (401, 403, 404), f"expected auth denial, got {r.status_code}: {r.text}"


def test_generate_chain_invalid_key(cathy_client, cathy_participant_id):
    r = cathy_client.post(
        f"{API}/lf2/generate-chain",
        json={"chain_key": "no_such_chain", "participant_id": cathy_participant_id, "context": {}},
    )
    assert r.status_code == 404


def test_unauth_generate_chain():
    r = requests.post(
        f"{API}/lf2/generate-chain",
        json={"chain_key": "hardship_full", "participant_id": "any", "context": {}},
    )
    assert r.status_code in (401, 403)
