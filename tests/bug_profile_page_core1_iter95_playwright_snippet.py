"""Playwright snippet used with mcp_browser_automation for CORE-1 profile bug verification.

This file documents the exact browser steps executed in the preview app:
login as Cathy, navigate to /app/me and direct participant profile, confirm the
CORE-1 profile sections render without core1-error, inspect profile network
responses for 500s/double effective fetches, and confirm invalid IDs render
core1-not-found.
"""

await page.set_viewport_size({"width": 1920, "height": 1080})
profile_events = []

def is_profile_url(url):
    return "/api/core/participants/" in url and "/profile" in url

page.on("request", lambda req: profile_events.append({"kind": "request", "url": req.url, "method": req.method}) if is_profile_url(req.url) else None)
page.on("response", lambda res: profile_events.append({"kind": "response", "url": res.url, "status": res.status}) if is_profile_url(res.url) else None)
page.on("requestfailed", lambda req: profile_events.append({"kind": "failed", "url": req.url, "failure": req.failure}) if is_profile_url(req.url) else None)

try:
    await page.goto("/login", wait_until="domcontentloaded")
    await page.evaluate("localStorage.clear()")
    await page.get_by_test_id("login-email-input").fill("cathy@example.com")
    await page.get_by_test_id("login-password-input").fill("testpass123")
    await page.get_by_test_id("login-submit-button").click()
    await page.wait_for_url("**/app", timeout=30000)
    print("PASS login reached /app")

    profile_events.clear()
    await page.goto("/app/me", wait_until="domcontentloaded")
    await page.get_by_test_id("core1-participant-profile").wait_for(timeout=30000)
    assert await page.get_by_test_id("core1-error").count() == 0
    for testid in ["core1-profile-header", "core1-financial-card", "core1-artefacts-grid", "core1-household-panel", "core1-timeline-section"]:
        assert await page.get_by_test_id(testid).is_visible(), f"missing {testid}"
    me_url = page.url
    me_pid = me_url.rstrip("/").split("/")[-1]
    me_profile_responses = [e for e in profile_events if e["kind"] == "response" and e["url"].endswith(f"/{me_pid}/profile")]
    me_500s = [e for e in me_profile_responses if e.get("status") == 500]
    print("PASS /app/me profile rendered", {"pid": me_pid, "events": profile_events, "responses": me_profile_responses, "500s": me_500s})

    profile_events.clear()
    await page.goto(f"/app/participants/{me_pid}", wait_until="domcontentloaded")
    await page.get_by_test_id("core1-participant-profile").wait_for(timeout=30000)
    assert await page.get_by_test_id("core1-error").count() == 0
    direct_responses = [e for e in profile_events if e["kind"] == "response" and e["url"].endswith(f"/{me_pid}/profile")]
    direct_500s = [e for e in direct_responses if e.get("status") == 500]
    print("PASS direct profile rendered", {"pid": me_pid, "events": profile_events, "responses": direct_responses, "500s": direct_500s})

    profile_events.clear()
    await page.goto("/app/participants/not-a-real-participant-iter95", wait_until="domcontentloaded")
    await page.get_by_test_id("core1-not-found").wait_for(timeout=30000)
    assert await page.get_by_test_id("core1-error").count() == 0
    invalid_responses = [e for e in profile_events if e["kind"] == "response"]
    print("PASS invalid participant rendered not-found", {"events": profile_events, "responses": invalid_responses})

    error_text = await page.evaluate("""() => {
    const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
    return errorElements.map(el => el.textContent).join(", ");
    }""")
    if error_text:
        print(f"Found error message: {error_text}")
    else:
        print("No error messages found on the page")
except Exception as e:
    print(f"FAIL CORE-1 profile browser verification: {e}")
    await page.screenshot(path="/app/test_reports/profile_core1_iter95_browser_failure.jpeg", quality=40, full_page=False)
    raise