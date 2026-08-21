"""Wayly observability, Sentry + structured JSON logging + request IDs +
security event helpers.

Phase 1 (Sentry) and Phase 2 (structured logging) of the monitoring pass.
Wires in via two calls from server.py: `install(app)` and `init_sentry()`.
"""
from __future__ import annotations
import os
import json
import time
import logging
import uuid
from datetime import datetime, timezone
from contextvars import ContextVar
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# ---------------------------------------------------------------------------
# Per-request context
# ---------------------------------------------------------------------------

request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")
user_id_ctx: ContextVar[Optional[str]] = ContextVar("user_id", default=None)


# ---------------------------------------------------------------------------
# Sentry (Phase 1)
# ---------------------------------------------------------------------------

def init_sentry() -> bool:
    """Initialise Sentry if SENTRY_DSN is set. Returns True if active."""
    dsn = os.environ.get("SENTRY_DSN", "").strip()
    if not dsn:
        return False
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
        from sentry_sdk.integrations.logging import LoggingIntegration
        sentry_sdk.init(
            dsn=dsn,
            environment=os.environ.get("SENTRY_ENV", "preview"),
            release=os.environ.get("SENTRY_RELEASE"),
            send_default_pii=False,  # privacy: never PII
            traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.2")),
            integrations=[
                FastApiIntegration(),
                StarletteIntegration(),
                LoggingIntegration(level=logging.INFO, event_level=logging.ERROR),
            ],
        )
        return True
    except Exception as e:
        logging.getLogger("wayly.observability").warning("sentry init failed: %s", e)
        return False


def set_sentry_user(user_id: str) -> None:
    """Attach the user-id (no email/PII) to all subsequent Sentry events."""
    try:
        import sentry_sdk
        sentry_sdk.set_user({"id": user_id})
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Structured JSON logging (Phase 2)
# ---------------------------------------------------------------------------

class JsonFormatter(logging.Formatter):
    """Single-line JSON log records. Always includes request_id + user_id
    from the context vars so every log line can be correlated."""
    def format(self, record: logging.LogRecord) -> str:  # noqa: D401
        payload = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "service": "wayly-api",
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": request_id_ctx.get(),
            "user_id": user_id_ctx.get(),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        # Merge any structured `extra={...}` fields the caller provided.
        for k, v in record.__dict__.items():
            if k in ("args","msg","levelname","levelno","pathname","filename",
                     "module","exc_info","exc_text","stack_info","lineno",
                     "funcName","created","msecs","relativeCreated","thread",
                     "threadName","processName","process","name","message"):
                continue
            try:
                json.dumps(v)
                payload[k] = v
            except Exception:
                payload[k] = repr(v)
        return json.dumps(payload, default=str)


def install_logging() -> None:
    """Replace the root handler with a JSON-formatted stdout handler. Safe to
    call twice, idempotent."""
    root = logging.getLogger()
    for h in list(root.handlers):
        root.removeHandler(h)
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)
    root.setLevel(os.environ.get("LOG_LEVEL", "INFO"))


# ---------------------------------------------------------------------------
# Request ID + automatic request/response logging middleware
# ---------------------------------------------------------------------------

class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Per-request: generate UUID, attach to context, log start + finish,
    return `X-Request-ID` response header."""

    _request_log = logging.getLogger("wayly.request")

    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("x-request-id") or str(uuid.uuid4())
        request_id_ctx.set(rid)
        user_id_ctx.set(None)
        started = time.perf_counter()
        try:
            response: Response = await call_next(request)
        except Exception:
            self._request_log.exception(
                "request_error",
                extra={"endpoint": request.url.path, "method": request.method},
            )
            raise
        duration_ms = int((time.perf_counter() - started) * 1000)
        # Skip noisy health probes from the access log
        if request.url.path not in ("/api/health",):
            self._request_log.info(
                "request",
                extra={
                    "endpoint": request.url.path,
                    "method": request.method,
                    "status": response.status_code,
                    "duration_ms": duration_ms,
                    "ip": (request.client.host if request.client else None),
                },
            )
        response.headers["X-Request-ID"] = rid
        return response


# ---------------------------------------------------------------------------
# Security event taxonomy (Phase 2 §5)
# ---------------------------------------------------------------------------

_sec = logging.getLogger("wayly.security")


def _hash_id(uid: str) -> str:
    """SHA-256 truncated to 16 hex, for password-reset / account-deletion
    events where we want to correlate without retaining the user_id."""
    import hashlib
    return hashlib.sha256((uid or "").encode()).hexdigest()[:16]


def sec_event(event_type: str, **kwargs) -> None:
    """Emit a structured security event. Drops any keys that look PII-ish
    (email, password, token, secret)."""
    safe = {
        k: v for k, v in kwargs.items()
        if not any(s in k.lower() for s in ("email", "password", "token", "secret"))
    }
    _sec.info(event_type, extra={"event_type": event_type, **safe})


# Convenience wrappers matching the taxonomy in the brief
def log_auth_login_success(user_id: str, ip: Optional[str]):       sec_event("AUTH_LOGIN_SUCCESS", user_id=user_id, ip=ip)
def log_auth_login_failure(ip: Optional[str], attempt_count: int): sec_event("AUTH_LOGIN_FAILURE", ip=ip, attempt_count=attempt_count)
def log_auth_lockout(ip: Optional[str], user_id: Optional[str]):   sec_event("AUTH_LOCKOUT", ip=ip, user_id=user_id)
def log_auth_password_reset(user_id: str):                          sec_event("AUTH_PASSWORD_RESET", user_id_hash=_hash_id(user_id))
def log_auth_mfa_enabled(user_id: str):                             sec_event("AUTH_MFA_ENABLED", user_id=user_id)
def log_auth_mfa_failure(user_id: str, ip: Optional[str]):          sec_event("AUTH_MFA_FAILURE", user_id=user_id, ip=ip)
def log_participant_access(user_id: str, household_id: Optional[str], participant_id: str, endpoint: str):
    sec_event("PARTICIPANT_ACCESS", user_id=user_id, household_id=household_id, participant_id=participant_id, endpoint=endpoint)
def log_file_upload(user_id: str, household_id: Optional[str], participant_id: Optional[str], file_type: str, file_size: int, scan_result: str):
    sec_event("FILE_UPLOAD", user_id=user_id, household_id=household_id, participant_id=participant_id, file_type=file_type, file_size=file_size, scan_result=scan_result)
def log_decoder_run(user_id: str, household_id: Optional[str], participant_id: Optional[str], anomaly_count: int, input_tokens: int, output_tokens: int, cost_aud: float, model: str):
    sec_event("DECODER_RUN", user_id=user_id, household_id=household_id, participant_id=participant_id,
              anomaly_count=anomaly_count, input_tokens=input_tokens, output_tokens=output_tokens,
              cost_aud=round(cost_aud, 4), model=model)
def log_subscription_change(user_id: str, old_plan: str, new_plan: str): sec_event("SUBSCRIPTION_CHANGE", user_id=user_id, old_plan=old_plan, new_plan=new_plan)
def log_admin_action(admin_id: str, action_type: str, target_entity: Optional[str]): sec_event("ADMIN_ACTION", admin_id=admin_id, action_type=action_type, target_entity=target_entity)
def log_data_export(user_id: str):                                  sec_event("DATA_EXPORT", user_id=user_id)
def log_account_deletion(user_id: str):                             sec_event("ACCOUNT_DELETION", user_id_hash=_hash_id(user_id))


# ---------------------------------------------------------------------------
# install(), single call from server.py
# ---------------------------------------------------------------------------

def install(app) -> None:
    install_logging()
    if init_sentry():
        logging.getLogger("wayly.observability").info("sentry enabled")
    app.add_middleware(RequestLoggingMiddleware)
    logging.getLogger("wayly.observability").info("observability installed")
