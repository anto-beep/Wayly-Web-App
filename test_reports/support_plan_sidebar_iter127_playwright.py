"""
Focused Playwright verification for bug: Care Plan Reviewer renamed to Support Plan Reviewer,
legacy /tools/* routes redirect, and authenticated sidebar nav groups are collapsed by default.

This script is mirrored in the browser automation call for iteration 127.
"""

BASE_URL = "https://proration-preview.preview.emergentagent.com"
EMAIL = "cathy@example.com"
PASSWORD = "testpass123"

async def run(page):
    await page.set_viewport_size({"width": 1920, "height": 1080})
    await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
    await page.evaluate("""() => { localStorage.clear(); sessionStorage.clear(); }""")
    await page.context.clear_cookies()
    await page.reload(wait_until="domcontentloaded")
    await page.get_by_test_id("login-email-input").fill(EMAIL)
    await page.get_by_test_id("login-password-input").fill(PASSWORD)
    await page.get_by_test_id("login-submit-button").click()
    await page.wait_for_url(lambda url: "/app" in url, timeout=30000)

    # Sidebar defaults in a clean session
    expected = {
        "today": "true",
        "guided_journeys": "false",
        "ai_tools": "false",
        "money": "false",
        "care": "false",
    }
    for key, value in expected.items():
        toggle = page.get_by_test_id(f"nav-group-toggle-{key}")
        assert await toggle.get_attribute("aria-expanded") == value
        cls = await toggle.get_attribute("class")
        assert "text-sm" in cls and "font-bold" in cls
    assert await page.get_by_test_id("nav-budget-scenarios").count() == 0
    await page.get_by_test_id("nav-group-toggle-money").click()
    await page.wait_for_timeout(250)
    assert await page.get_by_test_id("nav-budget-scenarios").count() == 1

    # Legacy tool routes redirect to support-plan-reviewer and render with new label only
    for path in ["/tools/care-plan-reviewer", "/tools/support-plan-reviewer", "/ai-tools/support-plan-reviewer"]:
        await page.goto(f"{BASE_URL}{path}", wait_until="domcontentloaded")
        await page.wait_for_url(lambda url: "/ai-tools/support-plan-reviewer" in url, timeout=15000)
        await page.get_by_role("heading", name="Support Plan Reviewer", exact=True).wait_for(timeout=15000)
        body = await page.locator("body").inner_text()
        assert "Care Plan Reviewer" not in body

    # Public Features page label
    await page.goto(f"{BASE_URL}/features", wait_until="domcontentloaded")
    await page.get_by_text("Support Plan Reviewer", exact=True).first.wait_for(timeout=15000)
    assert "Care Plan Reviewer" not in await page.locator("body").inner_text()

    # Command palette label
    await page.goto(f"{BASE_URL}/app", wait_until="domcontentloaded")
    await page.keyboard.press("Control+K")
    await page.get_by_text("Support Plan Reviewer", exact=True).wait_for(timeout=10000)
    assert "Care Plan Reviewer" not in await page.locator("body").inner_text()