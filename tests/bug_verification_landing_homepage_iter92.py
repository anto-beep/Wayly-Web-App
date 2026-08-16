"""
Focused Playwright verification for the landing/homepage copy and hero polish bug.

This file mirrors the script body executed through mcp_browser_automation. It is
intended to run inside an async function with an existing Playwright `page`.
"""

base_url = "https://mobile-parity-sweep.preview.emergentagent.com"
hero_image_path = "/branding/screenshots/dashboard-hero.png"
hero_image_url = f"{base_url}{hero_image_path}"
image_responses = []

async def collect_errors():
    # Get error messages using specific selectors
    error_text = await page.evaluate("""() => {
const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
return errorElements.map(el => el.textContent).join(", ");
}""")
    if error_text:
        print(f"Found error message: {error_text}")
    else:
        print("No error messages found on the page")
    return error_text

async def visible_text(selector):
    return await page.locator(selector).inner_text(timeout=10000)

try:
    print("Step 1: Open homepage with caregiver persona reset and verify hero baseline")
    await page.set_viewport_size({"width": 1920, "height": 1080})
    await page.add_init_script("localStorage.removeItem('wayly_persona_intent')")
    page.on("response", lambda response: image_responses.append({"url": response.url, "status": response.status}) if hero_image_path in response.url else None)
    await page.goto(base_url + "/", wait_until="domcontentloaded", timeout=60000)
    await page.locator('[data-testid="dual-flagship-hero"]').wait_for(timeout=20000)
    await page.locator('[data-testid="hero-eyebrow"]', has_text="Aged Care, Made Clear").wait_for(timeout=10000)
    caregiver_headline = await page.locator('[data-testid="hero-headline"]').inner_text(timeout=10000)
    print(f"Caregiver headline: {caregiver_headline}")
    assert caregiver_headline == "Read the statement. Check the invoice. Sleep on Sunday.", "Caregiver headline changed unexpectedly"
    print("PASS: Caregiver hero eyebrow and headline are correct")

    print("Step 2: Verify screenshot frame exists and dashboard hero image loads")
    await page.locator('[data-testid="hero-screenshot-wrap"]').scroll_into_view_if_needed(timeout=10000)
    await page.locator('[data-testid="hero-screenshot-img"]').wait_for(timeout=10000)
    img_src = await page.locator('[data-testid="hero-screenshot-img"]').get_attribute("src")
    print(f"Hero screenshot src: {img_src}")
    assert img_src == hero_image_path, f"Unexpected hero screenshot src: {img_src}"
    natural_width = await page.locator('[data-testid="hero-screenshot-img"]').evaluate("img => img.naturalWidth")
    natural_height = await page.locator('[data-testid="hero-screenshot-img"]').evaluate("img => img.naturalHeight")
    print(f"Hero screenshot natural size: {natural_width}x{natural_height}")
    assert natural_width > 0 and natural_height > 0, "Hero screenshot image did not decode/load"
    direct_image_response = await page.request.get(hero_image_url)
    print(f"Direct hero image status: {direct_image_response.status}")
    assert direct_image_response.status == 200, "Hero screenshot asset did not return HTTP 200"
    if image_responses:
        print(f"Captured page image responses: {image_responses}")
        assert any(r["status"] == 200 for r in image_responses), "Captured page image response was not HTTP 200"
    print("PASS: Hero screenshot is present in browser-style frame and image loads")

    print("Step 3: Toggle to participant and back without reload; verify copy and localStorage")
    marker = await page.evaluate("() => { window.__personaReloadProbe = Math.random(); return window.__personaReloadProbe; }")
    await page.locator('[data-testid="persona-toggle-participant"]').click(timeout=10000)
    await page.locator('[data-testid="hero-headline"]', has_text="Your Care. Your Statement. Your Call.").wait_for(timeout=10000)
    participant_headline = await page.locator('[data-testid="hero-headline"]').inner_text(timeout=10000)
    participant_eyebrow = await page.locator('[data-testid="hero-eyebrow"]').text_content(timeout=10000)
    stored_participant = await page.evaluate("() => localStorage.getItem('wayly_persona_intent')")
    marker_after_participant = await page.evaluate("() => window.__personaReloadProbe")
    print(f"Participant headline: {participant_headline}; eyebrow: {participant_eyebrow}; localStorage: {stored_participant}")
    assert participant_headline == "Your Care. Your Statement. Your Call.", "Participant headline is not title-cased correctly"
    assert "Aged Care, Made Clear" in participant_eyebrow, "Participant hero eyebrow is missing tagline"
    assert stored_participant == "participant", "Persona localStorage was not updated to participant"
    assert marker_after_participant == marker, "Persona toggle caused a full page reload"
    await page.locator('[data-testid="persona-toggle-caregiver"]').click(timeout=10000)
    await page.locator('[data-testid="hero-headline"]', has_text="Read the statement. Check the invoice. Sleep on Sunday.").wait_for(timeout=10000)
    stored_caregiver = await page.evaluate("() => localStorage.getItem('wayly_persona_intent')")
    marker_after_caregiver = await page.evaluate("() => window.__personaReloadProbe")
    assert stored_caregiver == "caregiver", "Persona localStorage was not updated back to caregiver"
    assert marker_after_caregiver == marker, "Caregiver toggle caused a full page reload"
    print("PASS: Persona toggle swaps copy live, preserves tagline, and updates localStorage")

    print("Step 4: Verify Invoice Checker card has no NEW badge and flagship/Ask Wayly links still exist")
    invoice_text = await page.locator('[data-testid="hero-flagship-invoice-checker"]').inner_text(timeout=10000)
    print(f"Invoice card text: {invoice_text}")
    assert "NEW" not in invoice_text.upper(), "Invoice Checker card still shows a NEW badge/text"
    statement_href = await page.locator('[data-testid="hero-flagship-statement-decoder"]').get_attribute("href")
    invoice_href = await page.locator('[data-testid="hero-flagship-invoice-checker"]').get_attribute("href")
    ask_href = await page.locator('[data-testid="hero-ask-wayly-cta"]').get_attribute("href")
    print(f"Hero links: statement={statement_href}; invoice={invoice_href}; ask={ask_href}")
    assert statement_href == "/ai-tools/statement-decoder", "Statement Decoder card link is wrong"
    assert invoice_href == "/ai-tools/invoice-checker", "Invoice Checker card link is wrong"
    assert ask_href, "Ask Wayly hero CTA is missing a link"
    print("PASS: NEW badge removed and hero links are intact")

    print("Step 5: Verify cluster titles have no numbering and hero/cluster visible copy has no em/en dashes")
    await page.locator('[data-testid="tool-cluster-grid"]').scroll_into_view_if_needed(timeout=10000)
    await page.locator('[data-testid="tool-cluster-grid"]').wait_for(timeout=10000)
    cluster_titles = await page.evaluate("""() => Array.from(document.querySelectorAll('[data-testid="tool-cluster-grid"] h3')).map(h => h.textContent.trim())""")
    print(f"Cluster titles: {cluster_titles}")
    for expected in ["Money & Statements", "Care Coordination", "Ask Wayly"]:
        assert expected in cluster_titles, f"Missing cluster title: {expected}"
    for forbidden in ["01", "02", "03"]:
        assert forbidden not in cluster_titles, f"Cluster title list still contains numbering {forbidden}"
    hero_text = await visible_text('[data-testid="dual-flagship-hero"]')
    cluster_text = await visible_text('[data-testid="tool-cluster-grid"]')
    for label, text in [("hero", hero_text), ("tool cluster", cluster_text)]:
        assert "—" not in text, f"Rendered {label} copy still contains an em dash"
        assert "–" not in text, f"Rendered {label} copy still contains an en dash"
    print("PASS: Cluster titles are unnumbered and rendered hero/cluster copy has no em/en dashes")

    print("Step 6: Broad sweep visible landing and about page copy for em/en dashes; verify About renders")
    landing_main_text = await visible_text('main#main-content')
    assert "—" not in landing_main_text, "Rendered landing page copy still contains an em dash"
    assert "–" not in landing_main_text, "Rendered landing page copy still contains an en dash"
    await page.goto(base_url + "/about", wait_until="domcontentloaded", timeout=60000)
    await page.locator('[data-testid="about-h1"]', has_text="We Built Wayly Because Someone Had To.").wait_for(timeout=15000)
    about_text = await visible_text('main#main-content')
    assert "—" not in about_text, "Rendered About page copy still contains an em dash"
    assert "–" not in about_text, "Rendered About page copy still contains an en dash"
    await collect_errors()
    print("PASS: Landing/About rendered user-visible copy has no em/en dashes and About still renders")

    print("RESULT: Focused landing/homepage hero, cluster, persona, screenshot, link, and dash checks passed")
except Exception as exc:
    print(f"FAIL: Focused landing/homepage verification failed: {exc}")
    await collect_errors()
    await page.screenshot(path="/app/test_reports/landing_homepage_iter92_failure.jpeg", quality=40, full_page=False)
    raise