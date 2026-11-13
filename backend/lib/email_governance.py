"""Email governance — marketing consent, suppression, unsubscribe tokens and
the ONE central eligibility gate used by every marketing send path.

Web and mobile share this single FastAPI backend, so a preference recorded on
either surface applies to both automatically (there is only one `users` row
and one suppression list).

Phase 1 (Business OS) scope: consent capture + preferences + suppression. We
NEVER gate transactional/essential email here (verification, password reset,
security, billing, trial lifecycle) — only marketing/nurture is gated.
"""
from __future__ import annotations
import os
import uuid
import hmac
import json
import base64
import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional, Tuple

log = logging.getLogger("wayly.email_gov")

MARKETING_CONSENT_VERSION = "marketing-consent-v1-2026-06"
CONSENT_WORDING = (
    "Email me helpful aged-care guides, product updates and occasional news "
    "from Wayly. I can unsubscribe at any time."
)

# --- categories -------------------------------------------------------------
TRANSACTIONAL = "transactional"   # always allowed, never gated
MARKETING = "marketing"           # gated on consent + suppression

# Classify every email the app sends. Unknown templates are treated as
# marketing (fail-safe: a new template cannot bypass consent by accident).
EMAIL_TEMPLATES = {
    # Transactional / essential — consent NOT required
    "email_verification": TRANSACTIONAL,
    "password_reset": TRANSACTIONAL,
    "email_change": TRANSACTIONAL,
    "security_alert": TRANSACTIONAL,
    "welcome": TRANSACTIONAL,
    "trial_start": TRANSACTIONAL,
    "trial_reminder": TRANSACTIONAL,
    "trial_expired": TRANSACTIONAL,
    "billing_receipt": TRANSACTIONAL,
    "failed_payment": TRANSACTIONAL,
    "tool_result": TRANSACTIONAL,       # user explicitly asked us to email it
    "contact_autoreply": TRANSACTIONAL,
    "contact_team": TRANSACTIONAL,
    "support_reply": TRANSACTIONAL,
    "weekly_digest": TRANSACTIONAL,     # opt-in product feature w/ its own prefs
    "anomaly_alert": TRANSACTIONAL,
    "adviser_invite": TRANSACTIONAL,
    # Marketing / nurture — consent REQUIRED + suppression-checked
    "onboarding_series": MARKETING,
    "product_news": MARKETING,
    "nurture": MARKETING,
    "admin_campaign": MARKETING,
}


def category_for(template: str) -> str:
    return EMAIL_TEMPLATES.get(template, MARKETING)


def is_marketing(template: str) -> bool:
    return category_for(template) == MARKETING


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# --- de-identified email hashing (tombstones / suppression keys) ------------
def email_hash(email: str) -> str:
    return hashlib.sha256((email or "").strip().lower().encode("utf-8")).hexdigest()


# --- signed preference/unsubscribe tokens -----------------------------------
# No new secret required: derive a dedicated signing key from JWT_SECRET so the
# token can never be reused as an auth token and vice-versa.
def _token_secret() -> bytes:
    base = os.environ.get("EMAIL_TOKEN_SECRET") or os.environ.get("JWT_SECRET") or ""
    return hashlib.sha256(("wayly-email-token::" + base).encode("utf-8")).digest()


def _b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode("ascii").rstrip("=")


def _b64u_dec(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def make_email_token(user_id: str, email: str, purpose: str = "prefs") -> str:
    body = {"u": user_id, "e": (email or "").strip().lower(), "p": purpose}
    raw = json.dumps(body, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload = _b64u(raw)
    sig = _b64u(hmac.new(_token_secret(), payload.encode("ascii"), hashlib.sha256).digest())
    return f"{payload}.{sig}"


def verify_email_token(token: str) -> Optional[dict]:
    """Return the token body dict if the signature is valid, else None.
    Unsubscribe tokens intentionally never expire (RFC 8058 links must keep
    working), but they are bound to a single user_id + email."""
    try:
        payload, sig = (token or "").split(".", 1)
    except ValueError:
        return None
    expected = _b64u(hmac.new(_token_secret(), payload.encode("ascii"), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        return json.loads(_b64u_dec(payload))
    except Exception:
        return None


# --- List-Unsubscribe headers (marketing emails only) -----------------------
def marketing_unsub_headers(base_url: str, token: str) -> dict:
    url = f"{base_url.rstrip('/')}/api/email/unsubscribe?token={token}"
    mailto = "mailto:unsubscribe@wayly.com.au?subject=unsubscribe"
    return {
        "List-Unsubscribe": f"<{url}>, <{mailto}>",
        # RFC 8058: one-click POST support (providers POST to the https URL).
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    }


# --- consent ----------------------------------------------------------------
async def record_consent(db, *, user_id, email, opted_in, source,
                         version=MARKETING_CONSENT_VERSION) -> None:
    now = _now_iso()
    await db.users.update_one({"id": user_id}, {"$set": {
        "marketing_consent": bool(opted_in),
        "marketing_consent_at": now,
        "marketing_consent_source": source,
        "marketing_consent_version": version,
    }})
    await db.marketing_consent_events.insert_one({
        "id": uuid.uuid4().hex,
        "user_id": user_id,
        "email_hash": email_hash(email),
        "status": "opted_in" if opted_in else "opted_out",
        "source": source,
        "version": version,
        "created_at": now,
    })
    # Re-opting-in clears a prior *unsubscribe* tombstone, but NEVER a hard
    # bounce or spam complaint (those stay to protect sender reputation).
    if opted_in:
        await db.email_suppressions.delete_many(
            {"email_hash": email_hash(email), "reason": "unsubscribe"}
        )


# --- suppression ------------------------------------------------------------
PERMANENT_REASONS = {"bounce_permanent", "complaint", "unsubscribe", "account_deleted"}


async def suppress(db, *, email, reason, permanent=True, meta=None) -> None:
    now = _now_iso()
    await db.email_suppressions.update_one(
        {"email_hash": email_hash(email), "reason": reason},
        {"$set": {"email_hash": email_hash(email), "reason": reason,
                  "permanent": bool(permanent), "updated_at": now, "meta": meta or {}},
         "$setOnInsert": {"created_at": now}},
        upsert=True,
    )


async def is_suppressed(db, email) -> bool:
    doc = await db.email_suppressions.find_one(
        {"email_hash": email_hash(email), "permanent": True}, {"_id": 1}
    )
    return bool(doc)


# --- central eligibility gate ----------------------------------------------
async def can_send_marketing(db, *, user=None, email=None) -> Tuple[bool, str]:
    """The single source of truth for 'may we send this person marketing?'.
    Returns (ok, reason). Used by the admin campaign sender and every future
    nurture/onboarding path."""
    u = user
    em = email or (u or {}).get("email")
    if not em:
        return False, "no_email"
    if u is None:
        u = await db.users.find_one({"email": (em or "").strip().lower()}, {"_id": 0})
    if u is None:
        return False, "no_account"
    if u.get("deleted_at"):
        return False, "deleted"
    if not u.get("marketing_consent"):
        return False, "no_consent"
    if await is_suppressed(db, em):
        return False, "suppressed"
    return True, "ok"


async def ensure_indexes(db) -> None:
    await db.marketing_consent_events.create_index([("user_id", 1), ("created_at", -1)])
    await db.email_suppressions.create_index(
        [("email_hash", 1), ("reason", 1)], unique=True)
    await db.email_suppressions.create_index("permanent")
