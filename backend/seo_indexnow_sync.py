"""
SEO-2 — change-scoped IndexNow synchronisation.

On each run we build a manifest of every sitemap URL and its content dates,
diff it against the previously stored manifest, and submit ONLY the URLs whose
content changed (or that are new) to IndexNow. A no-op deploy submits nothing.

Guards (per SEO-2 spec):
  - First run (no previous manifest): store the manifest, DO NOT mass-ping.
    Caller must run the manual full seed (`submit all sitemap URLs`) once.
  - datePublished immutability: if a URL's published date changes vs the stored
    manifest, we flag it as a violation and do NOT ping (caller should fail the
    build / surface the error).

Manifest persistence: a single MongoDB document in `seo_manifest` (_id="current").
NOTE: This Mongo doc is an INTERIM stopgap. The spec's target is object storage
(AWS Sydney). Do not treat this collection as long-term canonical storage.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

log = logging.getLogger(__name__)

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]

_MANIFEST_ID = "current"


async def compute_and_ping() -> dict:
    """Diff current sitemap dates against the stored manifest and ping changed URLs.

    Returns a status dict; never raises for expected outcomes (first run,
    no changes, immutability violation) so callers can map them to HTTP codes.
    """
    from seo_routes import sitemap_entries
    from indexnow_service import submit_urls

    entries = await sitemap_entries()
    current = {
        e["url"]: {"datePublished": e.get("datePublished"), "dateModified": e.get("dateModified")}
        for e in entries
    }
    now = datetime.now(timezone.utc).isoformat()

    prev_doc = await db.seo_manifest.find_one({"_id": _MANIFEST_ID})
    prev = prev_doc.get("entries") if prev_doc else None

    if prev is None:
        await db.seo_manifest.replace_one(
            {"_id": _MANIFEST_ID},
            {"_id": _MANIFEST_ID, "entries": current, "updated_at": now, "interim_storage": True},
            upsert=True,
        )
        log.info("seo-indexnow: first run, stored %d URLs, no ping", len(current))
        return {
            "ok": True,
            "first_run": True,
            "stored": len(current),
            "changed": [],
            "hint": "First run: manifest stored. Run the manual full seed (indexnow/all) once to introduce all URLs.",
        }

    # datePublished immutability guard
    violations = []
    for url, v in current.items():
        p = prev.get(url)
        if p and p.get("datePublished") and v.get("datePublished") and p["datePublished"] != v["datePublished"]:
            violations.append({"url": url, "was": p["datePublished"], "now": v["datePublished"]})
    if violations:
        log.error("seo-indexnow: datePublished immutability violation on %d URL(s)", len(violations))
        return {
            "ok": False,
            "error": "datePublished_changed",
            "violations": violations[:50],
            "message": "A published date changed vs the stored manifest. Published dates must never change.",
        }

    # change / new detection (skip entries with no content date, e.g. static pages)
    changed = [
        url for url, v in current.items()
        if v.get("dateModified") is not None
        and (url not in prev or prev[url].get("dateModified") != v.get("dateModified"))
    ]

    result = {"submitted": 0, "status": 0, "body": "", "error": "no_urls"}
    if changed:
        result = await submit_urls(changed)

    await db.seo_manifest.replace_one(
        {"_id": _MANIFEST_ID},
        {"_id": _MANIFEST_ID, "entries": current, "updated_at": now, "interim_storage": True},
        upsert=True,
    )
    log.info("seo-indexnow: changed=%d submitted=%s status=%s", len(changed), result.get("submitted"), result.get("status"))

    return {
        "ok": result.get("error") in (None, "no_urls"),
        "first_run": False,
        "changed": changed,
        "changed_count": len(changed),
        "submitted": result.get("submitted", 0),
        "status": result.get("status", 0),
        "indexnow_error": None if result.get("error") == "no_urls" else result.get("error"),
    }
