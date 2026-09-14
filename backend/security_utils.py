"""Phase 1 security utilities: TOTP encryption at rest, HIBP k-anonymity password
breach check, JWT token blocklist (revocation list).

All helpers are stack-internal, no external deps beyond cryptography (already
pinned in requirements.txt), httpx, and motor. Designed for FastAPI + MongoDB.

Layered explicitly *on top of* the existing `auth.py` so we don't break the
24+ files that already import from there.
"""
from __future__ import annotations
import os
import hashlib
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from cryptography.fernet import Fernet, InvalidToken
from motor.motor_asyncio import AsyncIOMotorClient

log = logging.getLogger("wayly.security")

# ----------------------------- Fernet (TOTP secret encryption) -----------------------------
_TOTP_ENC_KEY = os.environ.get("TOTP_ENC_KEY")
if not _TOTP_ENC_KEY:
    # Fail loud, we never want TOTP secrets sitting in plaintext silently.
    raise RuntimeError(
        "TOTP_ENC_KEY env var is missing. Generate one with: "
        "python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'"
    )
_fernet = Fernet(_TOTP_ENC_KEY.encode())

# A stored TOTP secret is wrapped with a single-byte prefix so we can tell a
# Fernet ciphertext from a legacy plaintext base32 secret during migration.
_ENC_PREFIX = "fernet:v1:"


def encrypt_totp_secret(plain: str) -> str:
    """Wrap a base32 TOTP secret with Fernet AEAD for at-rest storage."""
    if not plain:
        return plain
    token = _fernet.encrypt(plain.encode("utf-8")).decode("utf-8")
    return _ENC_PREFIX + token


def decrypt_totp_secret(stored: Optional[str]) -> Optional[str]:
    """Return the plaintext base32 secret regardless of whether the stored value
    is the new Fernet-wrapped form or a legacy plaintext from before Phase 1.

    Legacy values (no prefix) are returned as-is so the verifier still works;
    a follow-up `migrate_totp_secret_if_needed` call should re-encrypt them
    after the next successful 2FA challenge.
    """
    if not stored:
        return stored
    if not stored.startswith(_ENC_PREFIX):
        # legacy plaintext from pre-Phase-1
        return stored
    try:
        return _fernet.decrypt(stored[len(_ENC_PREFIX):].encode("utf-8")).decode("utf-8")
    except InvalidToken:
        log.error("TOTP secret could not be decrypted, wrong TOTP_ENC_KEY?")
        return None


def is_totp_encrypted(stored: Optional[str]) -> bool:
    return bool(stored) and stored.startswith(_ENC_PREFIX)


# ----------------------------- HIBP k-Anonymity password breach check -----------------------------

_HIBP_BLOCK = os.environ.get("HIBP_BLOCK_COMPROMISED", "true").lower() in ("1", "true", "yes")
_HIBP_TIMEOUT = 3.0  # seconds, fail-open if HIBP API is unreachable


async def hibp_pwned_count(password: str) -> int:
    """Return how many times `password` appears in the HIBP breach corpus.

    Uses the k-Anonymity API, we send only the first 5 hex chars of the
    SHA-1 hash; the password itself never leaves the server. Returns 0 on
    any network/API error (fail-open, logged), so HIBP being down does not
    block users from signing up.
    """
    try:
        digest = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
        prefix, suffix = digest[:5], digest[5:]
        async with httpx.AsyncClient(timeout=_HIBP_TIMEOUT) as client:
            r = await client.get(
                f"https://api.pwnedpasswords.com/range/{prefix}",
                headers={"User-Agent": "Wayly-Security-Audit"},
            )
        if r.status_code != 200:
            log.warning("HIBP returned status %s, failing open", r.status_code)
            return 0
        for line in r.text.splitlines():
            try:
                hsuffix, count = line.strip().split(":", 1)
            except ValueError:
                continue
            if hsuffix.upper() == suffix:
                return int(count)
        return 0
    except Exception as e:  # network errors, DNS, timeout, etc.
        log.warning("HIBP check failed: %s, failing open", e)
        return 0


async def assert_password_not_pwned(password: str) -> None:
    """Raise HTTPException 400 if the password appears in any HIBP breach.

    Controlled by HIBP_BLOCK_COMPROMISED env (default: true). When false this
    becomes a no-op but the check still runs and logs, useful for staging
    rollouts where we don't want to lock users out.
    """
    from fastapi import HTTPException
    if not password or len(password) < 8:
        return  # let the normal validator handle short passwords
    count = await hibp_pwned_count(password)
    if count > 0:
        log.info("HIBP: password seen %d times in breaches", count)
        if _HIBP_BLOCK:
            raise HTTPException(
                status_code=400,
                detail=(
                    "This password has appeared in known data breaches and is "
                    "no longer safe to use. Please choose a different password."
                ),
            )


# ----------------------------- JWT token blocklist (revocation) -----------------------------

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
_db = _client[os.environ["DB_NAME"]]


async def ensure_security_indexes() -> None:
    """Idempotent, call once at startup. Creates the indexes the new auth
    blocklist + caregiver MFA + lockout flow rely on."""
    try:
        # TTL: revoked tokens are auto-purged when their original exp passes.
        await _db.revoked_tokens.create_index("expires_at", expireAfterSeconds=0)
        await _db.revoked_tokens.create_index("jti", unique=True)
        # Lookups by user-id are used by `revoke_all_user_tokens`.
        await _db.revoked_tokens.create_index("user_id")
        # Used for caregiver MFA challenge tokens (pre-2FA short-lived tokens).
        await _db.users.create_index("email", unique=True)
        # Used by `record_login_failure` / `_clear_login_failures`.
        await _db.users.create_index(
            [("user_failed_login_count", 1)], sparse=True, name="user_failed_login_count"
        )
    except Exception as e:
        log.warning("ensure_security_indexes failed: %s", e)


async def revoke_jti(jti: str, user_id: str, exp_dt: datetime, reason: str = "logout") -> None:
    """Add a token's `jti` to the blocklist until its natural expiry."""
    try:
        await _db.revoked_tokens.update_one(
            {"jti": jti},
            {"$set": {
                "jti": jti,
                "user_id": user_id,
                "reason": reason,
                "expires_at": exp_dt,
                "revoked_at": datetime.now(timezone.utc),
            }},
            upsert=True,
        )
    except Exception as e:
        log.warning("revoke_jti(%s) failed: %s", jti, e)


async def is_jti_revoked(jti: Optional[str]) -> bool:
    if not jti:
        return False
    try:
        doc = await _db.revoked_tokens.find_one({"jti": jti}, {"_id": 1})
        return doc is not None
    except Exception as e:
        log.warning("is_jti_revoked(%s) failed: %s, failing closed", jti, e)
        # Fail closed: if the blocklist is unreachable, treat token as revoked.
        return True


async def revoke_all_user_tokens(user_id: str, reason: str = "password_change") -> int:
    """Mark a sentinel that says "every token issued before NOW for this user
    is invalid". Used on password change / account delete / admin lockout.

    We can't enumerate JWTs (they're stateless), so we instead bump the user's
    `token_invalid_before` field. The auth decoder must check `iat >=
    token_invalid_before` on every request.
    """
    try:
        now = datetime.now(timezone.utc)
        result = await _db.users.update_one(
            {"id": user_id},
            {"$set": {
                "token_invalid_before": now.isoformat(),
                "token_invalid_reason": reason,
            }},
        )
        return result.modified_count
    except Exception as e:
        log.warning("revoke_all_user_tokens(%s) failed: %s", user_id, e)
        return 0


async def get_token_invalid_before(user_id: str) -> Optional[datetime]:
    try:
        u = await _db.users.find_one({"id": user_id}, {"_id": 0, "token_invalid_before": 1})
        if not u or not u.get("token_invalid_before"):
            return None
        return datetime.fromisoformat(u["token_invalid_before"])
    except Exception:
        return None


# ----------------------------- caregiver lockout helpers -----------------------------

_USER_LOCKOUT_THRESHOLD = int(os.environ.get("USER_LOGIN_LOCKOUT_THRESHOLD", "5"))
_USER_LOCKOUT_MINUTES = int(os.environ.get("USER_LOGIN_LOCKOUT_MINUTES", "15"))


async def is_user_locked(user_id: str) -> tuple[bool, Optional[datetime]]:
    """Return (is_locked, lockout_until_dt or None)."""
    u = await _db.users.find_one(
        {"id": user_id}, {"_id": 0, "user_lockout_until": 1}
    )
    raw = (u or {}).get("user_lockout_until")
    if not raw:
        return False, None
    try:
        until = datetime.fromisoformat(raw)
    except Exception:
        return False, None
    if until > datetime.now(timezone.utc):
        return True, until
    return False, None


async def record_login_failure(user_id: str) -> None:
    from datetime import timedelta
    u = await _db.users.find_one(
        {"id": user_id}, {"_id": 0, "user_failed_login_count": 1}
    )
    n = int((u or {}).get("user_failed_login_count") or 0) + 1
    update: dict = {"user_failed_login_count": n}
    if n >= _USER_LOCKOUT_THRESHOLD:
        update["user_lockout_until"] = (
            datetime.now(timezone.utc) + timedelta(minutes=_USER_LOCKOUT_MINUTES)
        ).isoformat()
        update["user_failed_login_count"] = 0
    await _db.users.update_one({"id": user_id}, {"$set": update})


async def clear_login_failures(user_id: str) -> None:
    await _db.users.update_one(
        {"id": user_id},
        {"$set": {"user_failed_login_count": 0, "user_lockout_until": None}},
    )


# ----------------------------- Phase 2: participant access isolation -----------------------------

class ParticipantAccessDenied(Exception):
    """Raised when a user attempts to read/write a participant outside their
    household / account. Always surfaces as a 404 to the client (never 403) so
    we don't leak the existence of unrelated participants."""


async def _user_household_and_account(user_id: str) -> tuple[Optional[str], Optional[str]]:
    """Return `(household_id, account_id)` for a user, or (None, None) if the
    user has no household yet (legacy / mid-onboarding)."""
    u = await _db.users.find_one({"id": user_id}, {"_id": 0, "household_id": 1})
    hid = (u or {}).get("household_id")
    acct = await _db.accounts.find_one({"owner_user_id": user_id}, {"_id": 0, "id": 1})
    return hid, (acct or {}).get("id")


async def assert_participant_access(
    user_id: str,
    participant_id: Optional[str],
    *,
    allow_none: bool = False,
    require_active: bool = True,
) -> Optional[dict]:
    """Central, audited gate for every endpoint that touches participant data.

    - Returns the participant dict (no `_id`) when access is permitted.
    - Raises HTTPException(404) when the participant either doesn't exist or
      doesn't belong to the caller's household OR account. We always 404 (not
      403) so existence cannot be probed.
    - Honours `allow_none=True` for endpoints that accept "no participant
      selected", in that mode a missing pid resolves to (None) instead of
      raising.

    The helper is intentionally simple: ANY new endpoint that consumes a
    participant_id from path / query / body / header MUST call this first.
    """
    from fastapi import HTTPException

    if not participant_id:
        if allow_none:
            return None
        raise HTTPException(status_code=400, detail="participant_id is required")

    p = await _db.participants.find_one({"id": participant_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")

    if require_active:
        if p.get("status") == "REMOVED" or p.get("is_archived") is True:
            raise HTTPException(status_code=404, detail="Participant not found")

    user_hid, user_acct = await _user_household_and_account(user_id)
    p_hid = p.get("household_id")
    p_acct = p.get("account_id")

    # Match either via household (legacy / current data model) OR account
    # (newer multi-participant accounts). One of the two must agree.
    via_household = bool(user_hid and p_hid and user_hid == p_hid)
    via_account = bool(user_acct and p_acct and user_acct == p_acct)

    if not (via_household or via_account):
        log.warning(
            "participant access denied: user=%s p=%s p_hid=%s user_hid=%s p_acct=%s user_acct=%s",
            user_id, participant_id, p_hid, user_hid, p_acct, user_acct,
        )
        # 404 not 403, no probing.
        raise HTTPException(status_code=404, detail="Participant not found")

    return p


async def assert_household_access(user_id: str, household_id: Optional[str]) -> str:
    """Same contract as `assert_participant_access` but for household-scoped
    routes. Returns the household_id when access is permitted."""
    from fastapi import HTTPException
    if not household_id:
        raise HTTPException(status_code=400, detail="household_id is required")
    user_hid, _ = await _user_household_and_account(user_id)
    if not user_hid or user_hid != household_id:
        log.warning("household access denied: user=%s requested=%s actual=%s",
                    user_id, household_id, user_hid)
        raise HTTPException(status_code=404, detail="Household not found")
    return user_hid
