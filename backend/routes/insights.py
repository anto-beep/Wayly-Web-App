"""Smart AI Summary endpoint.

Generates a short, warm, plain-English overview for any data-heavy page in
the app. The frontend passes a compact context payload; the backend calls
Claude Sonnet 4.6 through the Emergent LLM key, enforces a strict tone and
punctuation policy (no dashes, no em-dashes), and caches the result for 24h
keyed on (user_id, page_key, context hash) to keep LLM spend predictable.

Endpoint:
    POST /api/insights/summarise
        body: { page_key: str, context: dict, refresh?: bool }
        200:  { summary: str, alerts: [{level, text}], cached: bool,
                generated_at: iso, model: str }
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

logger = logging.getLogger("wayly.insights")

insights_router = APIRouter(prefix="/insights", tags=["insights"])

_db = None
_user_dep = None

# Sonnet 4.6 is a good fit for these short summaries. It is cheaper than
# Opus 4.7 (which we reserve for SD-3 v2 streaming decode), and the outputs
# are consistently high-quality for 2 to 4 sentence overviews.
INSIGHT_MODEL_PROVIDER = "anthropic"
INSIGHT_MODEL_NAME = os.environ.get("WAYLY_INSIGHT_MODEL", "claude-sonnet-4-6")

CACHE_TTL_SECONDS = 60 * 60 * 24  # 24h
MAX_CONTEXT_BYTES = 12_000  # cap payload sent to the LLM


def init_insights(*, db, user_dep):
    global _db, _user_dep
    _db = db
    _user_dep = user_dep


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if not dt:
        return None
    if isinstance(dt, str):
        return dt
    return dt.astimezone(timezone.utc).isoformat()


def _key() -> str:
    return os.environ.get("EMERGENT_LLM_KEY", "")


# Strip dashes / em-dashes and normalise to soft punctuation. This runs after
# the model output as a safety net; the system prompt also forbids them.
_DASH_RE = re.compile(r"\s*[\u2014\u2013]\s*")  # em-dash + en-dash
_HYPHEN_SEP_RE = re.compile(r"(?<=[A-Za-z0-9])\s+-\s+(?=[A-Za-z0-9])")
# Money and percent normalisation. LLMs sometimes write "1,250 dollars" or
# "42 percent" despite instructions; enforce the symbol form.
_DOLLARS_RE = re.compile(r"\b(\d[\d,]*(?:\.\d+)?)\s+dollars?\b", re.IGNORECASE)
_PERCENT_WORD_RE = re.compile(r"\b(\d[\d,]*(?:\.\d+)?)\s+per\s?cent(?:age)?\b", re.IGNORECASE)


def _sanitise_prose(text: str) -> str:
    if not text:
        return ""
    out = _DASH_RE.sub(", ", text)
    out = _HYPHEN_SEP_RE.sub(", ", out)
    out = _DOLLARS_RE.sub(r"$\1", out)
    out = _PERCENT_WORD_RE.sub(r"\1%", out)
    # Collapse repeated commas the substitution may have created
    out = re.sub(r"(?:,\s*){2,}", ", ", out)
    # Collapse runs of spaces/tabs but PRESERVE paragraph breaks (blank lines),
    # so multi-paragraph summaries (e.g. the statement overview) keep their shape.
    out = re.sub(r"[ \t]{2,}", " ", out)
    out = re.sub(r"[ \t]*\n[ \t]*", "\n", out)
    out = re.sub(r"\n{3,}", "\n\n", out)
    return out.strip()


SYSTEM_PROMPT = (
    "You are Wayly's friendly, expert co pilot for Australian caregivers. "
    "You write warm, plain spoken overviews of what a caregiver is looking at "
    "on the current screen, so a busy family member gets the 'so what' in "
    "five seconds. "
    "STRICT WRITING RULES: "
    "1. Write two to four short sentences, maximum sixty words in total. "
    "2. Focus on trends, alerts, and clear next steps. Do not simply restate raw numbers. "
    "3. Use everyday English. No jargon, no headings, no bullets, no markdown, no emoji. "
    "4. PUNCTUATION: You may use commas, full stops, and semicolons only. "
    "   Do NOT use hyphens as sentence separators. "
    "   Do NOT use em dashes (U+2014). Do NOT use en dashes (U+2013). "
    "   Compound words such as 'out of pocket' should be written as separate words. "
    "5. Use Australian English (organise, favour, cheque, out of pocket). "
    "6. FORMAT NUMBERS: For money always use the dollar sign, e.g. '$1,250', NEVER write 'dollars'. "
    "   For proportions always use the percent sign, e.g. '42%', NEVER write 'percent' or 'percentage'. "
    "7. If the data shows a positive trend or good news, celebrate it warmly. "
    "8. If something looks off (spike, missing item, overdue action), name it "
    "and suggest one small next step the caregiver can take today. "
    "9. Never invent numbers. Only reference figures that appear in the context. "
    "OUTPUT SHAPE (JSON only, no prose outside): "
    '{"summary": "<the paragraph>", "alerts": [{"level": "info|warning|success", "text": "<one short sentence>"}]}'
    " Return zero to three alerts, only when they truly help the caregiver. "
)

# Pages that get a richer, multi-paragraph "overall standing" summary.
_STATEMENT_PAGE_KEYS = {"statement-detail"}

_STATEMENT_SUMMARY_OVERRIDE = (
    " PAGE OVERRIDE (statement detail): Ignore writing rule 1 above. Instead write TWO or THREE short "
    "paragraphs, up to about 110 words in total, separated by a blank line (two newline characters). "
    "Paragraph one speaks only to THIS statement: what it shows for the period, and any anomalies with "
    "their dollar impact if present, and whether it looks fine or worth a closer look. "
    "Paragraph two gives the participant's OVERALL standing across Wayly, using the participant_standing "
    "object in the context: letters in progress or awaiting a reply, any open complaints, and anything "
    "that needs attention. If a signal is zero or missing, do not mention it and do not invent it. "
    "Keep it warm and calm. Still return the exact JSON shape, with the paragraphs (including the blank "
    "line between them) inside the summary string."
)


def _system_prompt_for(page_key: str) -> str:
    if page_key in _STATEMENT_PAGE_KEYS:
        return SYSTEM_PROMPT + _STATEMENT_SUMMARY_OVERRIDE
    return SYSTEM_PROMPT


class SummariseIn(BaseModel):
    page_key: str = Field(..., min_length=1, max_length=64)
    context: Dict[str, Any] = Field(default_factory=dict)
    refresh: bool = False


def _hash_ctx(page_key: str, context: Dict[str, Any]) -> str:
    try:
        blob = json.dumps({"page_key": page_key, "context": context}, sort_keys=True, default=str)
    except Exception:
        blob = f"{page_key}::{str(context)[:2000]}"
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def _truncate_context(context: Dict[str, Any]) -> Dict[str, Any]:
    """Guard against gigantic payloads. Keep JSON but truncate to MAX bytes."""
    try:
        raw = json.dumps(context, default=str)
    except Exception:
        return {"note": "context could not be serialised"}
    if len(raw) <= MAX_CONTEXT_BYTES:
        return context
    return {
        "truncated": True,
        "excerpt": raw[:MAX_CONTEXT_BYTES],
    }


async def _generate_summary(page_key: str, context: Dict[str, Any]) -> Dict[str, Any]:
    key = _key()
    if not key:
        # Fallback: return a friendly generic without the LLM.
        return {
            "summary": (
                "Here is a quick look at your data. Everything is up to date, "
                "and there is nothing that needs your attention right now."
            ),
            "alerts": [],
            "model": "fallback",
        }

    # Route through llm_wrapper so the provider call runs OFF the request event
    # loop (dedicated thread executor) with a hard timeout + circuit breaker.
    # A raw LlmChat call here ran on the loop, so a hung gateway froze the whole
    # backend, stalling every dashboard request (the "stuck on skeletons" bug).
    try:
        from lib import llm_wrapper
        from agents import _strip_json  # reuse existing helper
    except Exception as e:  # pragma: no cover
        logger.warning("insights LLM import failed: %s", e)
        return {"summary": "Your latest data is ready to review.", "alerts": [], "model": "fallback"}

    try:
        payload = {"page": page_key, "context": _truncate_context(context)}
        raw = await llm_wrapper.chat_send(
            model=INSIGHT_MODEL_NAME,
            provider=INSIGHT_MODEL_PROVIDER,
            system=_system_prompt_for(page_key),
            user_text=json.dumps(payload, default=str),
            session_id=f"insight-{page_key}",
            deterministic=True,
            apply_tone_rules=False,
            model_params={"max_tokens": 700},
        )
        parsed = json.loads(_strip_json(raw))
        summary = _sanitise_prose(str(parsed.get("summary") or "").strip())
        alerts_raw = parsed.get("alerts") or []
        alerts: List[Dict[str, str]] = []
        for a in alerts_raw[:3]:
            if not isinstance(a, dict):
                continue
            level = str(a.get("level") or "info").lower()
            if level not in ("info", "warning", "success"):
                level = "info"
            text = _sanitise_prose(str(a.get("text") or "").strip())
            if text:
                alerts.append({"level": level, "text": text})
        if not summary:
            summary = "Your latest data is ready to review."
        return {"summary": summary, "alerts": alerts, "model": INSIGHT_MODEL_NAME}
    except Exception as e:
        logger.warning("insights generation error: %s", e)
        return {
            "summary": "Your latest data is ready to review.",
            "alerts": [],
            "model": "fallback",
        }


async def _enrich_context(uid: Optional[str], page_key: str, context: Dict[str, Any]) -> Dict[str, Any]:
    """For the statement page, add the participant's cross-tool standing
    (open complaints, letters in progress / awaiting a reply) so the summary
    can speak to the bigger picture, not just this statement."""
    if page_key not in _STATEMENT_PAGE_KEYS or _db is None:
        return context
    pid = context.get("participant_id")
    if not pid:
        return context
    try:
        open_complaints = await _db.complaints.count_documents({
            "participant_id": pid,
            "current_stage": {"$nin": ["closed_resolved", "closed_abandoned"]},
        })
        letters_total = await _db.lf1_correspondence.count_documents({"participant_id": pid})
        letters_awaiting = await _db.lf1_correspondence.count_documents({
            "participant_id": pid, "status": {"$in": ["sent", "awaiting_response"]},
        })
        letters_draft = await _db.lf1_correspondence.count_documents({
            "participant_id": pid, "status": "draft",
        })
        standing = {
            "open_complaints": int(open_complaints or 0),
            "letters_total": int(letters_total or 0),
            "letters_awaiting_reply": int(letters_awaiting or 0),
            "letters_in_draft": int(letters_draft or 0),
        }
        return {**context, "participant_standing": standing}
    except Exception as e:  # pragma: no cover - defensive
        logger.warning("insights enrich failed: %s", e)
        return context


@insights_router.post("/summarise")
async def summarise(payload: SummariseIn, request: Request):
    user = await _user_dep(request)
    uid = (user or {}).get("id") if isinstance(user, dict) else None

    # Enrich BEFORE hashing so cross-tool standing changes bust the cache.
    context = await _enrich_context(uid, payload.page_key, payload.context or {})

    ctx_hash = _hash_ctx(payload.page_key, context)
    cache_key = {"user_id": uid or "anon", "page_key": payload.page_key, "context_hash": ctx_hash}

    if not payload.refresh:
        cached = await _db.smart_ai_summaries.find_one(cache_key, {"_id": 0})
        if cached and cached.get("generated_at"):
            gen = cached["generated_at"]
            if isinstance(gen, str):
                try:
                    gen_dt = datetime.fromisoformat(gen.replace("Z", "+00:00"))
                except Exception:
                    gen_dt = None
            else:
                gen_dt = gen
            if gen_dt and (_now() - (gen_dt if gen_dt.tzinfo else gen_dt.replace(tzinfo=timezone.utc))).total_seconds() < CACHE_TTL_SECONDS:
                # Re-sanitise cached prose so historical rows containing
                # "dollars" or "percent" get normalised on the way out.
                cached_summary = _sanitise_prose(cached.get("summary", ""))
                cached_alerts = [
                    {"level": a.get("level", "info"), "text": _sanitise_prose(a.get("text", ""))}
                    for a in (cached.get("alerts") or [])
                ]
                return {
                    "summary": cached_summary,
                    "alerts": cached_alerts,
                    "cached": True,
                    "generated_at": _iso(gen_dt),
                    "model": cached.get("model", INSIGHT_MODEL_NAME),
                }

    result = await _generate_summary(payload.page_key, context)
    generated_at = _now()

    doc = {
        **cache_key,
        "summary": result["summary"],
        "alerts": result["alerts"],
        "model": result["model"],
        "generated_at": generated_at,
    }
    try:
        await _db.smart_ai_summaries.update_one(cache_key, {"$set": doc}, upsert=True)
    except Exception as e:
        logger.warning("insights cache write failed: %s", e)

    return {
        "summary": result["summary"],
        "alerts": result["alerts"],
        "cached": False,
        "generated_at": _iso(generated_at),
        "model": result["model"],
    }
