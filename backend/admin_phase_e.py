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
