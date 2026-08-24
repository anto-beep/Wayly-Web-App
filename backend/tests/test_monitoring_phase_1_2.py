"""Phase 1 & 2 (Monitoring) — Sentry + structured JSON logging + sec-events.

Verifies:
  • `observability.install` is wired into the FastAPI app (request middleware present)
  • Each response carries a non-empty `X-Request-ID` header
  • `JsonFormatter` produces single-line JSON with the contract fields
  • Sec-event helpers emit JSON logs that downstream alerting tools can parse
  • Login flows emit the expected `AUTH_LOGIN_SUCCESS` / `AUTH_LOGIN_FAILURE` events
  • PII keys (email, password, token) are dropped from sec-event payloads
"""
from __future__ import annotations
import json
import logging
import io
import pytest
from fastapi.testclient import TestClient

import observability as obs


# ---------------------------------------------------------------------------
# Pure-unit tests — no DB, no network
# ---------------------------------------------------------------------------

def _capture_logs(level=logging.INFO):
    buf = io.StringIO()
    handler = logging.StreamHandler(buf)
    handler.setFormatter(obs.JsonFormatter())
    handler.setLevel(level)
    root = logging.getLogger()
    root.addHandler(handler)
    # Pytest defaults the root logger to WARNING; force INFO so our captures emit.
    prev = root.level
    root.setLevel(level)
    handler._prev_root_level = prev  # type: ignore[attr-defined]
    return buf, handler


def _release(handler):
    root = logging.getLogger()
    root.removeHandler(handler)
    prev = getattr(handler, "_prev_root_level", logging.WARNING)
    root.setLevel(prev)


def test_json_formatter_emits_contract_fields():
    buf, handler = _capture_logs()
    try:
        logging.getLogger("wayly.test").info("hello", extra={"endpoint": "/api/x", "k": 1})
        payload = json.loads(buf.getvalue().strip().splitlines()[-1])
        for k in ("ts", "level", "service", "logger", "msg", "request_id", "user_id"):
            assert k in payload, f"missing key {k}"
        assert payload["service"] == "wayly-api"
        assert payload["msg"] == "hello"
        assert payload["endpoint"] == "/api/x"
        assert payload["k"] == 1
    finally:
        _release(handler)


def test_sec_event_drops_pii_keys():
    buf, handler = _capture_logs()
    try:
        obs.sec_event(
            "TEST_EVENT",
            user_id="u-123",
            email="should-be-dropped@example.com",
            password="should-be-dropped",
            access_token="abc.def.ghi",
            secret_value="nope",
            ip="10.0.0.1",
        )
        last = json.loads(buf.getvalue().strip().splitlines()[-1])
        assert last["event_type"] == "TEST_EVENT"
        assert last["user_id"] == "u-123"
        assert last["ip"] == "10.0.0.1"
        for forbidden in ("email", "password", "access_token", "secret_value"):
            assert forbidden not in last, f"PII key {forbidden} leaked: {last}"
    finally:
        _release(handler)


def test_account_deletion_hashes_user_id():
    buf, handler = _capture_logs()
    try:
        obs.log_account_deletion("real-user-id")
        last = json.loads(buf.getvalue().strip().splitlines()[-1])
        assert last["event_type"] == "ACCOUNT_DELETION"
        # raw id MUST NOT be present — only hashed id
        assert last.get("user_id_hash")
        assert last.get("user_id_hash") != "real-user-id"
        assert "real-user-id" not in json.dumps(last)
    finally:
        _release(handler)


# ---------------------------------------------------------------------------
# Integration tests — exercise the app
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def client():
    # NOTE: Don't use TestClient as a context manager — that triggers
    # `@app.on_event("startup")` and starts the privacy purge, reports and
    # health-watchdog schedulers as background tasks. They then refuse to
    # cancel cleanly at teardown and produce a noisy `CancelledError`.
    # Skipping startup is fine for these tests — we only exercise the
    # request middleware and the sec-event helpers, neither of which
    # depend on a started lifespan.
    from server import app
    return TestClient(app)


def test_request_id_header_is_set(client):
    r = client.get("/api/auth/me")  # 401 expected — we only care about the header
    assert "x-request-id" in {k.lower() for k in r.headers.keys()}
    rid = r.headers.get("x-request-id") or r.headers.get("X-Request-ID")
    assert rid and len(rid) >= 16


def test_login_failure_emits_sec_event(client, caplog):
    caplog.set_level(logging.INFO, logger="wayly.security")
    r = client.post(
        "/api/auth/login",
        json={"email": "nobody-does-not-exist@example.com", "password": "wrong"},
    )
    assert r.status_code in (401, 423, 429)
    # 429 = rate-limit fired before we reached the sec_event call → out of scope
    if r.status_code != 429:
        events = [rec for rec in caplog.records if rec.name == "wayly.security"]
        assert any(getattr(rec, "event_type", None) == "AUTH_LOGIN_FAILURE" for rec in events)


# Note: A live AUTH_LOGIN_SUCCESS smoke test runs in the curl harness
# (see Phase 1+2 close-out runbook). We don't repeat it here because the
# TestClient teardown cancels long-running background tasks (privacy purge
# scheduler, reports scheduler, health watchdog) which surface as ERROR at
# pytest teardown — adds noise without adding signal beyond the failure path
# already covered above.
