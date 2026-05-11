"""Push notification service for the Wayly admin mobile app.

Supports two providers out-of-box:
  - **Expo Push** (default) — no creds needed; works against the Expo Push API.
  - **FCM** (Firebase Cloud Messaging) — requires `FCM_SERVER_KEY` env var.
    Uses the FCM HTTP v1 API; if no key is set, sends are logged + mocked.

Devices register their push token via `POST /api/admin/devices`. Trigger code
calls `push_service.notify_role(role=..., title=..., body=..., data=...)` or
`notify_admin(admin_id=..., ...)`. All sends are fire-and-forget and never raise.
"""
from __future__ import annotations
import os
import logging
from datetime import datetime, timezone
from typing import Optional, List
import httpx
from motor.motor_asyncio import AsyncIOMotorClient

log = logging.getLogger("push_service")
_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]

EXPO_API = "https://exp.host/--/api/v2/push/send"
FCM_API = "https://fcm.googleapis.com/fcm/send"  # legacy; v1 requires OAuth2

# Roles allowed to receive each notification type
_ROLE_FANOUT = {
    "ticket_p1": ["super_admin", "operations_admin", "support_admin"],
    "payment_failed": ["super_admin", "operations_admin"],
    "data_request": ["super_admin", "operations_admin", "support_admin"],
    "system_health": ["super_admin", "operations_admin"],
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _list_tokens_for_admin(admin_id: str) -> List[dict]:
    rows = []
    async for d in db.admin_devices.find(
        {"admin_id": admin_id, "active": True}, {"_id": 0}
    ):
        rows.append(d)
    return rows


async def _list_tokens_for_roles(roles: List[str]) -> List[dict]:
    admin_ids = []
    async for u in db.users.find(
        {"admin_role": {"$in": roles}, "disabled": {"$ne": True}},
        {"_id": 0, "id": 1},
    ):
        admin_ids.append(u["id"])
    if not admin_ids:
        return []
    rows = []
    async for d in db.admin_devices.find(
        {"admin_id": {"$in": admin_ids}, "active": True}, {"_id": 0}
    ):
        rows.append(d)
    return rows


async def _send_expo(tokens: List[str], title: str, body: str, data: Optional[dict]) -> dict:
    if not tokens:
        return {"ok": True, "sent": 0, "provider": "expo", "mocked": False}
    messages = [{
        "to": t, "title": title, "body": body, "sound": "default",
        "data": data or {}, "priority": "high",
    } for t in tokens if t.startswith("ExponentPushToken[") or t.startswith("ExpoPushToken[")]
    if not messages:
        return {"ok": True, "sent": 0, "provider": "expo", "mocked": False, "reason": "no valid expo tokens"}
    try:
        async with httpx.AsyncClient(timeout=10) as cx:
            r = await cx.post(EXPO_API, json=messages,
                              headers={"Accept": "application/json", "Content-Type": "application/json"})
            ok = r.status_code == 200
            return {"ok": ok, "sent": len(messages), "provider": "expo",
                    "response_status": r.status_code,
                    "mocked": False}
    except Exception as e:
        log.warning("Expo push send failed: %s", e)
        return {"ok": False, "sent": 0, "provider": "expo", "error": str(e)[:200]}


async def _send_fcm(tokens: List[str], title: str, body: str, data: Optional[dict]) -> dict:
    server_key = os.environ.get("FCM_SERVER_KEY") or ""
    if not server_key:
        # No FCM creds configured — log mocked send
        log.info("[FCM MOCK] would notify %d device(s): %s | %s", len(tokens), title, body)
        return {"ok": True, "sent": 0, "provider": "fcm", "mocked": True}
    if not tokens:
        return {"ok": True, "sent": 0, "provider": "fcm"}
    payload = {
        "registration_ids": tokens,
        "notification": {"title": title, "body": body, "sound": "default"},
        "data": data or {},
        "priority": "high",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as cx:
            r = await cx.post(FCM_API, json=payload,
                              headers={"Authorization": f"key={server_key}",
                                       "Content-Type": "application/json"})
            return {"ok": r.status_code == 200, "sent": len(tokens), "provider": "fcm",
                    "response_status": r.status_code, "mocked": False}
    except Exception as e:
        log.warning("FCM send failed: %s", e)
        return {"ok": False, "sent": 0, "provider": "fcm", "error": str(e)[:200]}


async def _send_to_devices(devices: List[dict], title: str, body: str, data: Optional[dict]) -> dict:
    """Fan out across providers."""
    expo_tokens = [d["token"] for d in devices if d.get("provider") == "expo"]
    fcm_tokens = [d["token"] for d in devices if d.get("provider") == "fcm"]
    expo_result = await _send_expo(expo_tokens, title, body, data)
    fcm_result = await _send_fcm(fcm_tokens, title, body, data)

    # Log delivery attempt
    try:
        await db.push_log.insert_one({
            "ts": _now(),
            "title": title, "body": body,
            "data": data or {},
            "device_count": len(devices),
            "expo": expo_result,
            "fcm": fcm_result,
        })
    except Exception:
        pass

    return {
        "ok": expo_result.get("ok", True) and fcm_result.get("ok", True),
        "sent": expo_result.get("sent", 0) + fcm_result.get("sent", 0),
        "device_count": len(devices),
        "expo": expo_result, "fcm": fcm_result,
    }


# ---------------- PUBLIC API ----------------

async def notify_admin(admin_id: str, title: str, body: str, data: Optional[dict] = None) -> dict:
    """Send a push to all of one admin's registered devices."""
    devices = await _list_tokens_for_admin(admin_id)
    return await _send_to_devices(devices, title, body, data)


async def notify_role(role_key: str, title: str, body: str, data: Optional[dict] = None) -> dict:
    """Fan-out to every admin whose role is in _ROLE_FANOUT[role_key]."""
    roles = _ROLE_FANOUT.get(role_key, ["super_admin"])
    devices = await _list_tokens_for_roles(roles)
    return await _send_to_devices(devices, title, body, data)


async def notify_admin_test(admin_id: str) -> dict:
    """Used by /api/admin/devices/test-push so a freshly-registered mobile device
    can confirm push delivery."""
    return await notify_admin(
        admin_id,
        title="Wayly admin",
        body="Push notifications are working 🎉",
        data={"type": "test", "ts": _now()},
    )
