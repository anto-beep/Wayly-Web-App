# Focused Playwright test body for iteration 111 bug verification.
# Intended to be executed by the MCP browser automation runner inside an async function with `page` available.

await page.set_viewport_size({"width": 1920, "height": 1080})
base = "https://mobile-parity-sweep.preview.emergentagent.com"
errors = []

page.on("pageerror", lambda exc: errors.append(f"PAGEERROR: {exc}"))
page.on("console", lambda msg: errors.append(f"CONSOLE_ERROR: {msg.text}") if msg.type == "error" else None)

async def ensure_open(group_key):
    toggle = page.get_by_test_id(f"nav-group-toggle-{group_key}")
    await toggle.wait_for(state="visible", timeout=10000)
    if await toggle.get_attribute("aria-expanded") == "false":
        await toggle.click()
        await page.wait_for_timeout(150)

async def group_labels(group_key):
    group = page.get_by_test_id(f"nav-group-{group_key}")
    return [t.strip() for t in await group.locator("a span.flex-1").all_inner_texts()]

async def check_page_intro(path):
    await page.goto(base + path, wait_until="domcontentloaded")
    try:
        await page.wait_for_load_state("networkidle", timeout=3000)
    except Exception:
        pass
    await page.get_by_test_id("page-intro").wait_for(state="visible", timeout=15000)
    result = await page.evaluate("""() => {
        const intro = document.querySelector('[data-testid="page-intro"]');
        const headings = ['What This Does', 'How to Use It', 'What You Get'];
        const cards = Array.from(intro.querySelectorAll('div.rounded-2xl'));
        return headings.map((heading) => {
            const target = heading.toUpperCase();
            const card = cards.find((el) => ((el.innerText || '').toUpperCase()).includes(target));
            const body = card ? (card.innerText || '').replace(target, '').replace(heading, '').trim() : '';
            return { heading, exists: !!card, bodyLength: body.length, body };
        });
    }""")
    missing = [r for r in result if not r["exists"] or r["bodyLength"] < 10]
    if missing:
        raise AssertionError(f"{path} PageIntro missing/empty cards: {missing}")
    print(f"PASS PageIntro: {path}")

async def check_h1(path, expected, mode="exact"):
    await page.goto(base + path, wait_until="domcontentloaded")
    try:
        await page.wait_for_load_state("networkidle", timeout=3000)
    except Exception:
        pass
    h1 = page.locator("h1").first
    await h1.wait_for(state="visible", timeout=15000)
    text = (await h1.inner_text()).strip()
    if mode == "prefix":
        assert text.startswith(expected), f"{path}: expected h1 prefix {expected!r}, got {text!r}"
    else:
        assert text == expected, f"{path}: expected h1 {expected!r}, got {text!r}"
    print(f"PASS H1: {path} -> {text}")

async def route_loads(path):
    await page.goto(base + path, wait_until="domcontentloaded")
    try:
        await page.wait_for_load_state("networkidle", timeout=3000)
    except Exception:
        pass
    body = (await page.locator("body").inner_text()).strip()
    assert len(body) > 50, f"{path}: rendered blank/near blank body"
    assert "Something went wrong" not in body, f"{path}: rendered error boundary"
    assert "Page not found" not in body, f"{path}: rendered 404"
    print(f"PASS route loads: {path}")

try:
    await page.add_init_script("""() => { try { sessionStorage.clear(); localStorage.removeItem('wayly:remembered-email'); } catch(e) {} }""")
    await page.goto(base + "/login", wait_until="domcontentloaded")
    await page.get_by_test_id("login-email-input").fill("cathy@example.com")
    await page.get_by_test_id("login-password-input").fill("testpass123")
    await page.get_by_test_id("login-submit-button").click()
    await page.wait_for_url(lambda url: "/app" in str(url), timeout=20000)
    await page.get_by_test_id("primary-nav").wait_for(state="visible", timeout=15000)
    print("PASS login and sidebar visible")

    for key in ["today", "guided_journeys", "ai_tools", "care", "providers"]:
        await ensure_open(key)

    today = await group_labels("today")
    guided = await group_labels("guided_journeys")
    care = await group_labels("care")
    providers = await group_labels("providers")
    ai_tools = await group_labels("ai_tools")
    print(f"Today labels: {today}")
    print(f"Guided Journeys labels: {guided}")
    print(f"AI Tools labels: {ai_tools}")
    print(f"Their Care labels: {care}")
    print(f"Providers labels: {providers}")

    assert today == ["Dashboard", "Profile", "Family Wall", "All AI Tools"], f"Today group wrong: {today}"
    assert guided == ["Ask Wayly", "Carer Self-Check", "Classification Prep", "AT & HM Projects", "CHSP Tools", "Switch Provider"], f"Guided group wrong: {guided}"
    for removed in ["Ask Wayly", "Carer Self-Check", "Classification Prep", "AT & HM Projects", "CHSP Tools"]:
        assert removed not in today, f"{removed} still appears under Today"
    assert not any("AT & HM" in label for label in care), f"AT & HM duplicate still in Their Care: {care}"
    assert "Switch Provider" not in providers, f"Switch Provider duplicate still in Providers: {providers}"
    all_sidebar_text = await page.get_by_test_id("primary-nav").inner_text()
    assert all_sidebar_text.count("Ask Wayly") == 1, f"Expected exactly one Ask Wayly in sidebar, got {all_sidebar_text.count('Ask Wayly')}"
    print("PASS sidebar grouping and dedupe checks")

    title_checks = [
        ("/app/csc/stream-mix-and-iat", "Prepare for Your SAH Assessment", "exact"),
        ("/app/chsp/tools", "Verify CHSP Billing. Consider a Move to Support at Home.", "exact"),
        ("/app/athm/projects", "AT & HM Projects", "exact"),
        ("/app/ask-wayly", "Your Context-Aware Aged Care Assistant", "exact"),
        ("/app/carer/self-assessment", "Your Space to Check In With Yourself", "exact"),
        ("/app/documents", "All Your Aged-Care Paperwork, in One Place", "exact"),
        ("/app/reports", "Reports", "prefix"),
        ("/app/statements", "Your Support at Home Statements", "exact"),
        ("/app/care-plans", "Every Care Plan, Reviewed", "exact"),
    ]
    for path, expected, mode in title_checks:
        await check_h1(path, expected, mode)

    intro_paths = [
        "/app/ask-wayly",
        "/app/carer/self-assessment",
        "/app/csc/stream-mix-and-iat",
        "/app/athm/projects",
        "/app/chsp/tools",
        "/app/statements",
        "/app/statements/upload",
        "/app/documents",
        "/app/reports",
        "/app/care-plans",
        "/app/tools/provider-price-checker/compare",
        "/app/wall",
        "/app/tools/contribution-estimator/hardship-walkthrough",
    ]
    for path in intro_paths:
        await check_page_intro(path)

    for path in ["/app/chat", "/app/ask-wayly-v2"]:
        await page.goto(base + path, wait_until="domcontentloaded")
        await page.wait_for_url(lambda url: str(url).endswith("/app/ask-wayly"), timeout=10000)
        await page.get_by_test_id("page-intro").wait_for(state="visible", timeout=10000)
        print(f"PASS redirect: {path} -> {page.url}")

    nav_routes = {
        "Today": ["/app", "/app/me", "/app/wall", "/ai-tools"],
        "Guided Journeys": ["/app/ask-wayly", "/app/carer/self-assessment", "/app/csc/stream-mix-and-iat", "/app/athm/projects", "/app/chsp/tools", "/app/provider-switch"],
        "AI Tools": ["/ai-tools/statement-decoder", "/ai-tools/invoice-checker", "/ai-tools/budget-calculator", "/ai-tools/provider-price-checker", "/ai-tools/classification-self-check", "/ai-tools/letters-and-follow-ups", "/ai-tools/contribution-estimator", "/ai-tools/care-plan-reviewer", "/ai-tools/family-coordinator"],
    }
    for group, routes in nav_routes.items():
        for path in routes:
            await route_loads(path)

    if errors:
        filtered = [e for e in errors if "favicon" not in e.lower()]
        assert not filtered, f"JS console/page errors captured: {filtered}"
    print("ALL FOCUSED UX BUG VERIFICATION CHECKS PASSED")
except Exception as exc:
    print(f"TEST FAILURE: {exc}")
    # Get error messages using specific selectors
    error_text = await page.evaluate("""() => {
    const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
    return errorElements.map(el => el.textContent).join(", ");
    }""")
    if error_text:
        print(f"Found error message: {error_text}")
    else:
        print("No error messages found on the page")
    await page.screenshot(path="/app/test_reports/ux_capitalisation_sidebar_pageintro_iter111_failure.jpeg", quality=40, full_page=False)
    raise