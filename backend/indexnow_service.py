"""
IndexNow protocol implementation for Wayly.

IndexNow lets us push URL updates to Bing, Yandex, Naver, Seznam and Yep
within seconds, bypassing the normal crawl wait. We use Bing's central
endpoint (`api.indexnow.org`) which fans the submission out to all
participating engines, so a single POST notifies everyone.

Spec: https://www.indexnow.org/documentation
Bing: https://www.bing.com/indexnow/getstarted

How verification works
----------------------
1. We host a plain-text key file at  https://wayly.com.au/<KEY>.txt
   containing only the key (no whitespace, no other content).
2. We pass the same key in every IndexNow submission body.
3. The receiving engine fetches the key file and confirms the match.

The key lives in this module (and in /app/frontend/public/<KEY>.txt) so
both the file and the submission stay in sync.
"""
from __future__ import annotations

import logging
from typing import Iterable, Sequence

import httpx

log = logging.getLogger(__name__)

INDEXNOW_KEY = "9a677bbfffc44a13f71ab79eb5bc971bb94a5ff82c6d813795aff11ac8fa2ef7"
HOST = "wayly.com.au"
# IndexNow's validator does same-directory matching against keyLocation, so
# any URL submitted must live under the same path prefix as keyLocation.
# We therefore host the key file at the SITE ROOT (served as a static asset
# from /app/frontend/public/<KEY>.txt) so every URL on wayly.com.au qualifies.
# A backend mirror at /api/public/seo/indexnow-key.txt is kept as a fallback
# in case the static handler ever stops serving .txt files at the root.
KEY_LOCATION = f"https://{HOST}/{INDEXNOW_KEY}.txt"
ENDPOINT = "https://api.indexnow.org/IndexNow"
SUBMIT_TIMEOUT_S = 12
MAX_URLS_PER_SUBMIT = 10_000  # protocol limit


def _normalise(urls: Iterable[str]) -> list[str]:
    """Ensure every URL is absolute under https://wayly.com.au."""
    out: list[str] = []
    seen: set[str] = set()
    for raw in urls:
        if not raw:
            continue
        u = raw.strip()
        if u.startswith("/"):
            u = f"https://{HOST}{u}"
        elif u.startswith("http://") or u.startswith("https://"):
            pass
        else:
            u = f"https://{HOST}/{u.lstrip('/')}"
        # Only submit canonical host URLs. Anything else is dropped silently.
        if not u.startswith(f"https://{HOST}/") and u != f"https://{HOST}":
            log.info("indexnow: skipping non-canonical URL %s", u)
            continue
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


async def submit_urls(urls: Sequence[str]) -> dict:
    """
    Submit one or more URLs to IndexNow.

    Returns a small status dict so callers (admin endpoint, cron) can log
    the result without parsing httpx exceptions:
        {
          "submitted": int,
          "status": int,           # HTTP status (0 if request failed)
          "body": str,             # first 400 chars of the response body
          "error": str | None,
        }
    """
    normalised = _normalise(urls)
    if not normalised:
        return {"submitted": 0, "status": 0, "body": "", "error": "no_urls"}

    if len(normalised) > MAX_URLS_PER_SUBMIT:
        normalised = normalised[:MAX_URLS_PER_SUBMIT]

    payload = {
        "host": HOST,
        "key": INDEXNOW_KEY,
        "keyLocation": KEY_LOCATION,
        "urlList": normalised,
    }

    try:
        async with httpx.AsyncClient(timeout=SUBMIT_TIMEOUT_S) as client:
            resp = await client.post(
                ENDPOINT,
                json=payload,
                headers={
                    "Content-Type": "application/json; charset=utf-8",
                    "User-Agent": "Wayly-IndexNow/1.0 (+https://wayly.com.au)",
                },
            )
    except Exception as e:
        log.exception("indexnow: submit failed (%s URLs)", len(normalised))
        return {"submitted": len(normalised), "status": 0, "body": "", "error": str(e)[:200]}

    body = (resp.text or "")[:400]
    log.info("indexnow: submitted=%d status=%d body=%s", len(normalised), resp.status_code, body[:120])
    return {
        "submitted": len(normalised),
        "status": resp.status_code,
        "body": body,
        "error": None if 200 <= resp.status_code < 300 else f"http_{resp.status_code}",
    }


async def all_sitemap_urls() -> list[str]:
    """Return every URL in the Wayly sitemap by parsing the same XML the
    public /sitemap.xml route emits. This guarantees IndexNow submissions
    stay in lock-step with what search engines see in the sitemap ,
    STATIC_PAGES, CMS articles, glossary terms, changelog, etc.
    """
    import re
    from seo_routes import _build_sitemap_xml

    xml = await _build_sitemap_xml()
    return re.findall(r"<loc>([^<]+)</loc>", xml)
