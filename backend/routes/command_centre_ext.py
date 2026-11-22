"""Phase 5A.2 — Founder Command Centre, actionable layer.

Mounted at the SAME prefix as the existing Command Centre (/admin/command-centre)
so it extends — never replaces — the original summary. Adds:
  * metric definitions registry (every KPI documented)
  * 7/30/90/custom trends with previous-period comparison (honest N/A)
  * corrected SLA / security / Help Centre metrics (active vs historical)
  * actionable business alerts with lifecycle (active/acknowledged/resolved)
  * a unified Founder Approval Centre (help + marketing + BOS approvals)
  * Needs-Your-Attention priorities
  * on-demand daily / weekly founder briefing (facts separated from advice)
  * integration & data-source health

Access: super_admin + operations_admin. All figures from stored Wayly records.
"""
from __future__ import annotations

import os
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from bos_core import (period_range, previous_range, pct_change, sla_target_hours,
                      BUSINESS_TZ, now_utc, syd_now)

logger = logging.getLogger(__name__)
_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]

OPEN_TICKET_STATES = ["received", "under_review", "awaiting_user"]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# --------------------------------------------------------------------------- metric registry
METRIC_DEFINITIONS: List[dict] = [
    {"key": "mrr_aud", "label": "Monthly recurring revenue", "source": "subscriptions",
     "formula": "sum(plan price) over status=active", "period": "snapshot",
     "timezone": BUSINESS_TZ, "includes": "active paid plans",
     "excludes": "trials, cancelled, discounts/taxes/refunds not modelled"},
    {"key": "paid_subscribers", "label": "Active paying subscribers", "source": "subscriptions",
     "formula": "count(status=active)", "period": "snapshot", "timezone": BUSINESS_TZ,
     "includes": "active paid", "excludes": "trialing"},
    {"key": "active_trials", "label": "Trial customers", "source": "subscriptions",
     "formula": "count(status=trialing)", "period": "snapshot", "timezone": BUSINESS_TZ,
     "includes": "in free trial", "excludes": "paid, ended"},
    {"key": "new_signups", "label": "New registrations", "source": "users",
     "formula": "count(users.created_at in window)", "period": "window", "timezone": BUSINESS_TZ,
     "includes": "all new accounts", "excludes": "—"},
    {"key": "new_subscriptions", "label": "New subscriptions", "source": "subscriptions",
     "formula": "count(subscriptions.created_at in window)", "period": "window",
     "timezone": BUSINESS_TZ, "includes": "trial + paid starts", "excludes": "—"},
    {"key": "cancellations", "label": "Cancellations", "source": "subscriptions",
     "formula": "count(status in [cancelled,canceled] & updated_at in window)",
     "period": "window", "timezone": BUSINESS_TZ,
     "includes": "subscriptions ended in window (proxy: updated_at)",
     "excludes": "cancel-at-period-end that is still active"},
    {"key": "new_enquiries", "label": "New enquiries", "source": "contact_requests",
     "formula": "count(created_at in window)", "period": "window", "timezone": BUSINESS_TZ,
     "includes": "all contact requests", "excludes": "—"},
    {"key": "tickets_created", "label": "Support tickets created", "source": "sup_tickets",
     "formula": "count(created_at in window)", "period": "window", "timezone": BUSINESS_TZ,
     "includes": "all new tickets", "excludes": "—"},
    {"key": "marketing_spend_aud", "label": "Marketing investment", "source": "marketing_expenses",
     "formula": "sum(cost_inc_gst) by expense_reporting_date in window", "period": "window",
     "timezone": BUSINESS_TZ, "includes": "non-voided expenses", "excludes": "voided"},
]


# --------------------------------------------------------------------------- windowed counters
async def _count_in_window(coll: str, field: str, start: datetime, end: datetime,
                           extra: Optional[dict] = None) -> int:
    q: Dict[str, Any] = {field: {"$gte": start.isoformat(), "$lt": end.isoformat()}}
    if extra:
        q.update(extra)
    return await db[coll].count_documents(q)


async def _marketing_window_total(start: datetime, end: datetime) -> float:
    from routes.marketing_spend import _build_summary
    lo, hi = start.date().isoformat(), end.date().isoformat()
    s = await _build_summary(lo, hi, "window")
    return float(s["totals"]["total_investment_aud"] or 0)


async def _trend_metric(key: str, label: str, current: float, previous: float, source: str) -> dict:
    return {"key": key, "label": label, "current": current, "previous": previous,
            "change": round(current - previous, 2),
            "pct_change": pct_change(current, previous), "source": source, "series": None}


async def _bucketed_counts(coll: str, field: str, start: datetime, end: datetime,
                           extra: Optional[dict] = None, n: int = 8) -> List[int]:
    """Count docs per equal time-slice across [start,end) — for sparklines."""
    total = (end - start).total_seconds()
    if total <= 0:
        return [0] * n
    step = total / n
    out: List[int] = []
    for i in range(n):
        b0 = start + timedelta(seconds=step * i)
        b1 = end if i == n - 1 else start + timedelta(seconds=step * (i + 1))
        q: Dict[str, Any] = {field: {"$gte": b0.isoformat(), "$lt": b1.isoformat()}}
        if extra:
            q.update(extra)
        out.append(await db[coll].count_documents(q))
    return out


async def _pending_approvals_count() -> int:
    n = await db.help_articles.count_documents({"status": "in_review"})
    n += await db.marketing_expenses.count_documents({"status": "planned", "voided": {"$ne": True}})
    n += await db.bos_approvals.count_documents(
        {"status": {"$in": ["submitted", "pending_approval", "changes_requested"]}})
    return n


def _briefing_key(type_: str) -> str:
    now = syd_now()
    if type_ == "weekly":
        iso = now.isocalendar()
        return f"weekly:{iso[0]}-W{iso[1]:02d}"
    return f"daily:{now.date().isoformat()}"


async def _store_briefing(data: dict) -> None:
    key = _briefing_key(data["type"])
    await db.bos_briefings.update_one(
        {"key": key}, {"$set": {"key": key, "type": data["type"], "data": data,
                                "stored_at": _now()}}, upsert=True)


async def _compute_briefing(type_: str) -> dict:
    if type_ == "weekly":
        start, end, label = period_range("7d")
    else:
        end = now_utc()
        start = end - timedelta(days=1)
        label = "Last 24 hours"
    facts = {
        "new_signups": await _count_in_window("users", "created_at", start, end),
        "new_subscriptions": await _count_in_window("subscriptions", "created_at", start, end),
        "new_enquiries": await _count_in_window("contact_requests", "created_at", start, end),
        "tickets_created": await _count_in_window("sup_tickets", "created_at", start, end),
        "marketing_spend_aud": await _marketing_window_total(start, end),
    }
    await generate_alerts()
    active_alerts = await db.bos_alerts.count_documents({"status": "active"})
    pending = await _pending_approvals_count()
    open_tickets = await db.sup_tickets.count_documents({"status": {"$in": OPEN_TICKET_STATES}})
    paid_subs = await db.subscriptions.count_documents({"status": "active"})
    trials = await db.subscriptions.count_documents({"status": "trialing"})
    recs: List[str] = []
    if pending:
        recs.append(f"Review {pending} item(s) in the Approval Centre.")
    if active_alerts:
        recs.append(f"{active_alerts} active alert(s) need attention — start with critical/high.")
    if facts["new_enquiries"] and facts["tickets_created"] == 0:
        recs.append("New enquiries arrived — ensure they are being followed up.")
    if not recs:
        recs.append("No urgent actions detected in this window.")
    return {
        "type": type_,
        "period": {"label": label, "from": start.isoformat(), "to": end.isoformat(), "timezone": BUSINESS_TZ},
        "facts": facts,
        "snapshot": {"paid_subscribers": paid_subs, "active_trials": trials,
                     "open_tickets": open_tickets, "active_alerts": active_alerts,
                     "pending_approvals": pending},
        "recommendations": recs,
        "generated_at": _now(),
        "note": "Facts are computed from stored records for the stated window. "
                "Recommendations are rule-based suggestions, not statements of fact.",
    }


# --------------------------------------------------------------------------- SLA (corrected)
async def _ticket_first_response_breaches() -> List[dict]:
    """CURRENT unresolved tickets past their per-priority first-response target
    WITH no staff public reply. This is the only thing counted as an active SLA
    breach — old tickets are not blindly treated as breaches."""
    now = now_utc()
    breaches = []
    async for t in db.sup_tickets.find(
        {"status": {"$in": OPEN_TICKET_STATES}}, {"_id": 0}):
        tid = t.get("id")
        created = t.get("created_at")
        if not created:
            continue
        has_reply = await db.sup_messages.count_documents(
            {"ticket_id": tid, "author_type": "staff", "visibility": "public"})
        if has_reply:
            continue
        try:
            created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
        except Exception:
            continue
        target_h = sla_target_hours(t.get("priority"))
        age_h = (now - created_dt).total_seconds() / 3600.0
        if age_h > target_h:
            breaches.append({"ticket_id": tid, "reference": t.get("reference"),
                             "priority": t.get("priority") or "normal",
                             "age_hours": round(age_h, 1), "target_hours": target_h,
                             "subject": t.get("subject") or t.get("tool_name")})
    return breaches


# --------------------------------------------------------------------------- alerts engine
ALERT_SEVERITIES = ("critical", "high", "medium", "low")


async def ensure_indexes() -> None:
    try:
        await db.bos_alerts.create_index("dedup_key", unique=True)
        await db.bos_alerts.create_index("status")
        await db.bos_alerts.create_index("severity")
        await db.bos_briefings.create_index("key", unique=True)
    except Exception as exc:  # pragma: no cover
        logger.warning("bos_alerts index skipped: %s", exc)


async def _upsert_alert(dedup_key: str, *, category: str, severity: str, title: str,
                        description: str, source: str, record_link: Optional[str],
                        suggested_investigation: str) -> None:
    existing = await db.bos_alerts.find_one({"dedup_key": dedup_key}, {"_id": 0, "status": 1})
    if existing:
        upd = {"last_detected": _now(), "severity": severity, "title": title,
               "description": description, "record_link": record_link}
        # a resolved condition that recurs becomes active again
        if existing.get("status") == "resolved":
            upd["status"] = "active"
        await db.bos_alerts.update_one({"dedup_key": dedup_key}, {"$set": upd})
        return
    await db.bos_alerts.insert_one({
        "id": uuid.uuid4().hex, "dedup_key": dedup_key, "category": category,
        "severity": severity, "title": title, "description": description,
        "source": source, "record_link": record_link,
        "suggested_investigation": suggested_investigation,
        "status": "active", "owner": None,
        "first_detected": _now(), "last_detected": _now(),
    })


async def _auto_resolve(source: str, live_keys: set) -> None:
    """Any previously-active alert of this source whose condition is no longer
    present is auto-resolved (prevents stale noise)."""
    async for a in db.bos_alerts.find(
        {"source": source, "status": {"$in": ["active", "acknowledged"]}},
        {"_id": 0, "dedup_key": 1}):
        if a["dedup_key"] not in live_keys:
            await db.bos_alerts.update_one(
                {"dedup_key": a["dedup_key"]},
                {"$set": {"status": "resolved", "resolved_at": _now(),
                          "resolution_note": "Condition no longer present."}})


async def generate_alerts() -> None:
    """Idempotent, deduplicated. Safe to re-run on every load."""
    # 1) SLA first-response breaches
    live = set()
    for b in await _ticket_first_response_breaches():
        key = f"sla:{b['ticket_id']}"
        live.add(key)
        sev = "high" if b["priority"] in ("urgent", "high") else "medium"
        await _upsert_alert(
            key, category="support_sla", severity=sev,
            title=f"Ticket {b['reference']} past first-response target",
            description=f"{b['priority']} priority, {b['age_hours']}h old, target {b['target_hours']}h, no staff reply yet.",
            source="sup_tickets", record_link=f"/admin/support/{b['ticket_id']}",
            suggested_investigation="Open the ticket and send a first response, or reassign.")
    await _auto_resolve("sup_tickets", live)

    # 2) Failed / problematic payments
    live = set()
    async for s in db.subscriptions.find(
        {"status": {"$in": ["past_due", "unpaid", "incomplete"]}},
        {"_id": 0, "id": 1, "user_id": 1, "status": 1, "plan": 1}):
        key = f"payment:{s.get('id')}"
        live.add(key)
        await _upsert_alert(
            key, category="failed_payment", severity="high",
            title=f"Payment issue on {s.get('plan') or 'subscription'}",
            description=f"Subscription status is '{s.get('status')}'.",
            source="subscriptions", record_link="/admin/payments",
            suggested_investigation="Check the Stripe subscription and the customer's card.")
    await _auto_resolve("subscriptions", live)

    # 3) Security events (unresolved)
    live = set()
    async for a in db.security_alerts.find({"resolved": {"$ne": True}}, {"_id": 0}):
        key = f"security:{a.get('rule')}:{a.get('subject')}"
        live.add(key)
        sev = (a.get("severity") or "medium").lower()
        if sev not in ALERT_SEVERITIES:
            sev = "medium"
        await _upsert_alert(
            key, category="security", severity=sev,
            title=f"Security: {a.get('rule')}",
            description=a.get("description") or f"{a.get('count', 1)} event(s) for {a.get('subject')}",
            source="security_alerts", record_link="/admin/anomaly-log",
            suggested_investigation="Review the anomaly log and confirm whether action is required.")
    await _auto_resolve("security_alerts", live)

    # 4) Marketing overspend (committed beyond budget)
    live = set()
    from routes.marketing_spend import _campaign_financials
    async for c in db.marketing_campaigns.find(
        {"status": {"$ne": "archived"}}, {"_id": 0}):
        fin = await _campaign_financials(c)
        var = fin.get("variance_vs_budget_aud")
        if var is not None and var > 0:
            key = f"overspend:{c.get('id')}"
            live.add(key)
            await _upsert_alert(
                key, category="marketing_overspend", severity="medium",
                title=f"Campaign over budget: {c.get('name')}",
                description=f"Committed exceeds budget by A${var:,.2f}.",
                source="marketing_campaigns", record_link="/admin/marketing-spend",
                suggested_investigation="Review the campaign budget and committed placements.")
    await _auto_resolve("marketing_campaigns", live)


# --------------------------------------------------------------------------- router
class AlertAction(BaseModel):
    note: Optional[str] = Field(default=None, max_length=500)


class BriefingType(BaseModel):
    pass


def build_command_centre_ext_router():
    from admin_auth import require_super_or_ops  # noqa: WPS433
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(ensure_indexes())
    except Exception as exc:  # pragma: no cover
        logger.warning("command_centre_ext init skipped: %s", exc)

    r = APIRouter(prefix="/admin/command-centre", tags=["command-centre"])

    @r.get("/metrics")
    async def metric_definitions(admin: dict = Depends(require_super_or_ops)):
        return {"metrics": METRIC_DEFINITIONS, "timezone": BUSINESS_TZ,
                "note": "Every KPI is defined with its source, formula and period."}

    @r.get("/trends")
    async def trends(period: str = "30d", date_from: Optional[str] = None,
                     date_to: Optional[str] = None,
                     admin: dict = Depends(require_super_or_ops)):
        start, end, label = period_range(period, date_from, date_to)
        p_start, p_end = previous_range(start, end)

        cancelled_q = {"status": {"$in": ["cancelled", "canceled"]}}
        metrics = [
            await _trend_metric(
                "new_signups", "New registrations",
                await _count_in_window("users", "created_at", start, end),
                await _count_in_window("users", "created_at", p_start, p_end), "users"),
            await _trend_metric(
                "new_subscriptions", "New subscriptions",
                await _count_in_window("subscriptions", "created_at", start, end),
                await _count_in_window("subscriptions", "created_at", p_start, p_end), "subscriptions"),
            await _trend_metric(
                "cancellations", "Cancellations",
                await _count_in_window("subscriptions", "updated_at", start, end, cancelled_q),
                await _count_in_window("subscriptions", "updated_at", p_start, p_end, cancelled_q),
                "subscriptions"),
            await _trend_metric(
                "new_enquiries", "New enquiries",
                await _count_in_window("contact_requests", "created_at", start, end),
                await _count_in_window("contact_requests", "created_at", p_start, p_end), "contact_requests"),
            await _trend_metric(
                "tickets_created", "Support tickets created",
                await _count_in_window("sup_tickets", "created_at", start, end),
                await _count_in_window("sup_tickets", "created_at", p_start, p_end), "sup_tickets"),
            await _trend_metric(
                "marketing_spend_aud", "Marketing investment",
                await _marketing_window_total(start, end),
                await _marketing_window_total(p_start, p_end), "marketing_expenses"),
        ]
        series_specs = {
            "new_signups": ("users", "created_at", None),
            "new_subscriptions": ("subscriptions", "created_at", None),
            "cancellations": ("subscriptions", "updated_at", cancelled_q),
            "new_enquiries": ("contact_requests", "created_at", None),
            "tickets_created": ("sup_tickets", "created_at", None),
        }
        for m in metrics:
            spec = series_specs.get(m["key"])
            if spec:
                m["series"] = await _bucketed_counts(spec[0], spec[1], start, end, spec[2])
        return {
            "period": {"label": label, "from": start.isoformat(), "to": end.isoformat(),
                       "timezone": BUSINESS_TZ},
            "previous_period": {"from": p_start.isoformat(), "to": p_end.isoformat()},
            "metrics": metrics,
            "note": "Percentage change is N/A when the previous period is zero — never a misleading %.",
        }

    @r.get("/alerts")
    async def alerts(include_resolved: bool = False,
                     admin: dict = Depends(require_super_or_ops)):
        await generate_alerts()
        q = {} if include_resolved else {"status": {"$in": ["active", "acknowledged"]}}
        rows = []
        async for a in db.bos_alerts.find(q, {"_id": 0}).sort([("severity", 1), ("last_detected", -1)]):
            rows.append(a)
        sev_order = {s: i for i, s in enumerate(ALERT_SEVERITIES)}
        rows.sort(key=lambda a: sev_order.get(a.get("severity"), 9))
        counts = {s: await db.bos_alerts.count_documents({"severity": s, "status": "active"})
                  for s in ALERT_SEVERITIES}
        resolved = await db.bos_alerts.count_documents({"status": "resolved"})
        return {"alerts": rows, "active_by_severity": counts, "resolved_count": resolved,
                "note": "Only current (active/acknowledged) alerts are shown by default. "
                        "Resolved conditions are kept for history."}

    @r.post("/alerts/{alert_id}/acknowledge")
    async def acknowledge_alert(alert_id: str, body: AlertAction,
                                admin: dict = Depends(require_super_or_ops)):
        res = await db.bos_alerts.update_one(
            {"id": alert_id}, {"$set": {"status": "acknowledged", "owner": admin.get("email"),
                                        "acknowledged_at": _now(), "ack_note": body.note}})
        if res.matched_count == 0:
            raise HTTPException(404, "Alert not found")
        return {"ok": True}

    @r.post("/alerts/{alert_id}/resolve")
    async def resolve_alert(alert_id: str, body: AlertAction,
                            admin: dict = Depends(require_super_or_ops)):
        res = await db.bos_alerts.update_one(
            {"id": alert_id}, {"$set": {"status": "resolved", "resolved_at": _now(),
                                        "resolution_note": body.note or "Resolved by admin."}})
        if res.matched_count == 0:
            raise HTTPException(404, "Alert not found")
        return {"ok": True}

    @r.get("/approvals")
    async def approval_centre(admin: dict = Depends(require_super_or_ops)):
        """Unified view of real pending decisions. Drafts that are NOT submitted
        for review are excluded. AI drafts are NOT founder approvals."""
        items: List[dict] = []
        # Help Centre — only articles explicitly submitted for review
        async for a in db.help_articles.find({"status": "in_review"}, {"_id": 0}):
            items.append({
                "kind": "help_article", "id": a.get("id"), "title": a.get("title"),
                "reason": "Help Centre article submitted for review",
                "priority": "normal", "created_at": a.get("updated_at"),
                "action_base": f"/admin/help/articles/{a.get('id')}",
                "actions": ["approve"], "destination": "/admin/help-centre"})
        # Marketing — expenses awaiting approval
        async for e in db.marketing_expenses.find(
            {"status": "planned", "voided": {"$ne": True}}, {"_id": 0}):
            items.append({
                "kind": "marketing_expense", "id": e.get("id"),
                "title": f"{e.get('expense_id')} · {e.get('activity_name')}",
                "reason": "Marketing expense awaiting approval",
                "priority": "normal", "created_at": e.get("created_at"),
                "action_base": f"/admin/marketing/expenses/{e.get('id')}",
                "actions": ["approve"], "destination": "/admin/marketing-spend"})
        # BOS approvals (content, publicity, partnership, experiments, campaign changes)
        async for a in db.bos_approvals.find(
            {"status": {"$in": ["submitted", "pending_approval", "changes_requested"]}}, {"_id": 0}):
            items.append({
                "kind": a.get("kind"), "id": a.get("id"), "title": a.get("title"),
                "reason": a.get("reason"), "priority": a.get("priority") or "normal",
                "created_at": a.get("created_at"),
                "action_base": f"/admin/bos/approvals/{a.get('id')}",
                "actions": ["approve", "reject", "request-changes"],
                "destination": a.get("destination")})
        items.sort(key=lambda x: x.get("created_at") or "", reverse=True)
        return {"approvals": items, "count": len(items),
                "note": "Approval ≠ execution. Approving prepares an action; it is not "
                        "marked done until it is actually carried out."}

    @r.get("/needs-attention")
    async def needs_attention(admin: dict = Depends(require_super_or_ops)):
        await generate_alerts()
        priorities: List[dict] = []
        async for a in db.bos_alerts.find(
            {"status": "active", "severity": {"$in": ["critical", "high"]}}, {"_id": 0}).limit(6):
            priorities.append({"type": "alert", "severity": a.get("severity"),
                               "title": a.get("title"), "link": a.get("record_link"),
                               "action": a.get("suggested_investigation")})
        pending = (await approval_centre(admin))  # reuse
        if pending["count"]:
            priorities.append({"type": "approvals", "severity": "high",
                               "title": f"{pending['count']} item(s) awaiting your decision",
                               "link": "/admin/command-centre", "action": "Review the Approval Centre."})
        return {"priorities": priorities[:8], "generated_at": _now(),
                "note": "Evidence-based priorities only — not every notification."}

    @r.get("/integrations")
    async def integrations(admin: dict = Depends(require_super_or_ops)):
        """Data-source + external connector health. Manual entry is never shown
        as verified API data."""
        from routes.marketing_spend import db as _msdb  # same db
        has_spend = await _msdb.marketing_expenses.count_documents({"voided": {"$ne": True}}) > 0
        internal = [
            {"source": "Subscriptions (Stripe-backed)", "status": "connected", "kind": "app_record"},
            {"source": "Users", "status": "connected", "kind": "app_record"},
            {"source": "Support (sup_*/enquiries)", "status": "connected", "kind": "app_record"},
            {"source": "Help Centre", "status": "connected", "kind": "app_record"},
            {"source": "Marketing register (manual)", "status": "connected" if has_spend else "no_data_yet",
             "kind": "manual_entry"},
        ]
        external = []
        async for c in db.bos_integrations.find({}, {"_id": 0}):
            external.append({"source": c.get("name"), "status": c.get("status"),
                             "kind": "external_api", "last_success": c.get("last_success"),
                             "note": c.get("setup_note")})
        if not external:
            external = [{"source": n, "status": "not_connected", "kind": "external_api",
                         "note": "Requires authorised account access — not yet configured."}
                        for n in ("Google Search Console", "GA4", "Metricool",
                                  "Google Ads", "Meta Ads", "Microsoft Advertising")]
        return {"internal": internal, "external": external,
                "note": "External marketing platforms are not connected. Manual entries are "
                        "never represented as verified API-imported data."}

    @r.get("/briefing")
    async def briefing(type: str = "daily", admin: dict = Depends(require_super_or_ops)):
        """On-demand generation (also stores today's copy)."""
        data = await _compute_briefing(type)
        await _store_briefing(data)
        return data

    @r.get("/briefing/latest")
    async def briefing_latest(type: str = "daily", admin: dict = Depends(require_super_or_ops)):
        """Auto-generated briefing waiting each Australia/Sydney morning. Generates
        and stores once per day/week on first view (idempotent, no external send,
        no extra scheduler)."""
        key = _briefing_key(type)
        existing = await db.bos_briefings.find_one({"key": key}, {"_id": 0})
        if existing:
            return {**existing["data"], "auto_generated": True, "stored_at": existing.get("stored_at")}
        data = await _compute_briefing(type)
        await _store_briefing(data)
        return {**data, "auto_generated": True, "stored_at": _now()}

    return r
