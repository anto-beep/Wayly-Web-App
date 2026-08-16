# Follow-up focused checks for iteration 111 after the main script found /app/wall lacks PageIntro.
# Intended for MCP browser automation inside an async function with `page` available.

await page.set_viewport_size({"width": 1920, "height": 1080})
base = "https://mobile-exact-parity.preview.emergentagent.com"
errors = []
page.on("pageerror", lambda exc: errors.append(f"PAGEERROR: {exc}"))
page.on("console", lambda msg: errors.append(f"CONSOLE_ERROR: {msg.text}") if msg.type == "error" else None)

async def login():
    await page.goto(base + "/login", wait_until="domcontentloaded")
    await page.get_by_test_id("login-email-input").fill("cathy@example.com")
    await page.get_by_test_id("login-password-input").fill("testpass123")
    await page.get_by_test_id("login-submit-button").click()
    await page.wait_for_url(lambda url: "/app" in str(url), timeout=20000)
    await page.get_by_test_id("primary-nav").wait_for(state="visible", timeout=15000)
    print("PASS follow-up login")

async def soft_route_load(path):
    await page.goto(base + path, wait_until="domcontentloaded")
    try:
        await page.wait_for_load_state("networkidle", timeout=3000)
    except Exception:
        pass
    body = (await page.locator("body").inner_text()).strip()
    if len(body) <= 50 or "Something went wrong" in body or "Page not found" in body:
        raise AssertionError(f"{path} blank/error body: {body[:200]}")
    print(f"PASS follow-up route loads: {path}")

async def intro_present(path):
    await page.goto(base + path, wait_until="domcontentloaded")
    await page.get_by_test_id("page-intro").wait_for(state="visible", timeout=15000)
    text = await page.get_by_test_id("page-intro").inner_text()
    for label in ["WHAT THIS DOES", "HOW TO USE IT", "WHAT YOU GET"]:
        assert label in text.upper(), f"{path}: missing {label} in PageIntro"
    print(f"PASS follow-up PageIntro: {path}")

try:
    await login()
    await intro_present("/app/tools/contribution-estimator/hardship-walkthrough")
    for path in ["/app/chat", "/app/ask-wayly-v2"]:
        await page.goto(base + path, wait_until="domcontentloaded")
        await page.wait_for_url(lambda url: str(url).endswith("/app/ask-wayly"), timeout=10000)
        await page.get_by_test_id("page-intro").wait_for(state="visible", timeout=10000)
        print(f"PASS follow-up redirect: {path} -> {page.url}")

    for path in [
        "/app", "/app/me", "/app/wall", "/ai-tools",
        "/app/ask-wayly", "/app/carer/self-assessment", "/app/csc/stream-mix-and-iat", "/app/athm/projects", "/app/chsp/tools", "/app/provider-switch",
        "/ai-tools/statement-decoder", "/ai-tools/invoice-checker", "/ai-tools/budget-calculator", "/ai-tools/provider-price-checker", "/ai-tools/classification-self-check", "/ai-tools/letters-and-follow-ups", "/ai-tools/contribution-estimator", "/ai-tools/care-plan-reviewer", "/ai-tools/family-coordinator",
    ]:
        await soft_route_load(path)

    filtered = [e for e in errors if "favicon" not in e.lower()]
    assert not filtered, f"JS console/page errors captured: {filtered}"
    print("FOLLOW-UP CHECKS PASSED")
except Exception as exc:
    print(f"FOLLOW-UP TEST FAILURE: {exc}")
    # Get error messages using specific selectors
    error_text = await page.evaluate("""() => {
    const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
    return errorElements.map(el => el.textContent).join(", ");
    }""")
    if error_text:
        print(f"Found error message: {error_text}")
    else:
        print("No error messages found on the page")
    await page.screenshot(path="/app/test_reports/ux_iter111_followup_failure.jpeg", quality=40, full_page=False)
    raise