import asyncio
import json
import os
from pathlib import Path

from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError


BASE_URL = os.environ.get("PREVIEW_URL", "https://proration-preview.preview.emergentagent.com")
OUT = Path("/app/test_reports/tool_cta_bug_verification_iter113_results.json")


AUTH_SLUGS = ["invoice-checker", "statement-decoder", "care-plan-reviewer"]
ANON_SLUGS = ["invoice-checker", "statement-decoder"]


async def inspect_tool_page(page, slug, expect_cta):
    url = f"{BASE_URL}/ai-tools/{slug}"
    await page.goto(url, wait_until="domcontentloaded", timeout=60000)
    await page.wait_for_selector(f"[data-testid='tool-explainer-{slug}']", timeout=45000)
    await page.locator(f"[data-testid='tool-explainer-{slug}']").scroll_into_view_if_needed(timeout=10000)
    await page.wait_for_timeout(250)
    cta_selector = f"[data-testid='tool-cta-{slug}']"
    cta_count = await page.locator("[data-testid^='tool-cta-']").count()
    exact_cta_count = await page.locator(cta_selector).count()
    cta_visible = exact_cta_count > 0 and await page.locator(cta_selector).first.is_visible()
    if expect_cta:
        await page.wait_for_selector(cta_selector, timeout=10000)
    else:
        # Give auth bootstrap/render a chance to settle, then assert absence.
        await page.wait_for_timeout(1000)
        cta_count = await page.locator("[data-testid^='tool-cta-']").count()
        exact_cta_count = await page.locator(cta_selector).count()
        cta_visible = exact_cta_count > 0 and await page.locator(cta_selector).first.is_visible()

    metrics = await page.evaluate(
        """(slug) => {
            const explainer = document.querySelector(`[data-testid='tool-explainer-${slug}']`);
            const cta = document.querySelector(`[data-testid='tool-cta-${slug}']`);
            const footer = document.querySelector('[data-testid="site-footer"]');
            const visibleChildren = explainer ? Array.from(explainer.children).filter((el) => el.tagName !== 'SCRIPT') : [];
            const lastContent = cta || visibleChildren[visibleChildren.length - 1] || explainer;
            const exRect = explainer ? explainer.getBoundingClientRect() : null;
            const lastRect = lastContent ? lastContent.getBoundingClientRect() : null;
            const footerRect = footer ? footer.getBoundingClientRect() : null;
            const styles = explainer ? window.getComputedStyle(explainer) : null;
            return {
                path: window.location.pathname,
                explainerExists: !!explainer,
                explainerClass: explainer ? explainer.className : null,
                paddingBottom: styles ? styles.paddingBottom : null,
                footerExists: !!footer,
                gapLastToFooter: (lastRect && footerRect) ? Math.round(footerRect.top - lastRect.bottom) : null,
                gapExplainerToFooter: (exRect && footerRect) ? Math.round(footerRect.top - exRect.bottom) : null,
                lastBottom: lastRect ? Math.round(lastRect.bottom) : null,
                footerTop: footerRect ? Math.round(footerRect.top) : null,
                ctaText: cta ? cta.textContent.trim().replace(/\s+/g, ' ') : null,
            };
        }""",
        slug,
    )
    return {
        "slug": slug,
        "expect_cta": expect_cta,
        "url": url,
        "cta_count_prefix": cta_count,
        "exact_cta_count": exact_cta_count,
        "cta_visible": cta_visible,
        "metrics": metrics,
        "pass": ((exact_cta_count >= 1 and cta_visible) if expect_cta else (cta_count == 0)),
    }


async def main():
    results = {
        "base_url": BASE_URL,
        "authenticated": [],
        "anonymous": [],
        "console_errors": [],
        "request_failures": [],
        "login": {},
    }
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])

        # Anonymous context first: no stored auth tokens.
        anon = await browser.new_context(viewport={"width": 1920, "height": 1080}, ignore_https_errors=True)
        anon_page = await anon.new_page()
        anon_page.on("console", lambda msg: results["console_errors"].append({"scope": "anon", "type": msg.type, "text": msg.text}) if msg.type in ["error"] else None)
        anon_page.on("requestfailed", lambda req: results["request_failures"].append({"scope": "anon", "url": req.url, "failure": req.failure.error_text if req.failure else None}))
        for slug in ANON_SLUGS:
            results["anonymous"].append(await inspect_tool_page(anon_page, slug, expect_cta=True))
        await anon.close()

        # Authenticated context: log in through the real UI, then navigate to tool pages.
        auth = await browser.new_context(viewport={"width": 1920, "height": 1080}, ignore_https_errors=True)
        page = await auth.new_page()
        page.on("console", lambda msg: results["console_errors"].append({"scope": "auth", "type": msg.type, "text": msg.text}) if msg.type in ["error"] else None)
        page.on("requestfailed", lambda req: results["request_failures"].append({"scope": "auth", "url": req.url, "failure": req.failure.error_text if req.failure else None}))
        await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_selector("[data-testid='login-email-input']", timeout=30000)
        await page.fill("[data-testid='login-email-input']", "cathy@example.com")
        await page.fill("[data-testid='login-password-input']", "testpass123")
        await page.click("[data-testid='login-submit-button']")
        await page.wait_for_timeout(1500)
        try:
            await page.wait_for_url(lambda u: "/login" not in u.path, timeout=30000)
        except PlaywrightTimeoutError:
            pass
        token_present = await page.evaluate("Boolean(localStorage.getItem('kindred_token'))")
        current_path = await page.evaluate("window.location.pathname")
        plan_badge_count = await page.locator("[data-testid='layout-plan-badge']").count()
        results["login"] = {"token_present": token_present, "path_after_login": current_path, "plan_badge_count": plan_badge_count}
        for slug in AUTH_SLUGS:
            results["authenticated"].append(await inspect_tool_page(page, slug, expect_cta=False))
        await auth.close()
        await browser.close()

    OUT.write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    asyncio.run(main())