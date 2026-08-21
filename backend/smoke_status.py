"""Smoke-test status module.

Wires a tiny external smoke test (run on GitHub Actions every 15 min) into the
Wayly backend so the admin team can see at a glance whether the production
deployment is healthy.

Two endpoints:

  POST  /api/internal/smoke-report   HMAC-signed, called by the CI script.
  GET   /api/admin/smoke-status      Admin-only, returns last 20 runs + summary.

On a failing report, this module sends an email to TEAM_INBOX so the on-call
hears about it before users do.
"""
from __future__ import annotations
import os
import hmac
import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from email_service import _send, _sender, _team_inbox  # type: ignore

log = logging.getLogger("wayly.smoke")

# Lazy refs, injected by server.py via init_smoke_status(db, get_current_admin_id)
_db = None
_get_admin = None


def init_smoke_status(db, get_current_admin_id):
    """Called once from server.py wiring."""
    global _db, _get_admin
    _db = db
    _get_admin = get_current_admin_id


# --------------------------------------------------------------------------
# models
# --------------------------------------------------------------------------
class SmokeStep(BaseModel):
    name: str
    ok: bool
    duration_ms: int = 0
    error: Optional[str] = None


class SmokeReport(BaseModel):
    """Payload sent by the GitHub Actions smoke script."""
    run_id: str
    environment: str = Field(default="production")
    started_at: str
    finished_at: str
    duration_ms: int
    ok: bool
    steps: List[SmokeStep]
    git_sha: Optional[str] = None
    runner: Optional[str] = "github-actions"


# --------------------------------------------------------------------------
# HMAC verification, protects the report endpoint without needing JWT
# --------------------------------------------------------------------------
def _secret() -> str:
    """Shared secret between the CI runner and this backend."""
    return os.environ.get("SMOKE_HMAC_SECRET", "")


def _verify_hmac(raw_body: bytes, header_sig: str) -> bool:
    secret = _secret()
    if not secret or not header_sig:
        return False
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    # constant-time compare
    return hmac.compare_digest(expected, header_sig.strip())


# --------------------------------------------------------------------------
# router
# --------------------------------------------------------------------------
router = APIRouter()


@router.post("/internal/smoke-report")
async def receive_smoke_report(request: Request):
    """Called by the CI smoke script. Auth: HMAC-SHA256 over raw body, sent
    in the `X-Smoke-Signature` header, with the shared SMOKE_HMAC_SECRET."""
    if _db is None:
        raise HTTPException(503, "smoke status not initialised")
    if not _secret():
        raise HTTPException(503, "SMOKE_HMAC_SECRET not configured on backend")

    raw = await request.body()
    sig = request.headers.get("x-smoke-signature", "")
    if not _verify_hmac(raw, sig):
        log.warning("smoke-report rejected: bad HMAC (len=%d, sig=%s…)", len(raw), sig[:8])
        raise HTTPException(401, "invalid signature")

    try:
        report = SmokeReport.model_validate_json(raw)
    except Exception as e:
        raise HTTPException(422, f"invalid payload: {e}")

    doc = report.model_dump()
    doc["received_at"] = datetime.now(timezone.utc).isoformat()

    await _db["smoke_runs"].insert_one(doc)

    # Trim history: keep the last 200 runs (≈ 50h at 15-min cadence).
    cursor = _db["smoke_runs"].find({}, {"_id": 1}).sort("received_at", -1).skip(200)
    old_ids = [d["_id"] async for d in cursor]
    if old_ids:
        await _db["smoke_runs"].delete_many({"_id": {"$in": old_ids}})

    # Alert on failure (and not on every failure, only once per run, which is
    # naturally rate-limited because reports come every 15 min).
    if not report.ok:
        await _alert_on_failure(report)

    return {"ok": True, "run_id": report.run_id}


async def _admin_smoke_status_impl():
    """Plain function, wrapped by attach_router() with admin auth."""
    if _db is None or _get_admin is None:
        raise HTTPException(503, "smoke status not initialised")
    cursor = _db["smoke_runs"].find({}).sort("received_at", -1).limit(20)
    runs: List[Dict[str, Any]] = []
    async for d in cursor:
        d["_id"] = str(d["_id"])
        runs.append(d)

    last = runs[0] if runs else None
    last_ok = next((r for r in runs if r.get("ok")), None)
    last_fail = next((r for r in runs if not r.get("ok")), None)

    # Aggregate: success-rate over the last 24h (assume 15-min cadence ⇒ 96 runs).
    window = runs[:96]
    n = len(window)
    successes = sum(1 for r in window if r.get("ok"))
    pct = round(100.0 * successes / n, 1) if n else None

    return {
        "summary": {
            "last_status": last.get("ok") if last else None,
            "last_run_at": last.get("received_at") if last else None,
            "last_success_at": last_ok.get("received_at") if last_ok else None,
            "last_failure_at": last_fail.get("received_at") if last_fail else None,
            "success_rate_24h_pct": pct,
            "runs_24h": n,
        },
        "runs": runs,
    }


# --------------------------------------------------------------------------
# alerting
# --------------------------------------------------------------------------
async def _alert_on_failure(report: SmokeReport) -> None:
    """Email the team inbox. Logged but never raises (we still want to ack the
    smoke-report 200 so the CI runner does not keep retrying)."""
    failed = [s for s in report.steps if not s.ok]
    rows = "".join(
        f"<tr><td style='padding:6px 12px;color:#A5512B;font-weight:600'>{_esc(s.name)}</td>"
        f"<td style='padding:6px 12px;color:#524B42'>{_esc(s.error or 'unknown error')}</td></tr>"
        for s in failed
    )
    html = f"""<!doctype html>
<html><body style="font-family:Helvetica,Arial,sans-serif;background:#FBF8F3;padding:24px;color:#1C2B2D">
  <table align="center" style="width:600px;max-width:100%;background:#fff;border-radius:12px;border:1px solid #E7E0D5;overflow:hidden">
    <tr><td style="padding:20px 28px;background:#0E4D52;color:#fff">
      <div style="font-family:Georgia,serif;font-size:22px">Wayly · Smoke test failed</div>
      <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;opacity:.8;margin-top:4px">{_esc(report.environment)} · {_esc(report.runner or '')}</div>
    </td></tr>
    <tr><td style="padding:24px 28px">
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6">
        A scheduled smoke run against <strong>{_esc(report.environment)}</strong> failed at
        <strong>{_esc(report.finished_at)}</strong> (duration {report.duration_ms} ms).
      </p>
      <p style="margin:0 0 12px;font-size:13px;color:#524B42">Run id: <code>{_esc(report.run_id)}</code></p>
      <table style="border-collapse:collapse;background:#FBEEE7;border:1px solid #F4D6C5;border-radius:8px;overflow:hidden;width:100%">
        <tr><th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#874021">Step</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#874021">Error</th></tr>
        {rows}
      </table>
      <p style="margin:18px 0 0;font-size:13px;color:#524B42">
        Open the admin dashboard for the full run log:
        <a href="https://wayly.com.au/admin" style="color:#0E4D52;font-weight:600">/admin → smoke status</a>
      </p>
    </td></tr>
    <tr><td style="padding:14px 28px;background:#F4EFE7;color:#8C8275;font-size:11px">
      You received this because you are on the Wayly on-call inbox. Disable by removing TEAM_INBOX from backend env.
    </td></tr>
  </table>
</body></html>"""

    try:
        await _send({
            "from": _sender(),
            "to": [_team_inbox()],
            "subject": f"🚨 Wayly smoke FAILED, {len(failed)} step(s) · {report.environment}",
            "html": html,
        })
    except Exception as e:
        log.warning("smoke alert email failed: %s", e)


def _esc(s: str) -> str:
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


# --------------------------------------------------------------------------
# wiring helper
# --------------------------------------------------------------------------
def attach_router(api_router, db, get_current_admin_id):
    """Wire admin auth onto the GET endpoint, then return the router."""
    init_smoke_status(db, get_current_admin_id)

    @api_router.get("/admin/smoke-status", tags=["admin"])
    async def _authed_smoke_status(_admin_id: str = Depends(get_current_admin_id)):
        return await _admin_smoke_status_impl()

    # POST stays HMAC-only (no JWT) so the CI runner does not need an admin token.
    api_router.include_router(router)
    return api_router
