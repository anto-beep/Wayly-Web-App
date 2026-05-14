"""Adviser portal — minimal multi-client list view for Adviser-plan users.

Endpoints (all prefixed by `/api` via the parent router include):
  GET    /adviser/clients          — list adviser's clients
  POST   /adviser/clients          — add a client (invite-by-email; soft-create stub)
  DELETE /adviser/clients/{cid}    — remove a client from the adviser's roster
  GET    /adviser/summary          — quick stats card for the portal landing

Storage: `adviser_clients` collection. Each doc:
  { id, adviser_user_id, client_name, client_email, status, notes,
    invited_at, last_seen_at, created_at, updated_at }

This is a stub workspace — when the linked client signs up with the same
email later, we'll match them by lower-cased email and surface a "linked"
badge. For now the adviser just gets a CRM-style roster they can manage.
"""
from __future__ import annotations
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field

from models import new_id, now_iso

adviser_router = APIRouter(prefix="/adviser", tags=["adviser"])


# --- shared deps (injected from server.py at registration time) ---
_db = None
_require_adviser = None
_max_clients_for = None


def init_adviser_routes(*, db, require_adviser_dep, max_clients_for):
    """Wire dependencies from server.py without circular import."""
    global _db, _require_adviser, _max_clients_for
    _db = db
    _require_adviser = require_adviser_dep
    _max_clients_for = max_clients_for


class ClientCreate(BaseModel):
    client_name: str = Field(min_length=1, max_length=120)
    client_email: EmailStr
    notes: Optional[str] = Field(default=None, max_length=1000)


class ClientUpdate(BaseModel):
    client_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    notes: Optional[str] = Field(default=None, max_length=1000)
    status: Optional[str] = Field(default=None, pattern="^(invited|active|inactive|archived)$")


def _user_dep(request: Request):
    if _require_adviser is None:
        raise HTTPException(status_code=500, detail="Adviser router not initialised")
    return _require_adviser(request)


@adviser_router.get("/summary")
async def adviser_summary(request: Request):
    user = await _user_dep(request)
    plan = (user.get("plan") or "").lower()
    cap = _max_clients_for(plan)
    total = await _db.adviser_clients.count_documents({"adviser_user_id": user["id"]})
    active = await _db.adviser_clients.count_documents({"adviser_user_id": user["id"], "status": "active"})
    invited = await _db.adviser_clients.count_documents({"adviser_user_id": user["id"], "status": "invited"})
    return {
        "plan": plan,
        "max_clients": cap,
        "clients_total": total,
        "clients_active": active,
        "clients_invited": invited,
        "seats_remaining": max(0, cap - total),
    }


@adviser_router.get("/clients")
async def list_clients(request: Request):
    user = await _user_dep(request)
    cursor = _db.adviser_clients.find(
        {"adviser_user_id": user["id"]},
        {"_id": 0},
    ).sort("created_at", -1).limit(500)
    return [doc async for doc in cursor]


@adviser_router.post("/clients")
async def add_client(body: ClientCreate, request: Request):
    user = await _user_dep(request)
    plan = (user.get("plan") or "").lower()
    cap = _max_clients_for(plan)
    existing = await _db.adviser_clients.count_documents({"adviser_user_id": user["id"]})
    if existing >= cap:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "client_cap_reached",
                "message": f"Your {plan.capitalize()} plan allows up to {cap} clients. Archive an inactive client or upgrade your plan.",
                "max_clients": cap,
            },
        )
    email_lc = body.client_email.lower().strip()
    dup = await _db.adviser_clients.find_one(
        {"adviser_user_id": user["id"], "client_email": email_lc}, {"_id": 0, "id": 1},
    )
    if dup:
        raise HTTPException(status_code=409, detail="Client already on your roster")
    # Soft-link: if a user with this email exists, link them.
    linked = await _db.users.find_one({"email": email_lc}, {"_id": 0, "id": 1})
    now = now_iso()
    doc = {
        "id": new_id(),
        "adviser_user_id": user["id"],
        "client_name": body.client_name.strip(),
        "client_email": email_lc,
        "linked_user_id": linked["id"] if linked else None,
        "status": "active" if linked else "invited",
        "notes": (body.notes or "").strip() or None,
        "invited_at": now,
        "last_seen_at": None,
        "created_at": now,
        "updated_at": now,
    }
    await _db.adviser_clients.insert_one(doc)
    doc.pop("_id", None)
    return doc


@adviser_router.patch("/clients/{cid}")
async def update_client(cid: str, body: ClientUpdate, request: Request):
    user = await _user_dep(request)
    found = await _db.adviser_clients.find_one(
        {"id": cid, "adviser_user_id": user["id"]}, {"_id": 0},
    )
    if not found:
        raise HTTPException(status_code=404, detail="Client not found")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        return found
    updates["updated_at"] = now_iso()
    await _db.adviser_clients.update_one(
        {"id": cid, "adviser_user_id": user["id"]}, {"$set": updates},
    )
    found.update(updates)
    return found


@adviser_router.delete("/clients/{cid}")
async def remove_client(cid: str, request: Request):
    user = await _user_dep(request)
    res = await _db.adviser_clients.delete_one(
        {"id": cid, "adviser_user_id": user["id"]},
    )
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"ok": True, "deleted": cid}
