"""Public SEO routes, sitemap.xml + robots.txt.

Mounted both at /api/public/* (for testability) and at the project root
(/sitemap.xml, /robots.txt) for crawler-friendly URLs.
"""
from __future__ import annotations
import os
from datetime import datetime, timezone
from fastapi import APIRouter, Response
from motor.motor_asyncio import AsyncIOMotorClient

seo_public = APIRouter(prefix="/public/seo", tags=["public-seo"])

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]

SITE_DOMAIN = os.environ.get("PUBLIC_APP_URL", "https://wayly.com.au").rstrip("/")

# Static pages (path, priority, changefreq)
STATIC_PAGES = [
    ("/",                          "1.0", "weekly"),
    ("/features",                  "0.8", "monthly"),
    ("/pricing",                   "0.9", "monthly"),
    ("/trust",                     "0.6", "monthly"),
    ("/demo",                      "0.7", "monthly"),
    ("/contact",                   "0.5", "yearly"),
    ("/for-advisors",              "0.6", "monthly"),
    ("/for-gps",                   "0.6", "monthly"),
    ("/resources",                 "0.8", "weekly"),
    ("/resources/articles",        "0.8", "daily"),
    ("/resources/glossary",        "0.7", "weekly"),
    ("/resources/templates",       "0.6", "monthly"),
    ("/ai-tools",                  "0.9", "monthly"),
    ("/ai-tools/statement-decoder",      "0.9", "monthly"),
    ("/ai-tools/budget-calculator",      "0.9", "monthly"),
    ("/ai-tools/provider-price-checker", "0.9", "monthly"),
    ("/ai-tools/classification-self-check", "0.9", "monthly"),
    ("/ai-tools/reassessment-letter",    "0.8", "monthly"),
    ("/ai-tools/contribution-estimator", "0.9", "monthly"),
    ("/ai-tools/care-plan-reviewer",     "0.8", "monthly"),
    ("/ai-tools/family-coordinator",     "0.7", "monthly"),
    ("/legal/terms",               "0.3", "yearly"),
    ("/legal/privacy",             "0.3", "yearly"),
    ("/legal/ai-disclaimer",       "0.3", "yearly"),
    ("/legal/ai-intent",           "0.3", "yearly"),
    ("/legal/accessibility",       "0.3", "yearly"),
    ("/legal/cookies",             "0.3", "yearly"),
    # New Invoice Checker tool page (INV-1 v1.2)
    ("/ai-tools/invoice-checker",                                              "0.9", "monthly"),
    # Home Care Package transition pillar (HCP-BRIDGE-1)
    ("/home-care-packages",                                   "0.9", "monthly"),
    # NOTE: every /resources/articles/* and /articles/* URL is AUTO-DERIVED
    # from the frontend structured-article data (see _article_sitemap_entries),
    # so the sitemap stays in lock-step with published articles and can never
    # silently drift. Do NOT hand-list article URLs here.
    # Oct 2026 · Templates library (20 individual template pages)
    ("/resources/templates/support-at-home-statement-query-letter", "0.7", "monthly"),
    ("/resources/templates/rate-query-letter", "0.7", "monthly"),
    ("/resources/templates/aged-care-invoice-dispute-letter", "0.7", "monthly"),
    ("/resources/templates/aged-care-overcharge-refund-request", "0.7", "monthly"),
    ("/resources/templates/care-management-fee-query", "0.7", "monthly"),
    ("/resources/templates/personal-care-contribution-check-letter", "0.7", "monthly"),
    ("/resources/templates/request-service-records-visit-logs", "0.7", "monthly"),
    ("/resources/templates/aged-care-financial-hardship-application", "0.7", "monthly"),
    ("/resources/templates/services-australia-contribution-query", "0.7", "monthly"),
    ("/resources/templates/final-statement-and-unspent-funds-request", "0.7", "monthly"),
    ("/resources/templates/my-aged-care-reassessment-request", "0.7", "monthly"),
    ("/resources/templates/gp-letter-request-for-aged-care-reassessment", "0.7", "monthly"),
    ("/resources/templates/care-plan-review-questions", "0.7", "monthly"),
    ("/resources/templates/aged-care-complaint-letter-to-provider", "0.7", "monthly"),
    ("/resources/templates/aged-care-quality-and-safety-commission-complaint", "0.7", "monthly"),
    ("/resources/templates/opan-aged-care-advocate-call-sheet", "0.7", "monthly"),
    ("/resources/templates/switching-support-at-home-providers-checklist", "0.7", "monthly"),
    ("/resources/templates/registered-supporter-checklist", "0.7", "monthly"),
    ("/resources/templates/aged-care-family-meeting-agenda", "0.7", "monthly"),
    ("/resources/templates/advance-care-planning-conversation-guide", "0.7", "monthly"),
    # Phase 4 Batch 1, Support at Home levels hub + 8 level pages (Feb 2026)
    ("/support-at-home-levels", "0.9", "monthly"),
    ("/support-at-home-levels/level-1", "0.7", "monthly"),
    ("/support-at-home-levels/level-2", "0.7", "monthly"),
    ("/support-at-home-levels/level-3", "0.7", "monthly"),
    ("/support-at-home-levels/level-4", "0.7", "monthly"),
    ("/support-at-home-levels/level-5", "0.7", "monthly"),
    ("/support-at-home-levels/level-6", "0.7", "monthly"),
    ("/support-at-home-levels/level-7", "0.7", "monthly"),
    ("/support-at-home-levels/level-8", "0.7", "monthly"),
    # Phase 4 Batch B, service explainers (Jun 2026)
    ("/services", "0.9", "monthly"),
    ("/services/cleaning", "0.8", "monthly"),
    ("/services/gardening", "0.8", "monthly"),
    ("/services/transport", "0.8", "monthly"),
    ("/services/meals", "0.8", "monthly"),
    ("/services/personal-care", "0.9", "monthly"),
    ("/services/nursing", "0.8", "monthly"),
    ("/services/respite", "0.8", "monthly"),
    ("/services/social-support", "0.8", "monthly"),
    # Phase 4 Batch C, policy explainers
    ("/policy", "0.9", "monthly"),
    ("/policy/personal-care-free-1-october-2026", "0.9", "monthly"),
    ("/policy/price-caps-status", "0.8", "monthly"),
    ("/policy/no-worse-off-guarantee", "0.8", "monthly"),
    # Phase 4 Batches D + E, caregiver guides
    ("/guides", "0.9", "monthly"),
    ("/guides/my-aged-care-assessment-delay", "0.7", "monthly"),
    ("/guides/parent-refuses-help", "0.7", "monthly"),
    ("/guides/understanding-statement-line-items", "0.7", "monthly"),
    ("/guides/switching-providers", "0.7", "monthly"),
    ("/guides/talking-to-a-parent-about-aged-care", "0.7", "monthly"),
    ("/guides/sibling-disagreements-about-mum", "0.7", "monthly"),
    ("/guides/caregiver-guilt", "0.7", "monthly"),
    ("/guides/caring-from-far-away", "0.7", "monthly"),
    # Phase 4 Batches F + G + /about
    ("/faq", "0.9", "weekly"),
    ("/ask-wayly", "0.9", "monthly"),
    ("/about", "0.8", "yearly"),
    # CHSP content cluster (pillar + 3 deep-dives)
    ("/chsp", "0.9", "monthly"),
    ("/chsp/caregiver-guide", "0.8", "monthly"),
    ("/chsp/vs-support-at-home", "0.8", "monthly"),
    ("/chsp/extension-2029", "0.9", "monthly"),
]


# Content-level dateModified for static (non-CMS) SEO pages whose body has been
# updated. Only add a slug here when its visible content actually changed
# (Bing/Google treat lastmod as a recrawl signal). Keyed by sitemap path.
# ISO 8601 (YYYY-MM-DD); machine formats are exempt from DD/MM/YYYY.
STATIC_PAGE_MODIFIED = {
    # PC-RECLASS-1 personal-care change went live 01/10/2026 — refreshed copy.
    "/articles/support-at-home-personal-care-free-october-2026": "2026-10-02",
    "/resources/articles/support-at-home-personal-care-free-1-october-2026": "2026-10-02",
    "/policy/personal-care-free-1-october-2026": "2026-10-02",
    "/services/personal-care": "2026-10-02",
    # Oct 2026 · new pillar articles (A1 + A6) shipped with live INDEX-1 figures.
    "/resources/articles/support-at-home-explained": "2026-10-02",
    "/resources/articles/support-at-home-no-worse-off": "2026-10-02",
    # Oct 2026 · complaints + AT-HM articles.
    "/resources/articles/how-to-complain-about-aged-care-commission": "2026-10-22",
    "/resources/articles/at-hm-scheme-assistive-technology-home-modifications": "2026-10-22",
    "/chsp/extension-2029": "2026-08-23",
}


import json as _json
import pathlib as _pathlib
import re as _re

_FRONTEND_DATA = _pathlib.Path(__file__).resolve().parent.parent / "frontend" / "src" / "data"
_STRUCTURED_ARTICLE_FILES = ("seoArticles2026.js", "seoToolArticles.js")
_ARTICLE_SNAPSHOT = _pathlib.Path(__file__).resolve().parent / "seo_articles_snapshot.json"


def _is_article_path(path: str) -> bool:
    return path.startswith("/resources/articles/") or path.startswith("/articles/")


def _parse_structured_articles():
    """Parse the frontend structured-article data for sitemap entries.

    Returns a list of {"path", "lastmod"} dicts, or None when the frontend
    source is not available (e.g. a production backend image without the
    frontend tree), in which case the caller falls back to the committed
    snapshot. This keeps the sitemap in lock-step with published articles so
    it can never silently drift again.
    """
    files = [_FRONTEND_DATA / f for f in _STRUCTURED_ARTICLE_FILES]
    if not all(p.exists() for p in files):
        return None
    seen = {}
    for p in files:
        txt = p.read_text(encoding="utf-8")
        for chunk in _re.split(r'slug:\s*["\']', txt)[1:]:
            m = _re.match(r'([a-z0-9][a-z0-9-]*)', chunk)
            if not m:
                continue
            slug = m.group(1)
            window = chunk[:2500]
            cp = _re.search(r'canonical_path:\s*["\']([^"\']+)["\']', window)
            up = _re.search(r'updated_at:\s*["\']([0-9-]+)["\']', window)
            pub = _re.search(r'published_at:\s*["\']([0-9-]+)["\']', window)
            path = cp.group(1) if cp else f"/resources/articles/{slug}"
            lastmod = up.group(1) if up else (pub.group(1) if pub else None)
            seen[path] = {"path": path, "lastmod": lastmod}
    return sorted(seen.values(), key=lambda e: e["path"])


def _article_sitemap_entries():
    """Article sitemap entries: live-parsed from the frontend source in
    dev/preview (always fresh), refreshed into a committed snapshot that is
    used when the source is absent (production)."""
    live = _parse_structured_articles()
    if live is not None:
        try:
            payload = _json.dumps(live, indent=2)
            if not _ARTICLE_SNAPSHOT.exists() or _ARTICLE_SNAPSHOT.read_text() != payload:
                _ARTICLE_SNAPSHOT.write_text(payload)
        except Exception:
            pass
        return live
    if _ARTICLE_SNAPSHOT.exists():
        try:
            return _json.loads(_ARTICLE_SNAPSHOT.read_text())
        except Exception:
            return []
    return []


async def _build_sitemap_xml() -> str:
    today = datetime.now(timezone.utc).date().isoformat()
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']

    for path, priority, freq in STATIC_PAGES:
        if _is_article_path(path):
            continue
        lastmod = STATIC_PAGE_MODIFIED.get(path, today)
        out.append(
            f"  <url><loc>{SITE_DOMAIN}{path}</loc>"
            f"<lastmod>{lastmod}</lastmod>"
            f"<changefreq>{freq}</changefreq>"
            f"<priority>{priority}</priority></url>"
        )

    # Auto-derived article URLs (single source of truth = the structured
    # article data; never hand-maintained here).
    for art in _article_sitemap_entries():
        lastmod = art.get("lastmod") or STATIC_PAGE_MODIFIED.get(art["path"]) or today
        out.append(
            f"  <url><loc>{SITE_DOMAIN}{art['path']}</loc>"
            f"<lastmod>{lastmod}</lastmod>"
            f"<changefreq>monthly</changefreq><priority>0.8</priority></url>"
        )

    # CMS articles
    async for a in db.cms_articles.find({"published": True}, {"_id": 0, "slug": 1, "updated_at": 1, "published_at": 1}):
        slug = a.get("slug")
        if not slug:
            continue
        lastmod = (a.get("updated_at") or a.get("published_at") or today)[:10]
        out.append(
            f"  <url><loc>{SITE_DOMAIN}/resources/articles/{slug}</loc>"
            f"<lastmod>{lastmod}</lastmod>"
            f"<changefreq>monthly</changefreq><priority>0.7</priority></url>"
        )

    # CMS glossary terms, each has its own URL for SEO
    async for g in db.cms_glossary.find(
        {"published": True}, {"_id": 0, "slug": 1, "updated_at": 1},
    ):
        slug = g.get("slug")
        if not slug:
            continue
        lastmod = (g.get("updated_at") or today)[:10]
        out.append(
            f"  <url><loc>{SITE_DOMAIN}/resources/glossary/{slug}</loc>"
            f"<lastmod>{lastmod}</lastmod>"
            f"<changefreq>monthly</changefreq><priority>0.6</priority></url>"
        )

    # Changelog entries (single page deep-linked by anchor, represent the
    # changelog page itself with most recent release as lastmod)
    latest_release = None
    async for c in db.cms_changelog.find({"published": True}, {"_id": 0, "release_date": 1}).sort("release_date", -1).limit(1):
        latest_release = c.get("release_date")
    if latest_release:
        out.append(
            f"  <url><loc>{SITE_DOMAIN}/resources/changelog</loc>"
            f"<lastmod>{latest_release[:10]}</lastmod>"
            f"<changefreq>weekly</changefreq><priority>0.5</priority></url>"
        )

    out.append("</urlset>")
    return "\n".join(out)


async def sitemap_entries() -> list[dict]:
    """Structured view of the sitemap for SEO-2 change detection.

    Returns one dict per URL: {url, datePublished, dateModified}.
    Static marketing pages have no content-level date, so they carry
    dateModified=None and are excluded from the change-scoped IndexNow
    diff (they are covered by the periodic full seed ping instead).
    Article / glossary / changelog entries carry their real content dates,
    so a no-op deploy produces zero changed URLs.
    """
    entries: list[dict] = []

    for path, _priority, _freq in STATIC_PAGES:
        if _is_article_path(path):
            continue
        entries.append({"url": f"{SITE_DOMAIN}{path}", "datePublished": None,
                        "dateModified": STATIC_PAGE_MODIFIED.get(path)})

    # Auto-derived article URLs carry their real content dates, so IndexNow
    # change-detection picks up new / updated articles automatically.
    for art in _article_sitemap_entries():
        entries.append({
            "url": f"{SITE_DOMAIN}{art['path']}",
            "datePublished": art.get("lastmod"),
            "dateModified": art.get("lastmod"),
        })

    async for a in db.cms_articles.find({"published": True}, {"_id": 0, "slug": 1, "updated_at": 1, "published_at": 1}):
        slug = a.get("slug")
        if not slug:
            continue
        published = (a.get("published_at") or None)
        modified = (a.get("updated_at") or a.get("published_at") or None)
        entries.append({
            "url": f"{SITE_DOMAIN}/resources/articles/{slug}",
            "datePublished": published[:10] if published else None,
            "dateModified": modified[:10] if modified else None,
        })

    async for g in db.cms_glossary.find({"published": True}, {"_id": 0, "slug": 1, "updated_at": 1}):
        slug = g.get("slug")
        if not slug:
            continue
        modified = (g.get("updated_at") or None)
        entries.append({
            "url": f"{SITE_DOMAIN}/resources/glossary/{slug}",
            "datePublished": None,
            "dateModified": modified[:10] if modified else None,
        })

    latest_release = None
    async for c in db.cms_changelog.find({"published": True}, {"_id": 0, "release_date": 1}).sort("release_date", -1).limit(1):
        latest_release = c.get("release_date")
    if latest_release:
        entries.append({
            "url": f"{SITE_DOMAIN}/resources/changelog",
            "datePublished": None,
            "dateModified": latest_release[:10],
        })

    return entries



@seo_public.get("/sitemap.xml")
async def sitemap_xml():
    xml = await _build_sitemap_xml()
    return Response(content=xml, media_type="application/xml")


_ROBOTS = """User-agent: *
Allow: /
Disallow: /admin/
Disallow: /admin
Disallow: /app/
Disallow: /app
Disallow: /api/
Disallow: /onboarding
Disallow: /settings
Disallow: /billing/success
Disallow: /reset
Disallow: /forgot
Disallow: /invite
# Stub-redirect routes, keep UX redirect but stop GSC's
# "Page with redirect" error from showing up.
Disallow: /resources/guides
Disallow: /resources/webinars
Disallow: /resources/blog

# AI/LLM crawlers, allow content discovery but disallow login/app
User-agent: GPTBot
Allow: /
Disallow: /admin/
Disallow: /app/

User-agent: anthropic-ai
Allow: /
Disallow: /admin/
Disallow: /app/

Sitemap: {DOMAIN}/sitemap.xml
"""


@seo_public.get("/robots.txt")
async def robots_txt():
    body = _ROBOTS.replace("{DOMAIN}", SITE_DOMAIN)
    return Response(content=body, media_type="text/plain")




@seo_public.get("/indexnow-key.txt")
async def indexnow_key_file():
    """
    Hosts the IndexNow verification key at a real backend route so the
    receiving engines (Bing, Yandex, Naver, Seznam, Yep) can fetch the key
    even though the React SPA's catch-all would otherwise rewrite any
    .txt request to index.html.

    The key value lives in indexnow_service.INDEXNOW_KEY (single source of
    truth). When submitting URLs we pass this endpoint as `keyLocation`
    in the payload, so the engines know to look here.
    """
    from indexnow_service import INDEXNOW_KEY
    # Return exactly the key, no trailing whitespace, the receiving
    # engine does a byte-for-byte equality check against the submitted key.
    return Response(content=INDEXNOW_KEY, media_type="text/plain")
