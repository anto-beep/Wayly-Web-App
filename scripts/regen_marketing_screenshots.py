"""Regenerate the 5 Landing marketing screenshots against the live preview.
Run once after nav changes to keep the marketing PNGs in sync with the app.
"""
import asyncio
from pathlib import Path
from playwright.async_api import async_playwright

BASE = "https://mobile-exact-parity.preview.emergentagent.com"
OUT = Path("/app/frontend/public/marketing")
OUT.mkdir(parents=True, exist_ok=True)

SHOTS_PUBLIC = [
    ("03-statement-decoder-tool.png", f"{BASE}/ai-tools/statement-decoder"),
]
SHOTS_AUTH = [
    ("02-caregiver-dashboard.png", f"{BASE}/app"),
    ("07-budget-alerts.png", f"{BASE}/app/budget-alerts"),
    ("09-family-wall.png", f"{BASE}/app/family"),
    ("11-reports-hub.png", f"{BASE}/app/reports"),
]

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()

        # ---------- 1) Public shots, fresh context ----------
        ctx = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            service_workers="block",
        )
        page = await ctx.new_page()
        for fn, url in SHOTS_PUBLIC:
            try:
                await page.goto(url, wait_until="load", timeout=60000)
            except Exception:
                await page.goto(url, wait_until="commit", timeout=30000)
            await page.wait_for_timeout(3500)
            await page.screenshot(path=str(OUT / fn), type="png")
            print(f"saved {fn}")
        await ctx.close()

        # ---------- 2) Auth flow, brand-new context ----------
        ctx = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            service_workers="block",
        )
        page = await ctx.new_page()
        try:
            await page.goto(f"{BASE}/login", wait_until="load", timeout=60000)
        except Exception:
            await page.goto(f"{BASE}/login", wait_until="commit", timeout=30000)
        await page.wait_for_timeout(2500)
        await page.fill("input[type=email]", "cathy@example.com")
        await page.fill("input[type=password]", "testpass123")
        await page.click("[data-testid=login-submit], button[type=submit]")
        try:
            await page.wait_for_url("**/app**", timeout=20000)
        except Exception:
            pass
        await page.wait_for_timeout(5000)
        print(f"logged in, at {page.url}")

        for fn, url in SHOTS_AUTH:
            try:
                try:
                    await page.goto(url, wait_until="load", timeout=45000)
                except Exception:
                    await page.goto(url, wait_until="commit", timeout=30000)
                await page.wait_for_timeout(4500)
                await page.screenshot(path=str(OUT / fn), type="png")
                print(f"saved {fn}")
            except Exception as inner:
                print(f"skipped {fn}: {inner}")

        await browser.close()

asyncio.run(main())
