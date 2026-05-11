"""Phase E — Audit-log UI, Admin sessions, Admin CRUD, Feature flags,
System health, Maintenance mode, Cmd+K global search."""
from __future__ import annotations
import os
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

from admin_auth import (
    get_current_admin, require_super_admin, audit_log,
    ALL_ROLES,
)
from auth import hash_password

phase_e = APIRouter(prefix="/admin", tags=["admin-phase-e"])

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ============================================================================
# SECTION 10 — Admin Sessions
# ============================================================================

@phase_e.get("/sessions")
async def admin_sessions(_: dict = Depends(get_current_admin)):
    """All admin sessions in the last 30 days. Currently active sessions
    have revoked=false AND expires_at_max > now."""
    rows = []
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    async for s in db.admin_sessions.find(
        {"created_at": {"$gte": cutoff}}, {"_id": 0}
    ).sort("created_at", -1).limit(200):
        u = await db.users.find_one({"id": s.get("user_id")}, {"_id": 0, "email": 1, "admin_role": 1})
        s["admin_email"] = (u or {}).get("email")
        s["admin_role"] = (u or {}).get("admin_role")
        now_iso = _now()
        s["active"] = (not s.get("revoked")) and s.get("expires_at_max", "") > now_iso
        rows.append(s)
    active_count = sum(1 for r in rows if r["active"])
    return {"sessions": rows, "active_count": active_count, "total": len(rows)}


@phase_e.delete("/sessions/{session_id}")
async def revoke_session(session_id: str, admin: dict = Depends(require_super_admin)):
    res = await db.admin_sessions.update_one(
        {"id": session_id}, {"$set": {"revoked": True, "revoked_at": _now()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Session not found")
    await audit_log(admin["id"], "admin_session_revoked", target_id=session_id)
    return {"ok": True}


# ============================================================================
# SECTION 12 — Admin CRUD (Super Admin only)
# ============================================================================

class AdminCreate(BaseModel):
    email: EmailStr
    name: str = Field(min_length=2, max_length=100)
    admin_role: str
    temp_password: str = Field(min_length=8, max_length=128)


class AdminRoleUpdate(BaseModel):
    admin_role: str


@phase_e.get("/admins")
async def list_admins(_: dict = Depends(require_super_admin)):
    rows = []
    async for u in db.users.find(
        {"admin_role": {"$in": list(ALL_ROLES)}},
        {"_id": 0, "password_hash": 0, "totp_secret": 0, "totp_backup_codes": 0},
    ).sort("created_at", -1):
        # last login from audit
        last = await db.admin_audit.find_one(
            {"actor_id": u["id"], "action": "admin_login_complete"},
            {"_id": 0, "ts": 1}, sort=[("ts", -1)],
        )
        u["last_login_ts"] = (last or {}).get("ts")
        rows.append(u)
    return {"admins": rows}


@phase_e.post("/admins")
async def create_admin(body: AdminCreate, admin: dict = Depends(require_super_admin)):
    if body.admin_role not in ALL_ROLES:
        raise HTTPException(400, f"admin_role must be one of {ALL_ROLES}")
    existing = await db.users.find_one({"email": body.email.lower().strip()})
    if existing:
        await db.users.update_one(
            {"id": existing["id"]},
            {"$set": {"admin_role": body.admin_role, "is_admin": True, "name": existing.get("name") or body.name}},
        )
        await audit_log(admin["id"], "admin_promoted", target_id=existing["id"],
                        detail={"new_role": body.admin_role})
        return {"ok": True, "user_id": existing["id"], "existing": True}
    new_id = secrets.token_urlsafe(12)
    await db.users.insert_one({
        "id": new_id,
        "email": body.email.lower().strip(),
        "password_hash": hash_password(body.temp_password),
        "name": body.name,
        "role": "caregiver",
        "plan": "family",
        "household_id": None,
        "is_admin": True,
        "admin_role": body.admin_role,
        "totp_enabled": False,
        "failed_login_count": 0,
        "force_password_change": True,
        "created_at": _now(),
    })
    await audit_log(admin["id"], "admin_created", target_id=new_id,
                    detail={"email": body.email, "role": body.admin_role})
    return {"ok": True, "user_id": new_id, "existing": False}


@phase_e.put("/admins/{user_id}/role")
async def update_admin_role(user_id: str, body: AdminRoleUpdate, admin: dict = Depends(require_super_admin)):
    if body.admin_role not in ALL_ROLES:
        raise HTTPException(400, f"admin_role must be one of {ALL_ROLES}")
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "admin_role": 1})
    if not target:
        raise HTTPException(404, "Admin not found")
    # Prevent removing the last super admin
    if target.get("admin_role") == "super_admin" and body.admin_role != "super_admin":
        count = await db.users.count_documents({"admin_role": "super_admin"})
        if count <= 2:
            raise HTTPException(400, "Cannot demote — minimum 2 super admins required by policy")
    if user_id == admin["id"] and body.admin_role != "super_admin":
        raise HTTPException(400, "You cannot demote yourself")
    await db.users.update_one({"id": user_id}, {"$set": {"admin_role": body.admin_role}})
    await audit_log(admin["id"], "admin_role_changed", target_id=user_id,
                    detail={"new_role": body.admin_role, "from": target.get("admin_role")})
    return {"ok": True}


@phase_e.delete("/admins/{user_id}")
async def remove_admin_role(user_id: str, admin: dict = Depends(require_super_admin)):
    """Remove admin role (does NOT delete the user). Enforces 2-super-admin minimum."""
    if user_id == admin["id"]:
        raise HTTPException(400, "You cannot deactivate yourself")
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "admin_role": 1})
    if not target:
        raise HTTPException(404, "Admin not found")
    if target.get("admin_role") == "super_admin":
        count = await db.users.count_documents({"admin_role": "super_admin"})
        if count <= 2:
            raise HTTPException(400, "Cannot demote — minimum 2 super admins required by policy")
    await db.users.update_one({"id": user_id}, {"$set": {"is_admin": False}, "$unset": {"admin_role": ""}})
    await audit_log(admin["id"], "admin_deactivated", target_id=user_id)
    return {"ok": True}


# ============================================================================
# SECTION 11 — Feature Flags
# ============================================================================

class FlagBody(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: str = ""
    enabled: bool = False
    rollout_percent: int = 0
    allowed_plans: Optional[List[str]] = None
    allowed_emails: Optional[List[str]] = None


@phase_e.get("/feature-flags")
async def list_flags(_: dict = Depends(get_current_admin)):
    rows = []
    async for f in db.feature_flags.find({}, {"_id": 0}).sort("name", 1):
        rows.append(f)
    return {"flags": rows}


@phase_e.post("/feature-flags")
async def create_flag(body: FlagBody, admin: dict = Depends(get_current_admin)):
    if await db.feature_flags.find_one({"name": body.name}):
        raise HTTPException(400, "Flag with that name already exists")
    flag = body.dict() | {"created_at": _now(), "created_by": admin["id"], "updated_at": _now()}
    await db.feature_flags.insert_one(flag)
    await audit_log(admin["id"], "flag_created", target_id=body.name)
    flag.pop("_id", None)
    return {"ok": True, "flag": flag}


@phase_e.put("/feature-flags/{name}")
async def update_flag(name: str, body: FlagBody, admin: dict = Depends(get_current_admin)):
    update = body.dict() | {"updated_at": _now(), "updated_by": admin["id"]}
    res = await db.feature_flags.update_one({"name": name}, {"$set": update})
    if res.matched_count == 0:
        raise HTTPException(404, "Flag not found")
    await audit_log(admin["id"], "flag_updated", target_id=name, detail={"enabled": body.enabled})
    return {"ok": True}


@phase_e.delete("/feature-flags/{name}")
async def delete_flag(name: str, admin: dict = Depends(require_super_admin)):
    res = await db.feature_flags.delete_one({"name": name})
    if res.deleted_count == 0:
        raise HTTPException(404, "Flag not found")
    await audit_log(admin["id"], "flag_deleted", target_id=name)
    return {"ok": True}


# ============================================================================
# SECTION 11 — System Health
# ============================================================================

@phase_e.get("/system-health")
async def system_health(_: dict = Depends(get_current_admin)):
    """Quick health check. Returns service statuses + Mongo collection counts."""
    services = []
    # Mongo
    mongo_ok = True
    try:
        await db.command("ping")
    except Exception:
        mongo_ok = False
    services.append({"name": "MongoDB", "status": "healthy" if mongo_ok else "down"})

    # Stripe (presence of API key)
    stripe_ok = bool(os.environ.get("STRIPE_API_KEY"))
    services.append({"name": "Stripe", "status": "configured" if stripe_ok else "missing_key"})

    # Resend (presence of API key)
    resend_key = os.environ.get("RESEND_API_KEY") or ""
    resend_ok = bool(resend_key) and not resend_key.startswith(("re_demo_", "re_test_"))
    services.append({"name": "Resend (email)", "status": "live" if resend_ok else "mock"})

    # Emergent LLM key
    llm_ok = bool(os.environ.get("EMERGENT_LLM_KEY"))
    services.append({"name": "Emergent LLM", "status": "configured" if llm_ok else "missing_key"})

    # Maintenance mode flag
    maintenance = (await db.system_state.find_one({"key": "maintenance_mode"}, {"_id": 0})) or {}
    services.append({"name": "Maintenance mode", "status": "on" if maintenance.get("enabled") else "off"})

    # Collection counts
    counts = {
        "users": await db.users.count_documents({}),
        "households": await db.households.count_documents({}),
        "statements": await db.statements.count_documents({}),
        "subscriptions": await db.subscriptions.count_documents({}),
        "support_tickets": await db.support_tickets.count_documents({}),
        "admin_sessions": await db.admin_sessions.count_documents({}),
        "audit_events": await db.admin_audit.count_documents({}),
    }

    # Recent errors (last 24h from llm_calls.success=false)
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    llm_errors_24h = await db.llm_calls.count_documents({"ts": {"$gte": cutoff}, "success": False})

    return {"services": services, "counts": counts, "llm_errors_24h": llm_errors_24h, "maintenance_mode": bool(maintenance.get("enabled"))}


# ============================================================================
# SECTION 11 — Maintenance Mode
# ============================================================================

@phase_e.get("/maintenance")
async def get_maintenance(_: dict = Depends(get_current_admin)):
    rec = await db.system_state.find_one({"key": "maintenance_mode"}, {"_id": 0}) or {}
    return {
        "enabled": bool(rec.get("enabled")),
        "message": rec.get("message") or "",
        "expected_return": rec.get("expected_return"),
        "updated_at": rec.get("updated_at"),
    }


@phase_e.post("/maintenance")
async def toggle_maintenance(body: dict, admin: dict = Depends(require_super_admin)):
    enabled = bool(body.get("enabled"))
    message = body.get("message", "Wayly is undergoing scheduled maintenance and will be back shortly.")
    expected_return = body.get("expected_return")  # ISO datetime string
    await db.system_state.update_one(
        {"key": "maintenance_mode"},
        {"$set": {
            "enabled": enabled, "message": message, "expected_return": expected_return,
            "updated_at": _now(), "updated_by": admin["id"],
        }},
        upsert=True,
    )
    await audit_log(admin["id"], "maintenance_toggled", detail={"enabled": enabled})
    return {"ok": True, "enabled": enabled}


# ============================================================================
# SECTION 13 — Global Cmd+K search
# ============================================================================

@phase_e.get("/search")
async def global_search(q: str = Query(min_length=2, max_length=100), _: dict = Depends(get_current_admin)):
    q_str = q.strip()
    regex = {"$regex": q_str, "$options": "i"}

    # Users
    users = []
    async for u in db.users.find(
        {"$or": [{"email": regex}, {"name": regex}]},
        {"_id": 0, "id": 1, "email": 1, "name": 1, "plan": 1},
    ).limit(5):
        users.append({"type": "user", "id": u["id"], "primary": u["email"], "secondary": u.get("name") or "", "link": f"/admin/users/{u['id']}", "badge": u.get("plan")})

    # Households
    households = []
    async for h in db.households.find(
        {"$or": [{"participant_name": regex}, {"provider_name": regex}]},
        {"_id": 0, "id": 1, "participant_name": 1, "provider_name": 1},
    ).limit(5):
        households.append({"type": "household", "id": h["id"], "primary": h["participant_name"], "secondary": h.get("provider_name") or "", "link": "/admin/households", "badge": "household"})

    # Tickets
    tickets = []
    async for t in db.support_tickets.find(
        {"$or": [{"subject": regex}, {"user_email": regex}]},
        {"_id": 0, "id": 1, "subject": 1, "user_email": 1, "priority": 1},
    ).limit(5):
        tickets.append({"type": "ticket", "id": t["id"], "primary": t["subject"], "secondary": t.get("user_email"), "link": f"/admin/tickets/{t['id']}", "badge": t.get("priority")})

    # Payments by session ID
    payments = []
    if len(q_str) >= 6:
        async for p in db.payment_transactions.find(
            {"session_id": regex},
            {"_id": 0, "session_id": 1, "user_id": 1, "amount": 1, "currency": 1, "payment_status": 1},
        ).limit(5):
            payments.append({"type": "payment", "id": p["session_id"], "primary": f"{p['currency']} {p['amount']}", "secondary": p.get("session_id", "")[:30], "link": "/admin/payments", "badge": p.get("payment_status")})

    return {"users": users, "households": households, "tickets": tickets, "payments": payments}



# ============================================================================
# SECTION 10 — Data Requests (Privacy Act / GDPR-style)
# ============================================================================

class DataRequestCreate(BaseModel):
    user_email: EmailStr
    request_type: str = Field(pattern=r"^(export|delete|rectify)$")
    note: Optional[str] = Field(None, max_length=1000)


class DataRequestUpdate(BaseModel):
    status: str = Field(pattern=r"^(received|in_progress|completed|rejected)$")
    note: Optional[str] = Field(None, max_length=2000)


phase_e_public = APIRouter(prefix="/public", tags=["public-phase-e"])


@phase_e_public.post("/data-request")
async def submit_data_request(body: DataRequestCreate, request: Request):
    """Public intake — anyone can submit a Privacy Act data request."""
    rid = secrets.token_urlsafe(8)
    rec = {
        "id": rid,
        "user_email": body.user_email.lower().strip(),
        "request_type": body.request_type,
        "note": body.note,
        "status": "received",
        "created_at": _now(),
        "ip": request.client.host if request.client else None,
        "history": [{"status": "received", "ts": _now(), "by": "user"}],
    }
    await db.data_requests.insert_one(rec)
    return {"ok": True, "request_id": rid}


@phase_e.get("/data-requests")
async def list_data_requests(
    status: Optional[str] = None,
    request_type: Optional[str] = None,
    page: int = 1, page_size: int = 50,
    _: dict = Depends(get_current_admin),
):
    q: dict = {}
    if status: q["status"] = status
    if request_type: q["request_type"] = request_type
    total = await db.data_requests.count_documents(q)
    rows = []
    cursor = (db.data_requests.find(q, {"_id": 0})
              .sort("created_at", -1)
              .skip((page - 1) * page_size).limit(page_size))
    async for r in cursor:
        rows.append(r)
    return {"rows": rows, "total": total, "page": page, "page_size": page_size}


@phase_e.put("/data-requests/{request_id}")
async def update_data_request(request_id: str, body: DataRequestUpdate, admin: dict = Depends(get_current_admin)):
    r = await db.data_requests.find_one({"id": request_id}, {"_id": 0, "id": 1})
    if not r:
        raise HTTPException(404, "Request not found")
    entry = {"status": body.status, "ts": _now(), "by": admin.get("email"), "note": body.note}
    update = {"status": body.status, "updated_at": _now(), "updated_by": admin["id"]}
    if body.status == "completed":
        update["completed_at"] = _now()
    await db.data_requests.update_one(
        {"id": request_id},
        {"$set": update, "$push": {"history": entry}},
    )
    await audit_log(admin["id"], "data_request_updated", target_id=request_id,
                    detail={"status": body.status})
    return {"ok": True}


# ============================================================================
# SECTION 10 — Audit log CSV export
# ============================================================================

@phase_e.get("/audit-log/export")
async def audit_log_export(
    actor_id: Optional[str] = None,
    target_id: Optional[str] = None,
    action: Optional[str] = None,
    days: int = Query(30, ge=1, le=365),
    _: dict = Depends(get_current_admin),
):
    from fastapi.responses import Response
    q: dict = {}
    if actor_id: q["actor_id"] = actor_id
    if target_id: q["target_id"] = target_id
    if action: q["action"] = {"$regex": action, "$options": "i"}
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    q["ts"] = {"$gte": since}

    rows = ["ts,actor_id,actor_email,action,target_id,ip,result,detail"]
    async for r in db.admin_audit.find(q, {"_id": 0}).sort("ts", -1).limit(10000):
        actor_email = ""
        if r.get("actor_id"):
            u = await db.users.find_one({"id": r["actor_id"]}, {"_id": 0, "email": 1})
            actor_email = (u or {}).get("email") or ""
        det = (str(r.get("detail") or "")).replace(",", ";").replace("\n", " ").replace("\r", " ")
        rows.append(
            f"{r.get('ts','')},{r.get('actor_id','') or ''},{actor_email},"
            f"{r.get('action','')},{r.get('target_id','') or ''},"
            f"{r.get('ip','') or ''},{r.get('result','')},\"{det[:500]}\""
        )
    csv_body = "\n".join(rows)
    return Response(
        content=csv_body, media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=audit_log_{days}d.csv"},
    )


# ============================================================================
# SECTION 11 — Public maintenance status (no auth)
# ============================================================================

@phase_e_public.get("/maintenance-status")
async def public_maintenance_status():
    rec = await db.system_state.find_one({"key": "maintenance_mode"}, {"_id": 0}) or {}
    return {
        "enabled": bool(rec.get("enabled")),
        "message": rec.get("message") or "",
        "expected_return": rec.get("expected_return"),
    }


# ============================================================================
# SECTION 12 — Admin 2FA reset + login history
# ============================================================================

@phase_e.post("/admins/{user_id}/reset-2fa")
async def reset_admin_2fa(user_id: str, admin: dict = Depends(require_super_admin)):
    """Clear target admin's TOTP so they re-enrol on next login."""
    if user_id == admin["id"]:
        raise HTTPException(400, "Use the 2FA setup flow to reset your own 2FA")
    target = await db.users.find_one({"id": user_id}, {"_id": 0, "admin_role": 1})
    if not target or not target.get("admin_role"):
        raise HTTPException(404, "Admin not found")
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"totp_secret": None, "totp_enabled": False,
                  "totp_backup_codes": [], "totp_reset_at": _now(),
                  "totp_reset_by": admin["id"]}},
    )
    await db.admin_sessions.update_many(
        {"user_id": user_id, "revoked": False},
        {"$set": {"revoked": True, "revoked_at": _now(), "revoked_by": admin["id"]}},
    )
    await audit_log(admin["id"], "admin_2fa_reset", target_id=user_id)
    return {"ok": True}


@phase_e.get("/admins/{user_id}/login-history")
async def admin_login_history(user_id: str, days: int = 30, _: dict = Depends(require_super_admin)):
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    rows = []
    async for e in db.admin_audit.find(
        {"actor_id": user_id,
         "action": {"$in": [
             "admin_login_attempt", "admin_login_complete", "admin_login_first_time",
             "admin_2fa_attempt", "admin_login_password_ok", "admin_logout",
             "admin_backup_code_used", "admin_2fa_enabled",
         ]},
         "ts": {"$gte": since}},
        {"_id": 0},
    ).sort("ts", -1).limit(200):
        rows.append(e)
    return {"events": rows, "total": len(rows), "days": days}
