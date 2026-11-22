"""Phase 4A — Marketing & Brand Growth Engine.

A central marketing management layer: consolidated content calendar + editorial
workflow, grounded AI content preparation, an SEO opportunity engine, and a
read-only connector framework (honest about what is actually connected).

Rules:
  * No public content is ever auto-published — publishing is a manual, evidenced
    admin action AFTER founder approval.
  * AI drafts are grounded ONLY in approved/published Help Centre knowledge and
    Wayly brand guidance; never fabricated statistics, testimonials or claims.
  * Marketing spend stays in the Marketing Register (no second ledger here).
  * External connectors are NOT assumed available — each reports its real status.

Access: super_admin + operations_admin.
Mounted at /api/admin/growth/*.
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

CONTENT_STATUS = ("idea", "brief", "draft", "internal_review", "pending_approval",
                  "approved", "scheduled", "published", "failed", "archived")
PUBLISH_STATUS = ("not_published", "scheduled", "published", "failed")
CHANNELS = ("blog", "facebook", "instagram", "linkedin", "newsletter",
            "resource", "landing_page", "press_release", "media_pitch", "video_script")

SEO_STATUS = ("open", "in_progress", "actioned", "dismissed")

DEFAULT_CONNECTORS = [
    ("Google Search Console", "gsc", "OAuth to a verified GSC property is required."),
    ("GA4 Data API", "ga4", "A GA4 property ID and service-account access are required."),
    ("Metricool", "metricool", "A Metricool plan with API access is required."),
    ("Google Ads", "google_ads", "Google Ads API developer token + OAuth are required."),
    ("Meta Ads", "meta_ads", "A Meta Business system-user token is required."),
    ("Microsoft Advertising", "microsoft_ads", "Microsoft Advertising API access is required."),
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _strip(d):
    if d:
        d.pop("_id", None)
    return d


async def ensure_indexes() -> None:
    try:
        await db.bos_content.create_index("status")
        await db.bos_content.create_index("channel")
        await db.bos_content.create_index("campaign_id")
        await db.bos_content.create_index("scheduled_date")
        await db.bos_seo_opportunities.create_index("status")
        await db.bos_integrations.create_index("key", unique=True)
    except Exception as exc:  # pragma: no cover
        logger.warning("growth_engine index skipped: %s", exc)


async def seed_connectors() -> None:
    for name, key, note in DEFAULT_CONNECTORS:
        if await db.bos_integrations.find_one({"key": key}, {"_id": 1}):
            continue
        await db.bos_integrations.insert_one({
            "id": uuid.uuid4().hex, "key": key, "name": name,
            "status": "not_connected", "scope": "read_only",
            "setup_note": note, "last_success": None, "last_error": None,
            "created_at": _now(),
        })


# --------------------------------------------------------------------------- models
class ContentCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    channel: Literal[CHANNELS] = "blog"  # type: ignore
    content_format: Optional[str] = Field(default=None, max_length=80)
    campaign_id: Optional[str] = None
    owner: Optional[str] = Field(default=None, max_length=120)
    topic: Optional[str] = Field(default=None, max_length=300)
    brief: Optional[str] = Field(default=None, max_length=4000)
    body: Optional[str] = Field(default=None, max_length=40000)
    status: Literal[CONTENT_STATUS] = "idea"  # type: ignore
    scheduled_date: Optional[str] = None


class ContentPatch(BaseModel):
    title: Optional[str] = Field(default=None, min_length=2, max_length=200)
    channel: Optional[Literal[CHANNELS]] = None  # type: ignore
    content_format: Optional[str] = Field(default=None, max_length=80)
    campaign_id: Optional[str] = None
    owner: Optional[str] = Field(default=None, max_length=120)
    topic: Optional[str] = Field(default=None, max_length=300)
    brief: Optional[str] = Field(default=None, max_length=4000)
    body: Optional[str] = Field(default=None, max_length=40000)
    status: Optional[Literal[CONTENT_STATUS]] = None  # type: ignore
    scheduled_date: Optional[str] = None
    seo_title: Optional[str] = Field(default=None, max_length=200)
    meta_description: Optional[str] = Field(default=None, max_length=400)


class ScheduleBody(BaseModel):
    scheduled_date: str


class PublishedBody(BaseModel):
    published_url: str = Field(min_length=3, max_length=500)
    note: Optional[str] = Field(default=None, max_length=500)


class AIDraftBody(BaseModel):
    extra_instructions: Optional[str] = Field(default=None, max_length=1000)


class SeoCreate(BaseModel):
    page_or_topic: str = Field(min_length=2, max_length=300)
    signal: str = Field(min_length=2, max_length=120)
    source: str = Field(default="admin_recorded", max_length=120)
    metric_note: Optional[str] = Field(default=None, max_length=500)
    period: Optional[str] = Field(default=None, max_length=80)
    problem: Optional[str] = Field(default=None, max_length=1000)
    suggestion: Optional[str] = Field(default=None, max_length=1000)
    priority: Literal["low", "medium", "high"] = "medium"


class SeoPatch(BaseModel):
    status: Optional[Literal[SEO_STATUS]] = None  # type: ignore
    outcome: Optional[str] = Field(default=None, max_length=1000)
    priority: Optional[Literal["low", "medium", "high"]] = None
    suggestion: Optional[str] = Field(default=None, max_length=1000)


CONTENT_SYSTEM_PROMPT = (
    "You are a marketing content assistant for Wayly (wayly.com.au), an Australian "
    "service that helps households understand aged care. Brand promise: 'Aged Care, "
    "Made Clear.' Wayly is for households, NOT providers, and is independent.\n"
    "Write in natural Australian English, clear and accessible for older Australians "
    "and carers. Ground every factual claim ONLY in the supplied approved KNOWLEDGE. "
    "NEVER fabricate statistics, testimonials, policy/entitlement claims or outcomes. "
    "If knowledge is insufficient, say so in review_notes and keep claims general. "
    "This is a DRAFT for human review — it must not be published as-is.\n"
    "Return ONLY valid JSON with keys: title, body, seo_title, meta_description, "
    "channel_adaptation, review_notes, has_sufficient_knowledge (boolean), "
    "cited_sources (array of knowledge slugs actually used)."
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


def build_growth_engine_router():
    from admin_auth import require_super_or_ops  # noqa: WPS433
    from bos_approvals import request_approval
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(ensure_indexes())
            loop.create_task(seed_connectors())
    except Exception as exc:  # pragma: no cover
        logger.warning("growth_engine init skipped: %s", exc)

    r = APIRouter(prefix="/admin/growth", tags=["growth-engine"])

    # ----------------------------------------------------------------- content
    @r.get("/content")
    async def list_content(status: Optional[str] = None, channel: Optional[str] = None,
                           campaign_id: Optional[str] = None,
                           admin: dict = Depends(require_super_or_ops)):
        q: Dict[str, Any] = {}
        for k, v in (("status", status), ("channel", channel), ("campaign_id", campaign_id)):
            if v:
                q[k] = v
        rows = []
        async for c in db.bos_content.find(q, {"_id": 0}).sort("updated_at", -1):
            rows.append(c)
        return {"content": rows, "count": len(rows)}

    @r.get("/content/calendar")
    async def content_calendar(admin: dict = Depends(require_super_or_ops)):
        rows = []
        async for c in db.bos_content.find(
            {"scheduled_date": {"$nin": [None, ""]}},
            {"_id": 0, "id": 1, "title": 1, "channel": 1, "status": 1,
             "publish_status": 1, "scheduled_date": 1, "campaign_id": 1}).sort("scheduled_date", 1):
            rows.append(c)
        return {"items": rows, "count": len(rows),
                "note": "Scheduling here is Wayly's editorial plan. Where Metricool is the "
                        "external publisher, its records remain authoritative for external posting."}

    @r.post("/content")
    async def create_content(body: ContentCreate, admin: dict = Depends(require_super_or_ops)):
        doc = {
            "id": uuid.uuid4().hex, "title": body.title.strip(), "channel": body.channel,
            "content_format": body.content_format, "campaign_id": body.campaign_id,
            "owner": body.owner, "topic": body.topic, "brief": body.brief, "body": body.body,
            "seo_title": None, "meta_description": None,
            "status": body.status, "publish_status": "not_published",
            "scheduled_date": body.scheduled_date, "published_url": None,
            "approval_state": None, "ai_generated": False,
            "created_at": _now(), "updated_at": _now(), "created_by": admin.get("id"),
        }
        await db.bos_content.insert_one(doc)
        return {"ok": True, "content": _strip(doc)}

    @r.get("/content/{content_id}")
    async def get_content(content_id: str, admin: dict = Depends(require_super_or_ops)):
        c = await db.bos_content.find_one({"id": content_id}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Content not found")
        return {"content": c}

    @r.patch("/content/{content_id}")
    async def patch_content(content_id: str, body: ContentPatch,
                            admin: dict = Depends(require_super_or_ops)):
        c = await db.bos_content.find_one({"id": content_id}, {"_id": 1})
        if not c:
            raise HTTPException(404, "Content not found")
        upd = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
        if not upd:
            return {"ok": True, "unchanged": True}
        upd["updated_at"] = _now()
        await db.bos_content.update_one({"id": content_id}, {"$set": upd})
        return {"ok": True, "updated": list(upd.keys())}

    @r.post("/content/{content_id}/submit")
    async def submit_content(content_id: str, admin: dict = Depends(require_super_or_ops)):
        c = await db.bos_content.find_one({"id": content_id}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Content not found")
        await db.bos_content.update_one(
            {"id": content_id}, {"$set": {"status": "pending_approval", "updated_at": _now()}})
        await request_approval(
            kind="content", source_collection="bos_content", source_id=content_id,
            title=f"Content: {c.get('title')}", reason=f"{c.get('channel')} content awaiting approval",
            owner=c.get("owner"), destination="/admin/growth", actor=admin)
        return {"ok": True, "status": "pending_approval"}

    @r.post("/content/{content_id}/schedule")
    async def schedule_content(content_id: str, body: ScheduleBody,
                               admin: dict = Depends(require_super_or_ops)):
        c = await db.bos_content.find_one({"id": content_id}, {"_id": 0, "approval_state": 1, "status": 1})
        if not c:
            raise HTTPException(404, "Content not found")
        if c.get("approval_state") != "approved" and c.get("status") != "approved":
            raise HTTPException(409, "Content must be approved before scheduling.")
        await db.bos_content.update_one({"id": content_id}, {"$set": {
            "status": "scheduled", "publish_status": "scheduled",
            "scheduled_date": body.scheduled_date, "updated_at": _now()}})
        return {"ok": True}

    @r.post("/content/{content_id}/mark-published")
    async def mark_published(content_id: str, body: PublishedBody,
                             admin: dict = Depends(require_super_or_ops)):
        """Manual, evidenced publication record. Never automatic."""
        c = await db.bos_content.find_one({"id": content_id}, {"_id": 0, "approval_state": 1, "status": 1})
        if not c:
            raise HTTPException(404, "Content not found")
        if c.get("approval_state") != "approved" and c.get("status") not in ("approved", "scheduled"):
            raise HTTPException(409, "Content must be approved before it can be marked published.")
        await db.bos_content.update_one({"id": content_id}, {"$set": {
            "status": "published", "publish_status": "published",
            "published_url": body.published_url, "published_at": _now(),
            "published_by": admin.get("email"), "updated_at": _now()}})
        return {"ok": True}

    @r.post("/content/{content_id}/ai-draft")
    async def ai_draft_content(content_id: str, body: AIDraftBody,
                               admin: dict = Depends(require_super_or_ops)):
        c = await db.bos_content.find_one({"id": content_id}, {"_id": 0})
        if not c:
            raise HTTPException(404, "Content not found")
        query = c.get("topic") or c.get("title") or ""
        knowledge = await _retrieve_knowledge(query, 6)
        payload = {
            "CHANNEL": c.get("channel"), "FORMAT": c.get("content_format"),
            "TITLE": c.get("title"), "TOPIC": c.get("topic"), "BRIEF": c.get("brief"),
            "EXTRA_INSTRUCTIONS": body.extra_instructions,
            "KNOWLEDGE": [{"slug": k["slug"], "title": k["title"],
                           "summary": k.get("summary"), "content": k.get("excerpt")} for k in knowledge],
        }
        try:
            from emergentintegrations.llm.chat import LlmChat, UserMessage  # type: ignore
        except Exception as exc:  # pragma: no cover
            raise HTTPException(503, "AI drafting is temporarily unavailable.")
        api_key = os.environ.get("EMERGENT_LLM_KEY")
        if not api_key:
            raise HTTPException(503, "AI drafting is not configured.")
        started = time.perf_counter()
        try:
            chat = LlmChat(api_key=api_key, session_id=f"content-ai-{content_id}-{uuid.uuid4().hex[:8]}",
                           system_message=CONTENT_SYSTEM_PROMPT).with_model(PROVIDER, MODEL)
            raw = await chat.send_message(UserMessage(text=json.dumps(payload, ensure_ascii=False)))
            parsed = _parse_json(raw)
        except Exception as exc:
            logger.warning("content AI draft failed for %s: %s", content_id, exc)
            raise HTTPException(503, "The AI could not produce a draft right now. Please try again.")
        latency_ms = int((time.perf_counter() - started) * 1000)
        result = {
            "title": parsed.get("title") or c.get("title"),
            "body": parsed.get("body") or "",
            "seo_title": parsed.get("seo_title"),
            "meta_description": parsed.get("meta_description"),
            "channel_adaptation": parsed.get("channel_adaptation"),
            "review_notes": parsed.get("review_notes"),
            "has_sufficient_knowledge": bool(parsed.get("has_sufficient_knowledge")),
            "cited_sources": parsed.get("cited_sources") or [],
            "grounded_on": [{"slug": k["slug"], "title": k["title"], "url": k["url"]} for k in knowledge],
            "model": MODEL, "metrics": {"latency_ms": latency_ms},
        }
        return result

    # --------------------------------------------------------------------- SEO
    @r.get("/seo/opportunities")
    async def list_seo(status: Optional[str] = None, admin: dict = Depends(require_super_or_ops)):
        q = {} if not status else {"status": status}
        rows = []
        async for s in db.bos_seo_opportunities.find(q, {"_id": 0}).sort("created_at", -1):
            rows.append(s)
        return {"opportunities": rows, "count": len(rows)}

    @r.post("/seo/opportunities")
    async def create_seo(body: SeoCreate, admin: dict = Depends(require_super_or_ops)):
        doc = {
            "id": uuid.uuid4().hex, "page_or_topic": body.page_or_topic.strip(),
            "signal": body.signal, "source": body.source, "metric_note": body.metric_note,
            "period": body.period, "problem": body.problem, "suggestion": body.suggestion,
            "priority": body.priority, "status": "open", "outcome": None,
            "created_at": _now(), "updated_at": _now(), "created_by": admin.get("id"),
        }
        await db.bos_seo_opportunities.insert_one(doc)
        return {"ok": True, "opportunity": _strip(doc)}

    @r.patch("/seo/opportunities/{opp_id}")
    async def patch_seo(opp_id: str, body: SeoPatch, admin: dict = Depends(require_super_or_ops)):
        upd = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
        if not upd:
            return {"ok": True, "unchanged": True}
        upd["updated_at"] = _now()
        res = await db.bos_seo_opportunities.update_one({"id": opp_id}, {"$set": upd})
        if res.matched_count == 0:
            raise HTTPException(404, "Opportunity not found")
        return {"ok": True}

    # ------------------------------------------------------------- connectors
    @r.get("/connectors")
    async def list_connectors(admin: dict = Depends(require_super_or_ops)):
        rows = []
        async for c in db.bos_integrations.find({}, {"_id": 0}).sort("name", 1):
            rows.append(c)
        return {"connectors": rows,
                "note": "All external marketing connectors are read-only and currently not "
                        "connected. They require authorised account access before any real "
                        "data is shown. Manual data is never presented as verified API data."}

    return r


async def _retrieve_knowledge(query: str, limit: int) -> List[dict]:
    try:
        from routes.help_centre import retrieve_help_knowledge
        return await retrieve_help_knowledge(query, limit)
    except Exception as exc:  # pragma: no cover
        logger.warning("growth knowledge retrieval failed: %s", exc)
        return []
