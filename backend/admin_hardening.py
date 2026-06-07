"""Phase 8 — Admin hardening.

Five layered controls applied to every `/api/admin/*` request:

  1. Admin URL gate — without a valid `ADMIN_GATE_KEY` header (or admin
     cookie set by the gate endpoint), every admin route returns 404. This
     hides the admin surface from drive-by bot probes.
  2. IP allowlist — if `ADMIN_IP_ALLOWLIST` is set, requests from any other
     IP are 404'd. Empty = no restriction.
  3. New-device email alert — on a successful admin sign-in from a never-
     before-seen IP+UA combination, send the admin an email via Resend.
  4. Immutable audit log — every admin write is appended to
     `admin_audit_log` with a SHA-256 hash of the row + the previous row's
     hash. Any tampering breaks the chain.
  5. Maintenance mode — admin-toggled flag in `system_state` collection;
     when ON, every non-admin request returns 503.
"""
from __future__ import annotations
import os
import hashlib
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Iterable

from fastapi import HTTPException, Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response
from motor.motor_asyncio import AsyncIOMotorClient

log = logging.getLogger("wayly.admin.hardening")

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
_db = _client[os.environ["DB_NAME"]]


# --------------------------------------------------------------------------
# 1.  Admin gate
# --------------------------------------------------------------------------

ADMIN_GATE_KEY = os.environ.get("ADMIN_GATE_KEY")
ADMIN_GATE_COOKIE = "wayly_admin_gate"


def _gate_value_from(request: Request) -> Optional[str]:
    return (
        request.headers.get("x-admin-gate")
        or request.cookies.get(ADMIN_GATE_COOKIE)
        or request.query_params.get("admin_key")
    )


def gate_check(request: Request) -> bool:
    """Return True if the request is allowed to even SEE admin routes.
    When `ADMIN_GATE_KEY` is unset, the gate is open (dev mode)."""
    if not ADMIN_GATE_KEY:
        return True
    return _gate_value_from(request) == ADMIN_GATE_KEY


# --------------------------------------------------------------------------
# 2.  IP allowlist
# --------------------------------------------------------------------------

def _allowlist() -> list[str]:
    raw = os.environ.get("ADMIN_IP_ALLOWLIST", "").strip()
    return [ip.strip() for ip in raw.split(",") if ip.strip()] if raw else []


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    return (request.client.host if request.client else "") or "unknown"


def ip_allowed(request: Request) -> bool:
    allow = _allowlist()
    if not allow:
        return True
    return _client_ip(request) in allow


# --------------------------------------------------------------------------
# 3.  New-device email alert
# --------------------------------------------------------------------------

async def record_admin_signin_and_maybe_alert(
    admin_user: dict, request: Request,
) -> bool:
    """Record (admin_id, ip, ua_hash) and email the admin if the combo is new.
    Returns True if an alert was sent."""
    ip = _client_ip(request)
    ua = (request.headers.get("user-agent") or "")[:255]
    ua_hash = hashlib.sha256(ua.encode("utf-8")).hexdigest()[:16]
    key = {"admin_id": admin_user["id"], "ip": ip, "ua_hash": ua_hash}
    seen = await _db.admin_login_devices.find_one(key, {"_id": 1})
    if seen:
        await _db.admin_login_devices.update_one(
            key, {"$set": {"last_seen_at": datetime.now(timezone.utc).isoformat()}},
        )
        return False
    await _db.admin_login_devices.insert_one({
        **key,
        "ua": ua,
        "first_seen_at": datetime.now(timezone.utc).isoformat(),
        "last_seen_at": datetime.now(timezone.utc).isoformat(),
    })
    # Fire-and-forget email — never block sign-in if Resend is down.
    try:
        from email_service import send_email
        await send_email(
            to=admin_user["email"],
            subject="New device sign-in to your Wayly admin account",
            html=(
                f"<p>Hi {admin_user.get('name') or 'there'},</p>"
                f"<p>We noticed a new device sign-in to your Wayly admin account.</p>"
                f"<ul><li><strong>IP address:</strong> {ip}</li>"
                f"<li><strong>Browser:</strong> {ua[:120]}</li>"
                f"<li><strong>Time:</strong> {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}</li></ul>"
                f"<p>If this was you — you can ignore this email.</p>"
                f"<p>If you don't recognise this sign-in, please reset your password and contact security@wayly.com.au immediately.</p>"
            ),
        )
        return True
    except Exception as e:
        log.warning("admin new-device alert failed: %s", e)
        return False


# --------------------------------------------------------------------------
# 4.  Immutable audit log with hash chain
# --------------------------------------------------------------------------

async def _last_hash() -> str:
    last = await _db.admin_audit_log.find_one(
        sort=[("seq", -1)], projection={"_id": 0, "hash": 1, "seq": 1},
    )
    return (last or {}).get("hash") or "GENESIS"


async def _next_seq() -> int:
    last = await _db.admin_audit_log.find_one(
        sort=[("seq", -1)], projection={"_id": 0, "seq": 1},
    )
    return int((last or {}).get("seq") or 0) + 1


async def append_audit(
    *,
    actor_id: Optional[str],
    action: str,
    target_id: Optional[str] = None,
    target_type: Optional[str] = None,
    ip: Optional[str] = None,
    detail: Optional[dict] = None,
    result: str = "success",
) -> None:
    """Append-only audit row. Each row carries:
      - seq: monotonically increasing integer
      - prev_hash: hash of the previous row (or GENESIS for the first)
      - hash: SHA-256 of (seq + prev_hash + JSON(payload))

    Any tampering with a row breaks the chain at every subsequent row, which
    a `verify_chain()` audit can detect.
    """
    seq = await _next_seq()
    prev = await _last_hash()
    payload = {
        "seq": seq,
        "ts": datetime.now(timezone.utc).isoformat(),
        "actor_id": actor_id,
        "action": action,
        "target_id": target_id,
        "target_type": target_type,
        "ip": ip,
        "result": result,
        "detail": detail or {},
    }
    canonical = json.dumps(payload, sort_keys=True, default=str)
    h = hashlib.sha256((str(seq) + prev + canonical).encode("utf-8")).hexdigest()
    await _db.admin_audit_log.insert_one({**payload, "prev_hash": prev, "hash": h})


async def verify_chain(limit: int = 5000) -> tuple[bool, Optional[int]]:
    """Walk the chain and confirm every hash matches. Returns
    (ok, broken_at_seq_or_None)."""
    prev = "GENESIS"
    cursor = _db.admin_audit_log.find({}, {"_id": 0}).sort("seq", 1).limit(limit)
    async for row in cursor:
        payload = {k: row[k] for k in ("seq","ts","actor_id","action","target_id","target_type","ip","result","detail") if k in row}
        canonical = json.dumps(payload, sort_keys=True, default=str)
        expected = hashlib.sha256((str(row["seq"]) + prev + canonical).encode()).hexdigest()
        if row.get("prev_hash") != prev or row.get("hash") != expected:
            return False, row.get("seq")
        prev = row["hash"]
    return True, None


# --------------------------------------------------------------------------
# 5.  Maintenance mode
# --------------------------------------------------------------------------

async def is_maintenance_on() -> bool:
    doc = await _db.system_state.find_one({"key": "maintenance"}, {"_id": 0, "on": 1})
    return bool((doc or {}).get("on"))


async def set_maintenance(on: bool, *, by: Optional[str] = None) -> None:
    await _db.system_state.update_one(
        {"key": "maintenance"},
        {"$set": {
            "key": "maintenance", "on": bool(on),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "updated_by": by,
        }},
        upsert=True,
    )


# --------------------------------------------------------------------------
# 6.  Middleware that ties controls 1+2+5 together
# --------------------------------------------------------------------------

# Allowlist of admin path prefixes (Phase 8 controls apply to these only).
_ADMIN_PATH_PREFIXES = ("/api/admin", "/api/admin/")

# Paths exempted from maintenance mode (the admin must still be able to flip
# it off, and the health probe must answer).
_MAINTENANCE_EXEMPT = {"/api/health", "/api/admin/maintenance"}


class AdminHardeningMiddleware(BaseHTTPMiddleware):
    """Front-line gate for every admin route + global maintenance switch."""

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        is_admin = any(path.startswith(p) for p in _ADMIN_PATH_PREFIXES)

        if is_admin:
            # 1. Gate
            if not gate_check(request):
                return JSONResponse({"detail": "Not found"}, status_code=404)
            # 2. IP allowlist
            if not ip_allowed(request):
                # Log this — it's a real probe signal.
                log.warning("admin IP denied: %s %s", _client_ip(request), path)
                return JSONResponse({"detail": "Not found"}, status_code=404)
            # 5. Maintenance allowed for the toggle endpoint itself.
        else:
            # 5. Block non-admin traffic during maintenance.
            if path not in _MAINTENANCE_EXEMPT and path.startswith("/api/"):
                try:
                    if await is_maintenance_on():
                        return JSONResponse(
                            {"detail": "Wayly is temporarily offline for scheduled maintenance. Please try again shortly."},
                            status_code=503,
                            headers={"Retry-After": "300"},
                        )
                except Exception:
                    pass  # never let DB blip take everyone offline

        return await call_next(request)


def install(app) -> None:
    app.add_middleware(AdminHardeningMiddleware)
    log.info(
        "admin hardening installed (gate=%s, allowlist=%s)",
        "on" if ADMIN_GATE_KEY else "off",
        ",".join(_allowlist()) or "open",
    )
