"""Lightweight LLM call cost tracker.

Records every Claude / OpenAI call into `db.llm_calls` so the admin
Overview dashboard, AI Error Reports, and Tool Usage Stats have real data.

Token estimation note
---------------------
The emergentintegrations LlmChat doesn't surface input/output token counts,
so we estimate from character length (1 token ≈ 4 chars).  Cost rates
(USD per million tokens) for the models we use:

  claude-sonnet-4-5         $3.00 in / $15.00 out
  claude-haiku-4-5          $0.80 in / $4.00  out
  gpt-4o-mini               $0.15 in / $0.60  out
  gpt-image-1               flat $0.04 per image (handled separately)

AUD ≈ USD × 1.5 (rough conversion — refined nightly if needed).
"""
from __future__ import annotations
import os
import asyncio
from datetime import datetime, timezone
from typing import Optional
from motor.motor_asyncio import AsyncIOMotorClient

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]

USD_TO_AUD = 1.5  # approximate

MODEL_RATES = {
    # USD per million tokens
    "claude-sonnet-4-5":         {"in": 3.00, "out": 15.00},
    "claude-sonnet-4-5-20251022": {"in": 3.00, "out": 15.00},
    "claude-haiku-4-5":          {"in": 0.80, "out": 4.00},
    "claude-haiku-4-5-20251001": {"in": 0.80, "out": 4.00},
    "gpt-4o-mini":               {"in": 0.15, "out": 0.60},
    "gpt-4o":                    {"in": 2.50, "out": 10.00},
}


def _estimate_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, len(text) // 4)


def _estimate_cost_aud(model: str, input_text: str, output_text: str) -> float:
    rates = MODEL_RATES.get(model)
    if not rates:
        # Fallback: unknown model — use Haiku as a conservative estimate.
        rates = MODEL_RATES["claude-haiku-4-5"]
    in_tokens = _estimate_tokens(input_text)
    out_tokens = _estimate_tokens(output_text)
    cost_usd = (in_tokens / 1_000_000.0) * rates["in"] + (out_tokens / 1_000_000.0) * rates["out"]
    return round(cost_usd * USD_TO_AUD, 6)


async def record_llm_call(
    tool: str,                        # e.g. "statement_decoder_extract_clinical"
    model: str,
    *,
    user_id: Optional[str] = None,
    household_id: Optional[str] = None,
    input_text: str = "",
    output_text: str = "",
    duration_ms: int = 0,
    success: bool = True,
    error: Optional[str] = None,
) -> None:
    """Fire-and-forget. Never raises. Cheap insert."""
    try:
        doc = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "tool": tool,
            "model": model,
            "user_id": user_id,
            "household_id": household_id,
            "input_chars": len(input_text or ""),
            "output_chars": len(output_text or ""),
            "input_tokens_est": _estimate_tokens(input_text),
            "output_tokens_est": _estimate_tokens(output_text),
            "cost_aud_est": _estimate_cost_aud(model, input_text, output_text),
            "duration_ms": int(duration_ms),
            "success": bool(success),
            "error": error,
        }
        await db.llm_calls.insert_one(doc)
    except Exception:
        # Never let cost tracking break a real LLM call.
        pass


def fire_record_llm_call(*args, **kwargs) -> None:
    """Schedule the record on the running event loop without awaiting.
    Use this when you don't want to await the insert from a hot path."""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(record_llm_call(*args, **kwargs))
        else:
            asyncio.run(record_llm_call(*args, **kwargs))
    except Exception:
        pass
