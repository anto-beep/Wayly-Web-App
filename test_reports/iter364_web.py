"""iter364 - WEB signup verify-before-checkout flow + onboarding DateField test."""
import asyncio
import time
import re

BASE = "https://statement-renderer.preview.emergentagent.com"

async def _run(page):
    await page.set_viewport_size({"width": 1440, "height": 900})
    page.on("console", lambda m: print(f"[browser:{m.type}]", m.text[:300]) if m.type in ("error","warning") else None)
    results = {"steps": []}

    ts = int(time.time())
    email = f"TEST_iter364_{ts}@example.com"
    pwd = "TestPass!2026"

    # 1) go to /signup?plan=family
    await page.goto(f"{BASE}/signup?plan=family", wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)
    print("Navigated to signup page")

    # fill in form fields - look at Signup.jsx fields
    # First name, Last name, email, mobile, password
    try:
        # Fill via data-testid first; fall back to id/placeholder
        async def fill_testid(tid, val):
            el = page.locator(f'[data-testid="{tid}"]').first
            if await el.count() > 0:
                await el.fill(val)
                return True
            return False

        # Inspect what inputs are visible
        inputs = await page.locator("input").all()
        print(f"Found {len(inputs)} inputs")
        for i, inp in enumerate(inputs[:20]):
            name = await inp.get_attribute("name")
            tid = await inp.get_attribute("data-testid")
            ph = await inp.get_attribute("placeholder")
            typ = await inp.get_attribute("type")
            print(f"  input {i}: name={name} tid={tid} ph={ph} type={typ}")
    except Exception as e:
        print("Form inspection error:", e)

    # Fill using common names
    async def try_fill(selectors, val):
        for s in selectors:
            try:
                el = page.locator(s).first
                if await el.count() > 0:
                    await el.fill(val)
                    return True
            except Exception:
                continue
        return False

    await try_fill(['input[name="first_name"]', '[data-testid="signup-first-name"]'], "Test")
    await try_fill(['input[name="last_name"]', '[data-testid="signup-last-name"]'], "User")
    await try_fill(['input[type="email"]', 'input[name="email"]'], email)
    await try_fill(['input[name="mobile"]'], "0412345678")
    await try_fill(['input[name="password"]', 'input[type="password"]'], pwd)

    # Agree to terms if checkbox present
    try:
        tos = page.locator('input[type="checkbox"]').first
        if await tos.count() > 0 and not (await tos.is_checked()):
            await tos.check(force=True)
    except Exception:
        pass

    await page.wait_for_timeout(500)
    # submit
    submit = page.locator('[data-testid="signup-submit-button"]').first
    print(f"Submit button present: {await submit.count() > 0}")
    await submit.click(force=True)
    print("Submitted signup form")

    # wait for verify stage
    try:
        await page.wait_for_selector('[data-testid="signup-verify-stage"]', timeout=12000)
        print("PASS: signup-verify-stage appeared BEFORE checkout")
        results["verify_stage_appears"] = True
    except Exception as e:
        print("FAIL: signup-verify-stage did NOT appear:", e)
        results["verify_stage_appears"] = False
        html = await page.content()
        print("URL now:", page.url)
        # look for toast errors
        err_text = await page.evaluate("""() => {
            const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"], [role="status"]'));
            return errorElements.map(el => el.textContent).join(" | ");
        }""")
        print("errors:", err_text[:500])
        await page.screenshot(path="/app/test_reports/iter364_web_signup_fail.jpeg", quality=40, full_page=False)
        return results

    # 2) verify the code input renders and no "Preview code" text
    code_input = page.locator('[data-testid="email-code-verify"]').first
    results["email_code_verify_visible"] = await code_input.is_visible()
    digit0 = page.locator('[data-testid="code-digit-0"]').first
    results["code_digit_0_visible"] = await digit0.is_visible()

    page_text = await page.locator("body").inner_text()
    results["preview_code_leak_present"] = ("Preview code" in page_text)
    print("preview_code_leak_present:", results["preview_code_leak_present"])
    print("email_code_verify_visible:", results["email_code_verify_visible"], "code_digit_0_visible:", results["code_digit_0_visible"])

    await page.screenshot(path="/app/test_reports/iter364_web_verify_stage.jpeg", quality=40, full_page=False)

    # 3) Get the verification code via API
    # Need a token to call /api/auth/verification-status. Grab from localStorage.
    token = await page.evaluate("() => localStorage.getItem('wayly_token') || localStorage.getItem('token') || null")
    print("token present:", bool(token))

    # Try verification-status
    debug_code = None
    if token:
        import requests
        r = requests.get(f"{BASE}/api/auth/verification-status", headers={"Authorization": f"Bearer {token}"})
        print("verification-status:", r.status_code, r.text[:200])
        try:
            debug_code = r.json().get("debug_code")
        except Exception:
            pass

    # Try VERIFY path if we have code
    if debug_code:
        print(f"debug_code from server: {debug_code}")
        for i, d in enumerate(str(debug_code)):
            await page.locator(f'[data-testid="code-digit-{i}"]').first.fill(d)
            await page.wait_for_timeout(100)
        await page.wait_for_timeout(2500)
        # verification likely triggers onVerified -> proceedToCheckout -> Stripe redirect
        print("URL after code entry:", page.url)
        results["verify_url_after"] = page.url
        results["verify_redirect_to_stripe"] = "checkout.stripe.com" in page.url
    else:
        # fallback: enter wrong code and check error
        for i in range(6):
            await page.locator(f'[data-testid="code-digit-{i}"]').first.fill("0")
            await page.wait_for_timeout(80)
        await page.wait_for_timeout(2000)
        err = page.locator('[data-testid="code-error"]').first
        results["wrong_code_error_present"] = await err.count() > 0 and await err.is_visible()
        print("wrong_code_error_present:", results["wrong_code_error_present"])

    # 4) Test SKIP path by making a FRESH signup (because we may have already consumed)
    ts2 = int(time.time()) + 1
    email2 = f"TEST_iter364_skip_{ts2}@example.com"
    await page.goto(f"{BASE}/signup?plan=solo", wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)
    await try_fill(['input[name="first_name"]'], "Skip")
    await try_fill(['input[name="last_name"]'], "Tester")
    await try_fill(['input[type="email"]'], email2)
    await try_fill(['input[name="mobile"]'], "0412345679")
    await try_fill(['input[name="password"]'], pwd)
    try:
        tos = page.locator('input[type="checkbox"]').first
        if await tos.count() > 0 and not (await tos.is_checked()):
            await tos.check(force=True)
    except Exception:
        pass
    await page.locator('[data-testid="signup-submit-button"]').first.click(force=True)
    try:
        await page.wait_for_selector('[data-testid="signup-verify-skip"]', timeout=12000)
        print("Skip button appeared")
    except Exception as e:
        print("Skip button did not appear:", e)
        results["skip_button_visible"] = False
        return results
    results["skip_button_visible"] = True

    # click skip
    nav_promise = page.wait_for_url("**checkout.stripe.com**", timeout=15000)
    await page.locator('[data-testid="signup-verify-skip"]').first.click(force=True)
    try:
        await nav_promise
        results["skip_redirects_to_stripe"] = True
        print("PASS: skip redirects to Stripe:", page.url)
    except Exception as e:
        print("Skip did not redirect to stripe:", e, "current:", page.url)
        results["skip_redirects_to_stripe"] = False
        results["skip_final_url"] = page.url

    # 5) Onboarding DateField — this requires being logged in; just load /app or /onboarding
    # The signup flow completes with Stripe. Instead log in as cathy and visit onboarding (if accessible)
    # Skip - DateField/calendar on onboarding is more complex to reach here. We'll do a dedicated check.
    import json
    with open("/app/test_reports/iter364_web_results.json","w") as fp:
        json.dump(results, fp, indent=2)
    print("RESULTS:", results)

await _run(page)
