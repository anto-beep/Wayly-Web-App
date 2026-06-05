"""
Phase 8 — broken-link sweep.

Crawls every URL exposed in /api/public/seo/sitemap.xml, fetches each page,
parses the rendered HTML, collects every internal <a href="/..."> link, then
checks each one's HTTP status. SPA-aware: a 200 page with an empty <div id="root">
is still a 200 (React handles the actual rendering client-side), so this script
only catches true server-side 4xx/5xx and unreachable hosts.

Run:  python /app/scripts/broken_link_sweep.py
"""
from __future__ import annotations
import os
import re
import sys
import urllib.parse
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from xml.etree import ElementTree as ET

BASE = os.environ.get("WAYLY_BASE_URL", "https://aged-care-os.preview.emergentagent.com").rstrip("/")
SITEMAP = f"{BASE}/api/public/seo/sitemap.xml"
TIMEOUT = 15
USER_AGENT = "Mozilla/5.0 (compatible; Wayly-Broken-Link-Sweep/1.0; +https://wayly.com.au)"
SKIP_PREFIXES = ("mailto:", "tel:", "javascript:", "#")

LINK_RE = re.compile(r'<a [^>]*?href="([^"]+)"', re.IGNORECASE)
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": USER_AGENT})


def fetch(url: str) -> tuple[int, str]:
    try:
        r = SESSION.get(url, timeout=TIMEOUT, allow_redirects=True)
        return r.status_code, r.text
    except Exception as e:
        return 0, str(e)[:120]


def status_only(url: str) -> tuple[str, int]:
    try:
        r = SESSION.get(url, timeout=TIMEOUT, allow_redirects=True, stream=True)
        code = r.status_code
        r.close()
        return url, code
    except Exception:
        return url, 0


def load_sitemap_urls() -> list[str]:
    code, body = fetch(SITEMAP)
    if code != 200:
        print(f"[FATAL] sitemap returned HTTP {code}")
        sys.exit(2)
    ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    root = ET.fromstring(body)
    return [el.text.strip() for el in root.findall(".//sm:loc", ns)]


def normalise(href: str, page: str) -> str | None:
    if not href or href.startswith(SKIP_PREFIXES):
        return None
    parsed = urllib.parse.urlparse(href)
    if parsed.scheme in ("http", "https"):
        if parsed.netloc and parsed.netloc not in (urllib.parse.urlparse(BASE).netloc, "wayly.com.au"):
            return None  # External link, skip
        path = parsed.path or "/"
    else:
        path = href.split("?")[0].split("#")[0]
        if not path.startswith("/"):
            path = "/" + path
    return f"{BASE}{path}"


def main() -> int:
    sitemap_urls = load_sitemap_urls()
    print(f"sitemap: {len(sitemap_urls)} URLs")
    # Convert wayly.com.au URLs back to the preview host for testing.
    sitemap_paths = [
        urllib.parse.urlparse(u).path or "/" for u in sitemap_urls
    ]
    pages_to_crawl = [f"{BASE}{p}" for p in sitemap_paths]

    discovered: set[str] = set(pages_to_crawl)
    print("\n=== Pass 1 — checking sitemap URLs ===")
    failed_sitemap: dict[str, int] = {}
    with ThreadPoolExecutor(max_workers=10) as ex:
        for url, code in ex.map(status_only, pages_to_crawl):
            if code != 200:
                failed_sitemap[url] = code

    print(f"sitemap pages OK: {len(pages_to_crawl) - len(failed_sitemap)} / {len(pages_to_crawl)}")
    for u, c in failed_sitemap.items():
        print(f"  [FAIL {c}] {u}")

    print("\n=== Pass 2 — discovering all on-page links ===")
    on_page_links: set[str] = set()
    with ThreadPoolExecutor(max_workers=8) as ex:
        futures = {ex.submit(fetch, page): page for page in pages_to_crawl[:50]}
        for fut in as_completed(futures):
            page = futures[fut]
            code, html = fut.result()
            if code != 200 or not html:
                continue
            for href in LINK_RE.findall(html):
                full = normalise(href, page)
                if full and full not in discovered:
                    on_page_links.add(full)
    print(f"discovered {len(on_page_links)} additional internal URLs")

    print("\n=== Pass 3 — checking discovered URLs ===")
    failed_links: dict[str, int] = {}
    with ThreadPoolExecutor(max_workers=10) as ex:
        for url, code in ex.map(status_only, on_page_links):
            if code != 200:
                failed_links[url] = code

    print(f"discovered URLs OK: {len(on_page_links) - len(failed_links)} / {len(on_page_links)}")
    for u, c in sorted(failed_links.items()):
        print(f"  [FAIL {c}] {u}")

    total_failed = len(failed_sitemap) + len(failed_links)
    print(f"\n=== TOTAL FAILED: {total_failed} ===")
    return 0 if total_failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
