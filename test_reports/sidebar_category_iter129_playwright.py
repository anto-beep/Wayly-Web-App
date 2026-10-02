try:
    await page.set_viewport_size({"width": 1920, "height": 1000})
    await page.goto("http://localhost:3000/login", wait_until="domcontentloaded")
    await page.evaluate("() => { sessionStorage.clear(); localStorage.clear(); }")
    await page.reload(wait_until="domcontentloaded")
    await page.get_by_test_id("login-email-input").fill("cathy@example.com")
    await page.get_by_test_id("login-password-input").fill("testpass123")
    await page.get_by_test_id("login-submit-button").click()
    await page.wait_for_url("**/app", timeout=20000)
    await page.get_by_test_id("primary-nav").wait_for(state="visible", timeout=20000)
    await page.wait_for_timeout(800)

    error_text = await page.evaluate("""() => {
    const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
    return errorElements.map(el => el.textContent).join(", ");
    }""")
    print(f"Error text: {error_text or 'none'}")

    keys = ["today", "guided_journeys", "ai_tools", "money", "care", "providers", "account"]
    measurements = await page.evaluate("""(keys) => keys.map((key) => {
        const btn = document.querySelector(`[data-testid=\"nav-group-toggle-${key}\"]`);
        const span = btn?.querySelector('span');
        const svg = btn?.querySelector('svg');
        if (!btn || !span) return { key, missing: true };
        const bs = getComputedStyle(btn);
        const ss = getComputedStyle(span);
        const br = btn.getBoundingClientRect();
        const sr = span.getBoundingClientRect();
        const fontSize = parseFloat(ss.fontSize || bs.fontSize);
        const lineHeight = ss.lineHeight === 'normal' ? fontSize * 1.2 : parseFloat(ss.lineHeight);
        return {
            key,
            renderedText: span.innerText,
            ariaExpanded: btn.getAttribute('aria-expanded'),
            buttonClass: btn.getAttribute('class'),
            spanClass: span.getAttribute('class'),
            svgClass: svg?.getAttribute('class'),
            fontSize: ss.fontSize,
            fontWeight: ss.fontWeight,
            textTransform: bs.textTransform,
            whiteSpace: ss.whiteSpace,
            buttonHeight: br.height,
            spanHeight: sr.height,
            spanClientWidth: span.clientWidth,
            spanScrollWidth: span.scrollWidth,
            wraps: sr.height > lineHeight * 1.35 || br.height > 36,
            truncated: span.scrollWidth > span.clientWidth + 1
        };
    })""", keys)
    print(measurements)

    assert not [m for m in measurements if m.get("missing")], "Missing group toggle"
    assert not [m for m in measurements if m.get("wraps")], "A header wrapped/tall"
    assert not [m for m in measurements if m.get("truncated")], "A header truncated"
    assert not [m for m in measurements if m.get("fontSize") != "12px"], "Header font is not 12px"
    assert not [m for m in measurements if int(m.get("fontWeight") or 0) < 700], "Header is not bold"
    assert not [m for m in measurements if m.get("textTransform") != "uppercase"], "Header is not uppercase"
    assert not [m for m in measurements if m.get("whiteSpace") != "nowrap"], "Header is not nowrap"

    expanded = {m["key"]: m["ariaExpanded"] for m in measurements}
    assert expanded == {
        "today": "true",
        "guided_journeys": "false",
        "ai_tools": "false",
        "money": "false",
        "care": "false",
        "providers": "false",
        "account": "false",
    }, f"Unexpected default expanded state: {expanded}"
    assert await page.get_by_test_id("nav-dashboard").is_visible()
    assert await page.get_by_test_id("nav-ask-wayly").count() == 0
    assert await page.get_by_test_id("nav-documents").count() == 0

    await page.get_by_test_id("nav-group-toggle-providers").click()
    await page.wait_for_timeout(300)
    assert await page.get_by_test_id("nav-group-toggle-providers").get_attribute("aria-expanded") == "true"
    assert await page.get_by_test_id("nav-documents").is_visible()
    await page.get_by_test_id("nav-group-toggle-providers").click()
    await page.wait_for_timeout(300)
    assert await page.get_by_test_id("nav-group-toggle-providers").get_attribute("aria-expanded") == "false"
    assert await page.get_by_test_id("nav-documents").count() == 0
    print("SUCCESS: sidebar headers are single-line, 12px bold uppercase, and collapse/expand works")
except Exception as e:
    print(f"TEST FAILED: {e}")
    raise