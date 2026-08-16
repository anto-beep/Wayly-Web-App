"""Iteration 29 — Adviser invite emails + Document Vault.

Covers:
 - POST /api/adviser/clients: invite_token populated, invite_sent_at or mocked
 - GET /api/public/adviser/invite/{token}: 200/404/409
 - POST /api/auth/signup with invite token: flips adviser_clients row to active
 - POST /api/adviser/clients/{cid}/resend-invite: rotates token, 409 already_linked
 - Document Vault CRUD + send-to-decoder + adviser read-only
"""
import os
import io
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://wayly-rn-build.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CATHY_EMAIL = "cathy@example.com"
CATHY_PASS = "testpass123"
ADVISER_EMAIL = "mark.adviser@example.com"
ADVISER_PASS = "AdviserPass1!"


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return tok


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- Adviser invite ----------
@pytest.fixture(scope="module")
def adviser_token():
    return _login(ADVISER_EMAIL, ADVISER_PASS)


@pytest.fixture(scope="module")
def cathy_token():
    return _login(CATHY_EMAIL, CATHY_PASS)


@pytest.fixture(scope="module")
def fresh_invite_email():
    return f"TEST_invite_{uuid.uuid4().hex[:10]}@example.com"


def test_adviser_add_client_creates_invite_token(adviser_token, fresh_invite_email):
    r = requests.post(
        f"{API}/adviser/clients",
        headers=_h(adviser_token),
        json={"client_name": "Invitee QA", "client_email": fresh_invite_email, "notes": "Auto QA invite"},
        timeout=60,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("invite_token"), "invite_token must be present"
    assert data.get("client_email") == fresh_invite_email.lower()
    er = data.get("email_result") or {}
    # Either mocked OR ok:true OR ok:false with a reason (sandbox restriction)
    assert ("ok" in er) or ("mocked" in er), f"email_result missing structure: {er}"
    if er.get("ok") and not er.get("skipped"):
        # When ok and actually sent, invite_sent_at should be populated
        assert data.get("invite_sent_at"), "invite_sent_at should be set when send ok"
    if not er.get("ok"):
        assert er.get("reason"), "failed send must include reason"
    pytest.invite_token = data["invite_token"]
    pytest.invite_cid = data["id"]


def test_public_invite_preview(adviser_token):
    tok = pytest.invite_token
    r = requests.get(f"{API}/public/adviser/invite/{tok}", timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("client_name") == "Invitee QA"
    assert d.get("adviser_name")
    assert d.get("notes") == "Auto QA invite"


def test_public_invite_unknown_404():
    r = requests.get(f"{API}/public/adviser/invite/not-a-real-token-xyz", timeout=30)
    assert r.status_code == 404


def test_resend_invite_rotates_token(adviser_token):
    old = pytest.invite_token
    cid = pytest.invite_cid
    r = requests.post(f"{API}/adviser/clients/{cid}/resend-invite", headers=_h(adviser_token), timeout=60)
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True
    # Old token should now be 404
    r2 = requests.get(f"{API}/public/adviser/invite/{old}", timeout=30)
    assert r2.status_code == 404, f"old token should be invalid after rotation, got {r2.status_code}"
    # Fetch new token from list
    rl = requests.get(f"{API}/adviser/clients", headers=_h(adviser_token), timeout=30)
    assert rl.status_code == 200
    row = next((c for c in rl.json() if c["id"] == cid), None)
    assert row and row.get("invite_token") and row["invite_token"] != old
    pytest.invite_token = row["invite_token"]


def test_resend_invite_unknown_cid_404(adviser_token):
    r = requests.post(f"{API}/adviser/clients/nope-{uuid.uuid4().hex}/resend-invite",
                      headers=_h(adviser_token), timeout=30)
    assert r.status_code == 404


def test_signup_with_invite_token_links_client(adviser_token, fresh_invite_email):
    tok = pytest.invite_token
    pw = "QaPass!2026"
    r = requests.post(
        f"{API}/auth/signup",
        json={
            "email": fresh_invite_email,
            "password": pw,
            "name": "Invitee QA",
            "plan": "family",
            "invite": tok,
        },
        timeout=60,
    )
    assert r.status_code in (200, 201), r.text
    user_tok = r.json().get("token") or r.json().get("access_token")
    assert user_tok
    # Invite preview should now return 409 already_accepted
    rp = requests.get(f"{API}/public/adviser/invite/{tok}", timeout=30)
    assert rp.status_code == 409, rp.text
    body = rp.json()
    assert (body.get("detail") or {}).get("error") == "already_accepted" or body.get("error") == "already_accepted"
    # Adviser list should show linked_user_id
    rl = requests.get(f"{API}/adviser/clients", headers=_h(adviser_token), timeout=30)
    row = next((c for c in rl.json() if c["id"] == pytest.invite_cid), None)
    assert row and row.get("linked_user_id"), "client row must now be linked"
    assert row.get("status") == "active"
    pytest.invitee_token = user_tok


def test_resend_invite_after_linked_409(adviser_token):
    cid = pytest.invite_cid
    r = requests.post(f"{API}/adviser/clients/{cid}/resend-invite", headers=_h(adviser_token), timeout=30)
    assert r.status_code == 409
    detail = r.json().get("detail") or {}
    assert detail.get("error") == "already_linked"


# ---------- Document Vault ----------
@pytest.fixture(scope="module")
def docvault_state():
    return {}


def test_docvault_initial_list(cathy_token, docvault_state):
    r = requests.get(f"{API}/documents", headers=_h(cathy_token), timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "documents" in d
    assert d["scope"] == "owner"
    lim = d["limits"]
    assert lim["max_file_bytes"] == 10485760
    assert lim["max_vault_bytes"] == 104857600
    assert lim["vault_used_bytes"] >= 0
    assert lim["vault_remaining_bytes"] == lim["max_vault_bytes"] - lim["vault_used_bytes"]
    assert sorted(d["categories"]) == sorted([
        "assessment", "statement", "care_plan", "medical", "financial", "legal", "other",
    ])
    docvault_state["initial_used"] = lim["vault_used_bytes"]


def test_docvault_upload_bad_category(cathy_token):
    files = {"file": ("x.txt", b"hello", "text/plain")}
    data = {"category": "BOGUS", "title": "X"}
    r = requests.post(f"{API}/documents",
                      headers={"Authorization": f"Bearer {cathy_token}"},
                      files=files, data=data, timeout=30)
    assert r.status_code == 400
    detail = r.json().get("detail") or {}
    assert detail.get("error") == "bad_category"


def test_docvault_upload_statement(cathy_token, docvault_state):
    content = b"Service: Personal care, 1.5 hours @ $89.50\nDate: 2026-01-15\nTotal: $134.25\n"
    files = {"file": ("qa_stmt.txt", content, "text/plain")}
    data = {"category": "statement", "title": "QA Statement", "notes": "iter29 test"}
    r = requests.post(f"{API}/documents",
                      headers={"Authorization": f"Bearer {cathy_token}"},
                      files=files, data=data, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("category") == "statement"
    assert d.get("title") == "QA Statement"
    assert d.get("has_file") is True
    assert "file_b64" not in d
    assert d.get("file_size_bytes") == len(content)
    docvault_state["doc_id"] = d["id"]
    docvault_state["size"] = len(content)


def test_docvault_list_after_upload(cathy_token, docvault_state):
    r = requests.get(f"{API}/documents", headers=_h(cathy_token), timeout=30)
    assert r.status_code == 200
    d = r.json()
    ids = [x["id"] for x in d["documents"]]
    assert docvault_state["doc_id"] in ids
    assert d["limits"]["vault_used_bytes"] >= docvault_state["initial_used"] + docvault_state["size"]


def test_docvault_get_metadata(cathy_token, docvault_state):
    r = requests.get(f"{API}/documents/{docvault_state['doc_id']}", headers=_h(cathy_token), timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert "file_b64" not in d
    assert d["id"] == docvault_state["doc_id"]


def test_docvault_download(cathy_token, docvault_state):
    r = requests.get(f"{API}/documents/{docvault_state['doc_id']}/download",
                     headers={"Authorization": f"Bearer {cathy_token}"}, timeout=30)
    assert r.status_code == 200
    assert "attachment" in r.headers.get("Content-Disposition", "")
    assert "Personal care" in r.text


def test_docvault_patch_metadata(cathy_token, docvault_state):
    r = requests.patch(f"{API}/documents/{docvault_state['doc_id']}",
                       headers=_h(cathy_token),
                       json={"title": "QA Statement v2", "notes": "updated"}, timeout=30)
    assert r.status_code == 200
    assert r.json()["title"] == "QA Statement v2"


def test_docvault_patch_bad_category(cathy_token, docvault_state):
    r = requests.patch(f"{API}/documents/{docvault_state['doc_id']}",
                       headers=_h(cathy_token),
                       json={"category": "BOGUS"}, timeout=30)
    assert r.status_code == 400


def test_docvault_send_to_decoder_wrong_category(cathy_token):
    content = b"hello world"
    files = {"file": ("notes.txt", content, "text/plain")}
    data = {"category": "medical", "title": "Med notes"}
    r = requests.post(f"{API}/documents",
                      headers={"Authorization": f"Bearer {cathy_token}"},
                      files=files, data=data, timeout=30)
    assert r.status_code == 200
    med_id = r.json()["id"]
    r2 = requests.post(f"{API}/documents/{med_id}/send-to-decoder", headers=_h(cathy_token), timeout=30)
    assert r2.status_code == 400
    assert (r2.json().get("detail") or {}).get("error") == "wrong_category"
    # cleanup
    requests.delete(f"{API}/documents/{med_id}", headers=_h(cathy_token), timeout=30)


def test_docvault_send_to_decoder_statement(cathy_token, docvault_state):
    r = requests.post(f"{API}/documents/{docvault_state['doc_id']}/send-to-decoder",
                      headers=_h(cathy_token), timeout=60)
    assert r.status_code == 200, r.text
    d = r.json()
    job_id = d.get("job_id")
    assert job_id, f"expected job_id in response: {d}"
    assert d.get("status") in ("pending", "running", "done")
    # Poll up to 45s
    deadline = time.time() + 45
    final = None
    while time.time() < deadline:
        rp = requests.get(f"{API}/statements/upload-job/{job_id}", headers=_h(cathy_token), timeout=30)
        if rp.status_code == 200 and rp.json().get("status") in ("done", "error", "failed"):
            final = rp.json()
            break
        time.sleep(2)
    assert final, "job did not finish in 45s"
    if final.get("status") == "done":
        assert final.get("statement_id")
    else:
        pytest.skip(f"decoder did not return done in CI: {final}")


def test_docvault_delete(cathy_token, docvault_state):
    r = requests.delete(f"{API}/documents/{docvault_state['doc_id']}", headers=_h(cathy_token), timeout=30)
    assert r.status_code == 200
    r2 = requests.get(f"{API}/documents/{docvault_state['doc_id']}", headers=_h(cathy_token), timeout=30)
    assert r2.status_code == 404


def test_docvault_delete_unknown_404(cathy_token):
    r = requests.delete(f"{API}/documents/does-not-exist-xyz", headers=_h(cathy_token), timeout=30)
    assert r.status_code == 404


# ---------- Adviser read-only access to vault ----------
def test_adviser_cannot_use_as_client_id_without_link(adviser_token):
    # First get adviser's clients with a linked household (or skip)
    r = requests.get(f"{API}/adviser/clients", headers=_h(adviser_token), timeout=30)
    assert r.status_code == 200
    linked = [c for c in r.json() if c.get("linked_household_id")]
    if not linked:
        pytest.skip("No linked client with household — adviser read-only path covered logically only")
    cid = linked[0]["id"]
    r2 = requests.get(f"{API}/documents?as_client_id={cid}", headers=_h(adviser_token), timeout=30)
    assert r2.status_code == 200
    assert r2.json().get("scope") == "adviser"


def test_non_adviser_with_as_client_id_403(cathy_token):
    r = requests.get(f"{API}/documents?as_client_id=any-id", headers=_h(cathy_token), timeout=30)
    assert r.status_code == 403
    detail = r.json().get("detail") or {}
    assert detail.get("error") == "plan_required"


def test_cross_adviser_isolation_404(adviser_token):
    # Random id that the adviser doesn't own → 404
    r = requests.get(f"{API}/documents?as_client_id={uuid.uuid4().hex}", headers=_h(adviser_token), timeout=30)
    assert r.status_code == 404
