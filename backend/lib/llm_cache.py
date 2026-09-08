"""LLM response cache, deterministic prompts only.

Hook for the Section 5 LLM wrapper. When `temperature == 0` (or any other
deterministic config), repeated calls with the exact same prompt + params
return cached bytes, instant + free.

Section 3 ships this module; Section 5 wires it into the unified LLM
wrapper. Keeping it standalone here lets us add tests now and avoids a
big-bang dependency on the wrapper landing first.

Cache key: SHA-256 of `(model, prompt, system, params)` truncated to 24 hex
chars. Namespace `wayly:llm:<key>`. Default TTL: 24h.
"""
from __future__ import annotations
from typing import Any, Optional

from lib.cache import key_for, hash_key, get as _cache_get, set_ as _cache_set


_LLM_NS = "llm"
_DEFAULT_TTL = 24 * 60 * 60  # 24h


def is_deterministic(params: dict) -> bool:
    """Only cache calls that will produce the same output every time."""
    if params is None:
        return True
    if params.get("stream"):
        return False
    temp = params.get("temperature")
    if temp is not None and float(temp) > 0:
        return False
    top_p = params.get("top_p")
    if top_p is not None and float(top_p) < 1.0:
        # Nucleus sampling adds randomness, don't cache.
        return False
    if (params.get("n") or 1) > 1:
        return False
    return True


def cache_key(model: str, prompt: Any, system: Optional[str] = None,
              params: Optional[dict] = None) -> str:
    """Stable cache key. Independent of how the caller serialises kwargs."""
    h = hash_key(model, prompt, system or "", params or {})
    return key_for(_LLM_NS, h)


async def get_cached(model: str, prompt: Any, system: Optional[str] = None,
                     params: Optional[dict] = None) -> Optional[Any]:
    if not is_deterministic(params or {}):
        return None
    return await _cache_get(_LLM_NS, cache_key(model, prompt, system, params))


async def put(model: str, prompt: Any, response: Any,
              system: Optional[str] = None, params: Optional[dict] = None,
              ttl_seconds: int = _DEFAULT_TTL) -> bool:
    if not is_deterministic(params or {}):
        return False
    return await _cache_set(_LLM_NS, cache_key(model, prompt, system, params),
                             response, ttl_seconds)
