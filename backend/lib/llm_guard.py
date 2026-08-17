"""Global LLM call guard (concurrency / resilience hardening).

Empirically, LLM calls in Wayly do NOT block the event loop (verified: dozens
of concurrent 40-50s model calls while ``/auth/me`` stays ~0.15s and login
~0.9s), so no thread offload is required. The one real failure mode observed
was a provider call that *hung indefinitely* with no timeout, leaving a zombie
request pinning resources. This module wraps ``emergentintegrations``'
``LlmChat.send_message`` with a single hard timeout so any stalled upstream
call self-releases instead of hanging forever.

Combined with the existing per-model circuit breaker + concurrency semaphore in
``lib/llm_wrapper.py``, this keeps login and non-AI screens responsive even when
the AI endpoints are slow or an upstream provider stalls.
"""
from __future__ import annotations

import asyncio
import logging
import os

logger = logging.getLogger("wayly.llm.guard")

# Hard ceiling on ANY single LLM round-trip. Purpose is to kill zombie/hung
# calls, not to tune latency, so it sits above the slowest legitimate call
# (two-pass statement decode ~50s) while still bounded. Interactive endpoints
# (e.g. Ask Wayly) keep their own tighter timeouts on top of this.
LLM_SEND_TIMEOUT = float(os.environ.get("KINDRED_LLM_TIMEOUT_SECONDS", "90"))

_installed = False


def install() -> None:
    """Idempotently wrap LlmChat.send_message with a timeout. Safe to call more
    than once and safe if the SDK isn't importable (logs and no-ops)."""
    global _installed
    if _installed:
        return
    try:
        from emergentintegrations.llm import chat as _chat_mod
    except Exception as e:  # pragma: no cover - defensive
        logger.warning("llm guard: could not import LlmChat, skipping (%s)", e)
        return

    orig_send = _chat_mod.LlmChat.send_message
    if getattr(orig_send, "_wayly_guarded", False):
        _installed = True
        return

    async def _guarded_send(self, *args, **kwargs):
        try:
            return await asyncio.wait_for(orig_send(self, *args, **kwargs), timeout=LLM_SEND_TIMEOUT)
        except asyncio.TimeoutError:
            logger.warning("llm guard: send_message exceeded %.0fs, aborting call", LLM_SEND_TIMEOUT)
            raise

    _guarded_send._wayly_guarded = True  # type: ignore[attr-defined]
    _chat_mod.LlmChat.send_message = _guarded_send  # type: ignore[assignment]
    _installed = True
    logger.info("llm guard installed (send_message timeout=%.0fs)", LLM_SEND_TIMEOUT)
