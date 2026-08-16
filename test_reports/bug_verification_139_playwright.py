"""Focused Playwright verification for iteration 139 Stripe pricing checkout bug.

This file mirrors the script executed through the browser automation harness.
It intentionally does not submit any card details or complete Stripe Checkout.
"""

import json

BASE_URL = "https://mobile-parity-sweep.preview.emergentagent.com"

async def run(page):
    await page.set_viewport_size({"width": 1920, "height": 1080})
    results = []

    def record(name, ok, detail=""):
        status = "PASS" if ok else "FAIL"
        print(f"{status}: {name} {detail}")
        results.append({"name": name, "ok": ok, "detail": detail})

    async def report_page_errors():
        # Get error messages using specific selectors
        error_text = await page.evaluate("""() => {
        const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
        return errorElements.map(el => el.textContent).join(", ");
        }""")
        if error_text:
            print(f"Found error message: {error_text}")
        else:
            print("No error messages found on the page")

    async def login_cathy():
        await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
        await page.evaluate("localStorage.clear()")
        await page.reload(wait_until="domcontentloaded")
        await page.get_by_test_id("login-email-input").fill("cathy@example.com")
        await page.get_by_test_id("login-password-input").fill("testpass123")
        async with page.expect_response(lambda r: "/api/auth/login" in r.url and r.request.method == "POST", timeout=30000) as resp_info:
            await page.get_by_test_id("login-submit-button").click()
        resp = await resp_info.value
        body = await resp.json()
        assert resp.status == 200, f"login status {resp.status}, body={body}"
        await page.wait_for_url(lambda url: "/app" in url or "/participant" in url or "/adviser" in url, timeout=30000)
        record("Cathy login", True, f"status={resp.status}, url={page.url}")

    async def assert_checkout(plan, expected_plan_text):
        await page.goto(f"{BASE_URL}/pricing", wait_until="domcontentloaded")
        await page.get_by_test_id(f"tier-cta-{plan}").wait_for(timeout=30000)
        captured = {}

        async def checkout_route(route):
            request = route.request
            response = await route.fetch()
            body_text = await response.text()
            if request.method == "POST" and "/api/payments/checkout" in request.url:
                try:
                    captured["data"] = json.loads(body_text)
                except Exception:
                    captured["data"] = {"raw": body_text}
                captured["status"] = response.status
                captured["request_url"] = request.url
                captured["request_body"] = request.post_data
            await route.fulfill(response=response, body=body_text)

        await page.route("**/api/payments/checkout", checkout_route)
        await page.get_by_test_id(f"tier-cta-{plan}").click()
        for _ in range(120):
            if captured.get("status"):
                break
            await page.wait_for_timeout(250)
        await page.unroute("**/api/payments/checkout", checkout_route)
        data = captured.get("data") or {}
        checkout_url = data.get("url")
        assert captured.get("status") == 200, f"{plan} checkout status {captured.get('status')}, body={data}"
        assert isinstance(checkout_url, str) and checkout_url.startswith("https://checkout.stripe.com/"), f"bad url: {checkout_url}"
        assert f'"plan":"{plan}"' in (captured.get("request_body") or "").replace(" ", ""), f"request body did not include plan {plan}: {captured.get('request_body')}"
        record(f"{plan} checkout API", True, f"status={captured.get('status')}, session_id={data.get('session_id')}, url_prefix={checkout_url[:35]}")
        await page.wait_for_url("https://checkout.stripe.com/**", timeout=60000)
        assert page.url.startswith("https://checkout.stripe.com/"), f"did not land on Stripe: {page.url}"
        record(f"{plan} browser redirect", True, page.url[:80])
        await page.wait_for_load_state("domcontentloaded", timeout=30000)
        await page.wait_for_function(
            "([planText]) => document.body && document.body.innerText.includes(planText)",
            arg=[expected_plan_text],
            timeout=45000,
        )
        body_text = await page.locator("body").inner_text(timeout=10000)
        assert expected_plan_text in body_text, f"missing plan text {expected_plan_text}"
        assert "days free" in body_text.lower(), "missing trial text 'days free'"
        record(f"{plan} Stripe content", True, f"contains {expected_plan_text!r} and 'days free'")

    async def assert_adviser_in_app():
        checkout_calls = []
        def on_response(resp):
            if "/api/payments/checkout" in resp.url:
                checkout_calls.append(resp.url)
        page.on("response", on_response)
        await page.goto(f"{BASE_URL}/pricing", wait_until="domcontentloaded")
        await page.get_by_test_id("tier-cta-adviser").wait_for(timeout=30000)
        await page.get_by_test_id("tier-cta-adviser").click()
        await page.wait_for_url("**/contact?intent=adviser", timeout=30000)
        assert page.url.startswith(f"{BASE_URL}/contact?intent=adviser"), f"bad adviser URL: {page.url}"
        assert not checkout_calls, f"adviser unexpectedly called checkout: {checkout_calls}"
        record("Adviser CTA", True, page.url)

    async def assert_guest_solo_signup_gate():
        await page.goto(f"{BASE_URL}/pricing", wait_until="domcontentloaded")
        await page.evaluate("localStorage.clear()")
        await page.reload(wait_until="domcontentloaded")
        checkout_calls = []
        def on_response(resp):
            if "/api/payments/checkout" in resp.url:
                checkout_calls.append(resp.url)
        page.on("response", on_response)
        await page.get_by_test_id("tier-cta-solo").wait_for(timeout=30000)
        await page.get_by_test_id("tier-cta-solo").click()
        await page.wait_for_url("**/signup?plan=solo", timeout=30000)
        assert page.url.startswith(f"{BASE_URL}/signup?plan=solo"), f"bad guest URL: {page.url}"
        assert not checkout_calls, f"guest unexpectedly called checkout: {checkout_calls}"
        record("Guest Solo signup gate", True, page.url)

    try:
        await login_cathy()
        await assert_checkout("solo", "Wayly Solo")
        await assert_checkout("family", "Wayly Family")
        await assert_adviser_in_app()
        await assert_guest_solo_signup_gate()
        await report_page_errors()
        failures = [r for r in results if not r["ok"]]
        if failures:
            raise AssertionError(f"Failures: {failures}")
        print("BUG_VERIFICATION_139_RESULT: PASS")
    except Exception as exc:
        print(f"BUG_VERIFICATION_139_RESULT: FAIL: {exc}")
        try:
            await page.screenshot(path="/app/test_reports/bug_verification_139_failure.jpeg", quality=40, full_page=False)
        except Exception:
            pass
        raise
