
# Focused Playwright verification for PRICING-UI-1 v11 bug (iteration 142) - retry with domcontentloaded waits.
base_url = "https://wayly-rn-build.preview.emergentagent.com"
expected_subline = "7-day free trial · Cancel anytime · AUD inc. GST"
results = []

def record(name, passed, detail=""):
    results.append({"name": name, "passed": bool(passed), "detail": detail})
    print(("PASS" if passed else "FAIL") + f" - {name}: {detail}")

async def go(path):
    await page.goto(base_url + path, wait_until="domcontentloaded", timeout=20000)
    await page.wait_for_load_state("load", timeout=20000)
    await page.wait_for_timeout(800)

try:
    await page.set_viewport_size({"width": 1920, "height": 1080})
    await go("/pricing")
    await page.evaluate("localStorage.clear(); sessionStorage.clear();")
    await go("/pricing")
    pricing_text = await page.locator("body").inner_text(timeout=10000)
    record("guest /pricing has no Billed monthly", "Billed monthly" not in pricing_text)
    record("guest /pricing Solo subline present", expected_subline in await page.get_by_test_id("tier-solo").inner_text())
    record("guest /pricing Family subline present", expected_subline in await page.get_by_test_id("tier-family").inner_text())
    record("guest /pricing no $19/month or $19 per month", "$19/month" not in pricing_text and "$19 per month" not in pricing_text)
    record("guest /pricing additional participant copy uses $24.50 per fortnight", "$24.50 per fortnight" in pricing_text and "additional participants" in pricing_text.lower())
    adviser_row = page.locator("tr", has_text="Adviser-branded PDF reports").first
    await adviser_row.scroll_into_view_if_needed()
    yes_count = await adviser_row.locator('td svg[aria-label="Yes"], td [aria-label="Yes"]').count()
    row_text = await adviser_row.inner_text()
    record("/pricing Adviser-branded PDF row has no checkmarks in Solo/Family", yes_count == 0, f"yes_count={yes_count}; row_text={row_text!r}")

    await go("/")
    home_text = await page.locator("body").inner_text(timeout=10000)
    record("guest homepage has no Billed monthly", "Billed monthly" not in home_text)
    record("guest homepage Solo subline present", expected_subline in await page.get_by_test_id("landing-tier-solo").inner_text())
    record("guest homepage Family subline present", expected_subline in await page.get_by_test_id("landing-tier-family").inner_text())

    await go("/login")
    await page.get_by_test_id("login-email-input").fill("cathy@example.com")
    await page.get_by_test_id("login-password-input").fill("testpass123")
    await page.get_by_test_id("login-submit-button").click()
    await page.wait_for_url(lambda url: "/login" not in url, timeout=20000)
    record("Cathy login navigated away from /login", "/login" not in page.url, page.url)

    await go("/")
    await page.get_by_test_id("landing-tier-cta-solo").scroll_into_view_if_needed()
    solo_cta = page.get_by_test_id("landing-tier-cta-solo")
    family_cta = page.get_by_test_id("landing-tier-cta-family")
    solo_text = (await solo_cta.inner_text()).strip()
    family_text = (await family_cta.inner_text()).strip()
    record("logged-in homepage Solo CTA is Buy Solo", solo_text == "Buy Solo", solo_text)
    record("logged-in homepage Family CTA is Buy Family", family_text == "Buy Family", family_text)
    record("logged-in homepage tier CTAs do not say Start 7-day free trial", solo_text != "Start 7-day free trial" and family_text != "Start 7-day free trial", f"solo={solo_text}, family={family_text}")

    await solo_cta.click()
    await page.wait_for_url(lambda url: "/pricing" in url, timeout=10000)
    record("clicking logged-in Solo homepage CTA navigates to /pricing", "/pricing" in page.url, page.url)
    await go("/")
    await page.get_by_test_id("landing-tier-cta-family").scroll_into_view_if_needed()
    await page.get_by_test_id("landing-tier-cta-family").click()
    await page.wait_for_url(lambda url: "/pricing" in url, timeout=10000)
    record("clicking logged-in Family homepage CTA navigates to /pricing", "/pricing" in page.url, page.url)

    await go("/pricing")
    pricing_solo_cta = (await page.get_by_test_id("tier-cta-solo").inner_text()).strip()
    pricing_family_cta = (await page.get_by_test_id("tier-cta-family").inner_text()).strip()
    record("logged-in /pricing Solo CTA is Buy Solo", pricing_solo_cta == "Buy Solo", pricing_solo_cta)
    record("logged-in /pricing Family CTA is Buy Family", pricing_family_cta == "Buy Family", pricing_family_cta)
    pricing_logged_text = await page.locator("body").inner_text(timeout=10000)
    record("logged-in /pricing still has no Billed monthly", "Billed monthly" not in pricing_logged_text)

    error_text = await page.evaluate("""() => {
    const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
    return errorElements.map(el => el.textContent).join(", ");
    }""")
    if error_text:
        print(f"Found error message: {error_text}")
    else:
        print("No error messages found on the page")

    failures = [r for r in results if not r["passed"]]
    if failures:
        raise AssertionError(f"{len(failures)} focused UI assertions failed: {failures}")
    print("ALL FOCUSED UI ASSERTIONS PASSED")
except Exception as e:
    print(f"TEST FAILURE: {type(e).__name__}: {e}")
    await page.screenshot(path="/app/test_reports/pricing_ui_bug_iter142_failure_retry.jpeg", quality=40, full_page=False)
    raise
