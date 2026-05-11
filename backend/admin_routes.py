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
