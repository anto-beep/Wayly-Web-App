"""Phase 3A.2 — Wayly Help Centre.

A product-support knowledge base that lives at the public /help surface and is
managed through the existing CMS/admin pattern (admin auth + audit log). It is
deliberately SEPARATE from the marketing `cms_articles` (/resources/articles)
and the static FAQ (/faq) so product-support content never pollutes the
aged-care/SEO catalogue or its sitemap.

Guarantees
----------
* Public endpoints only ever return status == "published" content. Drafts,
  in-review and approved-but-unpublished articles are never publicly visible.
* Reader feedback comments are PRIVATE — only the admin endpoints return them.
* The approved knowledge retrieval (`retrieve_help_knowledge`) returns only
  approved/published articles and is the single sanctioned grounding source for
  the Phase 3A.3 human-reviewed AI support drafts. It never surfaces drafts,
  internal notes or private customer data.
* Full draft -> in_review -> approved -> published workflow with per-edit
  version snapshots, an outdated flag and a last-reviewed date.

Mounted (no prefix) under /api:  /api/admin/help/*  and  /api/public/help/*.
"""
from __future__ import annotations

import os
import re
import time
import uuid
import hmac
import hashlib
import logging
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]

_HASH_SECRET = os.environ.get("EMAIL_HASH_SECRET", "wayly-help-centre-fallback")

# Fixed product-support categories (slug -> label). "other-tools" is the catch-all.
CATEGORIES: Dict[str, str] = {
    "getting-started": "Getting started",
    "registration-trial": "Registration, card details & free trial",
    "onboarding": "Onboarding",
    "billing-subscriptions": "Billing & subscriptions",
    "statement-decoder": "Statement Decoder",
    "invoice-checker": "Invoice Checker",
    "ask-wayly": "Ask Wayly",
    "account-privacy": "Account & privacy",
    "technical-troubleshooting": "Technical troubleshooting",
    "support-at-home-chsp": "Support at Home & CHSP",
    "other-tools": "Other Wayly tools",
}

STATUSES = ("draft", "in_review", "approved", "published", "archived")
# Statuses that may ground a human-reviewed AI support reply (approved or better).
GROUNDING_STATUSES = ("approved", "published")
# Not reviewed in this many days => flagged "stale" in admin reporting.
STALE_DAYS = 180

_SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,80}[a-z0-9])?$")

# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slugify(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")[:80]


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _ip_hash(ip: str) -> str:
    return hmac.new(_HASH_SECRET.encode(), (ip or "").encode(), hashlib.sha256).hexdigest()[:32]


# In-memory per-IP limiter (sufficient for anonymous feedback/search abuse).
_RL: Dict[str, List[float]] = defaultdict(list)


def _rate_limit(key: str, max_n: int, window_sec: int, msg: str) -> None:
    now = time.time()
    _RL[key] = [t for t in _RL[key] if now - t < window_sec]
    if len(_RL[key]) >= max_n:
        raise HTTPException(status_code=429, detail={"error": "rate_limit", "message": msg})
    _RL[key].append(now)


def _public_article(a: dict) -> dict:
    """Public projection — never leaks admin/feedback internals."""
    return {
        "slug": a.get("slug"),
        "title": a.get("title"),
        "summary": a.get("summary"),
        "body_md": a.get("body_md"),
        "category": a.get("category"),
        "category_label": CATEGORIES.get(a.get("category"), a.get("category")),
        "tags": a.get("tags") or [],
        "meta_title": a.get("meta_title") or a.get("title"),
        "meta_description": a.get("meta_description") or a.get("summary"),
        "helpful_count": a.get("helpful_count", 0),
        "not_helpful_count": a.get("not_helpful_count", 0),
        "published_at": a.get("published_at"),
        "updated_at": a.get("updated_at"),
        "last_reviewed_at": a.get("last_reviewed_at"),
    }


def _card(a: dict) -> dict:
    return {
        "slug": a.get("slug"), "title": a.get("title"), "summary": a.get("summary"),
        "category": a.get("category"), "category_label": CATEGORIES.get(a.get("category"), a.get("category")),
        "tags": a.get("tags") or [], "view_count": a.get("view_count", 0),
        "helpful_count": a.get("helpful_count", 0),
    }


async def ensure_indexes() -> None:
    try:
        await db.help_articles.create_index("slug", unique=True)
        await db.help_articles.create_index("status")
        await db.help_articles.create_index("category")
        await db.help_articles.create_index([("status", 1), ("category", 1)])
        await db.help_article_versions.create_index([("article_id", 1), ("version", 1)])
        await db.help_feedback.create_index([("article_id", 1), ("ts", 1)])
        await db.help_searches.create_index("ts")
        await db.help_searches.create_index("results_count")
    except Exception as exc:  # pragma: no cover
        logger.warning("help_* index create skipped: %s", exc)


# ---------------------------------------------------------------------------
# AI grounding retrieval (sanctioned knowledge source for Phase 3A.3).
# Returns ONLY approved/published help articles — never drafts, internal notes
# or private customer data. Kept module-level so support AI can import it.
# ---------------------------------------------------------------------------
async def retrieve_help_knowledge(query: str, limit: int = 5) -> List[dict]:
    q = (query or "").strip()
    base = {"status": {"$in": list(GROUNDING_STATUSES)}}
    scored: List[tuple] = []
    terms = [t for t in re.split(r"[^a-z0-9]+", q.lower()) if len(t) > 2]
    async for a in db.help_articles.find(base, {
        "_id": 0, "slug": 1, "title": 1, "summary": 1, "body_md": 1,
        "category": 1, "tags": 1, "status": 1, "updated_at": 1,
    }):
        hay = f"{a.get('title','')} {a.get('summary','')} {' '.join(a.get('tags') or [])} {a.get('body_md','')}".lower()
        title_hay = f"{a.get('title','')} {a.get('summary','')}".lower()
        score = 0
        for t in terms:
            if t in title_hay:
                score += 3
            elif t in hay:
                score += 1
        if not terms:
            score = 1  # no query -> return most-recent approved content
        if score > 0:
            scored.append((score, a))
    scored.sort(key=lambda x: (x[0], x[1].get("updated_at") or ""), reverse=True)
    out = []
    for _, a in scored[:limit]:
        body = (a.get("body_md") or "").strip()
        out.append({
            "slug": a.get("slug"),
            "title": a.get("title"),
            "summary": a.get("summary"),
            "category": a.get("category"),
            "status": a.get("status"),
            "url": f"/help/a/{a.get('slug')}",
            "excerpt": body[:1200],
        })
    return out


async def help_centre_metrics() -> dict:
    """Compact metrics for the Founder Command Centre. Honest empty states."""
    now = datetime.now(timezone.utc)
    d30 = (now - timedelta(days=30)).isoformat()
    stale_before = (now - timedelta(days=STALE_DAYS)).isoformat()

    published = await db.help_articles.count_documents({"status": "published"})
    drafts = await db.help_articles.count_documents({"status": "draft"})
    in_review = await db.help_articles.count_documents({"status": "in_review"})
    approved_unpub = await db.help_articles.count_documents({"status": "approved"})
    pending_approval = drafts + in_review  # awaiting a reviewer/approver
    outdated = await db.help_articles.count_documents(
        {"$or": [{"is_outdated": True},
                 {"status": "published", "last_reviewed_at": {"$lt": stale_before}}]})

    searches_30d = await db.help_searches.count_documents({"ts": {"$gte": d30}})
    unanswered_30d = await db.help_searches.count_documents(
        {"ts": {"$gte": d30}, "results_count": 0})

    helpful = await db.help_feedback.count_documents({"ts": {"$gte": d30}, "helpful": True})
    not_helpful = await db.help_feedback.count_documents({"ts": {"$gte": d30}, "helpful": False})
    total_fb = helpful + not_helpful
    helpful_pct = round(100 * helpful / total_fb, 1) if total_fb else None

    popular = []
    async for a in db.help_articles.find(
        {"status": "published"}, {"_id": 0, "slug": 1, "title": 1, "view_count": 1}
    ).sort("view_count", -1).limit(5):
        if a.get("view_count"):
            popular.append({"slug": a["slug"], "title": a["title"], "views": a.get("view_count", 0)})

    # Top unanswered searches (knowledge gaps) in the window.
    gaps: Dict[str, int] = {}
    async for s in db.help_searches.find(
        {"ts": {"$gte": d30}, "results_count": 0}, {"_id": 0, "query_norm": 1}
    ).limit(2000):
        k = s.get("query_norm")
        if k:
            gaps[k] = gaps.get(k, 0) + 1
    top_gaps = [{"query": k, "count": v} for k, v in
                sorted(gaps.items(), key=lambda kv: kv[1], reverse=True)[:8]]

    last_updated = None
    latest = await db.help_articles.find_one({}, {"_id": 0, "updated_at": 1}, sort=[("updated_at", -1)])
    if latest:
        last_updated = latest.get("updated_at")

    return {
        "published_articles": published,
        "pending_approval": pending_approval,
        "approved_unpublished": approved_unpub,
        "outdated_articles": outdated,
        "searches_30d": searches_30d,
        "unanswered_searches_30d": unanswered_30d,
        "feedback_helpful_pct_30d": helpful_pct,
        "feedback_not_helpful_30d": not_helpful,
        "popular_articles": popular,
        "knowledge_gaps": top_gaps,
        "last_updated": last_updated,
        "has_data": bool(published or drafts or in_review or approved_unpub),
    }


# ---------------------------------------------------------------------------
# Pydantic bodies
# ---------------------------------------------------------------------------
class HelpArticleCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    summary: str = Field(min_length=10, max_length=400)
    body_md: str = Field(min_length=20, max_length=50000)
    category: str = Field(min_length=2, max_length=60)
    slug: Optional[str] = Field(default=None, max_length=80)
    tags: Optional[List[str]] = None
    meta_title: Optional[str] = Field(default=None, max_length=200)
    meta_description: Optional[str] = Field(default=None, max_length=400)
    tool_keys: Optional[List[str]] = None
    related_slugs: Optional[List[str]] = None


class HelpArticlePatch(BaseModel):
    title: Optional[str] = Field(default=None, min_length=3, max_length=200)
    summary: Optional[str] = Field(default=None, min_length=10, max_length=400)
    body_md: Optional[str] = Field(default=None, min_length=20, max_length=50000)
    category: Optional[str] = Field(default=None, min_length=2, max_length=60)
    tags: Optional[List[str]] = None
    meta_title: Optional[str] = Field(default=None, max_length=200)
    meta_description: Optional[str] = Field(default=None, max_length=400)
    tool_keys: Optional[List[str]] = None
    related_slugs: Optional[List[str]] = None


class ReviewBody(BaseModel):
    is_outdated: Optional[bool] = None


class FeedbackBody(BaseModel):
    helpful: bool
    comment: Optional[str] = Field(default=None, max_length=1000)


# ===========================================================================
# Router
# ===========================================================================
def build_help_centre_router():
    from admin_auth import get_current_admin, audit_log  # lazy (no circular dep)
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(ensure_indexes())
    except Exception as exc:  # pragma: no cover
        logger.warning("help_centre init skipped: %s", exc)

    r = APIRouter(tags=["help-centre"])

    async def _snapshot(a: dict, actor: dict, note: str) -> None:
        await db.help_article_versions.insert_one({
            "id": uuid.uuid4().hex,
            "article_id": a["id"],
            "slug": a.get("slug"),
            "version": a.get("version", 1),
            "title": a.get("title"),
            "summary": a.get("summary"),
            "body_md": a.get("body_md"),
            "category": a.get("category"),
            "status": a.get("status"),
            "note": note,
            "snapshot_at": _now(),
            "snapshot_by": actor.get("id"),
            "snapshot_by_email": actor.get("email"),
        })

    async def _get_or_404(article_id: str) -> dict:
        a = await db.help_articles.find_one({"id": article_id}, {"_id": 0})
        if not a:
            raise HTTPException(404, "Help article not found")
        return a

    # =====================================================================
    # ADMIN — knowledge management
    # =====================================================================
    @r.get("/admin/help/categories")
    async def admin_categories(_: dict = Depends(get_current_admin)):
        return {"categories": [{"slug": k, "label": v} for k, v in CATEGORIES.items()],
                "statuses": list(STATUSES)}

    @r.get("/admin/help/articles")
    async def admin_list(
        status: Optional[str] = Query(None),
        category: Optional[str] = Query(None),
        q: Optional[str] = Query(None, max_length=200),
        outdated: Optional[bool] = Query(None),
        page: int = Query(1, ge=1),
        page_size: int = Query(50, ge=1, le=200),
        _: dict = Depends(get_current_admin),
    ):
        filt: Dict[str, Any] = {}
        if status:
            filt["status"] = status
        if category:
            filt["category"] = category
        if outdated is True:
            filt["is_outdated"] = True
        if q:
            safe = re.escape(q.strip())
            filt["$or"] = [{"title": {"$regex": safe, "$options": "i"}},
                           {"slug": {"$regex": safe, "$options": "i"}},
                           {"summary": {"$regex": safe, "$options": "i"}},
                           {"tags": {"$regex": safe, "$options": "i"}}]
        total = await db.help_articles.count_documents(filt)
        rows = []
        cur = (db.help_articles.find(filt, {"_id": 0, "body_md": 0})
               .sort("updated_at", -1).skip((page - 1) * page_size).limit(page_size))
        async for a in cur:
            a["category_label"] = CATEGORIES.get(a.get("category"), a.get("category"))
            rows.append(a)
        # status counts for header chips
        counts: Dict[str, int] = {}
        for s in STATUSES:
            counts[s] = await db.help_articles.count_documents({"status": s})
        return {"rows": rows, "total": total, "page": page, "page_size": page_size,
                "status_counts": counts}

    @r.get("/admin/help/reporting")
    async def admin_reporting(_: dict = Depends(get_current_admin)):
        metrics = await help_centre_metrics()
        # Recent feedback-with-comments and recent unanswered searches for context.
        recent_comments = []
        async for f in db.help_feedback.find(
            {"comment": {"$ne": None}}, {"_id": 0, "file_b64": 0}
        ).sort("ts", -1).limit(10):
            recent_comments.append(f)
        recent_unanswered = []
        async for s in db.help_searches.find(
            {"results_count": 0}, {"_id": 0, "query": 1, "ts": 1}
        ).sort("ts", -1).limit(15):
            recent_unanswered.append(s)
        return {"metrics": metrics, "recent_comments": recent_comments,
                "recent_unanswered": recent_unanswered}

    @r.get("/admin/help/knowledge-search")
    async def admin_knowledge_search(q: str = Query(..., max_length=200),
                                     limit: int = Query(5, ge=1, le=20),
                                     _: dict = Depends(get_current_admin)):
        """Preview exactly what the Phase 3A.3 AI drafter would be grounded on."""
        return {"query": q, "results": await retrieve_help_knowledge(q, limit),
                "note": "Only approved/published articles are returned. Drafts are never grounding material."}

    @r.get("/admin/help/feedback")
    async def admin_feedback(
        helpful: Optional[bool] = Query(None),
        with_comment: bool = Query(False),
        page: int = Query(1, ge=1),
        page_size: int = Query(50, ge=1, le=200),
        _: dict = Depends(get_current_admin),
    ):
        filt: Dict[str, Any] = {}
        if helpful is not None:
            filt["helpful"] = helpful
        if with_comment:
            filt["comment"] = {"$ne": None}
        total = await db.help_feedback.count_documents(filt)
        rows = []
        cur = (db.help_feedback.find(filt, {"_id": 0})
               .sort("ts", -1).skip((page - 1) * page_size).limit(page_size))
        async for f in cur:
            rows.append(f)
        return {"rows": rows, "total": total, "page": page, "page_size": page_size}

    @r.get("/admin/help/articles/{article_id}")
    async def admin_get(article_id: str, _: dict = Depends(get_current_admin)):
        a = await _get_or_404(article_id)
        a["category_label"] = CATEGORIES.get(a.get("category"), a.get("category"))
        versions = []
        async for v in db.help_article_versions.find(
            {"article_id": article_id}, {"_id": 0, "body_md": 0}
        ).sort("version", -1).limit(50):
            versions.append(v)
        fb_helpful = await db.help_feedback.count_documents({"article_id": article_id, "helpful": True})
        fb_not = await db.help_feedback.count_documents({"article_id": article_id, "helpful": False})
        comments = []
        async for f in db.help_feedback.find(
            {"article_id": article_id, "comment": {"$ne": None}}, {"_id": 0}
        ).sort("ts", -1).limit(30):
            comments.append(f)
        return {"article": a, "versions": versions,
                "feedback": {"helpful": fb_helpful, "not_helpful": fb_not, "comments": comments}}

    @r.post("/admin/help/articles")
    async def admin_create(body: HelpArticleCreate, admin: dict = Depends(get_current_admin)):
        if body.category not in CATEGORIES:
            raise HTTPException(400, f"category must be one of {list(CATEGORIES)}")
        slug = (body.slug or _slugify(body.title)).strip().lower()
        if not _SLUG_RE.match(slug):
            raise HTTPException(400, "Invalid slug (lowercase a-z, 0-9, hyphens; 2-80 chars)")
        if await db.help_articles.find_one({"slug": slug}, {"_id": 1}):
            raise HTTPException(409, f"A help article with slug '{slug}' already exists")
        doc = {
            "id": uuid.uuid4().hex,
            "slug": slug,
            "title": body.title.strip(),
            "summary": body.summary.strip(),
            "body_md": body.body_md,
            "category": body.category,
            "tags": body.tags or [],
            "meta_title": body.meta_title,
            "meta_description": body.meta_description,
            "tool_keys": body.tool_keys or [],
            "related_slugs": body.related_slugs or [],
            "status": "draft",
            "version": 1,
            "is_outdated": False,
            "last_reviewed_at": None,
            "helpful_count": 0,
            "not_helpful_count": 0,
            "view_count": 0,
            "approved_by": None,
            "approved_at": None,
            "published_at": None,
            "created_at": _now(),
            "created_by": admin.get("id"),
            "updated_at": _now(),
            "updated_by": admin.get("id"),
        }
        await db.help_articles.insert_one(doc)
        await _snapshot(doc, admin, "created")
        await audit_log(admin["id"], "help_article_created", target_id=slug,
                        detail={"title": body.title})
        doc.pop("_id", None)
        return {"ok": True, "article": doc}

    @r.put("/admin/help/articles/{article_id}")
    async def admin_update(article_id: str, body: HelpArticlePatch,
                           admin: dict = Depends(get_current_admin)):
        a = await _get_or_404(article_id)
        payload = body.model_dump(exclude_unset=True)
        if "category" in payload and payload["category"] not in CATEGORIES:
            raise HTTPException(400, f"category must be one of {list(CATEGORIES)}")
        content_keys = {"title", "summary", "body_md", "category", "tags",
                        "meta_title", "meta_description", "related_slugs", "tool_keys"}
        changed_content = any(k in payload and payload[k] != a.get(k) for k in content_keys)
        update = {k: (v.strip() if isinstance(v, str) else v) for k, v in payload.items()}
        if changed_content:
            # Snapshot the PRE-edit state, then bump the version.
            await _snapshot(a, admin, "pre-edit snapshot")
            update["version"] = a.get("version", 1) + 1
        update["updated_at"] = _now()
        update["updated_by"] = admin.get("id")
        await db.help_articles.update_one({"id": article_id}, {"$set": update})
        await audit_log(admin["id"], "help_article_updated", target_id=a.get("slug"),
                        detail={"version": update.get("version", a.get("version"))})
        return {"ok": True, "version": update.get("version", a.get("version"))}

    async def _transition(article_id: str, admin: dict, new_status: str,
                          require_from: Optional[tuple] = None,
                          extra: Optional[dict] = None, audit: str = "") -> dict:
        a = await _get_or_404(article_id)
        if require_from and a.get("status") not in require_from:
            raise HTTPException(409, f"Cannot move from '{a.get('status')}' — allowed from {list(require_from)}")
        upd = {"status": new_status, "updated_at": _now(), "updated_by": admin.get("id")}
        if extra:
            upd.update(extra)
        await db.help_articles.update_one({"id": article_id}, {"$set": upd})
        await _snapshot({**a, **upd}, admin, audit or new_status)
        await audit_log(admin["id"], f"help_article_{audit or new_status}", target_id=a.get("slug"))
        return {"ok": True, "status": new_status}

    @r.post("/admin/help/articles/{article_id}/submit")
    async def admin_submit(article_id: str, admin: dict = Depends(get_current_admin)):
        return await _transition(article_id, admin, "in_review",
                                 require_from=("draft", "approved"), audit="submitted_for_review")

    @r.post("/admin/help/articles/{article_id}/approve")
    async def admin_approve(article_id: str, admin: dict = Depends(get_current_admin)):
        return await _transition(article_id, admin, "approved",
                                 require_from=("in_review", "draft"),
                                 extra={"approved_by": admin.get("id"), "approved_at": _now()},
                                 audit="approved")

    @r.post("/admin/help/articles/{article_id}/publish")
    async def admin_publish(article_id: str, admin: dict = Depends(get_current_admin)):
        a = await _get_or_404(article_id)
        extra = {"published_at": a.get("published_at") or _now(),
                 "is_outdated": False, "last_reviewed_at": _now()}
        return await _transition(article_id, admin, "published",
                                 require_from=("approved", "published"),
                                 extra=extra, audit="published")

    @r.post("/admin/help/articles/{article_id}/unpublish")
    async def admin_unpublish(article_id: str, admin: dict = Depends(get_current_admin)):
        return await _transition(article_id, admin, "approved",
                                 require_from=("published",), audit="unpublished")

    @r.post("/admin/help/articles/{article_id}/archive")
    async def admin_archive(article_id: str, admin: dict = Depends(get_current_admin)):
        return await _transition(article_id, admin, "archived", audit="archived")

    @r.post("/admin/help/articles/{article_id}/reopen")
    async def admin_reopen(article_id: str, admin: dict = Depends(get_current_admin)):
        return await _transition(article_id, admin, "draft",
                                 require_from=("archived", "in_review", "approved"), audit="reopened")

    @r.post("/admin/help/articles/{article_id}/review")
    async def admin_review(article_id: str, body: ReviewBody,
                           admin: dict = Depends(get_current_admin)):
        a = await _get_or_404(article_id)
        upd = {"last_reviewed_at": _now(), "updated_at": _now(), "updated_by": admin.get("id")}
        if body.is_outdated is not None:
            upd["is_outdated"] = body.is_outdated
        else:
            upd["is_outdated"] = False
        await db.help_articles.update_one({"id": article_id}, {"$set": upd})
        await audit_log(admin["id"], "help_article_reviewed", target_id=a.get("slug"),
                        detail={"is_outdated": upd["is_outdated"]})
        return {"ok": True}

    @r.delete("/admin/help/articles/{article_id}")
    async def admin_delete(article_id: str, admin: dict = Depends(get_current_admin)):
        a = await _get_or_404(article_id)
        await db.help_articles.delete_one({"id": article_id})
        await audit_log(admin["id"], "help_article_deleted", target_id=a.get("slug"))
        return {"ok": True}

    # =====================================================================
    # PUBLIC — /help surface (published content only)
    # =====================================================================
    @r.get("/public/help/categories")
    async def public_categories():
        out = []
        for slug, label in CATEGORIES.items():
            count = await db.help_articles.count_documents({"status": "published", "category": slug})
            out.append({"slug": slug, "label": label, "count": count})
        return {"categories": out}

    @r.get("/public/help/articles")
    async def public_list(
        request: Request,
        q: Optional[str] = Query(None, max_length=200),
        category: Optional[str] = Query(None),
        tool_key: Optional[str] = Query(None, max_length=60),
        limit: int = Query(50, ge=1, le=100),
    ):
        filt: Dict[str, Any] = {"status": "published"}
        if category:
            filt["category"] = category
        if tool_key:
            filt["tool_keys"] = tool_key
        if q:
            safe = re.escape(q.strip())
            filt["$or"] = [{"title": {"$regex": safe, "$options": "i"}},
                           {"summary": {"$regex": safe, "$options": "i"}},
                           {"tags": {"$regex": safe, "$options": "i"}},
                           {"body_md": {"$regex": safe, "$options": "i"}}]
        rows = []
        cur = (db.help_articles.find(filt, {"_id": 0})
               .sort([("view_count", -1), ("published_at", -1)]).limit(limit))
        async for a in cur:
            rows.append(_card(a))
        # Privacy-safe search logging (hashed IP only; used for knowledge-gap reporting).
        if q:
            try:
                await db.help_searches.insert_one({
                    "id": uuid.uuid4().hex,
                    "query": q.strip()[:200],
                    "query_norm": q.strip().lower()[:200],
                    "results_count": len(rows),
                    "category": category,
                    "ip_hash": _ip_hash(_client_ip(request)),
                    "ts": _now(),
                })
            except Exception as exc:  # pragma: no cover
                logger.warning("help search log skipped: %s", exc)
        return {"articles": rows, "total": len(rows), "query": q}

    @r.get("/public/help/articles/{slug}")
    async def public_get(slug: str):
        a = await db.help_articles.find_one({"slug": slug, "status": "published"}, {"_id": 0})
        if not a:
            raise HTTPException(404, "Help article not found")
        await db.help_articles.update_one({"slug": slug}, {"$inc": {"view_count": 1}})
        # Related: explicit related_slugs first, then same-category siblings.
        related: List[dict] = []
        seen = {slug}
        for rslug in (a.get("related_slugs") or []):
            if rslug in seen:
                continue
            rel = await db.help_articles.find_one(
                {"slug": rslug, "status": "published"},
                {"_id": 0, "slug": 1, "title": 1, "summary": 1, "category": 1})
            if rel:
                related.append(_card(rel))
                seen.add(rslug)
        if len(related) < 4:
            async for rel in db.help_articles.find(
                {"status": "published", "category": a.get("category"), "slug": {"$nin": list(seen)}},
                {"_id": 0, "slug": 1, "title": 1, "summary": 1, "category": 1, "view_count": 1}
            ).sort("view_count", -1).limit(4 - len(related)):
                related.append(_card(rel))
                seen.add(rel["slug"])
        out = _public_article(a)
        out["related"] = related
        return out

    @r.post("/public/help/articles/{slug}/feedback")
    async def public_feedback(slug: str, body: FeedbackBody, request: Request):
        ip = _client_ip(request)
        # Abuse protection: cap feedback per IP.
        _rate_limit(f"help_fb:{_ip_hash(ip)}", max_n=20, window_sec=3600,
                    msg="Thanks! You've sent a lot of feedback recently — please try again later.")
        a = await db.help_articles.find_one({"slug": slug, "status": "published"},
                                            {"_id": 0, "id": 1})
        if not a:
            raise HTTPException(404, "Help article not found")
        comment = (body.comment or "").strip() or None
        if comment:
            # Light spam guard: reject comments stuffed with links.
            if len(re.findall(r"https?://", comment, re.I)) >= 3:
                raise HTTPException(400, "Your comment looks like spam. Please remove the links and try again.")
        await db.help_feedback.insert_one({
            "id": uuid.uuid4().hex,
            "article_id": a["id"],
            "article_slug": slug,
            "helpful": bool(body.helpful),
            "comment": comment,
            "ip_hash": _ip_hash(ip),
            "ts": _now(),
        })
        field = "helpful_count" if body.helpful else "not_helpful_count"
        await db.help_articles.update_one({"id": a["id"]}, {"$inc": {field: 1}})
        return {"ok": True, "message": "Thanks for the feedback."}

    return r
