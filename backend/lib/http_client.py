"""Wayly, singleton HTTP client (Performance Hardening Section 6).

Replaces ad-hoc `httpx.AsyncClient()` constructions across the codebase.
Each new client opens a fresh TCP + TLS connection; reusing one client
with a connection pool reuses keep-alive connections to the same host,
saving 50-300 ms per outbound HTTP call to providers (Stripe, Resend,
fal.ai, IndexNow, etc.).

Single async client, lazy-init, shutdown on app close.
"""
from __future__ import annotations
import asyncio
import logging
from typing import Optional

import httpx

log = logging.getLogger("wayly.http")

_client: Optional[httpx.AsyncClient] = None
_lock: Optional[asyncio.Lock] = None


def _build_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(
        timeout=httpx.Timeout(30.0, connect=5.0),
        limits=httpx.Limits(
            max_connections=100,
            max_keepalive_connections=20,
            keepalive_expiry=30.0,
        ),
        http2=False,  # Most providers don't gain meaningfully; avoids extra deps.
        follow_redirects=True,
    )


async def get_http_client() -> httpx.AsyncClient:
    """Returns the singleton client, creating it if necessary."""
    global _client, _lock
    if _client is not None and not _client.is_closed:
        return _client
    if _lock is None:
        _lock = asyncio.Lock()
    async with _lock:
        if _client is None or _client.is_closed:
            _client = _build_client()
            log.info("shared HTTP client initialised")
    return _client


async def close_http_client() -> None:
    global _client
    if _client is not None and not _client.is_closed:
        try:
            await _client.aclose()
        except Exception:
            pass
    _client = None
