"""
Focused UI verification script for bug_verification_94:
User-reported bug: profile page shows "Something went wrong loading this profile. Please try again."

This file mirrors the Playwright script body run via mcp_browser_automation against
https://statement-checker-3.preview.emergentagent.com.
"""

# Script body is designed to run inside the MCP async Playwright harness with
# access to `page`.

BASE_URL = "https://statement-checker-3.preview.emergentagent.com"
TARGET_ID = "0c538637-b0dd-4982-8f78-b32814c6a5eb"

profile_requests = []
profile_responses = []

def record_request(req):
    if "/api/core/participants/" in req.url and "/profile" in req.url:
        profile_requests.append(req.url)

def record_response(resp):
    if "/api/core/participants/" in resp.url and "/profile" in resp.url:
        profile_responses.append({"url": resp.url, "status": resp.status})

page.on("request", record_request)
page.on("response", record_response)

async def visible_count(testid):
    return await page.locator(f'[data-testid="{testid}"]').count()

async def assert_no_generic_error(context):
    count = await visible_count("core1-error")
    if count != 0:
        txt = await page.locator('[data-testid="core1-error"]').first.inner_text()
        raise AssertionError(f"{context}: generic core1-error visible: {txt}")
    print(f"PASS: {context}: generic core1-error is not visible")

async def assert_profile_rendered(context):
    await page.locator('[data-testid="core1-participant-profile"]').wait_for(state="visible", timeout=20000)
    await assert_no_generic_error(context)
    header = await page.locator('[data-testid="core1-profile-header"]').inner_text()
    financial = await page.locator('[data-testid="core1-financial-card"]').inner_text()
    body = await page.locator('[data-testid="core1-participant-profile"]').inner_text()
    if "Mum's profile" not in header:
        raise AssertionError(f"{context}: expected header Mum's profile; got {header}")
    if "Level 4" not in header:
        raise AssertionError(f"{context}: expected Level 4 badge; got {header}")
    if "Provider:" not in header:
        raise AssertionError(f"{context}: expected provider in header; got {header}")
    if "$137,917" not in financial:
        raise AssertionError(f"{context}: expected lifetime cap $137,917; got {financial}")
    print(f"PASS: {context}: profile rendered with header, Level 4, provider, and lifetime cap")

async def reset_profile_network(label):
    profile_requests.clear()
    profile_responses.clear()
    print(f"INFO: reset profile network counters before {label}")

await page.set_viewport_size({"width": 1920, "height": 1080})

try:
    await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
    await page.evaluate("localStorage.clear()")
    await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
    await page.locator('[data-testid="login-email-input"]').wait_for(state="visible", timeout=15000)
    await page.locator('[data-testid="login-email-input"]').fill("cathy@example.com")
    await page.locator('[data-testid="login-password-input"]').fill("testpass123")
    await page.locator('[data-testid="login-submit-button"]').click()
    await page.wait_for_url("**/app**", timeout=20000)
    print("PASS: logged in as Cathy")

    await reset_profile_network("/app/me")
    await page.goto(f"{BASE_URL}/app/me", wait_until="domcontentloaded")
    await assert_profile_rendered("/app/me")
    await page.wait_for_timeout(1200)
    me_request_count = len(profile_requests)
    me_responses = list(profile_responses)
    if me_request_count != 1:
        raise AssertionError(f"/app/me expected 1 profile request, got {me_request_count}: {profile_requests}")
    print(f"PASS: /app/me made exactly one profile request: {me_responses}")

    await reset_profile_network("direct participant profile")
    await page.goto(f"{BASE_URL}/app/participants/{TARGET_ID}", wait_until="domcontentloaded")
    await assert_profile_rendered("direct participant profile")
    for tid in ["core1-artefacts-grid", "core1-household-panel", "core1-timeline-list"]:
        await page.locator(f'[data-testid="{tid}"]').wait_for(state="visible", timeout=15000)
        print(f"PASS: direct participant profile visible selector {tid}")
    artefact_text = await page.locator('[data-testid="core1-artefacts-grid"]').inner_text()
    for label in ["Statement Decoder", "Invoice Checker", "Letters & Follow-ups", "Price Checker", "Contribution Estimator"]:
        if label not in artefact_text:
            raise AssertionError(f"direct participant profile missing artefact label {label}; got {artefact_text}")
    household_text = await page.locator('[data-testid="core1-household-panel"]').inner_text()
    if "Cathy" not in household_text:
        raise AssertionError(f"direct participant profile missing Cathy caregiver in household panel: {household_text}")
    await page.wait_for_timeout(1200)
    direct_request_count = len(profile_requests)
    direct_responses = list(profile_responses)
    if direct_request_count != 1:
        raise AssertionError(f"direct profile expected 1 profile request, got {direct_request_count}: {profile_requests}")
    print(f"PASS: direct participant profile made exactly one profile request: {direct_responses}")

    await page.locator('[data-testid="participant-switcher-trigger"]').click()
    await page.locator('[data-testid="participant-switcher-menu"]').wait_for(state="visible", timeout=10000)
    selected_id = await page.evaluate(f"""(targetId) => {{
        const buttons = Array.from(document.querySelectorAll('[data-testid^="participant-option-"]'));
        const btn = buttons.find(b => !b.getAttribute('data-testid').endsWith(targetId));
        if (!btn) return null;
        btn.click();
        return btn.getAttribute('data-testid').replace('participant-option-', '');
    }}""", TARGET_ID)
    if not selected_id:
        raise AssertionError("ParticipantSwitcher did not expose another participant option")
    await page.wait_for_timeout(500)
    await reset_profile_network("ParticipantSwitcher View full profile")
    await page.locator('[data-testid="participant-switcher-trigger"]').click()
    await page.locator('[data-testid="participant-switcher-menu"]').wait_for(state="visible", timeout=10000)
    await page.locator('[data-testid="participant-switcher-view-profile"]').click()
    await page.wait_for_url(f"**/app/participants/{selected_id}**", timeout=15000)
    await page.locator('[data-testid="core1-participant-profile"]').wait_for(state="visible", timeout=20000)
    await assert_no_generic_error("ParticipantSwitcher View full profile")
    await page.wait_for_timeout(1200)
    switch_request_count = len(profile_requests)
    if switch_request_count != 1:
        raise AssertionError(f"switcher profile expected 1 profile request, got {switch_request_count}: {profile_requests}")
    print(f"PASS: ParticipantSwitcher View full profile navigated to {selected_id} and made one profile request")

    await reset_profile_network("invalid participant id")
    await page.goto(f"{BASE_URL}/app/participants/completely-invalid-id-123", wait_until="domcontentloaded")
    await page.locator('[data-testid="core1-not-found"]').wait_for(state="visible", timeout=15000)
    not_found_text = await page.locator('[data-testid="core1-not-found"]').inner_text()
    await assert_no_generic_error("invalid participant id")
    if "Profile not found" not in not_found_text:
        raise AssertionError(f"invalid participant id did not render Profile not found: {not_found_text}")
    await page.wait_for_timeout(500)
    print(f"PASS: invalid participant id rendered core1-not-found, not generic error; requests={profile_responses}")

    # Transient failure path: fail the next valid profile request once, verify Try again refetches.
    fail_once = {"done": False}
    async def transient_profile_failure(route):
        if not fail_once["done"] and f"/api/core/participants/{TARGET_ID}/profile" in route.request.url:
            fail_once["done"] = True
            await route.fulfill(status=503, content_type="application/json", body='{"detail":"Injected transient profile failure"}')
        else:
            await route.continue_()
    await page.route("**/api/core/participants/**/profile", transient_profile_failure)
    await reset_profile_network("transient failure retry")
    await page.goto(f"{BASE_URL}/app/participants/{TARGET_ID}", wait_until="domcontentloaded")
    await page.locator('[data-testid="core1-error"]').wait_for(state="visible", timeout=15000)
    await page.locator('[data-testid="core1-retry-btn"]').wait_for(state="visible", timeout=10000)
    detail = await page.locator('[data-testid="core1-error-detail"]').inner_text()
    if "Injected transient profile failure" not in detail:
        raise AssertionError(f"transient error detail missing injected message: {detail}")
    await page.locator('[data-testid="core1-retry-btn"]').click()
    await assert_profile_rendered("transient failure retry")
    await page.wait_for_timeout(1200)
    retry_request_count = len(profile_requests)
    if retry_request_count != 2:
        raise AssertionError(f"transient retry expected 2 profile requests (fail+retry), got {retry_request_count}: {profile_requests}")
    print(f"PASS: transient failure showed retry button and retry re-fetched successfully: {profile_responses}")

    error_text = await page.evaluate("""() => {
    const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
    return errorElements.map(el => el.textContent).join(", ");
    }""")
    if error_text:
        print(f"Found error message: {error_text}")
    else:
        print("No error messages found on the page")

    print("RESULT: fixed - CORE-1 profile bug did not reproduce in covered flows")
except Exception as exc:
    print(f"RESULT: failure - {exc}")
    await page.screenshot(path="/app/test_reports/profile_core1_iter94_failure.jpeg", quality=40, full_page=False)
    raise