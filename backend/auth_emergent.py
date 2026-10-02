"""Emergent-managed Google OAuth helper.

Exchanges a session_id (received in URL fragment after Google sign-in) for
user identity + a 7-day session_token by calling Emergent's session-data
endpoint server-side.
"""
import logging
import httpx

logger = logging.getLogger(__name__)

EMERGENT_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"


async def exchange_session_id(session_id: str) -> dict:
    """Call Emergent OAuth and return {id, email, name, picture, session_token}.

    Raises httpx.HTTPError on failure.
    """
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.get(EMERGENT_SESSION_URL, headers={"X-Session-ID": session_id})
        r.raise_for_status()
        return r.json()
