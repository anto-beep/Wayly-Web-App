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


# --- pseudonymous (keyed) email hashing (tombstones / suppression keys) -----
# IMPORTANT: these identifiers are PSEUDONYMOUS personal information, not fully
# anonymous data. We use a keyed HMAC-SHA256 (NOT a bare SHA-256) so the hash
# cannot be reversed by brute-forcing the small space of real email addresses
# without also knowing the server-side secret (EMAIL_HASH_SECRET).
class EmailHashSecretMissing(RuntimeError):
    """Raised when EMAIL_HASH_SECRET is not configured. Any caller on a
    MARKETING send path MUST treat this as 'do not send' (fail closed)."""


def normalize_email(email: str) -> str:
    """Single, consistent normalisation applied before hashing/compare so the
    same address always maps to the same identifier."""
    return (email or "").strip().lower()


def _email_hash_secret() -> bytes:
    base = os.environ.get("EMAIL_HASH_SECRET") or ""
    # Fail safe: refuse to emit a weak/guessable identifier. A short or missing
    # secret is treated as not-configured so we never silently downgrade.
    if len(base) < 16:
        raise EmailHashSecretMissing(
            "EMAIL_HASH_SECRET is missing or too short (need >= 16 chars)")
    # Domain-separate from the token-signing key even if they share a source.
    return hashlib.sha256(("wayly-email-hmac::" + base).encode("utf-8")).digest()


def email_hash_available() -> bool:
    try:
        _email_hash_secret()
        return True
    except EmailHashSecretMissing:
        return False


def email_hash(email: str) -> str:
    """Keyed HMAC-SHA256 of the normalised address, hex-encoded. Raises
    EmailHashSecretMissing if the secret is absent (never silently downgrades
    to an unkeyed hash). The secret is never logged."""
    return hmac.new(_email_hash_secret(), normalize_email(email).encode("utf-8"),
                    hashlib.sha256).hexdigest()


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
    body = {"u": user_id, "e": normalize_email(email), "p": purpose,
            "iat": int(datetime.now(timezone.utc).timestamp())}
    raw = json.dumps(body, separators=(",", ":"), sort_keys=True).encode("utf-8")
    payload = _b64u(raw)
    sig = _b64u(hmac.new(_token_secret(), payload.encode("ascii"), hashlib.sha256).digest())
    return f"{payload}.{sig}"


def verify_email_token(token: str, *, expected_purpose: Optional[str] = None,
                       max_age_days: Optional[int] = None) -> Optional[dict]:
    """Return the token body dict if the signature is valid, else None.

    Tokens are HMAC-signed (constant-time compared) and bound to a single
    user_id + email + purpose, with an issued-at (`iat`).
      - Unsubscribe / opt-OUT tokens intentionally never expire (RFC 8058
        links must keep working; replaying an opt-out is idempotent/harmless).
      - For the MUTATING opt-IN path the caller passes expected_purpose="prefs"
        and max_age_days, so a long-lived link can't be replayed to
        re-subscribe someone. A token with no / malformed `iat` is treated as
        too old (fail closed)."""
    try:
        payload, sig = (token or "").split(".", 1)
    except ValueError:
        return None
    expected = _b64u(hmac.new(_token_secret(), payload.encode("ascii"), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        data = json.loads(_b64u_dec(payload))
    except Exception:
        return None
    if expected_purpose is not None and data.get("p") != expected_purpose:
        return None
    if max_age_days is not None:
        iat = data.get("iat")
        if not isinstance(iat, int):
            return None  # legacy / undated token → too old for a mutating opt-in
        age = datetime.now(timezone.utc).timestamp() - iat
        if age < 0 or age > max_age_days * 86400:
            return None
    return data


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
                         version=MARKETING_CONSENT_VERSION,
                         clear_suppression: bool = False) -> None:
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
    # Explicit affirmative opt-in clears prior OPT-OUT tombstones (a manual
    # unsubscribe OR an account-deletion opt-out) — but ONLY once email
    # ownership is proven (`clear_suppression=True`): a verified login, a
    # verification success, or possession of an emailed prefs token. NEVER
    # clears a hard bounce or spam complaint.
    if opted_in and clear_suppression:
        await clear_optout_tombstones(db, email)


# --- suppression ------------------------------------------------------------
PERMANENT_REASONS = {"bounce_permanent", "complaint", "unsubscribe", "account_deleted"}

# Opt-out tombstones that an explicit, verified re-consent is allowed to clear.
# Deliberately EXCLUDES complaint + bounce_permanent (never auto-cleared, to
# protect sender reputation and honour hard signals).
OPTIN_CLEARABLE_REASONS = {"unsubscribe", "account_deleted"}


async def clear_optout_tombstones(db, email) -> None:
    """Remove ONLY the user-reversible opt-out tombstones for this address on
    an explicit affirmative opt-in. Never touches complaint/bounce_permanent."""
    await db.email_suppressions.delete_many(
        {"email_hash": email_hash(email),
         "reason": {"$in": list(OPTIN_CLEARABLE_REASONS)}})


async def on_email_verified(db, user) -> None:
    """Call after an email address is PROVEN owned (verification success).
    Now that ownership is confirmed, if the user has marketing consent on file
    we clear reversible opt-out tombstones (a prior unsubscribe or an
    account-deletion opt-out) so a legitimate re-signup can opt back in —
    but complaint / hard-bounce suppressions are never cleared. This is what
    enforces 'verify ownership BEFORE a new signup overrides an unsubscribe'."""
    if user and user.get("marketing_consent"):
        try:
            await clear_optout_tombstones(db, user.get("email") or "")
        except Exception as e:  # pragma: no cover
            log.warning("on_email_verified tombstone clear failed: %s", e)


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
    # Phase 2 / item-5: marketing only ever goes to a VERIFIED email address.
    if not u.get("email_verified"):
        return False, "unverified_email"
    # Fail closed: if we cannot compute the keyed suppression identifier we must
    # NOT send marketing (a missing secret can't be allowed to bypass the list).
    try:
        suppressed = await is_suppressed(db, em)
    except EmailHashSecretMissing:
        return False, "hash_unavailable"
    if suppressed:
        return False, "suppressed"
    return True, "ok"


async def ensure_indexes(db) -> None:
    await db.marketing_consent_events.create_index([("user_id", 1), ("created_at", -1)])
    await db.email_suppressions.create_index(
        [("email_hash", 1), ("reason", 1)], unique=True)
    await db.email_suppressions.create_index("permanent")
