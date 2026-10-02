"""Server-side verification of Apple 'Sign in with Apple' identity tokens.

Apple requires the identity token (a JWT) to be verified against Apple's public
keys before we trust any of its claims. For the native iOS (Expo) flow the token
audience is the app's iOS bundle identifier (APPLE_BUNDLE_ID).
"""
import os
from typing import Any, Dict

import jwt
from jwt import PyJWKClient
from fastapi import HTTPException

APPLE_ISSUER = "https://appleid.apple.com"
APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys"

_jwks_client = PyJWKClient(APPLE_KEYS_URL)


def verify_apple_identity_token(identity_token: str) -> Dict[str, Any]:
    """Validate an Apple identity token and return its claims.

    Checks signature (RS256 via Apple JWKS), issuer, audience (our bundle id),
    expiry and required claims. Raises HTTP 401 on any failure.
    """
    audience = os.environ.get("APPLE_BUNDLE_ID")
    if not audience:
        # Misconfiguration — never silently accept a token with no audience check.
        raise HTTPException(status_code=500, detail="Apple sign-in is not configured")
    try:
        signing_key = _jwks_client.get_signing_key_from_jwt(identity_token)
        claims = jwt.decode(
            identity_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=audience,
            issuer=APPLE_ISSUER,
            options={"require": ["iss", "aud", "exp", "iat", "sub"]},
            leeway=60,
        )
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid Apple identity token")

    if not claims.get("sub"):
        raise HTTPException(status_code=401, detail="Apple token has no subject")

    verified = claims.get("email_verified")
    if claims.get("email") and verified not in (True, "true", "1", 1):
        raise HTTPException(status_code=401, detail="Apple email is not verified")
    return claims
