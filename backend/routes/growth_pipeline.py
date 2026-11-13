"""Phase 4B — Publicity, Partnerships, Referrals & Growth Experiments.

A systematic engine for discovering growth opportunities, organising outreach,
tracking referrals and evaluating experiments — without compromising Wayly's
independence (households, not providers).

Hard rules:
  * No external outreach is ever sent automatically. AI may draft; a human must
    approve, and actual 'sent' status is recorded separately from approval.
  * Wayly independence: provider referrals / commissions / paid endorsements are
    flagged for founder review, never auto-accepted.
  * Referral programme is behind a feature flag (OFF). No incentives/discounts
    launch automatically. Customer personal data is never exposed to others.
  * Experiments report uncertainty; no statistical-significance claims on tiny
    samples. No experiments on security/privacy/billing.

Access: super_admin + operations_admin.
Mounted at /api/admin/pipeline/*.
"""
from __future__ import annotations

import os
import json
import uuid
import time
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]

MODEL = os.environ.get("SUPPORT_AI_MODEL", "claude-sonnet-5-5")
PROVIDER = os.environ.get("SUPPORT_AI_PROVIDER", "anthropic")
REFERRAL_ENABLED = os.environ.get("REFERRAL_PROGRAM_ENABLED", "false").lower() == "true"

PUBLICITY_STATUS = ("identified", "research", "qualified", "pitch_drafted",
                    "approval_requested", "outreach_authorised", "sent",
                    "follow_up", "outcome", "declined")
PARTNERSHIP_STATUS = ("identified", "evaluating", "qualified", "approval_requested",
                      "outreach_authorised", "in_discussion", "agreed", "declined")
EXPERIMENT_STATUS = ("proposed", "approved", "running", "completed", "abandoned")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _strip(d):
    if d:
        d.pop("_id", None)
    return d


async def ensure_indexes() -> None:
    try:
        await db.bos_publicity.create_index("status")
        await db.bos_partnerships.create_index("status")
        await db.bos_experiments.create_index("status")
        await db.bos_referrals.create_index("code", unique=True, sparse=True)
        await db.bos_recommendations.create_index("status")
    except Exception as exc:  # pragma: no cover
        logger.warning("growth_pipeline index skipped: %s", exc)


# --------------------------------------------------------------------------- models
class PublicityCreate(BaseModel):
    outlet: str = Field(min_length=2, max_length=200)
    opportunity_type: Optional[str] = Field(default=None, max_length=120)
    contact: Optional[str] = Field(default=None, max_length=200)
    url: Optional[str] = Field(default=None, max_length=500)
    topic: Optional[str] = Field(default=None, max_length=300)
    target_audience: Optional[str] = Field(default=None, max_length=300)
    relevance: Optional[str] = Field(default=None, max_length=1000)
    potential_value: Optional[Literal["low", "medium", "high"]] = "medium"
    deadline: Optional[str] = None
    priority: Literal["low", "medium", "high"] = "medium"
    notes: Optional[str] = Field(default=None, max_length=2000)


class PublicityPatch(BaseModel):
    status: Optional[Literal[PUBLICITY_STATUS]] = None  # type: ignore
    contact: Optional[str] = Field(default=None, max_length=200)
    topic: Optional[str] = Field(default=None, max_length=300)
    relevance: Optional[str] = Field(default=None, max_length=1000)
    pitch_draft: Optional[str] = Field(default=None, max_length=8000)
    follow_up_date: Optional[str] = None
    outcome: Optional[str] = Field(default=None, max_length=1000)
    priority: Optional[Literal["low", "medium", "high"]] = None
    notes: Optional[str] = Field(default=None, max_length=2000)
    sent_at: Optional[str] = None


class PitchAIBody(BaseModel):
    angle: Optional[str] = Field(default=None, max_length=500)


class SentBody(BaseModel):
    note: Optional[str] = Field(default=None, max_length=500)


class PartnershipCreate(BaseModel):
    organisation: str = Field(min_length=2, max_length=200)
    website: Optional[str] = Field(default=None, max_length=500)
    partnership_type: Optional[str] = Field(default=None, max_length=120)
    contact: Optional[str] = Field(default=None, max_length=200)
    strategic_fit: Optional[str] = Field(default=None, max_length=1000)
    audience_relevance: Optional[str] = Field(default=None, max_length=1000)
    description: Optional[str] = Field(default=None, max_length=2000)
    priority: Literal["low", "medium", "high"] = "medium"


class PartnershipPatch(BaseModel):
    status: Optional[Literal[PARTNERSHIP_STATUS]] = None  # type: ignore
    contact: Optional[str] = Field(default=None, max_length=200)
    notes: Optional[str] = Field(default=None, max_length=4000)
    next_follow_up: Optional[str] = None
    outcome: Optional[str] = Field(default=None, max_length=1000)
    priority: Optional[Literal["low", "medium", "high"]] = None


class ExperimentCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    business_problem: str = Field(min_length=2, max_length=1000)
    hypothesis: str = Field(min_length=2, max_length=1000)
    segment: Optional[str] = Field(default=None, max_length=300)
    proposed_change: Optional[str] = Field(default=None, max_length=2000)
    primary_metric: str = Field(min_length=2, max_length=200)
    secondary_metrics: Optional[str] = Field(default=None, max_length=500)
    guardrail_metrics: Optional[str] = Field(default=None, max_length=500)
    baseline: Optional[str] = Field(default=None, max_length=500)
    measurement_method: Optional[str] = Field(default=None, max_length=500)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    owner: Optional[str] = Field(default=None, max_length=120)


class ExperimentPatch(BaseModel):
    status: Optional[Literal[EXPERIMENT_STATUS]] = None  # type: ignore
    results: Optional[str] = Field(default=None, max_length=4000)
    recommendation: Optional[str] = Field(default=None, max_length=2000)
    sample_size: Optional[int] = Field(default=None, ge=0)
    confidence_note: Optional[str] = Field(default=None, max_length=500)


class ReferralSourceCreate(BaseModel):
    source_name: str = Field(min_length=2, max_length=160)
    campaign: Optional[str] = Field(default=None, max_length=160)
    code: Optional[str] = Field(default=None, max_length=60)
    notes: Optional[str] = Field(default=None, max_length=1000)


class RecommendationCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    area: str = Field(min_length=2, max_length=80)
    evidence: str = Field(min_length=2, max_length=2000)
    source: str = Field(min_length=2, max_length=160)
    rationale: Optional[str] = Field(default=None, max_length=2000)
    estimated_impact: Optional[str] = Field(default=None, max_length=500)
    uncertainty: Optional[str] = Field(default=None, max_length=500)
    next_step: Optional[str] = Field(default=None, max_length=500)
    priority: Literal["low", "medium", "high"] = "medium"


class RecommendationPatch(BaseModel):
    status: Optional[Literal["open", "accepted", "dismissed", "done"]] = None
    next_step: Optional[str] = Field(default=None, max_length=500)


PITCH_SYSTEM_PROMPT = (
    "You are a PR assistant for Wayly (wayly.com.au), an independent Australian "
    "service that helps households understand aged care. Brand: 'Aged Care, Made "
    "Clear.' Draft a short, genuine media pitch in Australian English for the given "
    "outlet and topic. Be honest and specific; NEVER fabricate statistics, awards, "
    "testimonials or partnerships. Do NOT include any private customer information. "
    "This is a DRAFT for human review and must not be sent automatically.\n"
    "Return ONLY valid JSON with keys: subject, pitch_body, suggested_angle, "
    "follow_up_note, review_notes."
)


def _parse_json(raw: str) -> dict:
    if not raw:
        return {}
    s = raw.strip()
    if s.startswith("```"):
        s = s.split("```", 2)[1] if "```" in s[3:] else s.strip("`")
        if s.startswith("json"):
            s = s[4:]
    try:
        return json.loads(s)
    except Exception:
        a, b = s.find("{"), s.rfind("}")
        if a != -1 and b != -1 and b > a:
            try:
                return json.loads(s[a:b + 1])
            except Exception:
                return {}
    return {}


def _provider_flag(text: str) -> bool:
    """Flag partnerships that could compromise independence (provider referral/commission)."""
    t = (text or "").lower()
    return any(w in t for w in ("provider referral", "commission", "referral fee",
                                "paid referral", "endorsement", "kickback"))


def build_growth_pipeline_router():
    from admin_auth import require_super_or_ops  # noqa: WPS433
    from bos_approvals import request_approval
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(ensure_indexes())
    except Exception as exc:  # pragma: no cover
        logger.warning("growth_pipeline init skipped: %s", exc)

    r = APIRouter(prefix="/admin/pipeline", tags=["growth-pipeline"])

    # ------------------------------------------------------------- publicity
    @r.get("/publicity")
    async def list_publicity(status: Optional[str] = None, admin: dict = Depends(require_super_or_ops)):
        q = {} if not status else {"status": status}
        rows = []
        async for p in db.bos_publicity.find(q, {"_id": 0}).sort("created_at", -1):
            rows.append(p)
        return {"opportunities": rows, "count": len(rows)}

    @r.post("/publicity")
    async def create_publicity(body: PublicityCreate, admin: dict = Depends(require_super_or_ops)):
        ref = f"PUB-{uuid.uuid4().hex[:6].upper()}"
        doc = {"id": uuid.uuid4().hex, "reference": ref, **body.model_dump(),
               "status": "identified", "pitch_draft": None, "follow_up_date": None,
               "outcome": None, "sent_at": None, "approval_state": None,
               "created_at": _now(), "updated_at": _now(), "created_by": admin.get("id")}
        await db.bos_publicity.insert_one(doc)
        return {"ok": True, "opportunity": _strip(doc)}

    @r.patch("/publicity/{pub_id}")
    async def patch_publicity(pub_id: str, body: PublicityPatch, admin: dict = Depends(require_super_or_ops)):
        upd = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
        if not upd:
            return {"ok": True, "unchanged": True}
        upd["updated_at"] = _now()
        res = await db.bos_publicity.update_one({"id": pub_id}, {"$set": upd})
        if res.matched_count == 0:
            raise HTTPException(404, "Opportunity not found")
        return {"ok": True}

    @r.post("/publicity/{pub_id}/ai-pitch")
    async def ai_pitch(pub_id: str, body: PitchAIBody, admin: dict = Depends(require_super_or_ops)):
        p = await db.bos_publicity.find_one({"id": pub_id}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Opportunity not found")
        knowledge = await _retrieve_knowledge(p.get("topic") or p.get("outlet") or "", 4)
        payload = {"OUTLET": p.get("outlet"), "TOPIC": p.get("topic"),
                   "AUDIENCE": p.get("target_audience"), "ANGLE": body.angle,
                   "KNOWLEDGE": [{"slug": k["slug"], "title": k["title"],
                                  "content": k.get("excerpt")} for k in knowledge]}
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
        except Exception:
            raise HTTPException(503, "AI drafting is temporarily unavailable.")
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(503, "AI drafting is not configured.")
        started = time.perf_counter()
        try:
            chat = LlmChat(api_key=api_key, session_id=f"pitch-{pub_id}-{uuid.uuid4().hex[:8]}",
                           system_message=PITCH_SYSTEM_PROMPT).with_model(PROVIDER, MODEL)
            raw = await chat.send_message(UserMessage(text=json.dumps(payload, ensure_ascii=False)))
            parsed = _parse_json(raw)
        except Exception as exc:
            logger.warning("pitch AI failed for %s: %s", pub_id, exc)
            raise HTTPException(503, "The AI could not produce a pitch right now.")
        latency_ms = int((time.perf_counter() - started) * 1000)
        draft = parsed.get("pitch_body") or ""
        await db.bos_publicity.update_one({"id": pub_id}, {"$set": {
            "pitch_draft": draft, "status": "pitch_drafted", "updated_at": _now()}})
        return {"subject": parsed.get("subject"), "pitch_body": draft,
                "suggested_angle": parsed.get("suggested_angle"),
                "follow_up_note": parsed.get("follow_up_note"),
                "review_notes": parsed.get("review_notes"),
                "model": MODEL, "metrics": {"latency_ms": latency_ms},
                "note": "Draft only — review and approve before any outreach. Nothing is sent automatically."}

    @r.post("/publicity/{pub_id}/submit")
    async def submit_publicity(pub_id: str, admin: dict = Depends(require_super_or_ops)):
        p = await db.bos_publicity.find_one({"id": pub_id}, {"_id": 0})
        if not p:
            raise HTTPException(404, "Opportunity not found")
        if not p.get("pitch_draft"):
            raise HTTPException(409, "Draft a pitch before requesting approval.")
        await db.bos_publicity.update_one(
            {"id": pub_id}, {"$set": {"status": "approval_requested", "updated_at": _now()}})
        await request_approval(kind="publicity", source_collection="bos_publicity",
                               source_id=pub_id, title=f"Media outreach: {p.get('outlet')}",
                               reason="Media pitch awaiting approval before outreach",
                               destination="/admin/pipeline", actor=admin)
        return {"ok": True, "status": "approval_requested"}

    @r.post("/publicity/{pub_id}/mark-sent")
    async def mark_sent(pub_id: str, body: SentBody, admin: dict = Depends(require_super_or_ops)):
        p = await db.bos_publicity.find_one({"id": pub_id}, {"_id": 0, "approval_state": 1})
        if not p:
            raise HTTPException(404, "Opportunity not found")
        if p.get("approval_state") != "approved":
            raise HTTPException(409, "Outreach must be approved before it is marked sent.")
        await db.bos_publicity.update_one({"id": pub_id}, {"$set": {
            "status": "sent", "sent_at": _now(), "sent_note": body.note, "updated_at": _now()}})
        return {"ok": True}

    # ----------------------------------------------------------- partnerships
    @r.get("/partnerships")
    async def list_partnerships(status: Optional[str] = None, admin: dict = Depends(require_super_or_ops)):
        q = {} if not status else {"status": status}
        rows = []
        async for p in db.bos_partnerships.find(q, {"_id": 0}).sort("created_at", -1):
            rows.append(p)
        return {"partnerships": rows, "count": len(rows)}

    @r.post("/partnerships")
    async def create_partnership(body: PartnershipCreate, admin: dict = Depends(require_super_or_ops)):
        combined = f"{body.partnership_type or ''} {body.description or ''} {body.strategic_fit or ''}"
        flagged = _provider_flag(combined)
        doc = {"id": uuid.uuid4().hex, **body.model_dump(), "status": "identified",
               "independence_flag": flagged, "next_follow_up": None, "outcome": None,
               "notes": None, "created_at": _now(), "updated_at": _now(),
               "created_by": admin.get("id")}
        await db.bos_partnerships.insert_one(doc)
        return {"ok": True, "partnership": _strip(doc),
                "independence_flag": flagged,
                "note": "Flagged for founder review — may affect Wayly's independence." if flagged else None}

    @r.patch("/partnerships/{pid}")
    async def patch_partnership(pid: str, body: PartnershipPatch, admin: dict = Depends(require_super_or_ops)):
        upd = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
        if not upd:
            return {"ok": True, "unchanged": True}
        upd["updated_at"] = _now()
        res = await db.bos_partnerships.update_one({"id": pid}, {"$set": upd})
        if res.matched_count == 0:
            raise HTTPException(404, "Partnership not found")
        return {"ok": True}

    # ------------------------------------------------------------ experiments
    @r.get("/experiments")
    async def list_experiments(status: Optional[str] = None, admin: dict = Depends(require_super_or_ops)):
        q = {} if not status else {"status": status}
        rows = []
        async for e in db.bos_experiments.find(q, {"_id": 0}).sort("created_at", -1):
            rows.append(e)
        return {"experiments": rows, "count": len(rows)}

    @r.post("/experiments")
    async def create_experiment(body: ExperimentCreate, admin: dict = Depends(require_super_or_ops)):
        doc = {"id": uuid.uuid4().hex, **body.model_dump(), "status": "proposed",
               "results": None, "recommendation": None, "sample_size": None,
               "confidence_note": None, "created_at": _now(), "updated_at": _now(),
               "created_by": admin.get("id")}
        await db.bos_experiments.insert_one(doc)
        return {"ok": True, "experiment": _strip(doc)}

    @r.patch("/experiments/{eid}")
    async def patch_experiment(eid: str, body: ExperimentPatch, admin: dict = Depends(require_super_or_ops)):
        upd = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
        if not upd:
            return {"ok": True, "unchanged": True}
        upd["updated_at"] = _now()
        res = await db.bos_experiments.update_one({"id": eid}, {"$set": upd})
        if res.matched_count == 0:
            raise HTTPException(404, "Experiment not found")
        return {"ok": True}

    # -------------------------------------------------------------- referrals
    @r.get("/referrals")
    async def referral_status(admin: dict = Depends(require_super_or_ops)):
        sources = []
        async for s in db.bos_referrals.find({}, {"_id": 0}).sort("created_at", -1):
            sources.append(s)
        return {"enabled": REFERRAL_ENABLED, "sources": sources, "count": len(sources),
                "note": "The customer-facing referral programme is behind a feature flag and is "
                        "OFF. No incentives or discounts are live. These are internal referral-source "
                        "records only — no customer personal data is exposed and no friends are contacted."}

    @r.post("/referrals/sources")
    async def create_referral_source(body: ReferralSourceCreate, admin: dict = Depends(require_super_or_ops)):
        code = (body.code or f"ref-{uuid.uuid4().hex[:8]}").strip().lower()
        if await db.bos_referrals.find_one({"code": code}, {"_id": 1}):
            raise HTTPException(409, "A referral source with this code already exists.")
        doc = {"id": uuid.uuid4().hex, "code": code, "source_name": body.source_name.strip(),
               "campaign": body.campaign, "notes": body.notes,
               "recorded_registrations": 0, "recorded_trials": 0, "recorded_paid": 0,
               "created_at": _now(), "created_by": admin.get("id")}
        await db.bos_referrals.insert_one(doc)
        return {"ok": True, "source": _strip(doc)}

    # --------------------------------------------------------- recommendations
    @r.get("/recommendations")
    async def list_recommendations(status: Optional[str] = None, admin: dict = Depends(require_super_or_ops)):
        q = {} if not status else {"status": status}
        rows = []
        async for rec in db.bos_recommendations.find(q, {"_id": 0}).sort("created_at", -1):
            rows.append(rec)
        return {"recommendations": rows, "count": len(rows)}

    @r.post("/recommendations")
    async def create_recommendation(body: RecommendationCreate, admin: dict = Depends(require_super_or_ops)):
        doc = {"id": uuid.uuid4().hex, **body.model_dump(), "status": "open",
               "observed_at": _now(), "created_at": _now(), "created_by": admin.get("id")}
        await db.bos_recommendations.insert_one(doc)
        return {"ok": True, "recommendation": _strip(doc)}

    @r.patch("/recommendations/{rid}")
    async def patch_recommendation(rid: str, body: RecommendationPatch, admin: dict = Depends(require_super_or_ops)):
        upd = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
        if not upd:
            return {"ok": True, "unchanged": True}
        upd["updated_at"] = _now()
        res = await db.bos_recommendations.update_one({"id": rid}, {"$set": upd})
        if res.matched_count == 0:
            raise HTTPException(404, "Recommendation not found")
        return {"ok": True}

    @r.post("/recommendations/generate")
    async def generate_recommendations(admin: dict = Depends(require_super_or_ops)):
        """Derive evidence-based suggestions from existing data (SEO opportunities,
        open experiments, unanswered Help searches). Never fabricates impact."""
        created = 0
        # Knowledge gaps from unanswered Help searches
        try:
            from routes.help_centre import help_centre_metrics
            hm = await help_centre_metrics()
            for gap in (hm.get("knowledge_gaps") or [])[:3]:
                term = gap.get("term") if isinstance(gap, dict) else gap
                if not term:
                    continue
                key = f"help_gap:{term}"
                if await db.bos_recommendations.find_one({"dedup_key": key}, {"_id": 1}):
                    continue
                await db.bos_recommendations.insert_one({
                    "id": uuid.uuid4().hex, "dedup_key": key,
                    "title": f"Create Help content for '{term}'", "area": "content_seo",
                    "evidence": f"Customers searched '{term}' with no matching article.",
                    "source": "help_searches", "rationale": "Close a known knowledge gap.",
                    "estimated_impact": "Reduced unanswered searches (magnitude unknown).",
                    "uncertainty": "Impact depends on search volume; not yet quantified.",
                    "next_step": "Draft an approved Help Centre article, then a blog post.",
                    "priority": "medium", "status": "open", "observed_at": _now(),
                    "created_at": _now(), "created_by": "system_generate"})
                created += 1
        except Exception as exc:  # pragma: no cover
            logger.warning("recommendation generate (help) skipped: %s", exc)
        return {"ok": True, "created": created,
                "note": "Generated only from verified signals. Impact is described with its uncertainty."}

    return r


async def _retrieve_knowledge(query: str, limit: int) -> List[dict]:
    try:
        from routes.help_centre import retrieve_help_knowledge
        return await retrieve_help_knowledge(query, limit)
    except Exception as exc:  # pragma: no cover
        logger.warning("pipeline knowledge retrieval failed: %s", exc)
        return []
