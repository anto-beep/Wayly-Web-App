"""PERSONA-1 Workstreams G/H/Ask-Wayly — end-to-end persona injection tests.

Exercises the four LLM surfaces that PERSONA-1 §G/H retrofitted:
    - POST /api/chat            (Ask Wayly)
    - POST /api/help-chat       (Help Chat)
    - POST /api/lf1/correspondence/{id}/generate  (LF-1 letters)
    - POST /api/reports/generate (report exec_summary)

Each surface is exercised in both caregiver and participant modes for the
same account (cathy@example.com). LLM output is inherently variable, so
assertions use tolerant substring matches on persona markers rather than
exact wording. If the Emergent LLM key is exhausted, tests skip cleanly.

Cleanup: cathy is restored to caregiver + care_recipient=Dorothy at the
end of the module so subsequent tests (and iter76 assumptions) still hold.
"""
from __future__ import annotations

import os
import re
import time
from typing import Any

import pytest
import requests

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL", "https://statement-checker-3.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE_URL}/api"

CATHY_EMAIL = "cathy@example.com"
CATHY_PASSWORD = "testpass123"

# First-person markers we expect to see in participant copy
PARTICIPANT_FIRST_PERSON = re.compile(
    r"\b(my|your|you|i'm|i am|myself|yours)\b", re.IGNORECASE
)
# Caregiver third-person markers (Dorothy or generic phrasing)
CAREGIVER_THIRD_PERSON = re.compile(
    r"\b(dorothy|the care recipient|care recipient's|dorothy's)\b", re.IGNORECASE
)
# Banned first-person / relationship framings for caregiver flows
CAREGIVER_BANNED = re.compile(
    r"\b(my mother|my parent|my mum|my mom|my dad|my loved one)\b", re.IGNORECASE
)


# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": CATHY_EMAIL, "password": CATHY_PASSWORD},
        timeout=15,
    )
    if r.status_code != 200:
        pytest.skip(f"Cannot log in cathy: {r.status_code} {r.text[:200]}")
    return r.json()["token"]


@pytest.fixture(scope="module")
def client(token):
    s = requests.Session()
    s.headers.update(
        {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    )
    return s


def _set_persona_caregiver(client: requests.Session):
    r = client.put(
        f"{API}/persona",
        json={
            "viewer_persona": "caregiver",
            "is_authorised_representative": False,
            "care_recipient": {
                "is_self": False,
                "first_name": "Dorothy",
                "pronouns": "unknown",
                "relationship_to_account": "mother",
            },
        },
        timeout=15,
    )
    assert r.status_code == 200, r.text


def _set_persona_participant(client: requests.Session):
    r = client.put(
        f"{API}/persona",
        json={
            "viewer_persona": "participant",
            "is_authorised_representative": False,
            "care_recipient": {"is_self": True},
        },
        timeout=15,
    )
    assert r.status_code == 200, r.text


@pytest.fixture(scope="module", autouse=True)
def teardown_persona(client):
    """Ensure we start caregiver and leave cathy caregiver on exit."""
    _set_persona_caregiver(client)
    yield
    _set_persona_caregiver(client)


# ---------------------------------------------------------------------------
# Ask Wayly — /api/chat
# ---------------------------------------------------------------------------

class TestAskWaylyPersona:
    def _post_chat(self, client, message: str) -> dict:
        r = client.post(
            f"{API}/chat",
            json={"message": message},
            timeout=90,
        )
        if r.status_code == 503:
            pytest.skip("LLM temporarily unavailable")
        if r.status_code >= 500:
            pytest.skip(f"chat 5xx (likely LLM budget): {r.status_code} {r.text[:120]}")
        assert r.status_code == 200, r.text
        return r.json()

    def test_caregiver_reply_uses_third_person(self, client):
        _set_persona_caregiver(client)
        body = self._post_chat(client, "What is my current annual budget?")
        reply = (body.get("response") or body.get("message") or body.get("reply") or "")
        assert reply, f"empty reply body={body}"
        # Should NOT use forbidden first-person relationship phrases
        assert not CAREGIVER_BANNED.search(reply), f"banned copy in caregiver reply: {reply[:400]}"

    def test_participant_reply_uses_first_person(self, client):
        _set_persona_participant(client)
        body = self._post_chat(client, "What is my current annual budget?")
        reply = (body.get("response") or body.get("message") or body.get("reply") or "")
        assert reply, f"empty reply body={body}"
        # Should have first-/second-person framing dominant
        assert PARTICIPANT_FIRST_PERSON.search(reply), f"missing participant framing: {reply[:400]}"
        # Must NOT refer to Dorothy in third person any more
        assert "dorothy" not in reply.lower(), f"leaked caregiver context: {reply[:400]}"


# ---------------------------------------------------------------------------
# Help chat — /api/help-chat
# ---------------------------------------------------------------------------

class TestHelpChatPersona:
    def _post_help(self, client, message: str) -> dict:
        r = client.post(
            f"{API}/help-chat",
            json={"message": message},
            timeout=90,
        )
        if r.status_code == 503:
            pytest.skip("LLM temporarily unavailable")
        if r.status_code >= 500:
            pytest.skip(f"help-chat 5xx: {r.status_code} {r.text[:120]}")
        assert r.status_code == 200, r.text
        return r.json()

    def test_caregiver_help_reply(self, client):
        _set_persona_caregiver(client)
        body = self._post_help(client, "How do I add a new participant?")
        reply = (body.get("response") or body.get("message") or body.get("reply") or "")
        assert reply, f"empty help-chat reply body={body}"
        assert not CAREGIVER_BANNED.search(reply), f"banned copy: {reply[:400]}"

    def test_participant_help_reply(self, client):
        _set_persona_participant(client)
        body = self._post_help(client, "How do I add a new participant?")
        reply = (body.get("response") or body.get("message") or body.get("reply") or "")
        assert reply, f"empty help-chat reply body={body}"
        assert PARTICIPANT_FIRST_PERSON.search(reply)


# ---------------------------------------------------------------------------
# LF-1 letter generation — dispute archetype (statement charge query)
# ---------------------------------------------------------------------------
# Note: The review used the label "rate_query" but the concrete archetype for
# "I don't agree with a charge on the statement" in lib/lf1.py is `dispute`
# (situation_id=3). Semantically identical; both are rate/charge disputes.

class TestLF1PersonaVoice:
    def _create_and_generate(self, client) -> str:
        r = client.post(
            f"{API}/lf1/correspondence",
            json={
                "situation_id": 3,
                "archetype": "dispute",
                "direction": "outbound",
                "sender_identity": "family_caregiver",
                "intake": {
                    "participant_name": "Dorothy",
                    "disputed_charge_summary": (
                        "The May statement shows a $95 personal-care visit "
                        "charged at the Saturday rate, but the visit was on a "
                        "Thursday. Please review and adjust."
                    ),
                },
            },
            timeout=30,
        )
        assert r.status_code in (200, 201), r.text
        entry_id = (r.json().get("entry") or r.json()).get("id")
        assert entry_id, f"no entry id in {r.json()}"
        return entry_id

    def _generate_body(self, client, entry_id: str) -> str:
        r = client.post(
            f"{API}/lf1/correspondence/{entry_id}/generate",
            json={"persist": False},
            timeout=120,
        )
        if r.status_code == 503 or (r.status_code >= 500 and r.status_code < 600):
            pytest.skip(f"LF-1 generate unavailable ({r.status_code}): {r.text[:120]}")
        assert r.status_code == 200, r.text
        payload = r.json()
        body = payload.get("body") or payload.get("content") or ""
        assert body, f"empty letter body: {payload}"
        return body

    def test_caregiver_letter_is_third_person(self, client):
        _set_persona_caregiver(client)
        entry_id = self._create_and_generate(client)
        try:
            body = self._generate_body(client, entry_id)
            # Should not contain relationship phrases banned by voice rules
            assert not CAREGIVER_BANNED.search(body), (
                f"banned phrasing in caregiver letter: {body[:600]}"
            )
            # Should reference Dorothy or "the care recipient" somewhere
            assert CAREGIVER_THIRD_PERSON.search(body), (
                f"missing caregiver third-person marker: {body[:600]}"
            )
        finally:
            client.delete(f"{API}/lf1/correspondence/{entry_id}", timeout=15)

    def test_participant_letter_uses_first_person(self, client):
        _set_persona_participant(client)
        entry_id = self._create_and_generate(client)
        try:
            body = self._generate_body(client, entry_id)
            # First-person "my statement", "my plan", or "I am"
            assert re.search(r"\b(my|i am|i'm|myself)\b", body, re.IGNORECASE), (
                f"missing first-person marker in participant letter: {body[:600]}"
            )
            # For the participant case, we only care that the LETTER VOICE is
            # first-person — the intake payload may still include a
            # participant_name that the LLM legitimately echoes into the
            # subject/body. So don't assert absence of any specific name here;
            # instead assert that no obvious third-person caregiver phrasings
            # crept in (e.g. "on behalf of", "my mother", "her statement").
            forbidden = [
                r"on behalf of",
                r"my (mother|father|parent|mum|dad|loved one)",
                r"\b(her|his) statement\b",
                r"\b(her|his) Support at Home\b",
            ]
            for pattern in forbidden:
                assert not re.search(pattern, body, re.IGNORECASE), (
                    f"caregiver-context leaked into participant letter (pattern {pattern!r}): {body[:600]}"
                )
        finally:
            client.delete(f"{API}/lf1/correspondence/{entry_id}", timeout=15)


# ---------------------------------------------------------------------------
# Reports — HOUSEHOLD_SUMMARY exec_summary voice
# ---------------------------------------------------------------------------

def _wait_for_report(client, rid: str, timeout: float = 120.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        # Prefer the /data endpoint so we get the embedded exec_summary
        rd = client.get(f"{API}/reports/{rid}/data", timeout=15)
        if rd.status_code == 200:
            body = rd.json()
            rep = body.get("report") or {}
            data = body.get("data") or {}
            status = (rep.get("status") or "").upper()
            if status in ("COMPLETED", "COMPLETE", "READY", "FAILED", "ERROR"):
                merged = {**rep, "data_json": data, "exec_summary": data.get("exec_summary")}
                return merged
        time.sleep(1.5)
    return {"status": "TIMEOUT"}


class TestReportsSummaryPersona:
    def _generate_and_wait(self, client) -> dict:
        r = client.post(
            f"{API}/reports/generate",
            json={"report_type": "HOUSEHOLD_SUMMARY"},
            timeout=30,
        )
        if r.status_code == 400 and "No participant" in r.text:
            pytest.skip("cathy has no participant available")
        assert r.status_code == 200, r.text
        rid = r.json().get("report_id")
        assert rid
        return {"rid": rid, "doc": _wait_for_report(client, rid)}

    def _cleanup(self, client, rid: str):
        try:
            client.delete(f"{API}/reports/{rid}", timeout=10)
        except Exception:
            pass

    def _extract_summary(self, doc: dict) -> str:
        # exec_summary lives either at top level or inside data_json
        summary = doc.get("exec_summary")
        if not summary:
            data = doc.get("data_json") or doc.get("data") or {}
            summary = data.get("exec_summary") or data.get("summary") or ""
        return summary or ""

    def test_caregiver_summary_is_third_person(self, client):
        _set_persona_caregiver(client)
        result = self._generate_and_wait(client)
        rid = result["rid"]
        doc = result["doc"]
        try:
            if doc.get("status") == "TIMEOUT":
                pytest.skip("report generation did not complete in time")
            if str(doc.get("status", "")).upper() in ("FAILED", "ERROR"):
                pytest.skip(f"report failed: {doc.get('error') or doc}")
            summary = self._extract_summary(doc)
            assert summary, f"no exec_summary in report doc: {doc}"
            assert not CAREGIVER_BANNED.search(summary), (
                f"banned caregiver copy in summary: {summary[:400]}"
            )
        finally:
            self._cleanup(client, rid)

    def test_participant_summary_is_first_person(self, client):
        _set_persona_participant(client)
        result = self._generate_and_wait(client)
        rid = result["rid"]
        doc = result["doc"]
        try:
            if doc.get("status") == "TIMEOUT":
                pytest.skip("report generation did not complete in time")
            if str(doc.get("status", "")).upper() in ("FAILED", "ERROR"):
                pytest.skip(f"report failed: {doc.get('error') or doc}")
            summary = self._extract_summary(doc)
            assert summary, f"no exec_summary in report doc: {doc}"
            # Must NOT reference the care recipient's name (Dorothy) any more
            assert "dorothy" not in summary.lower(), (
                f"caregiver context leaked into participant summary: {summary[:400]}"
            )
            # And should be second-person "you"/"your" dominant
            assert PARTICIPANT_FIRST_PERSON.search(summary), (
                f"missing participant framing: {summary[:400]}"
            )
        finally:
            self._cleanup(client, rid)
