"""Iteration 151 backend tests: Family Wall, Decode-v2 SSE, Register Push.

Covers the new mobile features against the shared backend:
- Family Wall CRUD + reactions (POST/GET/DELETE + react)
- Live Decode SSE stream (POST /api/sd3/statements/{id}/decode-v2/stream)
- Register push endpoint (expected 500 with placeholder EMERGENT_PUSH_KEY)
- Regression: login, participants shape, statements list+detail
"""
import os
import re
import json
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL")
if not BASE_URL:
    # Fall back to backend .env FRONTEND_URL
    BASE_URL = "https://wayly-rn-build.preview.emergentagent.com"
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "cathy@example.com"
PASSWORD = "testpass123"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text[:200]}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in login response: {r.json()}"
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def active_participant_id(session):
    r = session.get(f"{API}/participants", timeout=30)
    assert r.status_code == 200
    body = r.json()
    items = body.get("items") or body.get("participants") or []
    assert items, f"no participants for cathy: {body}"
    return items[0]["id"]


# -------- Regression: participants shape --------
def test_participants_shape(session):
    r = session.get(f"{API}/participants", timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body, f"expected 'items' key, got keys={list(body.keys())}"
    assert isinstance(body["items"], list) and len(body["items"]) >= 1


# -------- Family Wall --------
class TestFamilyWall:
    _created_id = None

    def test_wall_get_posts(self, session, active_participant_id):
        r = session.get(f"{API}/wall/posts?participant_id={active_participant_id}", timeout=30)
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        assert "items" in body and isinstance(body["items"], list)

    def test_wall_create_message(self, session, active_participant_id):
        payload = {
            "participant_id": active_participant_id,
            "kind": "message",
            "body": "TEST_iter151 wall post from backend_test",
        }
        r = session.post(f"{API}/wall/posts", json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text[:200]
        data = r.json()
        pid = data.get("id") or data.get("post", {}).get("id")
        assert pid, f"missing id in create response: {data}"
        TestFamilyWall._created_id = pid

        # Verify persistence via GET
        r2 = session.get(f"{API}/wall/posts?participant_id={active_participant_id}", timeout=30)
        assert r2.status_code == 200
        ids = [p["id"] for p in r2.json()["items"]]
        assert pid in ids, "created post did not appear in list"

    def test_wall_react_toggle(self, session, active_participant_id):
        pid = TestFamilyWall._created_id
        assert pid, "no created post to react to"
        r = session.post(f"{API}/wall/posts/{pid}/react", json={"emoji": "❤️"}, timeout=30)
        assert r.status_code in (200, 201), r.text[:200]
        # Verify reaction present
        r2 = session.get(f"{API}/wall/posts?participant_id={active_participant_id}", timeout=30)
        post = next((p for p in r2.json()["items"] if p["id"] == pid), None)
        assert post is not None
        reactions = post.get("reactions") or {}
        # Emoji count should be >= 1
        assert reactions.get("❤️", 0) >= 1, f"react not persisted, reactions={reactions}"

    def test_wall_delete_post(self, session, active_participant_id):
        pid = TestFamilyWall._created_id
        assert pid
        r = session.delete(f"{API}/wall/posts/{pid}", timeout=30)
        assert r.status_code in (200, 204)
        # Verify removal
        r2 = session.get(f"{API}/wall/posts?participant_id={active_participant_id}", timeout=30)
        ids = [p["id"] for p in r2.json()["items"]]
        assert pid not in ids


# -------- Live Decode SSE --------
def test_decode_v2_stream(session):
    # Pick a statement
    r = session.get(f"{API}/statements", timeout=30)
    assert r.status_code == 200
    lst = r.json()
    if isinstance(lst, dict):
        lst = lst.get("items") or []
    assert lst, "no statements to decode for cathy"
    sid = lst[0]["id"]

    url = f"{API}/sd3/statements/{sid}/decode-v2/stream"
    events = []
    with session.post(url, json={"force_fallback": False}, stream=True, timeout=120) as resp:
        assert resp.status_code == 200, f"SSE endpoint returned {resp.status_code}: {resp.text[:200]}"
        ctype = resp.headers.get("content-type", "")
        assert "event-stream" in ctype or "text/plain" in ctype, f"unexpected content-type: {ctype}"
        for raw in resp.iter_lines(decode_unicode=True):
            if raw is None:
                continue
            if raw.startswith("data:"):
                try:
                    events.append(json.loads(raw[5:].strip()))
                except Exception:
                    pass
            # Stop once we see 'done'
            if events and events[-1].get("event") == "done":
                break

    assert events, "no SSE events received"
    kinds = {e.get("event") for e in events}
    assert "done" in kinds, f"stream did not reach done; kinds={kinds}"
    done = next(e for e in events if e.get("event") == "done")
    assert "line_count" in done and "overall_confidence" in done


# -------- Register push (expected 500 with placeholder key) --------
def test_register_push_placeholder(session):
    payload = {"user_id": "test-user-iter151", "platform": "android", "device_token": "TEST_dummy_token"}
    r = requests.post(f"{API}/register-push", json=payload, timeout=30)
    # With placeholder EMERGENT_PUSH_KEY, backend intentionally returns HTTP 500 per spec.
    # Accept 201 (if a real key gets configured) OR 500 (placeholder / expected pre-deploy).
    assert r.status_code in (201, 500), f"unexpected status {r.status_code}: {r.text[:200]}"
    if r.status_code == 500:
        # Verify it's the specific expected error, not an unrelated 500
        body_txt = r.text.lower()
        assert "emergent_push_key" in body_txt or "push" in body_txt, f"unexpected 500 body: {r.text[:200]}"


# -------- Regression: statements list + detail --------
def test_statements_list_and_detail(session):
    r = session.get(f"{API}/statements", timeout=30)
    assert r.status_code == 200
    lst = r.json()
    if isinstance(lst, dict):
        lst = lst.get("items") or []
    assert isinstance(lst, list) and len(lst) >= 1
    sid = lst[0]["id"]
    r2 = session.get(f"{API}/statements/{sid}", timeout=30)
    assert r2.status_code == 200
    stmt = r2.json()
    assert stmt.get("id") == sid
    assert "filename" in stmt
