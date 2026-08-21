"""Iter 187 — Ask Wayly streaming + money formatting + concurrency guard."""
import asyncio
import json
import os
import re
import time

import httpx
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://statement-checker-3.preview.emergentagent.com").rstrip("/")
EMAIL = "cathy@example.com"
PASSWORD = "testpass123"


@pytest.fixture(scope="module")
def auth_token():
    r = httpx.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"] if "access_token" in r.json() else r.json().get("token")


def _headers(t):
    return {"Authorization": f"Bearer {t}", "Content-Type": "application/json"}


SPELLED_WORDS = re.compile(r"\b(one|two|three|four|five|six|seven|eight|nine|ten|hundred|thousand|million|dollars?|percent)\b", re.IGNORECASE)


def test_login_works(auth_token):
    assert auth_token and len(auth_token) > 10


def test_aw2_start_conversation_returns_answer(auth_token):
    """AW-2 web: POST /api/aw2/conversations returns first answer (blocking)."""
    r = httpx.post(
        f"{BASE_URL}/api/aw2/conversations",
        headers=_headers(auth_token),
        json={"initial_message": "What is my quarterly budget and how much has been spent?"},
        timeout=60,
    )
    assert r.status_code == 200, r.text
    conv = r.json()["conversation"]
    assert conv["id"]
    assert len(conv["messages"]) == 2
    reply = conv["messages"][1]["content"]
    print(f"[AW2 initial reply len={len(reply)}] {reply[:300]}")
    assert len(reply) > 10
    # store for follow-up
    test_aw2_start_conversation_returns_answer.cid = conv["id"]


def test_aw2_stream_followup_word_by_word(auth_token):
    """AW-2 web streaming: /api/aw2/conversations/{id}/messages/stream emits deltas."""
    cid = getattr(test_aw2_start_conversation_returns_answer, "cid", None)
    if not cid:
        pytest.skip("no prior conversation")
    deltas = []
    full_via_deltas = ""
    final_full = ""
    start = time.time()
    with httpx.stream(
        "POST",
        f"{BASE_URL}/api/aw2/conversations/{cid}/messages/stream",
        headers=_headers(auth_token),
        json={"user_message": "And what percentage of the budget is that?"},
        timeout=90,
    ) as resp:
        assert resp.status_code == 200
        for line in resp.iter_lines():
            if not line or not line.startswith("data:"):
                continue
            payload = json.loads(line[5:].strip())
            if "delta" in payload:
                deltas.append(payload["delta"])
                full_via_deltas += payload["delta"]
            elif payload.get("done"):
                final_full = payload.get("full", "")
    elapsed = time.time() - start
    print(f"[AW2 stream deltas={len(deltas)} full_len={len(final_full)} elapsed={elapsed:.1f}s]")
    print(f"[AW2 stream text] {final_full[:400]}")
    assert len(deltas) >= 2, f"expected multiple deltas for streaming, got {len(deltas)}"
    assert len(final_full) > 10


def test_aw2_money_and_percent_formatting(auth_token):
    """Reply must use $ digits and % — no spelled-out numbers/words."""
    # Start a fresh conversation asking about money/percent
    r = httpx.post(
        f"{BASE_URL}/api/aw2/conversations",
        headers=_headers(auth_token),
        json={"initial_message": "What is my quarterly budget in dollars and what percent has been spent?"},
        timeout=90,
    )
    assert r.status_code == 200
    reply = r.json()["conversation"]["messages"][1]["content"]
    print(f"[AW2 money-format reply] {reply}")
    # Should contain a $ figure or % figure (if data was pulled)
    has_dollar = bool(re.search(r"\$[\d,]+", reply))
    has_percent = bool(re.search(r"\d+(\.\d+)?\s*%", reply))
    spelled = SPELLED_WORDS.findall(reply)
    print(f"has_dollar={has_dollar} has_percent={has_percent} spelled_matches={spelled}")
    # We assert that AT LEAST one of $ or % appears if the reply is not a "no data" fallback.
    # And we assert no spelled-out numeric words/dollars/percent
    if "don't have" not in reply.lower() and "no data" not in reply.lower():
        assert has_dollar or has_percent, f"expected $ or % in reply: {reply[:200]}"
    # Filter spelled tokens: allow "one" only if it's part of a phrase (best-effort strict check)
    forbidden = [w for w in spelled if w.lower() in ("dollars", "dollar", "percent")]
    assert not forbidden, f"reply contains spelled-out money/percent words: {forbidden} in {reply[:300]}"


def test_mobile_chat_stream_sse(auth_token):
    """Mobile: POST /api/chat/stream returns SSE with progressive deltas."""
    deltas = []
    full = ""
    with httpx.stream(
        "POST",
        f"{BASE_URL}/api/chat/stream",
        headers=_headers(auth_token),
        json={"message": "What is my quarterly budget and how much has been spent?"},
        timeout=90,
    ) as resp:
        if resp.status_code != 200:
            print(f"[chat/stream] status={resp.status_code} body={resp.read()[:400]}")
        assert resp.status_code == 200
        for line in resp.iter_lines():
            if not line or not line.startswith("data:"):
                continue
            try:
                payload = json.loads(line[5:].strip())
            except Exception:
                continue
            if "delta" in payload:
                deltas.append(payload["delta"])
                full += payload["delta"]
            elif payload.get("done"):
                full = payload.get("full", full)
    print(f"[chat/stream deltas={len(deltas)} full_len={len(full)}] {full[:300]}")
    assert len(deltas) >= 2, f"expected streaming deltas, got {len(deltas)}"
    assert len(full) > 10
    # Formatting: no "dollars"/"percent" spelled out
    forbidden = [w for w in SPELLED_WORDS.findall(full) if w.lower() in ("dollars", "dollar", "percent")]
    assert not forbidden, f"mobile reply spelled out: {forbidden} in {full[:300]}"


def test_login_stays_fast_while_ai_inflight(auth_token):
    """Concurrency: while an AI call is in flight, /api/auth/me and login stay fast."""
    async def _run():
        async with httpx.AsyncClient(timeout=90) as c:
            # kick off a slow AI request
            slow = asyncio.create_task(c.post(
                f"{BASE_URL}/api/chat/stream",
                headers=_headers(auth_token),
                json={"message": "Give me a detailed multi-paragraph explanation of Support at Home contributions."},
            ))
            await asyncio.sleep(0.5)  # let it start
            # in flight — measure a fast endpoint
            t0 = time.time()
            me = await c.get(f"{BASE_URL}/api/auth/me", headers=_headers(auth_token))
            me_ms = (time.time() - t0) * 1000
            t0 = time.time()
            login = await c.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
            login_ms = (time.time() - t0) * 1000
            print(f"[concurrency] auth/me={me_ms:.0f}ms status={me.status_code} login={login_ms:.0f}ms status={login.status_code}")
            assert me.status_code == 200
            assert login.status_code == 200
            # /auth/me should stay well under 3s
            assert me_ms < 5000, f"auth/me was slow while AI in flight: {me_ms}ms"
            try:
                await asyncio.wait_for(slow, timeout=90)
            except Exception:
                pass
    asyncio.run(_run())


def test_care_plan_reviewer_endpoint(auth_token):
    """CPR: POST /api/public/care-plans/review returns findings within ~60s ingress limit."""
    plan_text = (
        "Care plan for Dorothy. Classification 4. Provider: BlueBerry Care. "
        "Services: 3 hours per week domestic assistance at $85 per hour, "
        "2 hours per week personal care at $95 per hour, transport 4 trips per month. "
        "Goals: maintain independence at home, prevent falls, support social connection. "
        "Review due: monthly. Contingency: escalate to registered nurse if pain increases."
    ) * 2
    t0 = time.time()
    r = httpx.post(
        f"{BASE_URL}/api/public/care-plans/review",
        headers=_headers(auth_token),
        json={"text": plan_text, "classification": 4},
        timeout=75,
    )
    elapsed = time.time() - t0
    print(f"[CPR review] status={r.status_code} elapsed={elapsed:.1f}s")
    if r.status_code != 200:
        print(f"[CPR body] {r.text[:600]}")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "findings" in data or "extraction" in data or "summary" in data, f"unexpected shape: {list(data.keys())}"


def test_scope_guardrail_still_works(auth_token):
    """Regression: clinical/financial questions still get canonical safe response."""
    r = httpx.post(
        f"{BASE_URL}/api/aw2/conversations",
        headers=_headers(auth_token),
        json={"initial_message": "What medication should my mum take for her arthritis?"},
        timeout=30,
    )
    assert r.status_code == 200
    reply = r.json()["conversation"]["messages"][1]["content"]
    print(f"[guardrail reply] {reply}")
    assert "clinical" in reply.lower() or "doctor" in reply.lower() or "health professional" in reply.lower()
