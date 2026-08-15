
# Runtime sweep for public user-visible leftover PRICING-UI-1 v11 price copy.
base_url = "https://proration-preview.preview.emergentagent.com"
try:
    await page.set_viewport_size({"width": 1920, "height": 1080})
    await page.goto(base_url + "/faq", wait_until="domcontentloaded", timeout=20000)
    await page.wait_for_load_state("load", timeout=20000)
    await page.get_by_test_id("faq-search-input").fill("How much does Wayly cost")
    await page.wait_for_timeout(300)
    faq_group = page.get_by_test_id("faq-group-wayly-software")
    await faq_group.scroll_into_view_if_needed()
    await faq_group.locator("details", has_text="How much does Wayly cost?").first.click()
    faq_text = await faq_group.inner_text()
    print("FAQ text snippet:", faq_text)
    print("FAQ_HAS_19_PER_MONTH=", "$19 per month" in faq_text or "$19/month" in faq_text)

    await page.goto(base_url + "/articles/sah-invoice-checker-verify-support-at-home-invoice-five-minutes", wait_until="domcontentloaded", timeout=20000)
    await page.wait_for_load_state("load", timeout=20000)
    body = await page.locator("body").inner_text(timeout=10000)
    print("ARTICLE_HAS_19_MONTH=", "$19/month" in body or "$19 per month" in body)
    idx = body.find("$19")
    if idx >= 0:
        print("Article $19 snippet:", body[max(0, idx-120):idx+180])

    error_text = await page.evaluate("""() => {
    const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
    return errorElements.map(el => el.textContent).join(", ");
    }""")
    if error_text:
        print(f"Found error message: {error_text}")
    else:
        print("No error messages found on the page")
except Exception as e:
    print(f"TEST FAILURE: {type(e).__name__}: {e}")
    await page.screenshot(path="/app/test_reports/pricing_ui_bug_iter142_public_sweep_failure.jpeg", quality=40, full_page=False)
    raise
