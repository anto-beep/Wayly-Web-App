"""Health, metrics and status endpoints.

Extracted from ``server.py`` as part of the CSC-1 batch server-split
(February 2026). Route surface is byte-identical to the pre-split code:

- ``GET  /api/``             root ping
- ``GET  /api/metrics``       Prometheus text metrics (token-guarded)
- ``GET  /api/health``        cheap liveness probe (UptimeRobot polls this)
- ``GET  /api/health/deep``   admin-only deep dependency probe
- ``GET  /api/health/clamav`` public clamd readiness probe
- ``GET  /api/status``        public status page data (uptime, versions)

Wire it up with:

    from routes.health import build_health_router
    api.include_router(build_health_router(
        db=db,
        mongo_client=client,
        admin_dep=get_current_admin_id,
        app_started_at=APP_STARTED_AT,
        versions={"build": APP_BUILD_VERSION, ...},
    ))
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response

logger = logging.getLogger("wayly.health.routes")

WAYLY_VERSION = os.environ.get("WAYLY_VERSION", "preview")


# --- Helpers (module-level, dep-free) ---------------------------------------

def _human_uptime(seconds: int) -> str:
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        return f"{seconds // 60}m"
    if seconds < 86400:
        h = seconds // 3600
        m = (seconds % 3600) // 60
        return f"{h}h {m}m" if m else f"{h}h"
    d = seconds // 86400
    h = (seconds % 86400) // 3600
    return f"{d}d {h}h" if h else f"{d}d"


async def _ping_mongo(mongo_client, timeout_s: float = 2.0) -> Dict[str, Any]:
    started = datetime.now(timezone.utc)
    try:
        await asyncio.wait_for(mongo_client.admin.command("ping"), timeout=timeout_s)
        return {"ok": True, "latency_ms": int((datetime.now(timezone.utc) - started).total_seconds() * 1000)}
    except Exception as e:
        return {"ok": False, "error": type(e).__name__}


async def _ping_redis(timeout_s: float = 2.0) -> Dict[str, Any]:
    started = datetime.now(timezone.utc)
    url = os.environ.get("REDIS_URL")
    if not url:
        return {"ok": False, "error": "REDIS_URL not set"}
    try:
        import redis.asyncio as redis_async
        r = redis_async.from_url(url)
        await asyncio.wait_for(r.ping(), timeout=timeout_s)
        try:
            await r.aclose()
        except Exception:
            pass
        return {"ok": True, "latency_ms": int((datetime.now(timezone.utc) - started).total_seconds() * 1000)}
    except Exception as e:
        return {"ok": False, "error": type(e).__name__}


async def _ping_clamav(timeout_s: float = 2.0) -> Dict[str, Any]:
    started = datetime.now(timezone.utc)
    sock = os.environ.get("CLAMD_SOCKET", "/var/run/clamav/clamd.ctl")
    if not os.path.exists(sock):
        return {"ok": False, "error": "clamd socket missing", "skipped": True}
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_unix_connection(sock), timeout=timeout_s
        )
        writer.write(b"nPING\n")
        await writer.drain()
        data = await asyncio.wait_for(reader.readline(), timeout=timeout_s)
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
        ok = b"PONG" in data
        return {"ok": ok, "latency_ms": int((datetime.now(timezone.utc) - started).total_seconds() * 1000)}
    except Exception as e:
        return {"ok": False, "error": type(e).__name__}


def _check_llm_key() -> Dict[str, Any]:
    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not key:
        return {"ok": False, "error": "EMERGENT_LLM_KEY missing"}
    return {
        "ok": key.startswith("sk-emergent-") and len(key) >= 20,
        "prefix": key[:12] + "…" if key else "",
    }


# --- Router factory ---------------------------------------------------------

def build_health_router(
    *,
    db,
    mongo_client,
    admin_dep: Callable,
    app_started_at: datetime,
    versions: Dict[str, str],
) -> APIRouter:
    """Return a fully-wired APIRouter for the health/status surface.

    Uses closure capture (not module globals) so FastAPI can bind
    ``admin_dep`` as a real dependency at route-definition time.
    """
    router = APIRouter(tags=["health"])
    _versions = dict(versions or {})

    @router.get("/")
    async def root():
        return {"service": "wayly", "ok": True}

    @router.get("/metrics")
    async def metrics(request: Request):
        expected = os.environ.get("METRICS_TOKEN")
        if expected:
            provided = request.query_params.get("token") or request.headers.get("X-Metrics-Token")
            if provided != expected:
                raise HTTPException(status_code=403, detail="invalid metrics token")

        lines: list[str] = []

        def _emit(metric: str, labels: dict, value):
            if labels:
                lbl = ",".join(f'{k}="{str(v).replace(chr(34), "")}"' for k, v in labels.items())
                lines.append(f"{metric}{{{lbl}}} {value}")
            else:
                lines.append(f"{metric} {value}")

        try:
            from lib import cache as _cache
            for ns, stats in _cache.get_stats().items():
                for kind, v in stats.items():
                    _emit("wayly_cache_total", {"namespace": ns, "kind": kind}, v)
        except Exception:
            pass

        try:
            from lib import jobs as _jobs
            for handler, stats in _jobs.get_stats().items():
                for kind, v in stats.items():
                    _emit("wayly_jobs_total", {"handler": handler, "kind": kind}, v)
            _emit("wayly_jobs_queue_depth", {}, await _jobs.queue_depth())
        except Exception:
            pass

        try:
            from lib import llm_wrapper as _llm
            for model, stats in _llm.get_stats().items():
                for kind, v in stats.items():
                    _emit("wayly_llm_total", {"model": model, "kind": kind}, v)
        except Exception:
            pass

        uptime = (datetime.now(timezone.utc) - app_started_at).total_seconds()
        _emit("wayly_uptime_seconds", {}, round(uptime, 1))

        body = "\n".join(lines) + "\n"
        return Response(content=body, media_type="text/plain; version=0.0.4")

    @router.get("/health")
    async def health():
        return {
            "status": "ok",
            "ts": datetime.now(timezone.utc).isoformat(),
            "service": "wayly-api",
            "version": WAYLY_VERSION,
        }

    @router.get("/health/deep")
    async def health_deep(user_id: str = Depends(admin_dep)):  # noqa: ARG001
        started = datetime.now(timezone.utc)
        mongo, redis_dep, clamav = await asyncio.gather(
            _ping_mongo(mongo_client), _ping_redis(), _ping_clamav(),
        )
        llm = _check_llm_key()
        uptime_s = int((started - app_started_at).total_seconds())
        all_ok = mongo.get("ok") and redis_dep.get("ok") and llm.get("ok") and (clamav.get("ok") or clamav.get("skipped"))
        return {
            "status": "ok" if all_ok else "degraded",
            "ts": started.isoformat(),
            "service": "wayly-api",
            "version": WAYLY_VERSION,
            "uptime_seconds": uptime_s,
            "uptime_human": _human_uptime(uptime_s),
            "dependencies": {
                "mongo": mongo,
                "redis": redis_dep,
                "clamav": clamav,
                "llm_key": llm,
            },
        }

    @router.get("/health/clamav")
    async def health_clamav():
        from upload_security import clamav_status
        return clamav_status()

    @router.get("/status")
    async def public_status():
        now = datetime.now(timezone.utc)
        uptime_seconds = int((now - app_started_at).total_seconds())

        mongo_ok = True
        try:
            await mongo_client.admin.command("ping")
        except Exception as e:
            logger.warning("Status mongo ping failed: %s", e)
            mongo_ok = False

        last_ingest_iso: Optional[str] = None
        last_ingest_method: Optional[str] = None
        try:
            latest = await db.statements.find_one(
                {},
                {"_id": 0, "uploaded_at": 1, "input_method": 1},
                sort=[("uploaded_at", -1)],
            )
            if latest:
                last_ingest_iso = latest.get("uploaded_at")
                last_ingest_method = latest.get("input_method")
        except Exception as e:
            logger.warning("Status last-ingestion lookup failed: %s", e)

        def _round_bucket(n: int) -> int:
            if n < 10:
                return n
            if n < 100:
                return (n // 10) * 10
            return (n // 100) * 100

        try:
            total_statements = await db.statements.estimated_document_count()
            total_households = await db.households.estimated_document_count()
        except Exception:
            total_statements = 0
            total_households = 0

        llm_key_configured = bool(os.environ.get("EMERGENT_LLM_KEY"))
        resend_configured = bool(os.environ.get("RESEND_API_KEY"))
        stripe_configured = bool(os.environ.get("STRIPE_SECRET_KEY"))

        components = {
            "mongo": "ok" if mongo_ok else "down",
            "llm": "ok" if llm_key_configured else "not_configured",
            "email": "ok" if resend_configured else "not_configured",
            "billing": "ok" if stripe_configured else "not_configured",
        }
        overall = "ok" if mongo_ok and llm_key_configured else ("down" if not mongo_ok else "degraded")

        recent_24h = 0
        try:
            cutoff = (now - timedelta(hours=24)).isoformat()
            recent_24h = await db.statements.count_documents({"uploaded_at": {"$gte": cutoff}})
        except Exception:
            pass

        return {
            "service": "wayly",
            "status": overall,
            "components": components,
            "uptime_seconds": uptime_seconds,
            "uptime_human": _human_uptime(uptime_seconds),
            "last_ingestion_at": last_ingest_iso,
            "last_ingestion_method": last_ingest_method,
            "ingestion_24h": recent_24h,
            "totals": {
                "statements": _round_bucket(total_statements),
                "households": _round_bucket(total_households),
            },
            "versions": {
                "build": _versions.get("build", ""),
                "anomaly_engine": _versions.get("anomaly_engine", ""),
                "document_extract": _versions.get("document_extract", ""),
                "claude_extractor": os.environ.get("KINDRED_EXTRACTOR_MODEL", "claude-haiku-4-5-20251001"),
                "claude_auditor": os.environ.get("KINDRED_AUDITOR_MODEL", "claude-haiku-4-5-20251001"),
                "claude_chat": "claude-sonnet-4-5-20250929",
            },
            "checked_at": now.isoformat(),
        }

    return router
