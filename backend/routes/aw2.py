"""AW-2 v1 slice: Ask Wayly v2 with Memory and Personalisation.

Scope for this v1 slice (per AW-2-v1.md):
  * Section B.1: AwConversation with session + message model.
  * Section B.2: AwUserContext with per-source per-participant consent.
  * Section B.3: ProactiveNudge with ADM date-gate.
  * Section B.4: AwRetrievalLog audit trail.
  * Section D.1: Conversation start / message / end / delete / extend.
  * Section D.2: Consent get / update.
  * Section D.3: ADM disclosure current-version + acknowledge.
  * Section D.4: Proactive nudge list + user-response.
  * Section K: Hallucination guardrails, no context ⇒ "I don't know" fallback.

Deferred to AW-2 v2:
  * Actual LLM inference (v1 returns deterministic scaffold responses; caller
    wires an LLM in via _llm_generate hook).
  * Real trigger-evaluation scheduler (v1 exposes manual trigger endpoint).
  * Voice modality, cross-language conversation, adviser multi-participant.
  * User feedback aggregation dashboard.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

logger = logging.getLogger("wayly.aw2")

aw2_router = APIRouter(prefix="/aw2", tags=["aw2"])

_db = None
_user_dep = None
_core1_write_event: Optional[Callable] = None
_llm_generate: Optional[Callable] = None  # (prompt, ctx) -> str

# ADM disclosure date-gate (Dec 2026 per PROGRAM-1)
ADM_DISCLOSURE_ACTIVE_DATE = datetime(2026, 12, 1, tzinfo=timezone.utc)
ADM_DISCLOSURE_VERSION = "v1.0-2026-12"

VALID_DATA_SOURCES = {
    "participant_profile", "budget_projection", "care_plan_summary",
    "contribution_position", "lifetime_cap_position", "decoded_statement_summary",
    "open_cases", "goal_ledger", "provider_history",
}
VALID_RETENTIONS = {"14_days", "30_days", "90_days", "session_only"}

RETENTION_DAYS = {"14_days": 14, "30_days": 30, "90_days": 90, "session_only": 0}


def init_aw2_routes(*, db, user_dep, core1_write_timeline, llm_generate=None):
    global _db, _user_dep, _core1_write_event, _llm_generate
    _db = db
    _user_dep = user_dep
    _core1_write_event = core1_write_timeline
    _llm_generate = llm_generate


def _flag_enabled() -> bool:
    return os.environ.get("AW2_ENABLED", "1") != "0"


def _nudges_enabled() -> bool:
    if os.environ.get("AW2_NUDGES_ENABLED", "0") == "0":
        return False
    # Hard date-gate per spec locked decision 4
    return datetime.now(timezone.utc) >= ADM_DISCLOSURE_ACTIVE_DATE


async def _assert_flag():
    if not _flag_enabled():
        raise HTTPException(status_code=404, detail="Not found")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt) -> Optional[str]:
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt
    return dt.astimezone(timezone.utc).isoformat()


async def _user_id(request) -> str:
    user = await _user_dep(request)
    uid = user["id"] if isinstance(user, dict) else getattr(user, "id", None)
    if not uid:
        raise HTTPException(status_code=401, detail="Auth required")
    return str(uid)


async def ensure_aw2_indexes(db) -> None:
    try:
        await db.aw_conversations.create_index(
            [("user_id", 1), ("last_activity_at", -1)])
        await db.aw_user_contexts.create_index([("user_id", 1)], unique=True)
        await db.proactive_nudges.create_index(
            [("user_id", 1), ("scheduled_for_surface_after", 1)])
        await db.aw_retrieval_logs.create_index([("conversation_id", 1)])
    except Exception as e:  # pragma: no cover
        logger.warning("aw2 index creation skipped: %s", e)


# ---------------------------------------------------------------------------
# User context / consent (Sections B.2, D.2, F)
# ---------------------------------------------------------------------------


async def _get_or_create_context(user_id: str) -> dict:
    doc = await _db.aw_user_contexts.find_one({"user_id": user_id})
    if doc:
        return doc
    now = _now()
    doc = {
        "user_id": user_id,
        "context_consents": [],
        "retention_policy": "session_only",
        "retention_policy_updated_at": now,
        "proactive_nudge_consent": "not_asked",
        "proactive_nudge_consent_updated_at": None,
        "adm_disclosure_version_seen": None,
        "adm_disclosure_acknowledged_at": None,
        "detailed_reasoning_shown": True,
        "citation_display_preference": "inline",
        "last_updated_at": now,
        "data_residency": "ap-southeast-2",
    }
    await _db.aw_user_contexts.insert_one(doc)
    return doc


def _view_context(c: dict) -> Dict[str, Any]:
    return {
        "user_id": c["user_id"],
        "context_consents": c.get("context_consents") or [],
        "retention_policy": c.get("retention_policy", "session_only"),
        "proactive_nudge_consent": c.get("proactive_nudge_consent", "not_asked"),
        "adm_disclosure_version_seen": c.get("adm_disclosure_version_seen"),
        "adm_disclosure_acknowledged_at": _iso(c.get("adm_disclosure_acknowledged_at")),
        "citation_display_preference": c.get("citation_display_preference", "inline"),
        "detailed_reasoning_shown": bool(c.get("detailed_reasoning_shown", True)),
    }


@aw2_router.get("/context")
async def get_context(request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    return {"context": _view_context(await _get_or_create_context(uid))}


class ConsentUpdate(BaseModel):
    data_source: str
    participant_context_id: str
    consent_state: str = Field(pattern="^(granted|denied|revoked|not_asked)$")


@aw2_router.post("/context/consent")
async def update_consent(body: ConsentUpdate, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    if body.data_source not in VALID_DATA_SOURCES:
        raise HTTPException(status_code=422, detail="Invalid data source")
    ctx = await _get_or_create_context(uid)
    consents = ctx.get("context_consents") or []
    now = _now()
    found = False
    for c in consents:
        if c["data_source"] == body.data_source and c["participant_context_id"] == body.participant_context_id:
            c["consent_state"] = body.consent_state
            if body.consent_state == "granted":
                c["consented_at"] = _iso(now)
                c["revoked_at"] = None
            elif body.consent_state == "revoked":
                c["revoked_at"] = _iso(now)
            found = True
            break
    if not found:
        consents.append({
            "data_source": body.data_source,
            "participant_context_id": body.participant_context_id,
            "consent_state": body.consent_state,
            "consented_at": _iso(now) if body.consent_state == "granted" else None,
            "revoked_at": _iso(now) if body.consent_state == "revoked" else None,
        })
    await _db.aw_user_contexts.update_one(
        {"user_id": uid},
        {"$set": {"context_consents": consents, "last_updated_at": now}})
    ctx["context_consents"] = consents
    return {"context": _view_context(ctx)}


class RetentionUpdate(BaseModel):
    retention_policy: str


@aw2_router.patch("/context/retention-policy")
async def update_retention(body: RetentionUpdate, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    if body.retention_policy not in VALID_RETENTIONS:
        raise HTTPException(status_code=422, detail="Invalid retention")
    await _get_or_create_context(uid)
    now = _now()
    await _db.aw_user_contexts.update_one(
        {"user_id": uid},
        {"$set": {"retention_policy": body.retention_policy,
                  "retention_policy_updated_at": now,
                  "last_updated_at": now}})
    return {"retention_policy": body.retention_policy}


# ---------------------------------------------------------------------------
# ADM disclosure (Sections J, D.3)
# ---------------------------------------------------------------------------


@aw2_router.get("/adm-disclosure/current-version")
async def adm_current_version():
    await _assert_flag()
    return {
        "version_id": ADM_DISCLOSURE_VERSION,
        "active_from": _iso(ADM_DISCLOSURE_ACTIVE_DATE),
        "content_url": "/legal/adm-disclosure",
        "is_active_now": _now() >= ADM_DISCLOSURE_ACTIVE_DATE,
    }


class AdmAckIn(BaseModel):
    disclosure_version_id: str


@aw2_router.post("/adm-disclosure/acknowledge")
async def adm_acknowledge(body: AdmAckIn, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    if body.disclosure_version_id != ADM_DISCLOSURE_VERSION:
        raise HTTPException(status_code=422, detail="Version mismatch")
    await _get_or_create_context(uid)
    now = _now()
    await _db.aw_user_contexts.update_one(
        {"user_id": uid},
        {"$set": {"adm_disclosure_version_seen": body.disclosure_version_id,
                  "adm_disclosure_acknowledged_at": now,
                  "last_updated_at": now}})
    return {"acknowledged": True, "at": _iso(now)}


# ---------------------------------------------------------------------------
# Conversation (Sections B.1, D.1, G)
# ---------------------------------------------------------------------------


def _retention_expiry(policy: str, base: datetime) -> datetime:
    days = RETENTION_DAYS.get(policy, 0)
    if days <= 0:
        return base  # session_only ⇒ deletion at session end
    return base + timedelta(days=days)


def _has_consent(ctx: dict, source: str, pid: Optional[str]) -> bool:
    if not pid:
        return False
    for c in ctx.get("context_consents") or []:
        if c["data_source"] == source and c["participant_context_id"] == pid:
            return c.get("consent_state") == "granted"
    return False


async def _fetch_participant_data(source: str, pid: str, user_id: str) -> Optional[Dict[str, Any]]:
    """Reads real data from mongo for a specific source, gated by consent.
    Returns a compact dict suitable for the LLM prompt (no PII leakage beyond
    what the user consented to for this participant). Returns None if the data
    is not available so the LLM will honestly say "I don't have that here".
    """
    if pid == "default":
        return None
    try:
        if source == "participant_profile":
            p = await _db.participants.find_one({"id": pid}, {"_id": 0})
            if not p:
                return None
            return {
                "first_name": p.get("first_name"),
                "classification": p.get("classification"),
                "provider_name": p.get("provider_name"),
                "is_primary": p.get("is_primary"),
                "status": p.get("status"),
            }
        if source == "budget_projection":
            # Compute this quarter's burn and quarterly budget window.
            try:
                import budget as budget_lib  # local import to avoid heavy import at module load
            except Exception:
                return None
            p = await _db.participants.find_one({"id": pid}, {"_id": 0, "classification": 1, "household_id": 1})
            if not p:
                return None
            q_start, q_end, q_label = budget_lib.get_quarter_window()
            cls = p.get("classification") or 4
            quarterly = budget_lib.quarterly_budget(cls)
            q = {"household_id": p.get("household_id"),
                 "$or": [{"participant_id": pid}, {"participant_id": None}, {"participant_id": {"$exists": False}}]}
            items: List[dict] = []
            async for s in _db.statements.find(q, {"_id": 0, "line_items": 1}):
                items.extend(s.get("line_items") or [])
            burn = budget_lib.compute_burn(items, q_start, q_end)
            return {
                "quarter_label": q_label,
                "quarterly_budget_aud": quarterly,
                "quarter_burn_by_stream_aud": burn,
                "classification": cls,
            }
        if source == "contribution_position":
            try:
                import budget as budget_lib
            except Exception:
                return None
            p = await _db.participants.find_one({"id": pid}, {"_id": 0, "household_id": 1})
            if not p:
                return None
            q = {"household_id": p.get("household_id"),
                 "$or": [{"participant_id": pid}, {"participant_id": None}, {"participant_id": {"$exists": False}}]}
            items: List[dict] = []
            async for s in _db.statements.find(q, {"_id": 0, "line_items": 1}):
                items.extend(s.get("line_items") or [])
            return {"contributions_total_aud": budget_lib.compute_contributions(items)}
        if source == "lifetime_cap_position":
            try:
                import budget as budget_lib
            except Exception:
                return None
            p = await _db.participants.find_one({"id": pid}, {"_id": 0, "household_id": 1, "is_grandfathered": 1})
            if not p:
                return None
            h = await _db.households.find_one({"id": p.get("household_id")}, {"_id": 0, "is_grandfathered": 1})
            gf = bool((p.get("is_grandfathered") if p.get("is_grandfathered") is not None else (h or {}).get("is_grandfathered", False)))
            cap = budget_lib.lifetime_cap(gf)
            q = {"household_id": p.get("household_id"),
                 "$or": [{"participant_id": pid}, {"participant_id": None}, {"participant_id": {"$exists": False}}]}
            items: List[dict] = []
            async for s in _db.statements.find(q, {"_id": 0, "line_items": 1}):
                items.extend(s.get("line_items") or [])
            contributed = budget_lib.compute_contributions(items)
            return {"lifetime_cap_aud": cap, "contributions_to_date_aud": contributed,
                    "remaining_headroom_aud": round(cap - contributed, 2), "is_grandfathered": gf}
        if source == "decoded_statement_summary":
            p = await _db.participants.find_one({"id": pid}, {"_id": 0, "household_id": 1})
            if not p:
                return None
            q = {"household_id": p.get("household_id"),
                 "$or": [{"participant_id": pid}, {"participant_id": None}, {"participant_id": {"$exists": False}}]}
            docs = await _db.statements.find(q, {"_id": 0, "summary": 1, "period_label": 1, "filename": 1, "uploaded_at": 1}) \
                .sort("uploaded_at", -1).limit(1).to_list(1)
            if not docs:
                return None
            latest = docs[0]
            return {"period_label": latest.get("period_label") or latest.get("filename"),
                    "summary": (latest.get("summary") or "")[:1500]}
        if source == "open_cases":
            cur = _db.cases.find({"participant_id": pid, "status": {"$in": ["open", "in_progress", "escalated"]}},
                                 {"_id": 0, "id": 1, "case_type": 1, "subject": 1, "status": 1, "opened_at": 1}) \
                .sort("opened_at", -1).limit(10)
            items = await cur.to_list(10)
            return {"open_case_count": len(items), "cases": items} if items else {"open_case_count": 0, "cases": []}
        if source == "goal_ledger":
            cur = _db.goal_ledger_entries.find({"participant_id": pid, "status": {"$ne": "superseded"}},
                                               {"_id": 0, "id": 1, "goal_title": 1, "goal_type": 1, "status": 1}) \
                .limit(20)
            goals = await cur.to_list(20)
            return {"goal_count": len(goals), "goals": goals} if goals else None
        if source == "care_plan_summary":
            latest = await _db.care_plans.find_one({"participant_id": pid}, {"_id": 0, "id": 1, "plan_title": 1, "review_notes": 1, "created_at": 1},
                                                    sort=[("created_at", -1)])
            if not latest:
                return None
            return {"plan_title": latest.get("plan_title"), "notes": (latest.get("review_notes") or "")[:800]}
        if source == "provider_history":
            p = await _db.participants.find_one({"id": pid}, {"_id": 0, "provider_name": 1})
            if not p:
                return None
            switches = await _db.psw1_switches.find({"participant_id": pid}, {"_id": 0, "id": 1, "outgoing_provider_name": 1, "incoming_provider_name": 1, "status": 1}).limit(5).to_list(5)
            return {"current_provider": p.get("provider_name"), "recent_switches": switches}
    except Exception as e:  # pragma: no cover
        logger.warning("aw2 data fetch failed for %s: %s", source, e)
        return None
    return None


async def _gather_context_data(ctx: dict, pid: Optional[str], user_id: str) -> Dict[str, Any]:
    """Aggregate real data for every source that has granted consent."""
    if not pid:
        return {}
    out: Dict[str, Any] = {}
    for src in VALID_DATA_SOURCES:
        if _has_consent(ctx, src, pid):
            data = await _fetch_participant_data(src, pid, user_id)
            # Even if data is None (e.g., no statements uploaded), record consent so the
            # LLM knows to say "I have permission but no data yet" rather than refuse.
            out[src] = data if data is not None else {"consented": True, "note": "consented but no data available yet"}
    return out


def _scope_guardrail(message: str) -> Optional[Dict[str, Any]]:
    """Return a scope-refusal template if question is clinical/financial/legal."""
    lower = message.lower()
    if any(k in lower for k in ["medication", "diagnos", "prescri", "symptom", "medical advice"]):
        return {"kind": "clinical",
                "response": "I'm not able to give clinical advice about medications, diagnoses, or medical care. Please talk to your doctor, pharmacist, or another qualified health professional."}
    if any(k in lower for k in ["invest", "tax planning", "retirement strat", "financial advice"]):
        return {"kind": "financial",
                "response": "I can explain what you're entitled to under Support at Home and how contributions are calculated, but I can't give personalised financial advice. Please talk to a licensed financial adviser."}
    if any(k in lower for k in ["sue", "lawsuit", "legal advice", "solicit"]):
        return {"kind": "legal",
                "response": "I can explain what the Aged Care Act 2024 generally says, but I can't give personalised legal advice. Please talk to a solicitor."}
    if any(k in lower for k in ["recommend a provider", "best provider", "which provider should"]):
        return {"kind": "provider_recommendation",
                "response": "I can share what public information is available about a provider via Wayly's Provider Price Checker, but I don't recommend providers."}
    return None


def _fallback_response() -> str:
    return ("I don't have enough information to answer that confidently. "
            "You might want to try rephrasing, or check the related tool in Wayly.")


async def _compose_response(message: str, context_data: Dict[str, Any], session_id: str = "aw2") -> Dict[str, Any]:
    """Deterministic v1 response composer. Hallucination-safe defaults per Section K."""
    guardrail = _scope_guardrail(message)
    if guardrail:
        return {
            "content": guardrail["response"],
            "cited_sources": [],
            "context_flags_used": [],
            "structured_answer": None,
            "guardrail_triggered": guardrail["kind"],
        }
    # If a caller-provided LLM hook exists, defer to it.
    if _llm_generate:
        try:
            return await _llm_generate(message, context_data)
        except Exception as e:  # pragma: no cover
            logger.warning("aw2 LLM hook failed: %s", e)
    # Attempt real LLM inference via Emergent LLM Key + Claude Sonnet 4.6
    key = os.environ.get("EMERGENT_LLM_KEY")
    if key:
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            system_prompt = (
                "You are Ask Wayly, an assistant embedded in the Wayly aged-care platform for Australian users. "
                "You help users of the Support at Home (SAH) programme understand their situation. "
                "Rules you must follow, no exceptions:\n"
                "1. NEVER provide clinical or medical advice. Redirect to a doctor, pharmacist, or qualified health professional.\n"
                "2. NEVER provide personalised financial advice. You may explain how SAH works, but redirect specific investment or tax-planning questions to a licensed financial adviser.\n"
                "3. NEVER provide personalised legal advice. You may explain what the Aged Care Act 2024 generally says, but redirect specific legal questions to a solicitor.\n"
                "4. NEVER recommend a specific provider. You may explain what Wayly's Provider Price Checker shows.\n"
                "5. If the user asks about their own participant data (budget, care plan, statements, contributions, cases, goals) and you do NOT have that data in context, say clearly: \"I don't have that information here. Please check the relevant tool in Wayly.\"\n"
                "6. Answer in Australian English, plain language, sentence case body text, warm and clear.\n"
                "7. Do NOT invent facts. If you are not confident, say you don't know and suggest where the user can check.\n"
                "8. Keep answers concise. 3-6 sentences unless the user asks for more detail."
            )
            if context_data:
                # Render actual data (not just consent flags) so the model can answer
                # with real numbers instead of the v1 "consent but no data" fallback.
                import json as _json
                context_lines = []
                for k, v in context_data.items():
                    try:
                        payload = _json.dumps(v, default=str)
                    except Exception:
                        payload = str(v)
                    if len(payload) > 1200:
                        payload = payload[:1200] + " …(truncated)"
                    context_lines.append(f"- {k}: {payload}")
                system_prompt += (
                    "\n\nParticipant context sources you have consent to read (real data below). "
                    "Use these figures directly. If a value is None or missing, say so honestly.\n"
                    + "\n".join(context_lines)
                )
            chat = LlmChat(api_key=key, session_id=session_id, system_message=system_prompt).with_model("anthropic", "claude-sonnet-4-6")
            resp = await chat.send_message(UserMessage(text=message))
            content = str(resp)
            return {
                "content": content,
                "cited_sources": [{"source_type": k, "source_id": None,
                                   "citation_reference": f"internal:{k}"} for k in context_data.keys()],
                "context_flags_used": list(context_data.keys()),
                "structured_answer": None,
                "llm_provider": "anthropic:claude-sonnet-4-6",
            }
        except Exception as e:  # pragma: no cover
            logger.warning("aw2 LLM inference failed, falling back: %s", e)
    # v1 deterministic fallback (Section K.4)
    if not context_data:
        return {
            "content": _fallback_response(),
            "cited_sources": [],
            "context_flags_used": [],
            "structured_answer": None,
        }
    # Simple echo with cited sources for tests
    keys = list(context_data.keys())
    return {
        "content": f"Based on what I can see for you ({', '.join(keys)}), here is a summary.",
        "cited_sources": [{"source_type": k, "source_id": None,
                           "citation_reference": f"internal:{k}"} for k in keys],
        "context_flags_used": keys,
        "structured_answer": None,
    }


class StartConvIn(BaseModel):
    participant_context_id: Optional[str] = None
    initial_message: str


def _view_conversation(c: dict) -> Dict[str, Any]:
    return {
        "id": c["id"],
        "user_id": c["user_id"],
        "participant_context_id": c.get("participant_context_id"),
        "session_id": c.get("session_id"),
        "messages": c.get("messages") or [],
        "retention_policy": c.get("retention_policy"),
        "retention_expires_at": _iso(c.get("retention_expires_at")),
        "total_message_count": len(c.get("messages") or []),
        "created_at": _iso(c.get("created_at")),
        "last_activity_at": _iso(c.get("last_activity_at")),
    }


@aw2_router.post("/conversations")
async def start_conversation(body: StartConvIn, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    ctx = await _get_or_create_context(uid)
    now = _now()
    session_id = str(uuid.uuid4())

    context_data: Dict[str, Any] = await _gather_context_data(ctx, body.participant_context_id, uid)

    resp = await _compose_response(body.initial_message, context_data, session_id=session_id)

    user_msg = {
        "id": str(uuid.uuid4()), "role": "user", "content": body.initial_message,
        "timestamp": _iso(now), "cited_sources": [], "context_flags_used": [],
        "structured_answer": None, "user_feedback": None,
    }
    asst_msg = {
        "id": str(uuid.uuid4()), "role": "assistant", "content": resp["content"],
        "timestamp": _iso(now), "cited_sources": resp["cited_sources"],
        "context_flags_used": resp["context_flags_used"],
        "structured_answer": resp["structured_answer"], "user_feedback": None,
    }

    conv = {
        "id": str(uuid.uuid4()),
        "user_id": uid,
        "participant_context_id": body.participant_context_id,
        "session_id": session_id,
        "is_current_session": True,
        "messages": [user_msg, asst_msg],
        "retention_policy": ctx.get("retention_policy", "session_only"),
        "retention_expires_at": _retention_expiry(
            ctx.get("retention_policy", "session_only"), now),
        "total_message_count": 2,
        "contains_sensitive_content_flag": False,
        "created_at": now,
        "last_activity_at": now,
        "data_residency": "ap-southeast-2",
    }
    await _db.aw_conversations.insert_one(conv)

    # Retrieval audit log
    if context_data:
        await _db.aw_retrieval_logs.insert_one({
            "id": str(uuid.uuid4()),
            "conversation_id": conv["id"],
            "message_id": asst_msg["id"],
            "retrieved_sources": [{"source_type": k, "source_id": None,
                                   "consent_verified_at": _iso(now),
                                   "excerpt_length_bytes": 0} for k in context_data],
            "retrieval_purpose": "initial_message_response",
            "retrieved_at": now,
            "data_residency": "ap-southeast-2",
        })

    return {"conversation": _view_conversation(conv)}


class SendMsgIn(BaseModel):
    user_message: str


@aw2_router.post("/conversations/{cid}/messages")
async def send_message(cid: str, body: SendMsgIn, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    conv = await _db.aw_conversations.find_one({"id": cid, "user_id": uid})
    if not conv:
        raise HTTPException(status_code=404, detail="Not found")
    ctx = await _get_or_create_context(uid)
    now = _now()

    context_data: Dict[str, Any] = await _gather_context_data(ctx, conv.get("participant_context_id"), uid)

    resp = await _compose_response(body.user_message, context_data, session_id=conv.get("session_id", cid))
    user_msg = {
        "id": str(uuid.uuid4()), "role": "user", "content": body.user_message,
        "timestamp": _iso(now), "cited_sources": [], "context_flags_used": [],
        "structured_answer": None, "user_feedback": None,
    }
    asst_msg = {
        "id": str(uuid.uuid4()), "role": "assistant", "content": resp["content"],
        "timestamp": _iso(now), "cited_sources": resp["cited_sources"],
        "context_flags_used": resp["context_flags_used"],
        "structured_answer": resp["structured_answer"], "user_feedback": None,
    }
    await _db.aw_conversations.update_one(
        {"id": cid},
        {"$push": {"messages": {"$each": [user_msg, asst_msg]}},
         "$set": {"last_activity_at": now}})
    return {"user_message": user_msg, "assistant_message": asst_msg}


@aw2_router.get("/conversations")
async def list_conversations(request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    cur = _db.aw_conversations.find({"user_id": uid}).sort("last_activity_at", -1)
    convs = await cur.to_list(length=100)
    return {"conversations": [_view_conversation(c) for c in convs]}


@aw2_router.get("/conversations/{cid}")
async def get_conversation(cid: str, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    conv = await _db.aw_conversations.find_one({"id": cid, "user_id": uid})
    if not conv:
        raise HTTPException(status_code=404, detail="Not found")
    return {"conversation": _view_conversation(conv)}


@aw2_router.delete("/conversations/{cid}")
async def delete_conversation(cid: str, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    result = await _db.aw_conversations.delete_one({"id": cid, "user_id": uid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    await _db.aw_retrieval_logs.delete_many({"conversation_id": cid})
    return {"deleted": True}


class MsgFeedbackIn(BaseModel):
    message_id: str
    rating: str = Field(pattern="^(helpful|unhelpful|incorrect)$")


@aw2_router.post("/conversations/{cid}/feedback")
async def message_feedback(cid: str, body: MsgFeedbackIn, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    result = await _db.aw_conversations.update_one(
        {"id": cid, "user_id": uid, "messages.id": body.message_id},
        {"$set": {"messages.$.user_feedback": body.rating}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Proactive nudges (Sections I, D.4)
# ---------------------------------------------------------------------------


VALID_NUDGE_TYPES = {
    "statement_anomaly_unopened", "quarter_end_rollover_risk",
    "care_plan_review_due", "contribution_variance_step_change",
    "provider_price_change_notable", "lifetime_cap_milestone", "other",
}


class NudgeCreateIn(BaseModel):
    user_id: str
    participant_context_id: Optional[str] = None
    nudge_type: str
    nudge_content: str
    triggered_by_source: str
    triggered_by_source_id: str
    trigger_condition_summary: str = ""


@aw2_router.post("/proactive-nudges")
async def create_nudge(body: NudgeCreateIn, request: Request):
    await _assert_flag()
    # Internal endpoint, requires auth and superadmin.
    user = await _user_dep(request)
    if isinstance(user, dict) and not user.get("is_superadmin"):
        raise HTTPException(status_code=403, detail="Superadmin required")
    if body.nudge_type not in VALID_NUDGE_TYPES:
        raise HTTPException(status_code=422, detail="Invalid nudge type")
    # Enforce 1-per-week-per-type cadence
    week_ago = _now() - timedelta(days=7)
    recent = await _db.proactive_nudges.find_one({
        "user_id": body.user_id,
        "nudge_type": body.nudge_type,
        "created_at": {"$gte": week_ago},
    })
    if recent:
        raise HTTPException(status_code=429, detail="Cadence limit (1 per week per type)")

    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": body.user_id,
        "participant_context_id": body.participant_context_id,
        "nudge_type": body.nudge_type,
        "nudge_content": body.nudge_content,
        "triggered_by_source": body.triggered_by_source,
        "triggered_by_source_id": body.triggered_by_source_id,
        "trigger_condition_summary": body.trigger_condition_summary,
        "scheduled_for_surface_after": now,
        "surfaced_at": None,
        "surface_channel": "in_app_next_login",
        "user_response": None,
        "user_responded_at": None,
        "created_at": now,
        "data_residency": "ap-southeast-2",
    }
    await _db.proactive_nudges.insert_one(doc)
    return {"nudge_id": doc["id"], "nudges_enabled": _nudges_enabled()}


@aw2_router.get("/proactive-nudges")
async def list_nudges(request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    if not _nudges_enabled():
        return {"nudges": [], "nudges_enabled": False,
                "adm_disclosure_gate_active_from": _iso(ADM_DISCLOSURE_ACTIVE_DATE)}
    ctx = await _get_or_create_context(uid)
    if not ctx.get("adm_disclosure_version_seen"):
        return {"nudges": [], "reason": "adm_disclosure_not_acknowledged"}
    cur = _db.proactive_nudges.find({
        "user_id": uid,
        "scheduled_for_surface_after": {"$lte": _now()},
    }).sort("created_at", -1)
    items = await cur.to_list(length=50)
    return {"nudges": [{k: v for k, v in n.items() if k != "_id"} for n in items]}


class NudgeResponseIn(BaseModel):
    response: str = Field(pattern="^(engaged_opened_related_tool|engaged_asked_follow_up|dismissed|marked_not_relevant)$")


@aw2_router.post("/proactive-nudges/{nid}/user-response")
async def nudge_response(nid: str, body: NudgeResponseIn, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    now = _now()
    result = await _db.proactive_nudges.update_one(
        {"id": nid, "user_id": uid},
        {"$set": {"user_response": body.response,
                  "user_responded_at": now,
                  "surfaced_at": now}})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}
