import asyncio
import json
import os
import sys

from playwright.async_api import async_playwright

sys.path.insert(0, "/app/test_reports")
import bug_verification_131_playwright as base

OUT_PATH = "/app/test_reports/bug_verification_131_light_supplement_results.json"


async def main():
    results = {"base_url": base.BASE_URL, "steps": [], "console_errors": [], "network_failures": []}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path=os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE", "/root/bin/chromium"))
        context = await browser.new_context(viewport={"width": 1400, "height": 1000})
        page = await context.new_page()
        await base.login(page, results)
        await base.set_theme(page, results, "light")
        await base.test_dashboard_cta(page, results, "light")
        await base.test_voice_check(page, results, "light")
        await base.test_statement_detail(page, results, "light")
        await browser.close()
    results["ok"] = all(s["ok"] for s in results["steps"])
    with open(OUT_PATH, "w") as f:
        json.dump(results, f, indent=2)
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    asyncio.run(main())