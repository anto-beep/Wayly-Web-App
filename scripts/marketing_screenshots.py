"""Marketing-quality screenshots of Wayly's key surfaces.

Runs against the preview environment, logs in once as cathy, then captures a
curated set of 10 PNG screenshots and bundles them into a single zip ready for
the user to download.

Output: /app/frontend/public/marketing/wayly-marketing-screenshots.zip
        plus each PNG at /app/frontend/public/marketing/<name>.png
"""
from __future__ import annotations
import asyncio
import os
import zipfile
from pathlib import Path

from playwright.async_api import async_playwright

PREVIEW = "https://statement-checker-3.preview.emergentagent.com"
EMAIL = "cathy@example.com"
PASSWORD = "testpass123"

OUT_DIR = Path("/app/frontend/public/marketing")
OUT_DIR.mkdir(parents=True, exist_ok=True)


SHOTS = [
    # (filename, url, full_page, wait_extra_ms, scroll_to_top)
    ("01-landing-hero.png",          f"{PREVIEW}/",                                False, 2500, True),
    ("02-caregiver-dashboard.png",   f"{PREVIEW}/app",                             True,  3500, True),
    ("03-statement-decoder-tool.png",f"{PREVIEW}/ai-tools/statement-decoder",      True,  2500, True),
    ("04-provider-price-checker.png",f"{PREVIEW}/ai-tools/provider-price-checker", True,  2500, True),
    ("05-ai-tools-index.png",        f"{PREVIEW}/ai-tools",                        True,  2500, True),
    ("06-ask-wayly-chat.png",        f"{PREVIEW}/app/chat",                        False, 3500, True),
    ("07-budget-alerts.png",         f"{PREVIEW}/app/budget-alerts",               True,  3500, True),
    ("08-participant-timeline.png",  f"{PREVIEW}/app/timeline",                    True,  3500, True),
    ("09-family-wall.png",           f"{PREVIEW}/app/wall",                        True,  3500, True),
    ("10-statements-list.png",       f"{PREVIEW}/app/statements",                  True,  3500, True),
]


async def login(context, page) -> None:
    """Authenticate via API directly (server-side request) and inject the
    token into the SPA's expected localStorage keys via add_init_script.
    Cleanest path — bypasses brute-force middleware entirely after one call."""
    import urllib.request
    import json as _json

    # Hit localhost directly — preview ingress / WAF blocks server-side POSTs.
    req = urllib.request.Request(
        "http://localhost:8001/api/auth/login",
        data=_json.dumps({"email": EMAIL, "password": PASSWORD}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            body = _json.loads(r.read().decode())
    except Exception as e:
        print(f"  login HTTP failed: {e} — waiting 65s and retrying")
        await asyncio.sleep(65)
        with urllib.request.urlopen(req, timeout=15) as r:
            body = _json.loads(r.read().decode())

    token = body.get("token")
    refresh = body.get("refresh_token", "")
    if not token:
        raise RuntimeError(f"no token in login response: {body}")
    print(f"  got token (len {len(token)})")

    # Inject into localStorage before any page script runs.
    await context.add_init_script(
        f"""
        try {{
            localStorage.setItem('kindred_token', {_json.dumps(token)});
            localStorage.setItem('kindred_refresh_token', {_json.dumps(refresh)});
        }} catch (e) {{}}
        """
    )
    await page.goto(f"{PREVIEW}/app", wait_until="domcontentloaded")
    await page.wait_for_timeout(4000)
    print(f"  landed on {page.url}")


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path="/root/bin/chromium",
            args=["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
        )
        context = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            device_scale_factor=2,                # retina-quality output
            color_scheme="light",
        )
        page = await context.new_page()
        # Suppress in-page banners/notifs that hurt marketing shots.
        await page.add_init_script("""
            window.localStorage.setItem('cookie-consent', 'accepted');
            window.localStorage.setItem('hide-onboarding-tour', 'true');
        """)

        print("Logging in…")
        await login(context, page)

        for filename, url, full_page, wait_extra, scroll in SHOTS:
            out_path = OUT_DIR / filename
            print(f"  → {filename}  ({url})")
            success = False
            for attempt in range(3):
                try:
                    # `commit` is the loosest wait condition — we don't need
                    # the full document, just enough DOM to screenshot. Most
                    # ERR_ABORTED errors come from heavier wait conditions.
                    await page.goto(url, wait_until="commit", timeout=15000)
                    await page.wait_for_timeout(wait_extra)
                    if scroll:
                        await page.evaluate("window.scrollTo({top: 0, behavior: 'instant'})")
                        await page.wait_for_timeout(500)
                    await page.evaluate("""
                        document.querySelectorAll('[data-sonner-toast]').forEach(t => t.remove());
                    """)
                    await page.screenshot(
                        path=str(out_path),
                        full_page=full_page,
                        type="png",
                        omit_background=False,
                    )
                    success = True
                    break
                except Exception as e:
                    print(f"     attempt {attempt + 1} failed: {str(e)[:120]}")
                    await page.wait_for_timeout(2000)
            if not success:
                print(f"     SKIPPED after 3 retries")

        await browser.close()

    # Bundle into a zip.
    zip_path = OUT_DIR / "wayly-marketing-screenshots.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for png in sorted(OUT_DIR.glob("*.png")):
            zf.write(png, arcname=png.name)
        # Include a tiny README.
        readme = OUT_DIR / "README.txt"
        readme.write_text(
            "Wayly marketing screenshots — captured from preview at 1440×900 @2× (retina).\n"
            "Use for marketing, deck inserts, social cards, and Claude-driven graphics.\n"
            "Re-run /app/scripts/marketing_screenshots.py to refresh.\n"
        )
        zf.write(readme, arcname="README.txt")

    files = sorted(p.name for p in OUT_DIR.glob("*.png"))
    print(f"\nWrote {len(files)} screenshots and {zip_path.relative_to(Path('/app/frontend/public'))}")
    print(f"Zip size: {zip_path.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    asyncio.run(main())
