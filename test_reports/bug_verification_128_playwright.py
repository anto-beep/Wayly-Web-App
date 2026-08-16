"""
Focused browser verification for iteration 128:
- Support Plan Reviewer rename on /features and tool routes
- legacy /tools/* redirects
- authenticated sidebar collapsed-by-default behavior and header typography
- Command Palette label

Target: https://mobile-exact-parity.preview.emergentagent.com
Credentials: cathy@example.com / testpass123
"""

import asyncio
from playwright.async_api import async_playwright, expect


BASE_URL = "https://mobile-exact-parity.preview.emergentagent.com"


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1920, "height": 1080})
        try:
            await page.goto(BASE_URL, wait_until="domcontentloaded")
            await page.evaluate("() => { localStorage.clear(); sessionStorage.clear(); }")

            # Public /features should show the new exact label and not the old exact label.
            await page.goto(f"{BASE_URL}/features", wait_until="networkidle")
            await expect(page.locator('[data-testid="features-group-care"]')).to_be_visible(timeout=15000)
            body_text = await page.locator("body").inner_text()
            assert "Support Plan Reviewer" in body_text
            assert "Care Plan Reviewer" not in body_text
            href = await page.locator('[data-testid="feat-card-support-plan-reviewer"]').evaluate("el => el.closest('a')?.getAttribute('href')")
            assert href == "/ai-tools/support-plan-reviewer"

            # Legacy and new /tools aliases should land on the support-plan reviewer route with the new heading.
            for path in ["/tools/care-plan-reviewer", "/tools/support-plan-reviewer"]:
                await page.goto(f"{BASE_URL}{path}", wait_until="domcontentloaded")
                await page.wait_for_url("**/ai-tools/support-plan-reviewer", timeout=15000)
                await expect(page.locator("h1", has_text="Support Plan Reviewer").first).to_be_visible(timeout=15000)
                route_text = await page.locator("body").inner_text()
                assert "Care Plan Reviewer" not in route_text

            # Clean sessionStorage before authenticated sidebar default-state check.
            await page.goto(f"{BASE_URL}/login", wait_until="networkidle")
            await page.evaluate("() => sessionStorage.clear()")
            await page.get_by_test_id("login-email-input").fill("cathy@example.com")
            await page.get_by_test_id("login-password-input").fill("testpass123")
            await page.get_by_test_id("login-submit-button").click()
            await page.wait_for_url("**/app**", timeout=20000)
            await expect(page.get_by_test_id("primary-nav")).to_be_visible(timeout=15000)

            expected = {
                "today": "true",
                "guided_journeys": "false",
                "ai_tools": "false",
                "money": "false",
                "care": "false",
                "providers": "false",
                "account": "false",
            }
            for key, value in expected.items():
                actual = await page.get_by_test_id(f"nav-group-toggle-{key}").get_attribute("aria-expanded")
                assert actual == value, f"{key} aria-expanded={actual}, expected={value}"

            primary_nav_text = await page.get_by_test_id("primary-nav").inner_text()
            assert "Dashboard" in primary_nav_text and "Profile" in primary_nav_text
            for hidden_child in ["Ask Wayly", "Support Plan Reviewer", "Statements", "Care Team", "Documents", "Settings"]:
                assert hidden_child not in primary_nav_text, f"Collapsed child visible by default: {hidden_child}"

            # Header typography: text-sm (14px) and bold.
            style = await page.get_by_test_id("nav-group-toggle-ai_tools").evaluate("""el => {
                const s = window.getComputedStyle(el);
                return {fontSize: s.fontSize, fontWeight: s.fontWeight};
            }""")
            assert style["fontSize"] == "14px"
            assert int(style["fontWeight"]) >= 700

            # Clicking a collapsed group expands it and reveals children with the new label only.
            await page.get_by_test_id("nav-group-toggle-ai_tools").click()
            await expect(page.get_by_test_id("nav-support-plan-reviewer")).to_be_visible(timeout=5000)
            assert await page.get_by_test_id("nav-group-toggle-ai_tools").get_attribute("aria-expanded") == "true"
            expanded_nav_text = await page.get_by_test_id("primary-nav").inner_text()
            assert "Support Plan Reviewer" in expanded_nav_text
            assert "Care Plan Reviewer" not in expanded_nav_text

            # Command Palette should show the renamed label.
            await page.keyboard.press("Control+K")
            await expect(page.get_by_test_id("command-input")).to_be_visible(timeout=5000)
            await page.get_by_test_id("command-input").fill("Support Plan Reviewer")
            await page.wait_for_timeout(300)
            dialog_text = await page.locator('[role="dialog"]').last.inner_text()
            assert "Support Plan Reviewer" in dialog_text
            assert "Care Plan Reviewer" not in dialog_text

            print("PASS: Support Plan Reviewer rename, redirects, sidebar collapse/styling, and command palette verified.")
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(main())