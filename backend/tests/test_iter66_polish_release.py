"""
Iteration 66 - Polish release regression tests
Verifies:
1. Text sanitiser tests (already covered separately - re-imported here as sanity check)
2. Statement Decoder LLM output has no em/en dashes
3. LF-1 letter generation has no em/en dashes
"""
import os
import time
import json
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://wayly-rn-build.preview.emergentagent.com").rstrip("/")

EM = "\u2014"
EN = "\u2013"


def _walk_for_dashes(obj, path=""):
    """Recursively find any em/en dashes in a JSON-serialisable object.
    Returns list of (path, offending_snippet)."""
    hits = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            hits.extend(_walk_for_dashes(v, f"{path}.{k}"))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            hits.extend(_walk_for_dashes(v, f"{path}[{i}]"))
    elif isinstance(obj, str):
        if EM in obj or EN in obj:
            # snippet around the dash
            idx = max(obj.find(EM), obj.find(EN))
            start = max(0, idx - 40)
            hits.append((path, obj[start:idx + 60]))
    return hits


# --- Text sanitiser sanity check ---
def test_sanitiser_module_import():
    from lib.text_sanitiser import strip_wayly_dashes, append_tone_rules, WAYLY_TONE_INSTRUCTIONS
    assert strip_wayly_dashes(f"hello{EM}world") == "hello, world"
    assert strip_wayly_dashes(f"7-day trial") == "7-day trial"
    assert "Wayly voice rules" in append_tone_rules("base system")


# --- Statement Decoder LLM output ---
SAMPLE_STATEMENT = (
    "Support at Home statement for Dorothy Thompson\n"
    "Classification 4 - July 2026\n"
    "Personal Care 8h @ $85/hr $680\n"
    "Domestic 4h @ $75/hr $300\n"
    "Nursing 1h @ $150/hr $150\n"
    "Broker service fee $50\n"
    "Total $1180\n"
)


def _submit_and_poll_decode(text=SAMPLE_STATEMENT, max_wait=90, session=None):
    """Kick off a decode job via public endpoint and poll until complete.
    Pass an authenticated session to bypass the 120-day free-use cap."""
    s = session or requests.Session()
    r = s.post(f"{BASE_URL}/api/public/decode-statement-text", json={"text": text}, timeout=30)
    assert r.status_code == 200, f"decode submit failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    if "summary" in body and "anomalies" in body:
        # Synchronous path (fallback)
        return body
    job_id = body.get("job_id")
    assert job_id, f"no job_id in submit response: {body}"
    deadline = time.time() + max_wait
    last = None
    while time.time() < deadline:
        time.sleep(2)
        r = s.get(f"{BASE_URL}/api/public/decode-job/{job_id}", timeout=20)
        if r.status_code != 200:
            continue
        last = r.json()
        status = (last.get("status") or "").lower()
        if status in {"complete", "completed", "done", "success"}:
            return last.get("result") or last
        if status in {"failed", "error"}:
            raise AssertionError(f"decode job failed: {last}")
        if last.get("summary") or last.get("anomalies"):
            return last
    raise AssertionError(f"decode job timed out. last poll: {last}")


def test_decoder_llm_output_no_dashes():
    """Public statement decoder response must contain no em/en dashes.
    Uses trial-user session to bypass the 120-day cooldown."""
    s = _login_as("trial30909@example.com", "TrialPass1!")
    result = _submit_and_poll_decode(session=s)
    hits = _walk_for_dashes(result)
    assert not hits, (
        "Found em/en dashes in decoder response:\n"
        + "\n".join(f"  {p}: ...{snippet}..." for p, snippet in hits[:5])
    )


# --- LF-1 letter generation (needs trial user auth) ---
def _login_as(email, password):
    """Log in and return a requests.Session with the Bearer token attached."""
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=45)
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}: {r.status_code}")
    body = r.json()
    token = body.get("token")
    if not token:
        pytest.skip(f"no token in login response: {list(body.keys())}")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


def test_lf1_letter_generation_no_dashes():
    """LF-1 letter generated for trial user must be dash-free.

    Two-step API:
      1. POST /api/lf1/correspondence  -> creates the entry, returns entry.id
      2. POST /api/lf1/correspondence/{id}/generate -> LLM produces subject+body
    """
    s = _login_as("trial30909@example.com", "TrialPass1!")

    # Step 1: create a change-request correspondence entry (situation 1)
    create = s.post(
        f"{BASE_URL}/api/lf1/correspondence",
        json={
            "situation_id": 1,
            "archetype": "request",
            "direction": "outbound",
            "intake": {
                "participant_name": "Dorothy",
                "change_type": "condition_change",
                "change_summary": (
                    "Since her hospital stay in January Dorothy now needs help with "
                    "showering and uses a walker. We would like a new assessment as soon "
                    "as possible so her home-support hours can be adjusted."
                ),
            },
        },
        timeout=30,
    )
    assert create.status_code == 200, f"create failed: {create.status_code} {create.text[:400]}"
    entry = create.json().get("entry") or {}
    entry_id = entry.get("id")
    assert entry_id, f"no id in create response: {entry}"

    # Step 2: generate the letter
    gen = s.post(
        f"{BASE_URL}/api/lf1/correspondence/{entry_id}/generate",
        json={"persist": True},
        timeout=120,
    )
    if gen.status_code == 502:
        pytest.skip(f"LLM outage on generate: {gen.text[:200]}")
    assert gen.status_code == 200, f"generate failed: {gen.status_code} {gen.text[:400]}"
    resp = gen.json()

    # The generated payload includes subject + body + mac_portal_short_form + cover_note.
    hits = _walk_for_dashes(resp)
    assert not hits, (
        "Found em/en dashes in LF-1 letter response:\n"
        + "\n".join(f"  {p}: ...{snippet}..." for p, snippet in hits[:5])
    )
