"""Admin-only routes for Wayly. Mounted at /api/admin/*.
Every endpoint here is gated by `get_current_admin` (admin_auth)."""
import os
import csv
import io
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from motor.motor_asyncio import AsyncIOMotorClient
from admin_auth import get_current_admin, require_super_admin, audit_log

admin = APIRouter(prefix="/admin", tags=["admin"])

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _strip_id(doc: dict) -> dict:
    """Remove BSON _id and any password hash from a Mongo document."""
    if not doc:
        return doc
    doc.pop("_id", None)
    doc.pop("password_hash", None)
    return doc


# ---------------------- USERS ----------------------

@admin.get("/users")
async def list_users(
    q: Optional[str] = None,
    plan: Optional[str] = None,
    role: Optional[str] = None,
    is_admin: Optional[bool] = None,
    page: int = 1,
    page_size: int = 50,
    _: dict = Depends(get_current_admin),
):
    """Paginated, searchable user list. `q` matches email or name (case-insensitive)."""
    query: dict = {}
    if q:
        query["$or"] = [
            {"email": {"$regex": q, "$options": "i"}},
            {"name": {"$regex": q, "$options": "i"}},
        ]
    if plan:
        query["plan"] = plan
    if role:
        query["role"] = role
    if is_admin is not None:
        query["is_admin"] = is_admin
    total = await db.users.count_documents(query)
    cursor = (
        db.users.find(query, {"_id": 0, "password_hash": 0})
        .sort("created_at", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    users = []
    async for u in cursor:
        sub = await db.subscriptions.find_one({"user_id": u["id"]}, {"_id": 0})
        if sub:
            u["subscription_status"] = sub.get("status")
            u["trial_ends_at"] = sub.get("trial_ends_at")
            u["cancel_at_period_end"] = sub.get("cancel_at_period_end")
        users.append(u)
    return {"users": users, "total": total, "page": page, "page_size": page_size}


@admin.get("/users/{user_id}")
async def user_detail(user_id: str, _: dict = Depends(get_current_admin)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(404, "User not found")
    sub = await db.subscriptions.find_one({"user_id": user_id}, {"_id": 0})
    household = None
    if user.get("household_id"):
        household = await db.households.find_one({"id": user["household_id"]}, {"_id": 0})
    statements = []
    if household:
        async for s in db.statements.find(
            {"household_id": household["id"]}, {"_id": 0, "file_b64": 0, "raw_text": 0}
        ).sort("uploaded_at", -1).limit(20):
            statements.append(s)
    audit = []
    async for ev in db.audit_events.find({"user_id": user_id}, {"_id": 0}).sort("ts", -1).limit(20):
        audit.append(ev)
    payments = []
    async for p in db.payment_transactions.find(
        {"user_id": user_id}, {"_id": 0}
    ).sort("ts", -1).limit(20):
        payments.append(p)
    return {
        "user": user,
        "subscription": _strip_id(sub) if sub else None,
        "household": household,
        "statements": statements,
        "audit": audit,
        "payments": payments,
    }


@admin.put("/users/{user_id}/admin")
async def toggle_admin(user_id: str, body: dict, admin: dict = Depends(get_current_admin)):
    admin_id = admin["id"]
    if user_id == admin_id and body.get("is_admin") is False:
        raise HTTPException(400, "You cannot remove your own admin flag")
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1})
    if not target:
        raise HTTPException(404, "User not found")
    is_admin = bool(body.get("is_admin", False))
    await db.users.update_one({"id": user_id}, {"$set": {"is_admin": is_admin}})
    return {"ok": True, "is_admin": is_admin}


@admin.put("/users/{user_id}/plan")
async def admin_set_plan(user_id: str, body: dict, _: dict = Depends(get_current_admin)):
    plan = body.get("plan")
    if plan not in {"free", "solo", "family"}:
        raise HTTPException(400, "Invalid plan")
    res = await db.users.update_one({"id": user_id}, {"$set": {"plan": plan}})
    if res.matched_count == 0:
        raise HTTPException(404, "User not found")
    return {"ok": True, "plan": plan}


@admin.post("/users/{user_id}/reset-password")
async def admin_send_reset(user_id: str, _: dict = Depends(get_current_admin)):
    import email_service
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "email": 1, "name": 1})
    if not user:
        raise HTTPException(404, "User not found")
    # Generate a one-time reset token using the same shape as /auth/forgot
    import secrets
    token = secrets.token_urlsafe(32)
    await db.password_resets.insert_one({
        "token": token,
        "user_id": user_id,
        "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
        "used": False,
        "created_at": _now_iso(),
    })
    try:
        await email_service.email_tool_result(
            to=user["email"],
            tool_name="Password reset",
            headline="Reset your Wayly password",
            body_html=(
                f"<p>Hi {user.get('name') or ''},</p>"
                "<p>A Wayly admin initiated a password reset for your account. "
                f"Click the link below within 60 minutes to set a new password.</p>"
                f"<p><a href=\"https://wayly.com.au/reset?token={token}\">Reset my password</a></p>"
                "<p>If you didn't expect this email, you can safely ignore it.</p>"
            ),
        )
    except Exception:
        pass
    return {"ok": True}


@admin.post("/users/{user_id}/cancel-subscription")
async def admin_cancel(user_id: str, _: dict = Depends(get_current_admin)):
    res = await db.subscriptions.update_one(
        {"user_id": user_id, "status": {"$in": ["trialing", "active"]}},
        {"$set": {"status": "cancelled", "cancel_at_period_end": True, "cancelled_at": _now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "No active subscription")
    await db.users.update_one({"id": user_id}, {"$set": {"plan": "free"}})
    return {"ok": True}


@admin.delete("/users/{user_id}")
async def admin_delete_user(user_id: str, admin: dict = Depends(require_super_admin)):
    admin_id = admin["id"]
    if user_id == admin_id:
        raise HTTPException(400, "You cannot delete your own account")
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "household_id": 1})
    if not user:
        raise HTTPException(404, "User not found")
    await db.users.delete_one({"id": user_id})
    await db.subscriptions.delete_many({"user_id": user_id})
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.password_resets.delete_many({"user_id": user_id})
    await db.audit_events.delete_many({"user_id": user_id})
    await db.notifications.delete_many({"user_id": user_id})
    # Household + statements: only delete if user was the household owner
    if user.get("household_id"):
        h = await db.households.find_one({"id": user["household_id"]}, {"_id": 0, "owner_id": 1})
        if h and h.get("owner_id") == user_id:
            await db.households.delete_one({"id": user["household_id"]})
            await db.statements.delete_many({"household_id": user["household_id"]})
    return {"ok": True}


# ---------------------- HOUSEHOLDS ----------------------

@admin.get("/households")
async def list_households(
    q: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    _: dict = Depends(get_current_admin),
):
    query: dict = {}
    if q:
        query["$or"] = [
            {"participant_name": {"$regex": q, "$options": "i"}},
            {"provider_name": {"$regex": q, "$options": "i"}},
        ]
    total = await db.households.count_documents(query)
    cursor = (
        db.households.find(query, {"_id": 0})
        .sort("created_at", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    out = []
    async for h in cursor:
        member_count = await db.users.count_documents({"household_id": h["id"]})
        statement_count = await db.statements.count_documents({"household_id": h["id"]})
        h["member_count"] = member_count
        h["statement_count"] = statement_count
        out.append(h)
    return {"households": out, "total": total, "page": page, "page_size": page_size}


# ---------------------- PAYMENTS ----------------------

@admin.get("/payments")
async def list_payments(
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = 1,
    page_size: int = 50,
    _: dict = Depends(get_current_admin),
):
    query: dict = {}
    if status_filter:
        query["payment_status"] = status_filter
    total = await db.payment_transactions.count_documents(query)
    cursor = (
        db.payment_transactions.find(query, {"_id": 0})
        .sort("ts", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    out = []
    async for p in cursor:
        if p.get("user_id"):
            u = await db.users.find_one(
                {"id": p["user_id"]}, {"_id": 0, "email": 1, "name": 1}
            )
            if u:
                p["user_email"] = u.get("email")
                p["user_name"] = u.get("name")
        out.append(p)
    return {"payments": out, "total": total, "page": page, "page_size": page_size}


# ---------------------- STATEMENTS ----------------------

@admin.get("/statements")
async def list_statements(
    q: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    _: dict = Depends(get_current_admin),
):
    query: dict = {}
    if q:
        query["participant_name"] = {"$regex": q, "$options": "i"}
    total = await db.statements.count_documents(query)
    projection = {"_id": 0, "file_b64": 0, "raw_text": 0, "audit": 0, "line_items": 0}
    cursor = (
        db.statements.find(query, projection)
        .sort("uploaded_at", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    out = []
    async for s in cursor:
        out.append(s)
    return {"statements": out, "total": total, "page": page, "page_size": page_size}


# ---------------------- ANALYTICS ----------------------

@admin.get("/analytics")
async def analytics(_: dict = Depends(get_current_admin)):
    now = datetime.now(timezone.utc)
    week_ago = (now - timedelta(days=7)).isoformat()
    month_ago = (now - timedelta(days=30)).isoformat()
    day_ago = (now - timedelta(days=1)).isoformat()

    total_users = await db.users.count_documents({})
    users_24h = await db.users.count_documents({"created_at": {"$gte": day_ago}})
    users_7d = await db.users.count_documents({"created_at": {"$gte": week_ago}})
    users_30d = await db.users.count_documents({"created_at": {"$gte": month_ago}})

    plan_counts = {}
    for p in ("free", "solo", "family"):
        plan_counts[p] = await db.users.count_documents({"plan": p})

    sub_counts = {}
    for s in ("trialing", "active", "cancelled", "expired"):
        sub_counts[s] = await db.subscriptions.count_documents({"status": s})

    statements_total = await db.statements.count_documents({})
    statements_7d = await db.statements.count_documents({"uploaded_at": {"$gte": week_ago}})
    statements_30d = await db.statements.count_documents({"uploaded_at": {"$gte": month_ago}})

    households_total = await db.households.count_documents({})

    # Top 5 users by statement count
    top_users_cursor = db.statements.aggregate(
        [
            {"$group": {"_id": "$household_id", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 5},
        ]
    )
    top_users = []
    async for row in top_users_cursor:
        h = await db.households.find_one({"id": row["_id"]}, {"_id": 0, "owner_id": 1, "participant_name": 1})
        if h:
            u = await db.users.find_one(
                {"id": h.get("owner_id")}, {"_id": 0, "email": 1, "name": 1}
            )
            top_users.append({
                "participant": h.get("participant_name"),
                "owner_email": (u or {}).get("email"),
                "owner_name": (u or {}).get("name"),
                "statement_count": row["count"],
            })

    paid_count = await db.payment_transactions.count_documents({"payment_status": "paid"})
    revenue_pipeline = db.payment_transactions.aggregate(
        [
            {"$match": {"payment_status": "paid"}},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]
    )
    revenue_total = 0.0
    async for row in revenue_pipeline:
        revenue_total = float(row.get("total", 0))

    return {
        "users": {"total": total_users, "last_24h": users_24h, "last_7d": users_7d, "last_30d": users_30d},
        "plans": plan_counts,
        "subscriptions": sub_counts,
        "statements": {"total": statements_total, "last_7d": statements_7d, "last_30d": statements_30d},
        "households": {"total": households_total},
        "payments": {"paid_count": paid_count, "revenue_total": revenue_total},
        "top_active_households": top_users,
    }


# ---------------------- CSV EXPORT ----------------------

async def _csv_response(rows: List[dict], filename: str) -> Response:
    if not rows:
        return Response(content="", media_type="text/csv")
    buf = io.StringIO()
    fieldnames = sorted({k for r in rows for k in r.keys()})
    writer = csv.DictWriter(buf, fieldnames=fieldnames)
    writer.writeheader()
    for r in rows:
        writer.writerow({k: ("" if r.get(k) is None else str(r.get(k))) for k in fieldnames})
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@admin.get("/export/users.csv")
async def export_users(_: dict = Depends(get_current_admin)):
    rows = []
    async for u in db.users.find({}, {"_id": 0, "password_hash": 0}):
        rows.append(u)
    return await _csv_response(rows, "wayly_users.csv")


@admin.get("/export/payments.csv")
async def export_payments(_: dict = Depends(get_current_admin)):
    rows = []
    async for p in db.payment_transactions.find({}, {"_id": 0}):
        rows.append(p)
    return await _csv_response(rows, "wayly_payments.csv")


@admin.get("/export/statements.csv")
async def export_statements(_: dict = Depends(get_current_admin)):
    projection = {"_id": 0, "file_b64": 0, "raw_text": 0, "audit": 0, "line_items": 0}
    rows = []
    async for s in db.statements.find({}, projection):
        rows.append(s)
    return await _csv_response(rows, "wayly_statements.csv")



# ============================================================================
# PHASE B — Real Overview metrics, Activity Feed, Impersonation, Notes,
#           Suspend/Reinstate, Refund, Extend Trial, LLM cost stats.
# ============================================================================

PLAN_PRICES_AUD = {"solo": 19.00, "family": 39.00, "advisor": 299.00, "advisor_pro": 999.00}


@admin.get("/overview")
async def overview(_: dict = Depends(get_current_admin)):
    """Rich overview matching Section 2 spec.
    Returns 8 metric cards + LLM cost panels + recent activity."""
    now = datetime.now(timezone.utc)
    today_iso = (now - timedelta(days=1)).isoformat()
    month_iso = (now - timedelta(days=30)).isoformat()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

    total_users = await db.users.count_documents({})
    signups_today = await db.users.count_documents({"created_at": {"$gte": today_start}})
    paid_subs = await db.subscriptions.count_documents({"status": "active"})
    trialing = await db.subscriptions.count_documents({"status": "trialing"})
    statements_today = await db.statements.count_documents({"uploaded_at": {"$gte": today_start}})
    churn_30d = await db.subscriptions.count_documents({
        "status": "cancelled", "cancelled_at": {"$gte": month_iso}
    })

    # MRR (AUD): sum of active subscriptions × plan price
    mrr = 0.0
    async for s in db.subscriptions.find({"status": "active"}, {"_id": 0, "plan": 1}):
        mrr += PLAN_PRICES_AUD.get(s.get("plan"), 0)

    # LLM cost panels
    llm_cost_today = 0.0
    llm_cost_month = 0.0
    llm_calls_today = 0
    llm_errors_today = 0
    async for row in db.llm_calls.aggregate([
        {"$match": {"ts": {"$gte": today_start}}},
        {"$group": {"_id": None, "cost": {"$sum": "$cost_aud_est"}, "n": {"$sum": 1},
                    "errs": {"$sum": {"$cond": ["$success", 0, 1]}}}},
    ]):
        llm_cost_today = float(row.get("cost") or 0)
        llm_calls_today = int(row.get("n") or 0)
        llm_errors_today = int(row.get("errs") or 0)
    async for row in db.llm_calls.aggregate([
        {"$match": {"ts": {"$gte": month_iso}}},
        {"$group": {"_id": None, "cost": {"$sum": "$cost_aud_est"}}},
    ]):
        llm_cost_month = float(row.get("cost") or 0)

    # Recent statement-decoder activity (last 24h success rate / avg duration)
    decoder_runs_24h = 0
    decoder_duration_total = 0
    decoder_errors_24h = 0
    async for row in db.llm_calls.aggregate([
        {"$match": {"ts": {"$gte": today_iso}, "tool": {"$regex": "^chunk:"}}},
        {"$group": {"_id": None, "n": {"$sum": 1},
                    "dur": {"$sum": "$duration_ms"},
                    "err": {"$sum": {"$cond": ["$success", 0, 1]}}}},
    ]):
        decoder_runs_24h = int(row.get("n") or 0)
        decoder_duration_total = int(row.get("dur") or 0)
        decoder_errors_24h = int(row.get("err") or 0)
    decoder_avg_ms = int(decoder_duration_total / decoder_runs_24h) if decoder_runs_24h else 0
    decoder_success_rate = (
        round(100 * (decoder_runs_24h - decoder_errors_24h) / decoder_runs_24h, 1)
        if decoder_runs_24h else None
    )

    # Plans donut + subscription distribution
    plan_counts = {p: await db.users.count_documents({"plan": p}) for p in ("free", "solo", "family")}
    sub_counts = {s: await db.subscriptions.count_documents({"status": s})
                  for s in ("trialing", "active", "cancelled", "expired")}

    # Open tickets (placeholder — Phase D builds tickets)
    open_tickets = await db.support_tickets.count_documents({"status": {"$in": ["open", "in_progress"]}})

    return {
        "cards": {
            "total_users": total_users,
            "signups_today": signups_today,
            "paid_subscribers": paid_subs,
            "active_trials": trialing,
            "mrr_aud": round(mrr, 2),
            "statements_today": statements_today,
            "churn_30d": churn_30d,
            "open_tickets": open_tickets,
        },
        "ai_health": {
            "llm_cost_today_aud": round(llm_cost_today, 4),
            "llm_cost_month_aud": round(llm_cost_month, 2),
            "llm_calls_today": llm_calls_today,
            "llm_errors_today": llm_errors_today,
            "decoder_runs_24h": decoder_runs_24h,
            "decoder_avg_ms": decoder_avg_ms,
            "decoder_success_rate_pct": decoder_success_rate,
        },
        "plans": plan_counts,
        "subscriptions": sub_counts,
    }


@admin.get("/activity")
async def activity_feed(_: dict = Depends(get_current_admin), limit: int = 50):
    """Merge recent events from users / statements / payments / audit log
    into a single chronological feed."""
    events: List[dict] = []

    async for u in db.users.find({}, {"_id": 0, "id": 1, "email": 1, "name": 1, "created_at": 1}).sort("created_at", -1).limit(20):
        events.append({
            "ts": u["created_at"], "kind": "signup", "color": "green",
            "actor_email": u["email"], "actor_id": u["id"],
            "summary": f"New signup: {u.get('name') or u['email']}",
        })

    async for s in db.statements.find({}, {"_id": 0, "id": 1, "household_id": 1, "uploaded_at": 1, "participant_name": 1, "uploaded_by": 1, "provider_name": 1, "classification": 1}).sort("uploaded_at", -1).limit(20):
        uploaded_by = s.get("uploaded_by")
        u = await db.users.find_one({"id": uploaded_by}, {"_id": 0, "email": 1}) if uploaded_by else None
        events.append({
            "ts": s["uploaded_at"], "kind": "statement_decoded", "color": "blue",
            "actor_email": (u or {}).get("email"), "actor_id": uploaded_by,
            "summary": f"Statement decoded for {s.get('participant_name', 'household')} (Class {s.get('classification', '?')}, {s.get('provider_name', 'provider')})",
            "target_id": s["id"],
        })

    async for p in db.payment_transactions.find({}, {"_id": 0}).sort("ts", -1).limit(20):
        status = p.get("payment_status")
        if status == "paid":
            color = "green"; verb = "upgraded"
        elif status == "failed":
            color = "red"; verb = "failed payment"
        else:
            color = "grey"; verb = "checkout started"
        u = await db.users.find_one({"id": p.get("user_id")}, {"_id": 0, "email": 1}) if p.get("user_id") else None
        events.append({
            "ts": p.get("ts"), "kind": "payment", "color": color,
            "actor_email": (u or {}).get("email"), "actor_id": p.get("user_id"),
            "summary": f"{(u or {}).get('email', 'unknown')} {verb} {p.get('plan', '')} ({p.get('currency', 'AUD')} {p.get('amount')})",
        })

    # Sort by ts desc, take limit
    events = sorted(events, key=lambda e: e.get("ts") or "", reverse=True)[:limit]
    return {"events": events}


@admin.get("/llm-cost-trend")
async def llm_cost_trend(_: dict = Depends(get_current_admin), days: int = 30):
    """Daily LLM spend in AUD over the last N days."""
    days = max(1, min(90, days))
    start_iso = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    rows = []
    async for row in db.llm_calls.aggregate([
        {"$match": {"ts": {"$gte": start_iso}}},
        {"$group": {
            "_id": {"$substr": ["$ts", 0, 10]},
            "cost": {"$sum": "$cost_aud_est"},
            "calls": {"$sum": 1},
            "errors": {"$sum": {"$cond": ["$success", 0, 1]}},
        }},
        {"$sort": {"_id": 1}},
    ]):
        rows.append({"date": row["_id"], "cost_aud": round(row["cost"], 4),
                     "calls": row["calls"], "errors": row["errors"]})
    return {"days": rows}


# ----------------------------- User notes -----------------------------

@admin.get("/users/{user_id}/notes")
async def list_notes(user_id: str, _: dict = Depends(get_current_admin)):
    notes = []
    async for n in db.admin_user_notes.find({"target_user_id": user_id}, {"_id": 0}).sort("ts", -1):
        notes.append(n)
    return {"notes": notes}


@admin.post("/users/{user_id}/notes")
async def add_note(user_id: str, body: dict, admin: dict = Depends(get_current_admin)):
    text = (body.get("text") or "").strip()
    if not text:
        raise HTTPException(400, "Note text required")
    if len(text) > 5000:
        raise HTTPException(400, "Note too long (max 5000 chars)")
    note = {
        "id": __import__("secrets").token_urlsafe(8),
        "target_user_id": user_id,
        "actor_id": admin["id"],
        "actor_email": admin.get("email"),
        "text": text,
        "ts": _now_iso(),
    }
    await db.admin_user_notes.insert_one(note)
    await audit_log(admin["id"], "user_note_added", target_id=user_id,
                    detail={"chars": len(text)})
    return {"ok": True, "note": {k: v for k, v in note.items() if k != "_id"}}


# ----------------------------- Suspend / reinstate -----------------------------

@admin.post("/users/{user_id}/suspend")
async def suspend(user_id: str, body: dict, admin: dict = Depends(get_current_admin)):
    if user_id == admin["id"]:
        raise HTTPException(400, "You cannot suspend yourself")
    reason = (body.get("reason") or "").strip() or "Unspecified"
    await db.users.update_one({"id": user_id}, {"$set": {
        "suspended": True,
        "suspended_at": _now_iso(),
        "suspended_by": admin["id"],
        "suspended_reason": reason,
    }})
    # Invalidate any active sessions
    await db.user_sessions.delete_many({"user_id": user_id})
    await audit_log(admin["id"], "user_suspended", target_id=user_id, detail={"reason": reason})
    return {"ok": True}


@admin.post("/users/{user_id}/reinstate")
async def reinstate(user_id: str, admin: dict = Depends(get_current_admin)):
    await db.users.update_one({"id": user_id}, {"$set": {"suspended": False},
                                                "$unset": {"suspended_at": "", "suspended_by": "", "suspended_reason": ""}})
    await audit_log(admin["id"], "user_reinstated", target_id=user_id)
    return {"ok": True}


# ----------------------------- Extend trial -----------------------------

@admin.post("/users/{user_id}/extend-trial")
async def extend_trial(user_id: str, body: dict, admin: dict = Depends(get_current_admin)):
    days = int(body.get("days") or 0)
    if days < 1 or days > 90:
        raise HTTPException(400, "days must be between 1 and 90")
    sub = await db.subscriptions.find_one({"user_id": user_id}, {"_id": 0})
    if not sub:
        raise HTTPException(404, "No subscription found")
    try:
        current = datetime.fromisoformat(sub.get("trial_ends_at") or _now_iso())
    except Exception:
        current = datetime.now(timezone.utc)
    new_end = max(current, datetime.now(timezone.utc)) + timedelta(days=days)
    await db.subscriptions.update_one({"user_id": user_id}, {"$set": {
        "trial_ends_at": new_end.isoformat(),
        "status": "trialing",
    }})
    await audit_log(admin["id"], "trial_extended", target_id=user_id, detail={"days": days})
    return {"ok": True, "trial_ends_at": new_end.isoformat()}


# ----------------------------- Impersonation -----------------------------

@admin.post("/users/{user_id}/impersonate")
async def impersonate(user_id: str, admin: dict = Depends(get_current_admin)):
    """Issue a read-only impersonation token (60 min, type='impersonation').
    The frontend will show a red 'ADMIN VIEW' banner and disable all mutations
    while this token is active. Every impersonation is audited."""
    import jwt
    from auth import JWT_SECRET, JWT_ALGORITHM
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "id": 1, "email": 1})
    if not target:
        raise HTTPException(404, "User not found")
    token = jwt.encode({
        "sub": user_id,
        "type": "impersonation",
        "impersonator_id": admin["id"],
        "impersonator_email": admin.get("email"),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=60),
    }, JWT_SECRET, algorithm=JWT_ALGORITHM)
    await audit_log(admin["id"], "impersonation_start", target_id=user_id,
                    detail={"target_email": target.get("email")})
    return {
        "token": token,
        "target_email": target.get("email"),
        "expires_in_minutes": 60,
        "warning": "Read-only. All actions disabled. Every keystroke is logged.",
    }


# ----------------------------- Refund -----------------------------

@admin.post("/users/{user_id}/refund")
async def refund(user_id: str, body: dict, admin: dict = Depends(get_current_admin)):
    """Refund a Stripe payment. Caps non-super-admin refunds at AUD 500."""
    session_id = body.get("session_id")
    amount = body.get("amount")  # AUD float
    reason = (body.get("reason") or "").strip() or "requested_by_customer"
    if not session_id or not amount:
        raise HTTPException(400, "session_id and amount required")
    try:
        amount = float(amount)
    except Exception:
        raise HTTPException(400, "amount must be a number")
    if amount <= 0:
        raise HTTPException(400, "amount must be positive")
    if admin.get("admin_role") == "support_admin" and amount > 500:
        raise HTTPException(403, "Refunds over $500 require Operations or Super Admin")

    txn = await db.payment_transactions.find_one(
        {"user_id": user_id, "session_id": session_id}, {"_id": 0}
    )
    if not txn:
        raise HTTPException(404, "Transaction not found")
    if txn.get("payment_status") != "paid":
        raise HTTPException(400, "Only paid transactions can be refunded")
    if amount > float(txn.get("amount", 0)):
        raise HTTPException(400, "Refund cannot exceed original charge")

    # Record refund request — actual Stripe call deferred (out of scope this iter)
    record = {
        "id": __import__("secrets").token_urlsafe(8),
        "ts": _now_iso(),
        "user_id": user_id,
        "session_id": session_id,
        "amount_aud": amount,
        "reason": reason,
        "processed_by": admin["id"],
        "processed_by_email": admin.get("email"),
        "status": "pending_stripe",
        "note": body.get("note", "")[:1000],
    }
    await db.refunds.insert_one(record)
    await audit_log(admin["id"], "refund_recorded", target_id=user_id,
                    detail={"amount": amount, "reason": reason})
    return {"ok": True, "refund": {k: v for k, v in record.items() if k != "_id"}}


# ----------------------------- Audit log query -----------------------------

@admin.get("/audit-log")
async def audit_log_query(
    actor_id: Optional[str] = None,
    target_id: Optional[str] = None,
    action: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    _: dict = Depends(get_current_admin),
):
    q: dict = {}
    if actor_id: q["actor_id"] = actor_id
    if target_id: q["target_id"] = target_id
    if action: q["action"] = {"$regex": action, "$options": "i"}
    total = await db.admin_audit.count_documents(q)
    rows = []
    cursor = db.admin_audit.find(q, {"_id": 0}).sort("ts", -1).skip((page - 1) * page_size).limit(page_size)
    async for r in cursor:
        if r.get("actor_id"):
            u = await db.users.find_one({"id": r["actor_id"]}, {"_id": 0, "email": 1})
            r["actor_email"] = (u or {}).get("email")
        rows.append(r)
    return {"events": rows, "total": total, "page": page, "page_size": page_size}


# ----------------------------- Enhanced user detail -----------------------------

@admin.get("/users/{user_id}/profile")
async def user_profile(user_id: str, _: dict = Depends(get_current_admin)):
    """Phase-B enriched user detail: subscription history, login history,
    LLM tool usage by this user, audit log, notes."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0, "totp_secret": 0, "totp_backup_codes": 0})
    if not user:
        raise HTTPException(404, "User not found")

    sub = await db.subscriptions.find_one({"user_id": user_id}, {"_id": 0})
    household = None
    if user.get("household_id"):
        household = await db.households.find_one({"id": user["household_id"]}, {"_id": 0})

    statements = []
    if household:
        async for s in db.statements.find(
            {"household_id": household["id"]},
            {"_id": 0, "file_b64": 0, "raw_text": 0, "audit": 0, "line_items": 0},
        ).sort("uploaded_at", -1).limit(20):
            statements.append(s)

    payments = []
    async for p in db.payment_transactions.find({"user_id": user_id}, {"_id": 0}).sort("ts", -1):
        payments.append(p)

    # Activity from llm_calls
    llm_usage = []
    cursor = db.llm_calls.find({"user_id": user_id}, {"_id": 0}).sort("ts", -1).limit(20)
    async for c in cursor:
        llm_usage.append(c)

    # Audit log entries where this user was the actor OR target
    actor_events = []
    async for e in db.admin_audit.find(
        {"$or": [{"actor_id": user_id}, {"target_id": user_id}]}, {"_id": 0}
    ).sort("ts", -1).limit(30):
        actor_events.append(e)

    notes = []
    async for n in db.admin_user_notes.find({"target_user_id": user_id}, {"_id": 0}).sort("ts", -1):
        notes.append(n)

    sessions = []
    async for s in db.user_sessions.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).limit(10):
        sessions.append(s)

    return {
        "user": user,
        "subscription": _strip_id(sub) if sub else None,
        "household": household,
        "statements": statements,
        "payments": payments,
        "llm_usage": llm_usage,
        "audit_events": actor_events,
        "notes": notes,
        "sessions": sessions,
    }
