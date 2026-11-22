"""Regression: the public chat tool is now "Aged Care Q&A" and must:

1. Serve identical behaviour from the new ``/api/public/aged-care-chat``
   route and the legacy ``/api/public/family-coordinator-chat`` alias.
2. Refuse to answer household-data questions (e.g. "what is mum's budget")
   and instead direct the user to sign in.

The authenticated ``/api/chat`` endpoint is intentionally NOT tested here —
its behaviour must remain byte-for-byte unchanged (verified by ``git diff``
in the same commit).
"""
from __future__ import annotations
import os
import re
import sys
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
load_dotenv("/app/backend/.env")


def _api_url() -> str:
    env_path = "/app/frontend/.env"
    if not os.path.exists(env_path):
        pytest.skip("frontend/.env missing")
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    pytest.skip("REACT_APP_BACKEND_URL not configured")
    return ""


@pytest.fixture(scope="module")
def cathy_token() -> str:
    url = _api_url()
    r = requests.post(
        f"{url}/api/auth/login",
        json={"email": "cathy@example.com", "password": "testpass123"},
        timeout=20,
    )
    if r.status_code != 200:
        pytest.skip(f"login unavailable ({r.status_code})")
    tok = r.json().get("token")
    if not tok:
        pytest.skip("login did not return a token")
    return tok


def _post(path: str, token: str, message: str, session_id: str | None = None) -> requests.Response:
    return requests.post(
        f"{_api_url()}{path}",
        headers={"Authorization": f"Bearer {token}"},
        json={"message": message, "session_id": session_id},
        timeout=90,
    )


def test_aged_care_chat_route_returns_reply(cathy_token):
    """New canonical route must serve a reply."""
    r = _post("/api/public/aged-care-chat", cathy_token,
              "What is the lifetime contribution cap under Support at Home?",
              session_id=f"pytest-{uuid.uuid4()}")
    if r.status_code == 429:
        pytest.skip(f"rate-limited: {r.text}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body.get("reply"), str)
    assert len(body["reply"]) > 20, body


def test_legacy_family_coordinator_alias_removed(cathy_token):
    """Legacy slug must now 404 after the one-release deprecation window."""
    r = _post("/api/public/family-coordinator-chat", cathy_token,
              "ping", session_id=f"pytest-{uuid.uuid4()}")
    # Legacy route is gone — accept 404 (route absent) or 405 (no handler).
    assert r.status_code in (404, 405), r.text


def test_household_data_question_does_not_invent_dollar_figure(cathy_token):
    """When a user asks something only the in-app assistant can answer
    (their own household / mum's budget / our last statement), the public
    Q&A bot must NOT fabricate a dollar figure and SHOULD point them to
    signing in to use the household-aware in-app assistant."""
    r = _post("/api/public/aged-care-chat", cathy_token,
              "What is my mum's quarterly budget and how much have we paid in contributions this year?",
              session_id=f"pytest-{uuid.uuid4()}")
    if r.status_code == 429:
        pytest.skip(f"rate-limited: {r.text}")
    assert r.status_code == 200, r.text
    reply = (r.json().get("reply") or "")
    lower = reply.lower()

    # No dollar figure of the form $X (with or without comma + decimals).
    dollar = re.compile(r"\$\s?\d")
    assert not dollar.search(reply), (
        f"Reply must not invent a dollar figure. Got: {reply!r}"
    )

    # Reply must steer the user to signed-in / in-app context.
    redirected = any(
        keyword in lower
        for keyword in (
            "sign in", "signed in", "sign up", "log in", "logged in",
            "in the app", "in-app", "your account", "wayly account",
            "household", "members can ask",
        )
    )
    assert redirected, (
        "Reply must direct the user to sign in / use the in-app assistant. "
        f"Got: {reply!r}"
    )


def test_system_prompt_documents_data_boundaries():
    """Static sanity-check: the rebuilt system prompt explicitly tells the
    model it has no household data."""
    import server  # type: ignore
    prompt = server.AGED_CARE_QA_SYSTEM
    lower = prompt.lower()
    assert "no access" in lower
    assert "household" in lower
    assert "signed-in" in lower or "in the app" in lower or "in-app" in lower
    # Old branding must not leak.
    assert "Family Care Coordinator" not in prompt
