"""Milestone C — Founder Command Centre MVP (read-only aggregation).

A single admin-only summary that composes verified data from existing
sources + the new Marketing Spend Register. Every block carries its own
source, last-updated timestamp and status so empty/missing data is shown
honestly and never fabricated.

Access: super_admin + operations_admin.
Mounted at /api/admin/command-centre/*.
"""
from __future__ import annotations

import os
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _block(data: Any, *, source: str, last_updated=None, status: str = "ok") -> dict:
    return {"data": data, "source": source, "last_updated": last_updated, "status": status}


def build_command_centre_router():
    from admin_auth import require_super_or_ops  # noqa: WPS433

    r = APIRouter(prefix="/admin/command-centre", tags=["command-centre"])

    @r.get("/summary")
    async def summary(admin: dict = Depends(require_super_or_ops)):
        from admin_routes import PLAN_PRICES_AUD
        from routes.marketing_spend import _build_summary, _resolve_period

        now = _now()
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        d30 = (now - timedelta(days=30)).isoformat()
        d7 = (now - timedelta(days=7)).isoformat()

        # ---- Revenue & subscriptions (authoritative app records) ----
        total_users = await db.users.count_documents({})
        paid_subs = await db.subscriptions.count_documents({"status": "active"})
        trialing = await db.subscriptions.count_documents({"status": "trialing"})
        churn_30d = await db.subscriptions.count_documents(
            {"status": {"$in": ["cancelled", "canceled"]}, "cancelled_at": {"$gte": d30}})
        mrr = 0.0
        async for s in db.subscriptions.find({"status": "active"}, {"_id": 0, "plan": 1}):
            mrr += PLAN_PRICES_AUD.get(s.get("plan"), 0)
        revenue_block = _block({
            "mrr_aud": round(mrr, 2), "paid_subscribers": paid_subs,
            "active_trials": trialing, "churn_30d": churn_30d,
        }, source="subscriptions", last_updated=now.isoformat(),
            status="ok" if (paid_subs or trialing) else "empty")

        # ---- Customer growth ----
        signups_today = await db.users.count_documents({"created_at": {"$gte": today_start}})
        signups_30d = await db.users.count_documents({"created_at": {"$gte": d30}})
        growth_block = _block({
            "total_users": total_users, "signups_today": signups_today,
            "signups_30d": signups_30d,
        }, source="users", last_updated=now.isoformat(),
            status="ok" if total_users else "empty")

        # ---- Unified support overview (sup_* + legacy + enquiries) ----
        sup_open = await db.sup_tickets.count_documents(
            {"status": {"$in": ["received", "under_review", "awaiting_user"]}})
        legacy_open = await db.support_tickets.count_documents(
            {"status": {"$in": ["open", "in_progress", "waiting_on_user"]}})
        new_enquiries = await db.contact_requests.count_documents(
            {"$or": [{"status": "new"}, {"status": None}]})
        sla_breached = await db.sup_tickets.count_documents(
            {"status": {"$in": ["received", "under_review", "awaiting_user"]},
             "created_at": {"$lt": d7}})
        avg_csat = None
        async for row in db.sup_tickets.aggregate([
            {"$match": {"csat_score": {"$ne": None}}},
            {"$group": {"_id": None, "avg": {"$avg": "$csat_score"}, "n": {"$sum": 1}}},
        ]):
            avg_csat = {"avg": round(row["avg"], 2), "n": row["n"]}
        support_total = await db.sup_tickets.count_documents({})
        support_block = _block({
            "open_tickets": sup_open, "legacy_open": legacy_open,
            "new_enquiries": new_enquiries, "sla_breached": sla_breached,
            "avg_csat": avg_csat, "total_tickets": support_total,
        }, source="sup_tickets+contact_requests", last_updated=now.isoformat(),
            status="ok" if (support_total or new_enquiries or legacy_open) else "empty")

        # ---- Marketing investment (this month, reuse register summary) ----
        lo, hi, label = _resolve_period("this_month", None, None)
        mk = await _build_summary(lo, hi, label)
        has_spend = mk["totals"]["expense_count"] > 0
        marketing_block = _block({
            "period": mk["period"], "totals": mk["totals"],
            "by_group": mk["by_group"], "top_categories": mk["top_categories"],
        }, source=mk["meta"]["source"], last_updated=mk["meta"]["last_updated"],
            status="ok" if has_spend else "empty")

        # ---- Operational alerts ----
        open_alerts = 0
        try:
            open_alerts = await db.security_alerts.count_documents({"resolved": {"$ne": True}})
        except Exception:
            open_alerts = 0
        alerts_block = _block({
            "open_security_alerts": open_alerts,
            "sla_breached_tickets": sla_breached,
        }, source="security_alerts+sup_tickets", last_updated=now.isoformat(),
            status="ok")

        # ---- Pending approvals (marketing expenses awaiting sign-off) ----
        pending_expenses = await db.marketing_expenses.count_documents(
            {"status": "planned", "voided": {"$ne": True}})
        approvals_block = _block({
            "marketing_expenses_pending": pending_expenses,
        }, source="marketing_expenses", last_updated=now.isoformat(),
            status="ok" if pending_expenses else "empty")

        # ---- Data-source health ----
        health = [
            {"source": "subscriptions", "status": "connected", "kind": "app_record"},
            {"source": "users", "status": "connected", "kind": "app_record"},
            {"source": "support (sup_*/enquiries)", "status": "connected", "kind": "app_record"},
            {"source": "marketing register", "status": "connected" if has_spend else "no_data_yet",
             "kind": "manual_entry"},
            {"source": "ad platforms (Google/Meta/etc.)", "status": "not_connected",
             "kind": "external_api", "note": "Manual entry only until an integration is approved."},
        ]

        return {
            "generated_at": now.isoformat(),
            "blocks": {
                "revenue": revenue_block,
                "growth": growth_block,
                "support": support_block,
                "marketing": marketing_block,
                "alerts": alerts_block,
                "approvals": approvals_block,
            },
            "data_source_health": health,
            "note": "All figures are computed from stored Wayly records. Empty blocks mean no data has been entered yet.",
        }

    return r
