"""Focused Playwright verification for bug: Budget Scenarios nav entry not visible under Money & Statements.

Run against the preview frontend with caregiver cathy@example.com/testpass123.
Checks collapsed Money & Statements group expansion, nav link placement, route navigation,
Budget Scenarios page render, sliders, and document title.
"""

async def run(page, base_url):
    await page.set_viewport_size({"width": 1920, "height": 1080})
    await page.goto(f"{base_url}/login", wait_until="domcontentloaded")
    await page.evaluate("""() => {
        localStorage.removeItem('kindred_token');
        localStorage.removeItem('kindred_refresh_token');
        sessionStorage.setItem('wayly_nav_group_money', '0');
    }""")
    await page.reload(wait_until="domcontentloaded")
    await page.get_by_test_id("login-email-input").fill("cathy@example.com")
    await page.get_by_test_id("login-password-input").fill("testpass123")
    await page.get_by_test_id("login-submit-button").click()
    await page.wait_for_url("**/app", timeout=30000)
    await page.get_by_test_id("nav-group-money").wait_for(state="visible", timeout=15000)
    expanded = await page.get_by_test_id("nav-group-toggle-money").get_attribute("aria-expanded")
    if expanded != "true":
        await page.get_by_test_id("nav-group-toggle-money").click()
    await page.get_by_test_id("nav-budget-scenarios").wait_for(state="visible", timeout=10000)
    await page.get_by_test_id("nav-budget-scenarios").click()
    await page.wait_for_url("**/app/budget-scenarios", timeout=15000)
    await page.get_by_test_id("budget-scenarios-page").wait_for(state="visible", timeout=15000)
    await page.get_by_test_id("bc2-sliders").wait_for(state="visible", timeout=15000)
    assert await page.title() == "Budget Scenarios | Wayly"