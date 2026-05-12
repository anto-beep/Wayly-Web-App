"""Public SEO routes — sitemap.xml + robots.txt.

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
]


async def _build_sitemap_xml() -> str:
    today = datetime.now(timezone.utc).date().isoformat()
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']

    for path, priority, freq in STATIC_PAGES:
        out.append(
            f"  <url><loc>{SITE_DOMAIN}{path}</loc>"
            f"<lastmod>{today}</lastmod>"
            f"<changefreq>{freq}</changefreq>"
            f"<priority>{priority}</priority></url>"
        )

    # CMS articles
    async for a in db.cms_articles.find({"published": True}, {"_id": 0, "slug": 1, "updated_at": 1, "published_at": 1}):
        slug = a.get("slug")
        if not slug: continue
        lastmod = (a.get("updated_at") or a.get("published_at") or today)[:10]
        out.append(
            f"  <url><loc>{SITE_DOMAIN}/resources/articles/{slug}</loc>"
            f"<lastmod>{lastmod}</lastmod>"
            f"<changefreq>monthly</changefreq><priority>0.7</priority></url>"
        )

    # Changelog entries (single page deep-linked by anchor — represent the
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

# AI/LLM crawlers — allow content discovery but disallow login/app
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
