"""
Focused Playwright verification for homepage/pricing v11 plan-card regression.

Run context: executed by the bug testing agent via the browser automation tool.
It checks only the reported marketing/pricing plan-card symptoms for guest and
logged-in users.
"""

BASE_URL = "https://proration-preview.preview.emergentagent.com"
EMAIL = "cathy@example.com"
PASSWORD = "testpass123"

results = []


def record(name, ok, details=""):
    status = "PASS" if ok else "FAIL"
    line = f"{status}: {name}"
    if details:
        line += f" -- {details}"
    print(line)
    results.append({"name": name, "ok": ok, "details": details})


async def visible_text(locator):
    try:
        return await locator.inner_text(timeout=5000)
    except Exception as exc:
        return f"<missing: {exc}>"


try:
    await page.set_viewport_size({"width": 1920, "height": 1080})
    await page.context.clear_cookies()

    # Guest homepage checks
    await page.goto(f"{BASE_URL}/", wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)
    landing_cards = page.locator('div[data-testid^="landing-tier-"]')
    landing_card_count = await landing_cards.count()
    record("Guest homepage has exactly two landing tier cards", landing_card_count == 2, f"count={landing_card_count}")
    record("Guest homepage solo card exists", await page.get_by_test_id("landing-tier-solo").count() == 1)
    record("Guest homepage family card exists", await page.get_by_test_id("landing-tier-family").count() == 1)
    record("Guest homepage adviser tier card absent", await page.get_by_test_id("landing-tier-adviser").count() == 0)

    solo_home_text = await visible_text(page.get_by_test_id("landing-tier-solo"))
    family_home_text = await visible_text(page.get_by_test_id("landing-tier-family"))
    record("Guest homepage Solo price/cadence correct", "$24.50" in solo_home_text and "per fortnight" in solo_home_text, solo_home_text.replace("\n", " | "))
    record("Guest homepage Family price/cadence correct", "$49.50" in family_home_text and "per fortnight" in family_home_text, family_home_text.replace("\n", " | "))

    home_text = await page.locator("body").inner_text(timeout=10000)
    old_home_amounts = [amt for amt in ["$27", "$49/month", "$19", "$299"] if amt in home_text]
    record("Guest homepage does not show old plan amounts", len(old_home_amounts) == 0, f"found={old_home_amounts}")
    landing_card_labels = [solo_home_text, family_home_text]
    record("Guest homepage plan cards are not labelled Adviser", all("Adviser" not in t for t in landing_card_labels), "checked tier card text only")

    faq_answer = await page.evaluate("""() => {
        const summaries = Array.from(document.querySelectorAll('details summary'));
        const summary = summaries.find(s => s.textContent.trim() === 'How much does it cost?');
        if (!summary) return '';
        const details = summary.closest('details');
        details.open = true;
        return details.textContent;
    }""")
    record(
        "Homepage FAQ cost answer updated",
        "Solo is $24.50 per fortnight" in faq_answer and "Family is $49.50 per fortnight" in faq_answer,
        faq_answer.strip().replace("\n", " | ")
    )
    faq_old_amounts = [amt for amt in ["$19/month", "$39/month", "$299/month"] if amt in faq_answer]
    record("Homepage FAQ cost answer does not show old monthly prices", len(faq_old_amounts) == 0, f"found={faq_old_amounts}")

    # Guest pricing page checks
    await page.goto(f"{BASE_URL}/pricing", wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)
    pricing_cards = page.locator('div[data-testid^="tier-"]')
    pricing_card_count = await pricing_cards.count()
    record("Guest pricing has exactly two tier cards", pricing_card_count == 2, f"count={pricing_card_count}")
    record("Guest pricing solo CTA exists", await page.get_by_test_id("tier-cta-solo").count() == 1)
    record("Guest pricing family CTA exists", await page.get_by_test_id("tier-cta-family").count() == 1)
    record("Guest pricing adviser CTA absent", await page.get_by_test_id("tier-cta-adviser").count() == 0)

    pricing_text = await page.locator("body").inner_text(timeout=10000)
    record("Guest pricing does not mention $699 or For financial advisers", "$699" not in pricing_text and "For financial advisers" not in pricing_text)
    old_cadence_notes = [note for note in ["Billed every 14 days · 26 charges a year · $637 a year", "$1,287 a year"] if note in pricing_text]
    record("Guest pricing removed old cadenceNote yearly lines", len(old_cadence_notes) == 0, f"found={old_cadence_notes}")

    solo_pricing_text = await visible_text(page.get_by_test_id("tier-solo"))
    family_pricing_text = await visible_text(page.get_by_test_id("tier-family"))
    leftover_under_price = [t for t in [solo_pricing_text, family_pricing_text] if "Billed monthly" in t or "Billed every 14 days" in t]
    record("Guest pricing Solo/Family cards have no billing-note line under price", len(leftover_under_price) == 0, " | ".join(t.replace("\n", " | ") for t in leftover_under_price))

    headers = await page.locator('[data-testid="pricing-table"] table thead th').evaluate_all("els => els.map(e => e.textContent.trim())")
    record("Pricing comparison headers are only Feature/Solo/Family", headers == ["Feature", "Solo", "Family"], f"headers={headers}")
    table_text = await page.get_by_test_id("pricing-table").inner_text(timeout=5000)
    record("Pricing comparison table has no Adviser header/section/rows", "Adviser" not in table_text, table_text[:500].replace("\n", " | "))

    addons_text = await page.get_by_test_id("addons-section").inner_text(timeout=5000)
    record("Managing more than 2 participants section uses fortnight amount", "$24.50 per fortnight" in addons_text, addons_text.replace("\n", " | "))
    record("Managing more than 2 participants section does not show $19/month", "$19/month" not in addons_text, addons_text.replace("\n", " | "))
    record("Pricing page does not show old $19/month anywhere", "$19/month" not in pricing_text)

    await page.get_by_test_id("tier-solo").scroll_into_view_if_needed(timeout=5000)
    solo_box = await page.get_by_test_id("tier-solo").bounding_box()
    family_box = await page.get_by_test_id("tier-family").bounding_box()
    parent_class = await page.get_by_test_id("tier-solo").locator("xpath=..").get_attribute("class")
    width_ok = bool(solo_box and family_box and solo_box["width"] >= 400 and family_box["width"] >= 400 and "sm:grid-cols-2" in (parent_class or "") and "max-w-4xl" in (parent_class or ""))
    record("Pricing cards are wide two-column layout", width_ok, f"solo_width={solo_box['width'] if solo_box else None}, family_width={family_box['width'] if family_box else None}, parent_class={parent_class}")
    await page.screenshot(path="/app/test_reports/pricing_cards_desktop_iter141.jpeg", quality=40, full_page=False)

    # Logged-in regression checks
    await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
    await page.wait_for_timeout(500)
    await page.get_by_test_id("login-email-input").fill(EMAIL)
    await page.get_by_test_id("login-password-input").fill(PASSWORD)
    await page.get_by_test_id("login-submit-button").click()
    await page.wait_for_timeout(3000)
    login_url = page.url
    logged_in = "/login" not in login_url and await page.get_by_test_id("login-submit-button").count() == 0
    record("Can log in as cathy@example.com for CTA regression", logged_in, f"url={login_url}")

    # Get error messages using specific selectors
    error_text = await page.evaluate("""() => {
    const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
    return errorElements.map(el => el.textContent).join(", ");
    }""")
    if error_text:
        print(f"Found error message: {error_text}")
    else:
        print("No error messages found on the page")

    if logged_in:
        await page.goto(f"{BASE_URL}/pricing", wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)
        solo_cta_text = (await page.get_by_test_id("tier-cta-solo").inner_text(timeout=5000)).strip()
        family_cta_text = (await page.get_by_test_id("tier-cta-family").inner_text(timeout=5000)).strip()
        record("Logged-in pricing Solo CTA says Buy Solo", solo_cta_text == "Buy Solo", solo_cta_text)
        record("Logged-in pricing Family CTA says Buy Family", family_cta_text == "Buy Family", family_cta_text)

        await page.goto(f"{BASE_URL}/", wait_until="domcontentloaded")
        await page.wait_for_timeout(1500)
        landing_solo_cta = (await page.get_by_test_id("landing-tier-cta-solo").inner_text(timeout=5000)).strip()
        landing_family_cta = (await page.get_by_test_id("landing-tier-cta-family").inner_text(timeout=5000)).strip()
        record(
            "Logged-in homepage pricing-card CTAs do not say Start 7-day free trial",
            "Start 7-day free trial" not in landing_solo_cta and "Start 7-day free trial" not in landing_family_cta,
            f"solo={landing_solo_cta}, family={landing_family_cta}"
        )

    failed = [r for r in results if not r["ok"]]
    print(f"\nSUMMARY: {len(results) - len(failed)}/{len(results)} checks passed; failures={len(failed)}")
    for failure in failed:
        print(f"FAILED_CHECK: {failure['name']} -- {failure['details']}")

except Exception as exc:
    print(f"TEST_SCRIPT_EXCEPTION: {type(exc).__name__}: {exc}")
    # Get error messages using specific selectors
    error_text = await page.evaluate("""() => {
    const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
    return errorElements.map(el => el.textContent).join(", ");
    }""")
    if error_text:
        print(f"Found error message: {error_text}")
    else:
        print("No error messages found on the page")
    raise