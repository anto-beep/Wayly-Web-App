"""Playwright snippet for the prior ParticipantSwitcher 404 regression.

Executed with mcp_browser_automation: login as Cathy, select the previously
failing visible participant Lebron James (f094f938-...), click View full
profile, and verify the CORE-1 profile renders with a 200 /profile response.
"""

await page.set_viewport_size({"width": 1920, "height": 1080})
BASE = "https://mobile-exact-parity.preview.emergentagent.com"
TARGET_PID = "f094f938-fb27-4a7a-958c-1cedf8b94ccd"
profile_events = []

def is_target_profile(url):
    return f"/api/core/participants/{TARGET_PID}/profile" in url

page.on("response", lambda res: profile_events.append({"kind": "response", "url": res.url, "status": res.status}) if is_target_profile(res.url) else None)

try:
    await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
    await page.evaluate("localStorage.clear()")
    await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
    await page.get_by_test_id("login-email-input").fill("cathy@example.com")
    await page.get_by_test_id("login-password-input").fill("testpass123")
    await page.get_by_test_id("login-submit-button").click()
    await page.wait_for_url("**/app", timeout=30000)

    await page.get_by_test_id("participant-switcher-trigger").wait_for(timeout=30000)
    await page.get_by_test_id("participant-switcher-trigger").click(force=True)
    await page.wait_for_timeout(200)
    await page.get_by_test_id(f"participant-option-{TARGET_PID}").click(force=True)
    await page.wait_for_timeout(300)
    await page.get_by_test_id("participant-switcher-trigger").click(force=True)
    await page.wait_for_timeout(200)
    await page.get_by_test_id("participant-switcher-view-profile").click(force=True)
    await page.wait_for_url(f"**/app/participants/{TARGET_PID}", timeout=30000)
    await page.get_by_test_id("core1-participant-profile").wait_for(timeout=30000)
    assert await page.get_by_test_id("core1-error").count() == 0
    assert await page.get_by_test_id("core1-not-found").count() == 0
    assert any(e.get("status") == 200 for e in profile_events), profile_events
    assert not any(e.get("status") in (404, 500) for e in profile_events), profile_events
    print("PASS switcher View full profile renders CORE-1 profile", profile_events)
except Exception as e:
    print(f"FAIL switcher profile verification: {e}")
    await page.screenshot(path="/app/test_reports/profile_core1_iter95_switcher_failure.jpeg", quality=40, full_page=False)
    raise