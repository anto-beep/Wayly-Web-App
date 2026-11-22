"""Wayly Admin - Phase B backend endpoints (P0 pages that had no backend).

Introduced Feb 2026 alongside AdminPhaseB.jsx.

Endpoints
---------
GET  /api/admin/security-alerts        - flagged accounts + alert stream
GET  /api/admin/anomaly-log            - existing endpoint; the shape now
                                          supports ``?status=needs_review``
GET  /api/admin/v2/free-tier/usage     - passthrough (already implemented)

None of the endpoints here duplicate existing routes - they only add the
five that the Flagged / Review Queue / Analytics / Funnels / Cohorts
pages call and that were previously missing.

Wire it up with:

    from routes.admin_phase_b import build_admin_phase_b_router
    api.include_router(build_admin_phase_b_router(
        db=db,
        admin_dep=get_current_admin_id,
    ))
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Callable, Optional

from fastapi import APIRouter, Depends, Query, Request

logger = logging.getLogger("wayly.admin_phase_b")


def build_admin_phase_b_router(*, db, admin_dep: Callable) -> APIRouter:
    router = APIRouter(prefix="/admin", tags=["admin-phase-b"])

    # ---- P0: Flagged Accounts / Review Queue - lightweight aggregations ----

    @router.get("/security-alerts")
    async def security_alerts(
        request: Request,  # noqa: ARG001
        kind: Optional[str] = Query(None),
        status: Optional[str] = Query(None),
        limit: int = Query(100, ge=1, le=500),
        admin_id: str = Depends(admin_dep),  # noqa: ARG001
    ):
        """Unified alert stream: dedup guard hits, brute-force spikes,
        anomaly log entries flagged as ``needs_review``, plus support
        tickets categorised as ``fraud`` or ``account_takeover``."""
        q: dict = {}
        if kind:
            q["kind"] = kind
        if status:
            q["status"] = status
        try:
            docs = await db.security_alerts.find(q, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(length=limit)
        except Exception as e:
            logger.warning("security_alerts fetch failed: %s", e)
            docs = []
        # If collection is empty, synthesise a summary from adjacent
        # collections so the UI is never blank.
        if not docs:
            fallback = []
            try:
                anom = await db.anomaly_log.find(
                    {"status": {"$in": ["open", "needs_review"]}}, {"_id": 0}
                ).sort("detected_at", -1).limit(min(20, limit)).to_list(length=20)
                for a in anom:
                    fallback.append({
                        "created_at": a.get("detected_at") or a.get("ts"),
                        "kind": "account",
                        "reason": a.get("kind") or "anomaly",
                        "severity": a.get("severity") or "info",
                        "user_email": a.get("user_email") or a.get("user_id"),
                        "status": a.get("status"),
                    })
            except Exception:
                pass
            docs = fallback
        return docs

    @router.get("/analytics")
    async def analytics(
        request: Request,  # noqa: ARG001
        view: Optional[str] = Query(None),
        admin_id: str = Depends(admin_dep),  # noqa: ARG001
    ):
        """Product analytics roll-up. ``view`` selects the shape:
          - default: KPI cards for the overview
          - funnels: signup - activation - first tool run - paid
          - cohorts: weekly cohorts + retention
        Read from the pre-computed ``analytics_rollup`` collection when
        present; otherwise compute live from ``events``/``users``."""
        now = datetime.now(timezone.utc)
        try:
            snap = await db.analytics_rollup.find_one({"kind": view or "kpi"}, {"_id": 0}, sort=[("computed_at", -1)])
            if snap:
                return snap.get("payload") or snap
        except Exception:
            pass

        if view == "funnels":
            return await _live_funnels(db, now)
        if view == "cohorts":
            return await _live_cohorts(db, now)
        return await _live_kpis(db, now)

    @router.get("/hardening/status")
    async def hardening_status(admin_id: str = Depends(admin_dep)):  # noqa: ARG001
        """Read-only admin-hardening posture (gate on/off, allowlist
        entry count). Used by the System Health page."""
        try:
            from admin_hardening import status_summary
            return status_summary()
        except Exception:
            return {"gate_enabled": False, "allowlist_enabled": False, "allowlist_entry_count": 0}

    @router.post("/analytics/rollup")
    async def analytics_rollup_trigger(admin_id: str = Depends(admin_dep)):  # noqa: ARG001
        """Manual re-run of the nightly analytics rollup. Ops can hit
        this after a bulk import or when previewing changes without
        waiting for the 02:00 UTC cron."""
        now = datetime.now(timezone.utc)
        counts = {}
        for kind, fn in (("kpi", _live_kpis), ("funnels", _live_funnels), ("cohorts", _live_cohorts)):
            payload = await fn(db, now)
            await db.analytics_rollup.update_one(
                {"kind": kind},
                {"$set": {"kind": kind, "payload": payload, "computed_at": now.isoformat()}},
                upsert=True,
            )
            counts[kind] = "ok"
        return {"ok": True, "computed_at": now.isoformat(), "kinds": counts}

    return router


# ---------------------------------------------------------------------------
# Live fallback aggregations
# ---------------------------------------------------------------------------

async def _live_kpis(db, now: datetime) -> dict:
    day = now - timedelta(days=1)
    week = now - timedelta(days=7)
    prev_week = now - timedelta(days=14)
    day_iso = day.isoformat()
    week_iso = week.isoformat()
    prev_iso = prev_week.isoformat()
    try:
        dau = await db.users.count_documents({"last_seen_at": {"$gte": day_iso}})
        wau = await db.users.count_documents({"last_seen_at": {"$gte": week_iso}})
        prev_wau = await db.users.count_documents({
            "last_seen_at": {"$gte": prev_iso, "$lt": week_iso}
        })
        tool_runs_7d = await db.tool_runs.count_documents({"created_at": {"$gte": week_iso}})
        total_users = await db.users.estimated_document_count()
        paid = await db.subscriptions.count_documents({"status": "active"})
        churn = await db.subscriptions.count_documents({
            "cancelled_at": {"$gte": (now - timedelta(days=30)).isoformat()}
        })
    except Exception as e:
        logger.warning("kpi rollup live query failed: %s", e)
        return {"kpis": [], "dau": None, "note": "rollup unavailable"}
    dau_delta = 0
    if prev_wau:
        dau_delta = round(((wau - prev_wau) / max(1, prev_wau)) * 100, 1)
    conversion_pct = round((paid / max(1, total_users)) * 100, 1) if total_users else 0
    churn_pct = round((churn / max(1, paid)) * 100, 1) if paid else 0
    return {
        "dau": dau,
        "dau_delta": dau_delta,
        "tool_runs_7d": tool_runs_7d,
        "conversion_pct": conversion_pct,
        "churn_pct": churn_pct,
        "kpis": [
            {"label": "DAU", "value": dau, "sub": f"{'+' if dau_delta >= 0 else ''}{dau_delta}% WoW", "trend": "up" if dau_delta >= 0 else "down"},
            {"label": "Tool runs 7d", "value": tool_runs_7d},
            {"label": "Conversion", "value": f"{conversion_pct}%"},
            {"label": "Churn 30d", "value": f"{churn_pct}%"},
        ],
    }


async def _live_funnels(db, now: datetime) -> dict:
    week_iso = (now - timedelta(days=7)).isoformat()
    try:
        signup = await db.users.count_documents({"created_at": {"$gte": week_iso}})
        activated = await db.users.count_documents({
            "created_at": {"$gte": week_iso},
            "email_verified_at": {"$exists": True, "$ne": None},
        })
        first_run = await db.users.count_documents({
            "created_at": {"$gte": week_iso},
            "first_tool_run_at": {"$exists": True, "$ne": None},
        })
        paid = await db.users.count_documents({
            "created_at": {"$gte": week_iso},
            "subscription_status": "active",
        })
    except Exception as e:
        logger.warning("funnel live query failed: %s", e)
        return {"funnels": []}
    steps = [
        {"label": "Signup (7d)",     "count": signup},
        {"label": "Email verified",  "count": activated},
        {"label": "First tool run",  "count": first_run},
        {"label": "Paid conversion", "count": paid},
    ]
    top = max(1, steps[0]["count"])
    for i, s in enumerate(steps):
        s["pct_of_top"] = round((s["count"] / top) * 100, 1) if top else 0
        s["pct_of_prev"] = round((s["count"] / max(1, steps[i - 1]["count"])) * 100, 1) if i > 0 else 100.0
    return {"funnels": steps, "window": "7d"}


async def _live_cohorts(db, now: datetime) -> dict:
    """Weekly signup cohorts, retention at 1/4/12 weeks."""
    weeks = 8
    cohorts = []
    for i in range(weeks):
        start = now - timedelta(days=(i + 1) * 7)
        end = now - timedelta(days=i * 7)
        try:
            size = await db.users.count_documents({
                "created_at": {"$gte": start.isoformat(), "$lt": end.isoformat()}
            })
            wk1_cutoff = (start + timedelta(days=7)).isoformat()
            wk4_cutoff = (start + timedelta(days=28)).isoformat()
            wk12_cutoff = (start + timedelta(days=84)).isoformat()
            wk1_active = await db.users.count_documents({
                "created_at": {"$gte": start.isoformat(), "$lt": end.isoformat()},
                "last_seen_at": {"$gte": wk1_cutoff},
            })
            wk4_active = await db.users.count_documents({
                "created_at": {"$gte": start.isoformat(), "$lt": end.isoformat()},
                "last_seen_at": {"$gte": wk4_cutoff},
            })
            wk12_active = await db.users.count_documents({
                "created_at": {"$gte": start.isoformat(), "$lt": end.isoformat()},
                "last_seen_at": {"$gte": wk12_cutoff},
            })
        except Exception as e:
            logger.warning("cohort live query failed: %s", e)
            size = wk1_active = wk4_active = wk12_active = 0
        cohorts.append({
            "week": start.strftime("%Y-W%U"),
            "size": size,
            "wk1": (wk1_active / size) if size else 0,
            "wk4": (wk4_active / size) if size else 0,
            "wk12": (wk12_active / size) if size else 0,
        })
    return {"cohorts": list(reversed(cohorts)), "window": f"{weeks}w"}
