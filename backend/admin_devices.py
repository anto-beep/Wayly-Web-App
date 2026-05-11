"""Admin mobile-device push-token registration.

Routes (all admin-auth required):
  POST   /api/admin/devices           — register or refresh a push token
  GET    /api/admin/devices           — list this admin's devices
  DELETE /api/admin/devices/{id}      — unregister a device (sign-out, lost phone)
  POST   /api/admin/devices/test-push — fire a test push to all this admin's devices
"""
from __future__ import annotations
import os
import secrets
from datetime import datetime, timezone
from typing import Optional, Literal
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from admin_auth import get_current_admin, audit_log
import push_service

devices_router = APIRouter(prefix="/admin/devices", tags=["admin-devices"])

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class DeviceRegistration(BaseModel):
    token: str = Field(min_length=10, max_length=400)
    platform: Literal["ios", "android"] = "ios"
    provider: Literal["expo", "fcm"] = "expo"
    app_version: Optional[str] = Field(None, max_length=40)
    device_name: Optional[str] = Field(None, max_length=120)


@devices_router.post("")
async def register_device(body: DeviceRegistration, admin: dict = Depends(get_current_admin)):
    """Idempotent — if the same token is already registered to this admin,
    bump last_seen_at instead of duplicating."""
    existing = await db.admin_devices.find_one(
        {"admin_id": admin["id"], "token": body.token},
        {"_id": 0, "id": 1},
    )
    if existing:
        await db.admin_devices.update_one(
            {"id": existing["id"]},
            {"$set": {
                "platform": body.platform,
                "provider": body.provider,
                "app_version": body.app_version,
                "device_name": body.device_name,
                "active": True,
                "last_seen_at": _now(),
            }},
        )
        return {"ok": True, "device_id": existing["id"], "refreshed": True}

    rec = {
        "id": secrets.token_urlsafe(10),
        "admin_id": admin["id"],
        "token": body.token,
        "platform": body.platform,
        "provider": body.provider,
        "app_version": body.app_version,
        "device_name": body.device_name,
        "active": True,
        "created_at": _now(),
        "last_seen_at": _now(),
    }
    await db.admin_devices.insert_one(rec)
    await audit_log(admin["id"], "admin_device_registered", target_id=rec["id"],
                    detail={"platform": body.platform, "provider": body.provider})
    return {"ok": True, "device_id": rec["id"], "refreshed": False}


@devices_router.get("")
async def list_my_devices(admin: dict = Depends(get_current_admin)):
    rows = []
    async for d in db.admin_devices.find(
        {"admin_id": admin["id"]},
        {"_id": 0, "token": 0},  # don't leak tokens back to clients
    ).sort("last_seen_at", -1):
        rows.append(d)
    return {"devices": rows, "total": len(rows)}


@devices_router.delete("/{device_id}")
async def unregister_device(device_id: str, admin: dict = Depends(get_current_admin)):
    res = await db.admin_devices.update_one(
        {"id": device_id, "admin_id": admin["id"]},
        {"$set": {"active": False, "deactivated_at": _now()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Device not found")
    await audit_log(admin["id"], "admin_device_unregistered", target_id=device_id)
    return {"ok": True}


@devices_router.post("/test-push")
async def test_push(admin: dict = Depends(get_current_admin)):
    """Fire a test push to every active device registered to this admin.
    Useful for the mobile agent to verify FCM/Expo wiring on first install."""
    result = await push_service.notify_admin_test(admin["id"])
    return {"ok": True, "result": result}
