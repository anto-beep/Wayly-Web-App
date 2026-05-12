"""Phase E2 — Content CMS (Articles · Glossary · Templates · Changelog).

Admin-side CRUD + lightweight public read endpoints. Falls back gracefully
to the static `resources.js` registry on the frontend when the DB is empty.
"""
from __future__ import annotations
import os
import re
import secrets
from datetime import datetime, timezone
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from admin_auth import get_current_admin, audit_log

cms_admin = APIRouter(prefix="/admin/cms", tags=["admin-cms"])
cms_public = APIRouter(prefix="/public/cms", tags=["public-cms"])

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _strip(d: dict) -> dict:
    if not d:
        return d
    d.pop("_id", None)
    return d


_SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,80}[a-z0-9])?$")


def _slugify(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")[:80]


# ============================================================================
# ARTICLES
# ============================================================================

class CitationModel(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    url: str = Field(min_length=8, max_length=500)
    publisher: Optional[str] = Field(None, max_length=120)


class ArticleBody(BaseModel):
    slug: Optional[str] = Field(None, max_length=80)
    title: str = Field(min_length=3, max_length=200)
    excerpt: str = Field(min_length=10, max_length=400)
    body_md: str = Field(min_length=20, max_length=50000)
    tags: Optional[List[str]] = None
    published: bool = False
    # YMYL E-E-A-T fields
    author_id: Optional[str] = None
    reviewer_id: Optional[str] = None
    reviewed_at: Optional[str] = None  # ISO date
    citations: Optional[List[CitationModel]] = None
    is_draft_needs_review: Optional[bool] = False  # show "DRAFT — NEEDS REVIEW" banner


@cms_admin.get("/articles")
async def list_articles(
    q: Optional[str] = None,
    published: Optional[bool] = None,
    page: int = 1, page_size: int = 50,
    _: dict = Depends(get_current_admin),
):
    filt: dict = {}
    if published is not None:
        filt["published"] = published
    if q:
        safe = re.escape(q)
        filt["$or"] = [{"title": {"$regex": safe, "$options": "i"}},
                       {"slug": {"$regex": safe, "$options": "i"}},
                       {"tags": {"$regex": safe, "$options": "i"}}]
    total = await db.cms_articles.count_documents(filt)
    rows = []
    cur = (db.cms_articles.find(filt, {"_id": 0, "body_md": 0})
           .sort("updated_at", -1)
           .skip((page - 1) * page_size).limit(page_size))
    async for r in cur:
        rows.append(r)
    return {"rows": rows, "total": total, "page": page, "page_size": page_size}


@cms_admin.get("/articles/{slug}")
async def get_article(slug: str, _: dict = Depends(get_current_admin)):
    a = await db.cms_articles.find_one({"slug": slug}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Article not found")
    return a


@cms_admin.post("/articles")
async def create_article(body: ArticleBody, admin: dict = Depends(get_current_admin)):
    slug = (body.slug or _slugify(body.title)).strip().lower()
    if not _SLUG_RE.match(slug):
        raise HTTPException(400, "Invalid slug (lowercase a-z, 0-9, hyphens; 2-80 chars)")
    if await db.cms_articles.find_one({"slug": slug}, {"_id": 0, "slug": 1}):
        raise HTTPException(409, f"Article with slug '{slug}' already exists")
    rec = {
        "slug": slug,
        "title": body.title,
        "excerpt": body.excerpt,
        "body_md": body.body_md,
        "tags": body.tags or [],
        "published": bool(body.published),
        "published_at": _now() if body.published else None,
        "author_id": body.author_id,
        "reviewer_id": body.reviewer_id,
        "reviewed_at": body.reviewed_at,
        "citations": [c.model_dump() for c in (body.citations or [])],
        "is_draft_needs_review": bool(body.is_draft_needs_review),
        "created_at": _now(),
        "created_by": admin["id"],
        "updated_at": _now(),
        "updated_by": admin["id"],
    }
    await db.cms_articles.insert_one(rec)
    await audit_log(admin["id"], "cms_article_created", target_id=slug,
                    detail={"title": body.title, "published": body.published})
    return {"ok": True, "article": _strip(rec)}


@cms_admin.put("/articles/{slug}")
async def update_article(slug: str, body: ArticleBody, admin: dict = Depends(get_current_admin)):
    existing = await db.cms_articles.find_one({"slug": slug}, {"_id": 0, "published": 1})
    if not existing:
        raise HTTPException(404, "Article not found")
    update = {
        "title": body.title,
        "excerpt": body.excerpt,
        "body_md": body.body_md,
        "tags": body.tags or [],
        "published": bool(body.published),
        "author_id": body.author_id,
        "reviewer_id": body.reviewer_id,
        "reviewed_at": body.reviewed_at,
        "citations": [c.model_dump() for c in (body.citations or [])],
        "is_draft_needs_review": bool(body.is_draft_needs_review),
        "updated_at": _now(),
        "updated_by": admin["id"],
    }
    if body.published and not existing.get("published"):
        update["published_at"] = _now()
    elif not body.published:
        update["published_at"] = None
    await db.cms_articles.update_one({"slug": slug}, {"$set": update})
    await audit_log(admin["id"], "cms_article_updated", target_id=slug,
                    detail={"published": body.published})
    return {"ok": True}


@cms_admin.delete("/articles/{slug}")
async def delete_article(slug: str, admin: dict = Depends(get_current_admin)):
    res = await db.cms_articles.delete_one({"slug": slug})
    if res.deleted_count == 0:
        raise HTTPException(404, "Article not found")
    await audit_log(admin["id"], "cms_article_deleted", target_id=slug)
    return {"ok": True}


@cms_public.get("/articles")
async def public_list_articles(limit: int = 50):
    rows = []
    cur = db.cms_articles.find({"published": True},
                                {"_id": 0, "body_md": 0, "created_by": 0, "updated_by": 0}
                                ).sort("published_at", -1).limit(min(limit, 100))
    async for r in cur:
        rows.append(r)
    return {"articles": rows}


@cms_public.get("/articles/{slug}")
async def public_get_article(slug: str):
    a = await db.cms_articles.find_one({"slug": slug, "published": True},
                                       {"_id": 0, "created_by": 0, "updated_by": 0})
    if not a:
        raise HTTPException(404, "Article not found")
    # Enrich author + reviewer for E-E-A-T signals
    if a.get("author_id"):
        author = await db.cms_reviewers.find_one({"id": a["author_id"]}, {"_id": 0})
        if author:
            a["author"] = author
    if a.get("reviewer_id"):
        rev = await db.cms_reviewers.find_one({"id": a["reviewer_id"]}, {"_id": 0})
        if rev:
            a["reviewer"] = rev
    return a


# ============================================================================
# CMS REVIEWERS — named expert reviewers/authors for YMYL E-E-A-T
# ============================================================================

class ReviewerBody(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    role: str = Field(min_length=2, max_length=200)  # e.g. "Aged Care Financial Adviser"
    qualifications: Optional[str] = Field(None, max_length=400)  # "BCom, ASIC AR No. 12345"
    bio: Optional[str] = Field(None, max_length=2000)
    photo_url: Optional[str] = Field(None, max_length=500)
    sameAs: Optional[List[str]] = None  # LinkedIn, professional registry URLs
    is_author: bool = True   # can be assigned as author
    is_reviewer: bool = True  # can be assigned as reviewer


@cms_admin.get("/reviewers")
async def list_reviewers(_: dict = Depends(get_current_admin)):
    rows = []
    async for r in db.cms_reviewers.find({}, {"_id": 0}).sort("name", 1):
        rows.append(r)
    return {"reviewers": rows, "total": len(rows)}


@cms_admin.post("/reviewers")
async def create_reviewer(body: ReviewerBody, admin: dict = Depends(get_current_admin)):
    rec = {
        "id": secrets.token_urlsafe(8),
        **body.model_dump(),
        "created_at": _now(),
        "created_by": admin["id"],
        "updated_at": _now(),
    }
    await db.cms_reviewers.insert_one(rec)
    await audit_log(admin["id"], "cms_reviewer_created", target_id=rec["id"],
                    detail={"name": body.name})
    return {"ok": True, "reviewer": _strip(rec)}


@cms_admin.put("/reviewers/{reviewer_id}")
async def update_reviewer(reviewer_id: str, body: ReviewerBody, admin: dict = Depends(get_current_admin)):
    res = await db.cms_reviewers.update_one(
        {"id": reviewer_id},
        {"$set": {**body.model_dump(), "updated_at": _now(), "updated_by": admin["id"]}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Reviewer not found")
    await audit_log(admin["id"], "cms_reviewer_updated", target_id=reviewer_id)
    return {"ok": True}


@cms_admin.delete("/reviewers/{reviewer_id}")
async def delete_reviewer(reviewer_id: str, admin: dict = Depends(get_current_admin)):
    # Don't allow deleting a reviewer that's currently referenced
    count = await db.cms_articles.count_documents(
        {"$or": [{"author_id": reviewer_id}, {"reviewer_id": reviewer_id}]}
    )
    if count > 0:
        raise HTTPException(409, f"Cannot delete — {count} article(s) reference this reviewer")
    res = await db.cms_reviewers.delete_one({"id": reviewer_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Reviewer not found")
    await audit_log(admin["id"], "cms_reviewer_deleted", target_id=reviewer_id)
    return {"ok": True}


# Public list — used to render an Authors page if you want one
@cms_public.get("/reviewers")
async def public_reviewers():
    rows = []
    async for r in db.cms_reviewers.find({}, {"_id": 0, "created_by": 0, "updated_by": 0}).sort("name", 1):
        rows.append(r)
    return {"reviewers": rows}


# ============================================================================
# GLOSSARY
# ============================================================================

class GlossaryBody(BaseModel):
    term: str = Field(min_length=1, max_length=120)
    definition: str = Field(min_length=3, max_length=2000)
    published: bool = True


class BulkImportBody(BaseModel):
    items: List[GlossaryBody]


@cms_admin.get("/glossary")
async def list_glossary(
    q: Optional[str] = None,
    _: dict = Depends(get_current_admin),
):
    filt: dict = {}
    if q:
        safe = re.escape(q)
        filt["$or"] = [{"term": {"$regex": safe, "$options": "i"}},
                       {"definition": {"$regex": safe, "$options": "i"}}]
    rows = []
    async for r in db.cms_glossary.find(filt, {"_id": 0}).sort("term", 1).limit(1000):
        rows.append(r)
    return {"rows": rows, "total": len(rows)}


@cms_admin.post("/glossary")
async def create_glossary(body: GlossaryBody, admin: dict = Depends(get_current_admin)):
    term = body.term.strip()
    existing = await db.cms_glossary.find_one(
        {"term": {"$regex": f"^{re.escape(term)}$", "$options": "i"}},
        {"_id": 0, "term": 1},
    )
    if existing:
        raise HTTPException(409, f"Term '{existing['term']}' already exists")
    rec = {
        "id": secrets.token_urlsafe(6),
        "term": term,
        "definition": body.definition.strip(),
        "published": bool(body.published),
        "created_at": _now(),
        "created_by": admin["id"],
        "updated_at": _now(),
    }
    await db.cms_glossary.insert_one(rec)
    await audit_log(admin["id"], "cms_glossary_added", target_id=rec["id"],
                    detail={"term": term})
    return {"ok": True, "entry": _strip(rec)}


@cms_admin.put("/glossary/{entry_id}")
async def update_glossary(entry_id: str, body: GlossaryBody, admin: dict = Depends(get_current_admin)):
    res = await db.cms_glossary.update_one(
        {"id": entry_id},
        {"$set": {
            "term": body.term.strip(),
            "definition": body.definition.strip(),
            "published": bool(body.published),
            "updated_at": _now(),
            "updated_by": admin["id"],
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Glossary entry not found")
    await audit_log(admin["id"], "cms_glossary_updated", target_id=entry_id)
    return {"ok": True}


@cms_admin.delete("/glossary/{entry_id}")
async def delete_glossary(entry_id: str, admin: dict = Depends(get_current_admin)):
    res = await db.cms_glossary.delete_one({"id": entry_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Glossary entry not found")
    await audit_log(admin["id"], "cms_glossary_deleted", target_id=entry_id)
    return {"ok": True}


@cms_admin.post("/glossary/bulk-import")
async def bulk_import_glossary(body: BulkImportBody, admin: dict = Depends(get_current_admin)):
    """Add many glossary terms at once. Idempotent: skips existing terms (case-insensitive)."""
    if len(body.items) > 500:
        raise HTTPException(400, "Maximum 500 items per import")
    added, skipped = 0, 0
    for item in body.items:
        term = item.term.strip()
        existing = await db.cms_glossary.find_one(
            {"term": {"$regex": f"^{re.escape(term)}$", "$options": "i"}}, {"_id": 0, "id": 1},
        )
        if existing:
            skipped += 1
            continue
        await db.cms_glossary.insert_one({
            "id": secrets.token_urlsafe(6),
            "term": term,
            "definition": item.definition.strip(),
            "published": bool(item.published),
            "created_at": _now(),
            "created_by": admin["id"],
            "updated_at": _now(),
            "import_source": "bulk",
        })
        added += 1
    await audit_log(admin["id"], "cms_glossary_bulk_import",
                    detail={"added": added, "skipped": skipped})
    return {"ok": True, "added": added, "skipped": skipped}


@cms_public.get("/glossary")
async def public_glossary():
    rows = []
    async for r in db.cms_glossary.find(
        {"published": True}, {"_id": 0, "created_by": 0, "updated_by": 0}
    ).sort("term", 1).limit(2000):
        rows.append(r)
    return {"terms": rows}


# ============================================================================
# TEMPLATES LIBRARY
# ============================================================================

class TemplateBody(BaseModel):
    slug: Optional[str] = Field(None, max_length=80)
    title: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=10, max_length=600)
    cta_label: str = Field(min_length=2, max_length=80, default="Use this template")
    cta_href: str = Field(min_length=1, max_length=500)
    body_md: Optional[str] = Field(None, max_length=20000)
    published: bool = True


@cms_admin.get("/templates")
async def list_templates(_: dict = Depends(get_current_admin)):
    rows = []
    async for r in db.cms_templates.find({}, {"_id": 0}).sort("updated_at", -1):
        rows.append(r)
    return {"rows": rows, "total": len(rows)}


@cms_admin.post("/templates")
async def create_template(body: TemplateBody, admin: dict = Depends(get_current_admin)):
    slug = (body.slug or _slugify(body.title)).strip().lower()
    if not _SLUG_RE.match(slug):
        raise HTTPException(400, "Invalid slug")
    if await db.cms_templates.find_one({"slug": slug}, {"_id": 0, "slug": 1}):
        raise HTTPException(409, f"Template with slug '{slug}' already exists")
    rec = {
        "slug": slug,
        "title": body.title,
        "description": body.description,
        "cta_label": body.cta_label,
        "cta_href": body.cta_href,
        "body_md": body.body_md or "",
        "published": bool(body.published),
        "created_at": _now(),
        "created_by": admin["id"],
        "updated_at": _now(),
    }
    await db.cms_templates.insert_one(rec)
    await audit_log(admin["id"], "cms_template_created", target_id=slug)
    return {"ok": True, "template": _strip(rec)}


@cms_admin.put("/templates/{slug}")
async def update_template(slug: str, body: TemplateBody, admin: dict = Depends(get_current_admin)):
    res = await db.cms_templates.update_one(
        {"slug": slug},
        {"$set": {
            "title": body.title, "description": body.description,
            "cta_label": body.cta_label, "cta_href": body.cta_href,
            "body_md": body.body_md or "", "published": bool(body.published),
            "updated_at": _now(), "updated_by": admin["id"],
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Template not found")
    await audit_log(admin["id"], "cms_template_updated", target_id=slug)
    return {"ok": True}


@cms_admin.delete("/templates/{slug}")
async def delete_template(slug: str, admin: dict = Depends(get_current_admin)):
    res = await db.cms_templates.delete_one({"slug": slug})
    if res.deleted_count == 0:
        raise HTTPException(404, "Template not found")
    await audit_log(admin["id"], "cms_template_deleted", target_id=slug)
    return {"ok": True}


@cms_public.get("/templates")
async def public_templates():
    rows = []
    async for r in db.cms_templates.find(
        {"published": True}, {"_id": 0, "created_by": 0, "updated_by": 0}
    ).sort("title", 1):
        rows.append(r)
    return {"templates": rows}


# ============================================================================
# CHANGELOG
# ============================================================================

class ChangelogBody(BaseModel):
    version: str = Field(min_length=1, max_length=40)
    title: str = Field(min_length=3, max_length=200)
    body_md: str = Field(min_length=10, max_length=20000)
    tags: Optional[List[str]] = None  # e.g. ["feature", "fix", "improvement"]
    published: bool = True
    release_date: Optional[str] = None  # ISO yyyy-mm-dd; defaults to today


@cms_admin.get("/changelog")
async def list_changelog(
    page: int = 1, page_size: int = 50,
    _: dict = Depends(get_current_admin),
):
    total = await db.cms_changelog.count_documents({})
    rows = []
    cur = (db.cms_changelog.find({}, {"_id": 0})
           .sort("release_date", -1)
           .skip((page - 1) * page_size).limit(page_size))
    async for r in cur:
        rows.append(r)
    return {"rows": rows, "total": total, "page": page, "page_size": page_size}


@cms_admin.post("/changelog")
async def create_changelog(body: ChangelogBody, admin: dict = Depends(get_current_admin)):
    if await db.cms_changelog.find_one({"version": body.version}, {"_id": 0, "version": 1}):
        raise HTTPException(409, f"Version '{body.version}' already exists")
    rec = {
        "id": secrets.token_urlsafe(6),
        "version": body.version,
        "title": body.title,
        "body_md": body.body_md,
        "tags": body.tags or [],
        "release_date": body.release_date or datetime.now(timezone.utc).date().isoformat(),
        "published": bool(body.published),
        "created_at": _now(),
        "created_by": admin["id"],
        "updated_at": _now(),
    }
    await db.cms_changelog.insert_one(rec)
    await audit_log(admin["id"], "cms_changelog_created", target_id=body.version)
    return {"ok": True, "entry": _strip(rec)}


@cms_admin.put("/changelog/{entry_id}")
async def update_changelog(entry_id: str, body: ChangelogBody, admin: dict = Depends(get_current_admin)):
    res = await db.cms_changelog.update_one(
        {"id": entry_id},
        {"$set": {
            "version": body.version, "title": body.title, "body_md": body.body_md,
            "tags": body.tags or [], "release_date": body.release_date,
            "published": bool(body.published),
            "updated_at": _now(), "updated_by": admin["id"],
        }},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Changelog entry not found")
    await audit_log(admin["id"], "cms_changelog_updated", target_id=entry_id)
    return {"ok": True}


@cms_admin.delete("/changelog/{entry_id}")
async def delete_changelog(entry_id: str, admin: dict = Depends(get_current_admin)):
    res = await db.cms_changelog.delete_one({"id": entry_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Changelog entry not found")
    await audit_log(admin["id"], "cms_changelog_deleted", target_id=entry_id)
    return {"ok": True}


@cms_public.get("/changelog")
async def public_changelog(limit: int = 50):
    rows = []
    async for r in db.cms_changelog.find(
        {"published": True}, {"_id": 0, "created_by": 0, "updated_by": 0}
    ).sort("release_date", -1).limit(min(limit, 100)):
        rows.append(r)
    return {"entries": rows}
