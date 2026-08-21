import asyncio
import json
import os
from playwright.async_api import async_playwright

BASE_URL = os.environ.get("BASE_URL", "https://statement-checker-3.preview.emergentagent.com").rstrip("/")
OUT_PATH = "/app/test_reports/bug_verification_131_routing_supplement_results.json"
EMAIL = "cathy@example.com"
PASSWORD = "testpass123"


async def state(page):
    return await page.evaluate("""() => ({
      url: location.href,
      title: document.title,
      h1: Array.from(document.querySelectorAll('h1')).map(e => e.innerText.trim()).join(' | '),
      body: document.body.innerText.slice(0, 300),
      notFound: /Page not found/i.test(document.title) || /This page has gone for a walk/i.test(document.body.innerText)
    })""")


async def main():
    result = {"base_url": BASE_URL, "steps": []}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path=os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE", "/root/bin/chromium"))
        page = await (await browser.new_context(viewport={"width": 1400, "height": 1000})).new_page()
        await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
        await page.locator('[data-testid="login-email-input"]').fill(EMAIL)
        await page.locator('[data-testid="login-password-input"]').fill(PASSWORD)
        await page.locator('[data-testid="login-submit-button"]').click()
        await page.wait_for_url("**/app", timeout=15000)
        result["steps"].append({"name": "login", "ok": True, "state": await state(page)})

        await page.goto(f"{BASE_URL}/app/tools/provider-price-checker/compare", wait_until="domcontentloaded")
        await page.wait_for_selector('[data-testid="ppc3-compare-root"]', timeout=15000)
        back_href = await page.evaluate("""() => {
          const a = Array.from(document.querySelectorAll('a[href]')).find(a => /Back to Provider Price Checker/i.test(a.innerText));
          return a && a.getAttribute('href');
        }""")
        result["steps"].append({"name": "provider compare route and back href", "ok": back_href == "/ai-tools/provider-price-checker", "href": back_href, "state": await state(page)})
        if back_href:
            await page.locator('a', has_text='Back to Provider Price Checker').first.click()
            await page.wait_for_timeout(1000)
            st = await state(page)
            result["steps"].append({"name": "provider compare back click", "ok": st["url"].endswith("/ai-tools/provider-price-checker") and not st["notFound"], "state": st})

        await page.goto(f"{BASE_URL}/app/tools/invoice-checker/list", wait_until="domcontentloaded")
        await page.wait_for_timeout(800)
        st = await state(page)
        result["steps"].append({"name": "direct legacy invoice checker cited URL", "ok": not st["notFound"], "state": st})
        await browser.close()
    result["ok"] = all(step["ok"] for step in result["steps"])
    with open(OUT_PATH, "w") as f:
        json.dump(result, f, indent=2)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    asyncio.run(main())