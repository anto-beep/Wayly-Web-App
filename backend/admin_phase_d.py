"""Phase D — Support tickets + Communications (campaigns/templates).

Mounted as a sub-router on /api/admin (admin) and /api (user-side endpoints).
"""
from __future__ import annotations
import os
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

from auth import get_current_user_id
from admin_auth import get_current_admin, audit_log

phase_d_admin = APIRouter(prefix="/admin", tags=["admin-phase-d"])
phase_d_user = APIRouter(tags=["support"])

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _strip(d: dict) -> dict:
    if not d:
        return d
    d.pop("_id", None)
    return d


# ============================================================================
# SUPPORT TICKETS — Section 6
# ============================================================================

PRIORITY_VALUES = ("P1", "P2", "P3")
STATUS_VALUES = ("open", "in_progress", "waiting_on_user", "resolved", "closed")
CATEGORY_VALUES = ("billing", "ai_result", "feature", "bug", "account", "data_privacy", "other")


class TicketCreate(BaseModel):
    subject: str = Field(min_length=3, max_length=200)
    body: str = Field(min_length=10, max_length=10000)
    category: str = "other"
    priority: str = "P3"


class TicketUpdate(BaseModel):
    priority: Optional[str] = None
    status: Optional[str] = None
    category: Optional[str] = None
    assigned_admin_id: Optional[str] = None


class TicketMessage(BaseModel):
    body: str = Field(min_length=1, max_length=10000)
    is_internal_note: bool = False


# ----------------------- USER-SIDE -----------------------

@phase_d_user.post("/tickets")
async def user_create_ticket(body: TicketCreate, user_id: str = Depends(get_current_user_id)):
    if body.category not in CATEGORY_VALUES:
        raise HTTPException(400, f"category must be one of {CATEGORY_VALUES}")
    if body.priority not in PRIORITY_VALUES:
        body.priority = "P3"
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1, "name": 1, "plan": 1})
    if not user:
        raise HTTPException(404, "User not found")
    tid = secrets.token_urlsafe(8)
    now = _now()
    ticket = {
        "id": tid,
        "user_id": user_id,
        "user_email": user["email"],
        "user_name": user.get("name"),
        "user_plan": user.get("plan"),
        "subject": body.subject,
        "category": body.category,
        "priority": body.priority,
        "status": "open",
        "assigned_admin_id": None,
        "created_at": now,
        "last_message_at": now,
        "resolved_at": None,
    }
    await db.support_tickets.insert_one(ticket)
    await db.ticket_messages.insert_one({
        "id": secrets.token_urlsafe(8),
        "ticket_id": tid,
        "author_type": "user",
        "author_id": user_id,
        "author_email": user["email"],
        "body": body.body,
        "is_internal_note": False,
        "ts": now,
    })
    return {"ok": True, "ticket": _strip(ticket)}


@phase_d_user.get("/tickets")
async def user_list_tickets(user_id: str = Depends(get_current_user_id)):
    rows = []
    async for t in db.support_tickets.find({"user_id": user_id}, {"_id": 0}).sort("last_message_at", -1):
        rows.append(t)
    return {"tickets": rows}


@phase_d_user.get("/tickets/{ticket_id}")
async def user_get_ticket(ticket_id: str, user_id: str = Depends(get_current_user_id)):
    t = await db.support_tickets.find_one({"id": ticket_id, "user_id": user_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Ticket not found")
    msgs = []
    async for m in db.ticket_messages.find(
        {"ticket_id": ticket_id, "is_internal_note": False},
        {"_id": 0}
    ).sort("ts", 1):
        msgs.append(m)
    return {"ticket": t, "messages": msgs}


@phase_d_user.post("/tickets/{ticket_id}/messages")
async def user_reply_ticket(ticket_id: str, body: TicketMessage, user_id: str = Depends(get_current_user_id)):
    t = await db.support_tickets.find_one({"id": ticket_id, "user_id": user_id}, {"_id": 0, "id": 1})
    if not t:
        raise HTTPException(404, "Ticket not found")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1})
    msg = {
        "id": secrets.token_urlsafe(8),
        "ticket_id": ticket_id,
        "author_type": "user",
        "author_id": user_id,
        "author_email": (user or {}).get("email"),
        "body": body.body,
        "is_internal_note": False,
        "ts": _now(),
    }
    await db.ticket_messages.insert_one(msg)
    await db.support_tickets.update_one(
        {"id": ticket_id},
        {"$set": {"last_message_at": msg["ts"], "status": "open"}},
    )
    return {"ok": True, "message": _strip(msg)}


# ----------------------- ADMIN-SIDE -----------------------

@phase_d_admin.get("/tickets")
async def admin_list_tickets(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    assigned_admin_id: Optional[str] = None,
    category: Optional[str] = None,
    unassigned: bool = False,
    mine: bool = False,
    page: int = 1,
    page_size: int = 50,
    admin: dict = Depends(get_current_admin),
):
    q: dict = {}
    if status: q["status"] = status
    if priority: q["priority"] = priority
    if category: q["category"] = category
    if unassigned: q["assigned_admin_id"] = None
    if mine: q["assigned_admin_id"] = admin["id"]
    if assigned_admin_id: q["assigned_admin_id"] = assigned_admin_id
    total = await db.support_tickets.count_documents(q)
    rows = []
    cursor = db.support_tickets.find(q, {"_id": 0}).sort([("priority", 1), ("last_message_at", -1)]).skip((page - 1) * page_size).limit(page_size)
    async for t in cursor:
        rows.append(t)
    return {"rows": rows, "total": total, "page": page, "page_size": page_size}


@phase_d_admin.get("/tickets/{ticket_id}")
async def admin_get_ticket(ticket_id: str, _: dict = Depends(get_current_admin)):
    t = await db.support_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Ticket not found")
    msgs = []
    async for m in db.ticket_messages.find({"ticket_id": ticket_id}, {"_id": 0}).sort("ts", 1):
        msgs.append(m)
    return {"ticket": t, "messages": msgs}


@phase_d_admin.put("/tickets/{ticket_id}")
async def admin_update_ticket(ticket_id: str, body: TicketUpdate, admin: dict = Depends(get_current_admin)):
    update: dict = {}
    if body.priority:
        if body.priority not in PRIORITY_VALUES:
            raise HTTPException(400, f"priority must be one of {PRIORITY_VALUES}")
        update["priority"] = body.priority
    if body.status:
        if body.status not in STATUS_VALUES:
            raise HTTPException(400, f"status must be one of {STATUS_VALUES}")
        update["status"] = body.status
        if body.status == "resolved":
            update["resolved_at"] = _now()
    if body.category:
        if body.category not in CATEGORY_VALUES:
            raise HTTPException(400, f"category must be one of {CATEGORY_VALUES}")
        update["category"] = body.category
    if body.assigned_admin_id is not None:
        update["assigned_admin_id"] = body.assigned_admin_id or None
    if not update:
        raise HTTPException(400, "No fields to update")
    res = await db.support_tickets.update_one({"id": ticket_id}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Ticket not found")
    await audit_log(admin["id"], "ticket_updated", target_id=ticket_id, detail=update)
    return {"ok": True, "updated": update}


@phase_d_admin.post("/tickets/{ticket_id}/messages")
async def admin_reply_ticket(ticket_id: str, body: TicketMessage, admin: dict = Depends(get_current_admin)):
    t = await db.support_tickets.find_one({"id": ticket_id}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Ticket not found")
    msg = {
        "id": secrets.token_urlsafe(8),
        "ticket_id": ticket_id,
        "author_type": "admin",
        "author_id": admin["id"],
        "author_email": admin.get("email"),
        "author_name": admin.get("name"),
        "body": body.body,
        "is_internal_note": bool(body.is_internal_note),
        "ts": _now(),
    }
    await db.ticket_messages.insert_one(msg)
    update = {"last_message_at": msg["ts"]}
    # If this is a real reply (not an internal note), auto-set status
    if not body.is_internal_note:
        update["status"] = "waiting_on_user"
    await db.support_tickets.update_one({"id": ticket_id}, {"$set": update})

    # Send email notification to user
    if not body.is_internal_note and t.get("user_email"):
        try:
            import email_service
            await email_service.email_tool_result(
                to=t["user_email"],
                tool_name="Support reply",
                headline=f"Re: {t['subject']}",
                body_html=(
                    f"<p>Hi {t.get('user_name') or ''},</p>"
                    f"<p>{admin.get('name') or 'A Wayly admin'} replied to your ticket:</p>"
                    f"<blockquote style='border-left:3px solid #D4A24E;padding-left:12px;color:#555'>"
                    f"{body.body.replace(chr(10), '<br>')}</blockquote>"
                    f"<p><a href='https://wayly.com.au/support/{ticket_id}'>View ticket</a></p>"
                ),
            )
        except Exception:
            pass
    await audit_log(admin["id"], "ticket_replied", target_id=ticket_id,
                    detail={"is_internal_note": body.is_internal_note})
    return {"ok": True, "message": _strip(msg)}


@phase_d_admin.get("/ticket-reports")
async def ticket_reports(_: dict = Depends(get_current_admin)):
    now = datetime.now(timezone.utc)
    week_iso = (now - timedelta(days=7)).isoformat()
    counts_by_status = {}
    for s in STATUS_VALUES:
        counts_by_status[s] = await db.support_tickets.count_documents({"status": s})
    open_p1 = await db.support_tickets.count_documents({"status": {"$in": ["open", "in_progress"]}, "priority": "P1"})
    opened_7d = await db.support_tickets.count_documents({"created_at": {"$gte": week_iso}})
    resolved_7d = await db.support_tickets.count_documents({"resolved_at": {"$gte": week_iso}})

    # Oldest unresolved
    oldest = await db.support_tickets.find_one(
        {"status": {"$nin": ["resolved", "closed"]}},
        {"_id": 0, "id": 1, "created_at": 1, "subject": 1, "user_email": 1},
        sort=[("created_at", 1)],
    )

    return {
        "counts_by_status": counts_by_status,
        "open_p1": open_p1,
        "opened_7d": opened_7d,
        "resolved_7d": resolved_7d,
        "oldest_unresolved": oldest,
    }


# ----------------------- MACROS -----------------------

class MacroBody(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    body: str = Field(min_length=1, max_length=10000)


@phase_d_admin.get("/macros")
async def list_macros(_: dict = Depends(get_current_admin)):
    rows = []
    async for m in db.ticket_macros.find({}, {"_id": 0}).sort("name", 1):
        rows.append(m)
    return {"macros": rows}


@phase_d_admin.post("/macros")
async def create_macro(body: MacroBody, admin: dict = Depends(get_current_admin)):
    macro = {
        "id": secrets.token_urlsafe(6),
        "name": body.name,
        "body": body.body,
        "created_by": admin["id"],
        "created_at": _now(),
    }
    await db.ticket_macros.insert_one(macro)
    return {"ok": True, "macro": _strip(macro)}


@phase_d_admin.put("/macros/{macro_id}")
async def update_macro(macro_id: str, body: MacroBody, admin: dict = Depends(get_current_admin)):
    res = await db.ticket_macros.update_one(
        {"id": macro_id},
        {"$set": {"name": body.name, "body": body.body, "updated_at": _now(), "updated_by": admin["id"]}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Macro not found")
    return {"ok": True}


@phase_d_admin.delete("/macros/{macro_id}")
async def delete_macro(macro_id: str, _: dict = Depends(get_current_admin)):
    res = await db.ticket_macros.delete_one({"id": macro_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Macro not found")
    return {"ok": True}


# ============================================================================
# COMMUNICATIONS — Section 7 (campaigns, templates, notification log)
# ============================================================================

# ----------------------- AUDIENCE BUILDER -----------------------

async def _audience_query(audience: dict) -> dict:
    """Translate an audience spec into a MongoDB query."""
    q: dict = {}
    typ = audience.get("type", "all")
    if typ == "plan":
        plans = audience.get("plans") or []
        q["plan"] = {"$in": plans}
    elif typ == "trial_expiring":
        days = int(audience.get("days_remaining") or 3)
        target = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
        sub_user_ids = []
        async for s in db.subscriptions.find(
            {"status": "trialing", "trial_ends_at": {"$lte": target}},
            {"_id": 0, "user_id": 1},
        ):
            sub_user_ids.append(s["user_id"])
        q["id"] = {"$in": sub_user_ids}
    elif typ == "churned":
        days = int(audience.get("days_since") or 90)
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        sub_user_ids = []
        async for s in db.subscriptions.find(
            {"status": "cancelled", "cancelled_at": {"$gte": since}},
            {"_id": 0, "user_id": 1},
        ):
            sub_user_ids.append(s["user_id"])
        q["id"] = {"$in": sub_user_ids}
    elif typ == "never_decoded":
        # Users with no household OR no statements yet
        decoded_users = []
        async for s in db.statements.distinct("uploaded_by"):
            if s:
                decoded_users.append(s)
        q["id"] = {"$nin": decoded_users}
    # "all" → empty filter
    return q


@phase_d_admin.post("/campaigns/preview-audience")
async def preview_audience(body: dict, _: dict = Depends(get_current_admin)):
    q = await _audience_query(body.get("audience") or {})
    count = await db.users.count_documents(q)
    sample = []
    async for u in db.users.find(q, {"_id": 0, "email": 1, "name": 1, "plan": 1}).limit(5):
        sample.append(u)
    return {"count": count, "sample": sample}


# ----------------------- CAMPAIGNS -----------------------

class CampaignBody(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    audience: dict
    subject: str = Field(min_length=2, max_length=200)
    html_body: str = Field(min_length=10)
    schedule_at: Optional[str] = None  # ISO; None = send now


@phase_d_admin.get("/campaigns")
async def list_campaigns(_: dict = Depends(get_current_admin)):
    rows = []
    async for c in db.email_campaigns.find({}, {"_id": 0}).sort("created_at", -1):
        rows.append(c)
    return {"campaigns": rows}


@phase_d_admin.post("/campaigns")
async def create_campaign(body: CampaignBody, admin: dict = Depends(get_current_admin)):
    cid = secrets.token_urlsafe(8)
    campaign = {
        "id": cid,
        "name": body.name,
        "audience": body.audience,
        "subject": body.subject,
        "html_body": body.html_body,
        "schedule_at": body.schedule_at,
        "status": "draft",
        "recipients": 0,
        "sent_count": 0,
        "created_at": _now(),
        "created_by": admin["id"],
    }
    await db.email_campaigns.insert_one(campaign)
    return {"ok": True, "campaign": _strip(campaign)}


@phase_d_admin.post("/campaigns/{campaign_id}/send")
async def send_campaign(campaign_id: str, admin: dict = Depends(get_current_admin)):
    c = await db.email_campaigns.find_one({"id": campaign_id}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Campaign not found")
    if c.get("status") in ("sending", "sent"):
        raise HTTPException(400, f"Campaign already {c['status']}")

    q = await _audience_query(c.get("audience") or {})
    recipients = []
    async for u in db.users.find(q, {"_id": 0, "email": 1, "name": 1, "id": 1}):
        recipients.append(u)
    await db.email_campaigns.update_one(
        {"id": campaign_id},
        {"$set": {"status": "sending", "recipients": len(recipients), "send_started_at": _now()}},
    )

    # Send (in-process loop — fine for low volume; in prod use a queue)
    import email_service
    sent = 0
    failed = 0
    for r in recipients:
        try:
            html = c["html_body"].replace("{{first_name}}", (r.get("name") or "there").split()[0] or "there")
            html = html.replace("{{email}}", r.get("email") or "")
            await email_service.email_tool_result(
                to=r["email"],
                tool_name=c["name"],
                headline=c["subject"],
                body_html=html,
            )
            await db.notification_log.insert_one({
                "id": secrets.token_urlsafe(6),
                "ts": _now(),
                "user_id": r["id"],
                "to_email": r["email"],
                "type": "campaign",
                "campaign_id": campaign_id,
                "subject": c["subject"],
                "status": "sent",
            })
            sent += 1
        except Exception as e:
            failed += 1
            await db.notification_log.insert_one({
                "id": secrets.token_urlsafe(6),
                "ts": _now(),
                "user_id": r.get("id"),
                "to_email": r.get("email"),
                "type": "campaign",
                "campaign_id": campaign_id,
                "subject": c["subject"],
                "status": "failed",
                "error": str(e)[:200],
            })

    await db.email_campaigns.update_one(
        {"id": campaign_id},
        {"$set": {"status": "sent", "sent_count": sent, "failed_count": failed, "sent_at": _now()}},
    )
    await audit_log(admin["id"], "campaign_sent", target_id=campaign_id,
                    detail={"recipients": len(recipients), "sent": sent, "failed": failed})
    return {"ok": True, "recipients": len(recipients), "sent": sent, "failed": failed}


# ----------------------- EMAIL TEMPLATES -----------------------

@phase_d_admin.get("/email-templates")
async def list_templates(_: dict = Depends(get_current_admin)):
    """Hard-coded list of system templates currently sent by the app
    (welcome, password reset, trial nudge, etc.) plus admin-editable templates."""
    system = [
        {"id": "sys-welcome", "name": "Welcome", "type": "auth", "system": True},
        {"id": "sys-verify", "name": "Email verification", "type": "auth", "system": True},
        {"id": "sys-password-reset", "name": "Password reset", "type": "auth", "system": True},
        {"id": "sys-trial-day-3", "name": "Trial Day 3 nudge", "type": "trial", "system": True},
        {"id": "sys-trial-day-6", "name": "Trial T-1 nudge", "type": "trial", "system": True},
        {"id": "sys-trial-expired", "name": "Trial expired", "type": "trial", "system": True},
        {"id": "sys-statement-decoded", "name": "Statement decoded", "type": "product", "system": True},
        {"id": "sys-anomaly-alert", "name": "Anomaly alert", "type": "product", "system": True},
        {"id": "sys-invoice", "name": "Invoice", "type": "billing", "system": True},
        {"id": "sys-failed-payment", "name": "Failed payment", "type": "billing", "system": True},
        {"id": "sys-ticket-reply", "name": "Support reply", "type": "support", "system": True},
    ]
    custom = []
    async for t in db.email_templates_custom.find({}, {"_id": 0}):
        custom.append(t)
    return {"system": system, "custom": custom}


# ----------------------- NOTIFICATION LOG -----------------------

@phase_d_admin.get("/notification-log")
async def notification_log(
    status: Optional[str] = None,
    type_filter: Optional[str] = Query(None, alias="type"),
    page: int = 1, page_size: int = 50,
    _: dict = Depends(get_current_admin),
):
    q: dict = {}
    if status: q["status"] = status
    if type_filter: q["type"] = type_filter
    total = await db.notification_log.count_documents(q)
    rows = []
    cursor = db.notification_log.find(q, {"_id": 0}).sort("ts", -1).skip((page - 1) * page_size).limit(page_size)
    async for r in cursor:
        rows.append(r)
    # Aggregate counts
    failure_rate = None
    last_hour = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    sent_hour = await db.notification_log.count_documents({"status": "sent", "ts": {"$gte": last_hour}})
    failed_hour = await db.notification_log.count_documents({"status": "failed", "ts": {"$gte": last_hour}})
    if sent_hour + failed_hour > 0:
        failure_rate = round(100 * failed_hour / (sent_hour + failed_hour), 1)
    return {"rows": rows, "total": total, "page": page, "page_size": page_size,
            "last_hour": {"sent": sent_hour, "failed": failed_hour, "failure_rate_pct": failure_rate}}


# ----------------------- NEWSLETTER SUBSCRIBERS -----------------------

@phase_d_admin.get("/newsletter-subscribers")
async def newsletter_subscribers(
    status: Optional[str] = None,
    page: int = 1, page_size: int = 50,
    _: dict = Depends(get_current_admin),
):
    q: dict = {}
    if status: q["status"] = status
    total = await db.newsletter_subscribers.count_documents(q)
    rows = []
    cursor = db.newsletter_subscribers.find(q, {"_id": 0}).sort("subscribed_at", -1).skip((page - 1) * page_size).limit(page_size)
    async for r in cursor:
        rows.append(r)
    return {"rows": rows, "total": total, "page": page, "page_size": page_size}
