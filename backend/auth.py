"""JWT authentication utilities for Wayly.

Phase 1 security hardening, replaces the old single-token model with:

* Fail-fast secrets, JWT_SECRET must exist; admin JWTs are signed with a
  *separate* ADMIN_JWT_SECRET (defence-in-depth, so a compromised user secret
  doesn't unlock the admin realm).
* Short-lived access tokens (60 min default) + long-lived refresh tokens
  (30 days default).
* `jti` on every token + a Mongo-backed blocklist for logout / password
  change / account delete.
* `token_invalid_before` per-user sentinel checked on every decode, so
  password change instantly kills all outstanding access tokens.

Backwards-compatible exports (`JWT_SECRET`, `JWT_ALGORITHM`, `create_token`,
`decode_token`, `hash_password`, `verify_password`, `get_current_user_id`,
`get_current_admin_id`) are preserved so the rest of the codebase keeps
working untouched.
"""
import os
from pathlib import Path
from dotenv import load_dotenv as _load_dotenv
_load_dotenv(Path(__file__).parent / ".env")

import secrets
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# ----------------------------- env / fail-fast -----------------------------

_RAW_JWT_SECRET = os.environ.get("JWT_SECRET")
if not _RAW_JWT_SECRET or _RAW_JWT_SECRET == "dev-secret":
    raise RuntimeError(
        "JWT_SECRET env var is missing or set to the legacy 'dev-secret' "
        "placeholder. Generate a fresh 64-char hex secret with "
        "`python -c 'import secrets; print(secrets.token_hex(32))'` and set it "
        "in /app/backend/.env before starting the server."
    )

JWT_SECRET = _RAW_JWT_SECRET
ADMIN_JWT_SECRET = os.environ.get("ADMIN_JWT_SECRET") or JWT_SECRET
if ADMIN_JWT_SECRET == JWT_SECRET:
    # not fatal, but log a clear warning
    import logging
    logging.getLogger("wayly.auth").warning(
        "ADMIN_JWT_SECRET is the same as JWT_SECRET, set a separate value in "
        ".env for defence in depth."
    )

JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")

ACCESS_TTL_MINUTES = int(os.environ.get("JWT_ACCESS_MINUTES", "60"))
REFRESH_TTL_DAYS = int(os.environ.get("JWT_REFRESH_DAYS", "30"))

# Kept for any legacy caller that still imports it; equivalent to the old
# single-token TTL (now 60 min by default, configurable).
TOKEN_TTL_HOURS = max(1, ACCESS_TTL_MINUTES // 60)

bearer_scheme = HTTPBearer(auto_error=False)

# ----------------------------- passwords -----------------------------

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ----------------------------- jwt helpers -----------------------------

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _new_jti() -> str:
    return secrets.token_urlsafe(16)


def create_access_token(user_id: str, extra: Optional[dict] = None) -> tuple[str, str, datetime]:
    """Return `(jwt, jti, exp_dt)`. Use as the short-lived bearer token."""
    exp = _now() + timedelta(minutes=ACCESS_TTL_MINUTES)
    jti = _new_jti()
    payload = {
        "sub": user_id,
        "iat": _now(),
        "exp": exp,
        "type": "access",
        "jti": jti,
    }
    if extra:
        payload.update(extra)
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return token, jti, exp


def create_refresh_token(user_id: str) -> tuple[str, str, datetime]:
    """Return `(jwt, jti, exp_dt)`. Use only at /api/auth/refresh."""
    exp = _now() + timedelta(days=REFRESH_TTL_DAYS)
    jti = _new_jti()
    payload = {
        "sub": user_id,
        "iat": _now(),
        "exp": exp,
        "type": "refresh",
        "jti": jti,
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return token, jti, exp


# Backwards-compatible wrapper so callers like server.py and the email-verify
# flow still work without changes. Returns just the JWT string.
def create_token(user_id: str) -> str:
    token, _jti, _exp = create_access_token(user_id)
    return token


def create_mfa_challenge_token(user_id: str) -> str:
    """5-min token issued after email+password OK, exchanged at /mfa/verify."""
    payload = {
        "sub": user_id,
        "iat": _now(),
        "exp": _now() + timedelta(minutes=5),
        "type": "mfa_challenge",
        "jti": _new_jti(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Return the full payload of an access token. Raises 401 on any failure.
    Also enforces the `token_invalid_before` sentinel and the jti blocklist ,
    both checks run lazily via `get_current_user_id` which awaits them.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("type") not in (None, "access"):
        # Older single-token JWTs had no "type" claim, so we accept missing
        # for backwards compatibility; otherwise must be "access".
        raise HTTPException(status_code=401, detail="Invalid token type")
    return payload


def decode_refresh_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Not a refresh token")
    return payload


def decode_mfa_challenge_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="2FA challenge expired , please sign in again")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid 2FA challenge")
    if payload.get("type") != "mfa_challenge":
        raise HTTPException(status_code=401, detail="Invalid 2FA challenge")
    return payload


def decode_token(token: str) -> str:
    """Legacy helper, returns just the `sub` (user id). Kept so the dozens of
    callers that already import it work unchanged. Still enforces signature +
    expiry but does NOT consult the async blocklist (use `get_current_user_id`
    for that)."""
    return decode_access_token(token)["sub"]


# ----------------------------- FastAPI dependencies -----------------------------

async def _enforce_revocation(payload: dict) -> None:
    """Async checks shared by every dependency that consumes an access token."""
    # Lazy import to avoid module-load-time DB connection in tests.
    from security_utils import is_jti_revoked, get_token_invalid_before
    jti = payload.get("jti")
    if await is_jti_revoked(jti):
        raise HTTPException(status_code=401, detail="Token revoked , please sign in again")
    iat = payload.get("iat")
    if iat is not None:
        try:
            issued_at = datetime.fromtimestamp(int(iat), tz=timezone.utc)
        except (TypeError, ValueError):
            issued_at = None
        if issued_at is not None:
            cutoff = await get_token_invalid_before(payload["sub"])
            if cutoff and issued_at < cutoff:
                raise HTTPException(
                    status_code=401,
                    detail="Session ended , please sign in again",
                )


async def get_current_user_id(
    creds: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> str:
    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(creds.credentials)
    await _enforce_revocation(payload)
    return payload["sub"]


async def get_current_user_id_optional(
    creds: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> Optional[str]:
    """DEC-1 Phase 1: identity-aware public endpoints.
    Returns the caller's user_id when a valid bearer token is attached,
    None otherwise. Endpoints that are intentionally public (Statement
    Decoder, Budget Calculator, etc.) use this to opportunistically
    persist results for signed-in users without gating the endpoint."""
    if creds is None:
        return None
    try:
        payload = decode_access_token(creds.credentials)
        await _enforce_revocation(payload)
        return payload.get("sub")
    except HTTPException:
        return None
    except Exception:
        return None


async def get_current_user_payload(
    creds: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    """Same as get_current_user_id but returns the whole decoded payload
    (used by /api/auth/logout to grab the jti + exp for the blocklist)."""
    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(creds.credentials)
    await _enforce_revocation(payload)
    return payload


async def get_current_admin_id(
    creds: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> str:
    """Resolve the JWT and verify the user has `is_admin=True` in the DB.

    NOTE: This dependency is the *legacy* admin gate used by routes that
    accept the regular user JWT. The new admin realm (admin_auth.py) issues
    a completely separate JWT signed with ADMIN_JWT_SECRET, this helper does
    NOT accept those. Both gates exist during the migration window.
    """
    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(creds.credentials)
    await _enforce_revocation(payload)
    user_id = payload["sub"]
    from motor.motor_asyncio import AsyncIOMotorClient
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "is_admin": 1})
    if not user or not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user_id
