"""Focused Playwright verification for participant cap copy bug.

Checks /app/participants as caregiver cathy@example.com:
- the removed phrase "Up to 10 per account" is absent
- no "Up to <number> per account" cap copy appears
- remaining pricing copy still renders
"""

async def run(page):
    import re

    try:
        await page.set_viewport_size({"width": 1920, "height": 1080})
        await page.goto("https://proration-preview.preview.emergentagent.com/login", wait_until="domcontentloaded")
        await page.evaluate("""() => { localStorage.clear(); sessionStorage.clear(); }""")
        await page.reload(wait_until="domcontentloaded")

        print("Step 1: login page loaded")
        await page.get_by_test_id("login-email-input").fill("cathy@example.com")
        await page.get_by_test_id("login-password-input").fill("testpass123")
        await page.get_by_test_id("login-submit-button").click()
        await page.wait_for_url("**/app**", timeout=20000)
        print(f"Step 2: caregiver login succeeded; url={page.url}")

        await page.goto("https://proration-preview.preview.emergentagent.com/app/participants", wait_until="domcontentloaded", timeout=20000)
        await page.get_by_role("heading", name=re.compile(r"Participants")).wait_for(timeout=15000)
        await page.locator("text=Family plan covers 2, additional participants are $24.50 per fortnight each.").first.wait_for(timeout=15000)
        await page.wait_for_timeout(1000)
        print("Step 3: participants page loaded")

        body_text = await page.locator("body").inner_text(timeout=10000)
        exact_removed = "Up to 10 per account" in body_text
        generic_cap = re.search(r"Up to\s+\d+\s+per account", body_text, re.I)
        pricing_copy = "Family plan covers 2, additional participants are $24.50 per fortnight each." in body_text

        print(f"Exact removed copy present? {exact_removed}")
        print(f"Generic cap copy match: {generic_cap.group(0) if generic_cap else 'none'}")
        print(f"Expected pricing copy present? {pricing_copy}")

        error_text = await page.evaluate("""() => {
        const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
        return errorElements.map(el => el.textContent).join(", ");
        }""")
        if error_text:
            print(f"Found error message: {error_text}")
        else:
            print("No error messages found on the page")

        assert not exact_removed, "Removed copy still appears: Up to 10 per account"
        assert generic_cap is None, f"Participant cap copy still appears: {generic_cap.group(0)}"
        assert pricing_copy, "Expected remaining pricing copy is missing"
        print("PASS: Participants cap copy removed and pricing copy preserved")
    except Exception as exc:
        print(f"FAIL: {exc}")
        raise