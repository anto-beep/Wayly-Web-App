"""Twilio SMS scaffold for Wayly.

Behind a feature flag (`SMS_ENABLED`). When disabled or credentials missing,
all sends are logged and return `{ok:true, mocked:true}`. Wire the live SDK
later by setting `SMS_ENABLED=true` + `TWILIO_*` env vars.
"""
from __future__ import annotations
import os
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger("wayly.sms")


def _flag(name: str) -> bool:
    v = (os.environ.get(name) or "").strip().lower()
    return v in ("1", "true", "yes", "on")


def sms_enabled() -> bool:
    if not _flag("SMS_ENABLED"):
        return False
    if not os.environ.get("TWILIO_ACCOUNT_SID"):
        return False
    if not os.environ.get("TWILIO_AUTH_TOKEN"):
        return False
    if not os.environ.get("TWILIO_FROM_NUMBER"):
        return False
    return True


def whatsapp_enabled() -> bool:
    """Future expansion — flag-gated."""
    return sms_enabled() and _flag("WHATSAPP_ENABLED")


async def send_sms(to_e164: str, body: str) -> Dict[str, Any]:
    """Send a one-off SMS. Always returns a result dict; never raises on send failure."""
    body = (body or "").strip()
    if not body:
        return {"ok": False, "error": "empty_body"}
    if not to_e164 or not to_e164.startswith("+"):
        return {"ok": False, "error": "invalid_e164"}
    if len(body) > 480:
        body = body[:477] + "..."
    if not sms_enabled():
        logger.info("[SMS-MOCK] to=%s body=%r", to_e164, body[:120])
        return {"ok": True, "mocked": True, "to": to_e164, "preview": body[:120]}
    try:
        # Lazy import — only loaded when the live flag is on.
        from twilio.rest import Client  # type: ignore
        client = Client(
            os.environ["TWILIO_ACCOUNT_SID"],
            os.environ["TWILIO_AUTH_TOKEN"],
        )
        msg = client.messages.create(
            body=body,
            from_=os.environ["TWILIO_FROM_NUMBER"],
            to=to_e164,
        )
        return {"ok": True, "sid": msg.sid, "to": to_e164}
    except Exception as e:
        logger.warning("SMS send failed to=%s err=%s", to_e164, e)
        return {"ok": False, "error": str(e)}


async def send_whatsapp(to_e164: str, body: str) -> Dict[str, Any]:
    if not whatsapp_enabled():
        logger.info("[WA-MOCK] to=%s body=%r", to_e164, (body or "")[:120])
        return {"ok": True, "mocked": True, "channel": "whatsapp"}
    try:
        from twilio.rest import Client  # type: ignore
        client = Client(
            os.environ["TWILIO_ACCOUNT_SID"],
            os.environ["TWILIO_AUTH_TOKEN"],
        )
        msg = client.messages.create(
            body=body,
            from_=f"whatsapp:{os.environ['TWILIO_FROM_NUMBER']}",
            to=f"whatsapp:{to_e164}",
        )
        return {"ok": True, "sid": msg.sid, "channel": "whatsapp"}
    except Exception as e:
        logger.warning("WhatsApp send failed: %s", e)
        return {"ok": False, "error": str(e)}


def normalize_phone_e164(phone: Optional[str], default_cc: str = "+61") -> Optional[str]:
    """Best-effort E.164 normalization for AU numbers. Returns None if invalid."""
    if not phone:
        return None
    s = "".join(c for c in phone if c.isdigit() or c == "+")
    if not s:
        return None
    if s.startswith("+"):
        digits = s[1:]
        if 8 <= len(digits) <= 15 and digits.isdigit():
            return "+" + digits
        return None
    # Australian leading 0 → +61
    if default_cc == "+61" and s.startswith("0") and len(s) == 10:
        return "+61" + s[1:]
    if 8 <= len(s) <= 15 and s.isdigit():
        return default_cc + s
    return None
