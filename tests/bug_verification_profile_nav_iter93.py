"""Focused CORE-1 profile discoverability verification (iteration 93).

This file mirrors the Playwright steps run through the browser automation tool:
- login as cathy@example.com
- discover the participant profile via sidebar Profile link (/app/me redirect)
- discover the profile via ParticipantSwitcher "View full profile" link
- verify required CORE-1 profile sections and key populated artefact cards
"""


async def run(page):
    await page.set_viewport_size({"width": 1920, "height": 1080})
    await page.context.clear_cookies()
    await page.goto("https://proration-preview.preview.emergentagent.com/login", wait_until="domcontentloaded")
    await page.evaluate("""() => { localStorage.clear(); sessionStorage.clear(); }""")
    await page.reload(wait_until="domcontentloaded")

    await page.get_by_test_id("login-email-input").fill("cathy@example.com")
    await page.get_by_test_id("login-password-input").fill("testpass123")
    await page.get_by_test_id("login-submit-button").click()
    await page.wait_for_url(lambda url: "/app" in url and "/login" not in url, timeout=30000)

    await page.get_by_test_id("nav-profile").wait_for(state="visible", timeout=20000)
    await page.get_by_test_id("nav-profile").click()
    await page.wait_for_url(lambda url: "/app/participants/" in url, timeout=30000)
    await page.get_by_test_id("core1-participant-profile").wait_for(state="visible", timeout=30000)

    for test_id in [
        "core1-profile-header",
        "core1-financial-card",
        "core1-open-cases-placeholder",
        "core1-artefacts-grid",
        "core1-household-panel",
        "core1-timeline-list",
        "core1-artefact-statement",
        "core1-artefact-invoice_check",
        "core1-artefact-letter",
        "core1-artefact-price_check",
        "core1-artefact-contribution_estimate",
    ]:
        await page.get_by_test_id(test_id).wait_for(state="visible", timeout=15000)

    await page.get_by_test_id("brand-link").click()
    await page.wait_for_url(lambda url: url.rstrip("/").endswith("/app"), timeout=20000)
    await page.get_by_test_id("participant-switcher-trigger").click()
    await page.get_by_test_id("participant-switcher-view-profile").wait_for(state="visible", timeout=10000)
    await page.get_by_test_id("participant-switcher-view-profile").click()
    await page.wait_for_url(lambda url: "/app/participants/" in url, timeout=30000)
    await page.get_by_test_id("core1-participant-profile").wait_for(state="visible", timeout=30000)