"""
CONV-1 Workstream A 'truth pass' verification (iter 418).
Tests signup/pricing/invoice-checker copy, /tools redirect, pacing retirement.
"""
import asyncio, os, sys, json
from playwright.async_api import async_playwright

BASE = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

CANON_TRIAL_FAMILY = "Free for 7 days, then A$49.50/fortnight (Family) unless cancelled. Card required at signup. Cancel any time from Settings → Billing."
CANON_TRIAL_SOLO = "Free for 7 days, then A$24.50/fortnight (Solo) unless cancelled. Card required at signup. Cancel any time from Settings → Billing."

results = {"tests": []}

def log(name, status, detail=""):
    print(f"[{status}] {name}: {detail}")
    results["tests"].append({"name": name, "status": status, "detail": detail})

async def dismiss_cookie(page):
    for sel in [
        'button:has-text("Only necessary")',
        'button:has-text("Accept all")',
        'button:has-text("Accept")',
        '[data-testid="cookie-accept"]',
        '[data-testid="cookie-reject"]',
    ]:
        try:
            el = await page.query_selector(sel)
            if el and await el.is_visible():
                await el.click(force=True)
                await page.wait_for_timeout(300)
                return
        except Exception:
            pass

async def test_signup(page):
    await page.goto(f"{BASE}/signup", wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)
    await dismiss_cookie(page)
    body = (await page.inner_text("body")).lower()

    # Solo card must NOT list Quarterly Pacing dashboard
    solo_card = await page.query_selector('[data-testid="signup-plan-solo"]')
    if solo_card:
        solo_txt = (await solo_card.inner_text()).lower()
        if "quarterly pacing" in solo_txt:
            log("signup.solo.no-quarterly-pacing", "FAIL", "Found 'quarterly pacing' in Solo card")
        else:
            log("signup.solo.no-quarterly-pacing", "PASS")
    else:
        log("signup.solo.card", "FAIL", "signup-plan-solo not found")

    # Click family plan to expand
    family = await page.query_selector('[data-testid="signup-plan-family"]')
    if family:
        await family.click(force=True)
        await page.wait_for_timeout(500)
        fam_txt = await family.inner_text()
        fl = fam_txt.lower()

        if "3 caregiver seats" in fl:
            log("signup.family.3seats", "PASS")
        else:
            log("signup.family.3seats", "FAIL", f"'3 Caregiver seats' not found. Family card excerpt: {fam_txt[:400]}")

        if "up to 5 caregiver" in fl or "5 caregiver seats" in fl:
            log("signup.family.no-5-seats", "FAIL", "Still mentions 5 seats")
        else:
            log("signup.family.no-5-seats", "PASS")

        if "within one business day" in fl:
            log("signup.family.within-one-business-day", "PASS")
        else:
            log("signup.family.within-one-business-day", "FAIL", "Missing 'within one business day'")

        if "same-day response" in fl or "same day response" in fl:
            log("signup.family.no-same-day", "FAIL", "Still says 'same-day response'")
        else:
            log("signup.family.no-same-day", "PASS")
    else:
        log("signup.family.card", "FAIL", "signup-plan-family not found")

    # Trial sentence (Family selected)
    page_text = await page.inner_text("body")
    if CANON_TRIAL_FAMILY in page_text:
        log("signup.trial.family-canonical", "PASS")
    else:
        # look for the sentence fragment
        idx = page_text.find("Free for 7 days")
        snippet = page_text[idx:idx+250] if idx >= 0 else "NOT FOUND"
        log("signup.trial.family-canonical", "FAIL", f"Expected exact string not found. Got: {snippet!r}")

    # Try selecting Solo plan and verify the trial sentence switches
    solo = await page.query_selector('[data-testid="signup-plan-solo"]')
    if solo:
        await solo.click(force=True)
        await page.wait_for_timeout(500)
        page_text = await page.inner_text("body")
        if CANON_TRIAL_SOLO in page_text:
            log("signup.trial.solo-canonical", "PASS")
        else:
            idx = page_text.find("Free for 7 days")
            snippet = page_text[idx:idx+250] if idx >= 0 else "NOT FOUND"
            log("signup.trial.solo-canonical", "FAIL", f"Expected solo sentence, got: {snippet!r}")

async def test_pricing(page):
    await page.goto(f"{BASE}/pricing", wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)
    await dismiss_cookie(page)
    # scroll to bottom
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    await page.wait_for_timeout(500)
    await page.evaluate("window.scrollTo(0, 0)")
    await page.wait_for_timeout(300)

    body = await page.inner_text("body")
    bl = body.lower()
    if "care plan amendment generator" in bl:
        log("pricing.no-care-plan-amendment", "FAIL", "Row 'Care Plan Amendment Generator' still present")
    else:
        log("pricing.no-care-plan-amendment", "PASS")

    if "referral program" in bl or "14-day extended trial" in bl:
        log("pricing.no-referral-program", "FAIL", "Referral program row still present")
    else:
        log("pricing.no-referral-program", "PASS")

    # Priority support row — Solo column must be a tick, not excluded
    rows = await page.query_selector_all("tr")
    checked = False
    for row in rows:
        txt = (await row.inner_text()).lower()
        if "priority support" in txt and "priority support, reply" not in txt:
            # Get the cells
            cells = await row.query_selector_all("td, th")
            if len(cells) >= 2:
                # Typically: label, solo, family
                # We examine the Solo cell (idx 1)
                solo_cell = cells[1]
                solo_html = await solo_cell.inner_html()
                solo_text = (await solo_cell.inner_text()).strip().lower()
                # Look for tick icon or 'yes' or absence of em-dash/no
                has_tick = ("check" in solo_html.lower() or "tick" in solo_html.lower()
                            or "✓" in solo_text or "yes" in solo_text or "included" in solo_text
                            or "lucide-check" in solo_html.lower())
                is_excluded = ("—" in solo_text or "not included" in solo_text or "no" == solo_text.strip()
                               or "x" == solo_text.strip() or "lucide-x" in solo_html.lower())
                log("pricing.priority-support.solo-row-found", "PASS",
                    f"solo cell text={solo_text!r} has_tick={has_tick} excluded={is_excluded}")
                if has_tick and not is_excluded:
                    log("pricing.priority-support.solo-included", "PASS")
                else:
                    log("pricing.priority-support.solo-included", "FAIL",
                        f"Solo cell does not clearly show included. text={solo_text!r} html={solo_html[:300]}")
                checked = True
                break
    if not checked:
        log("pricing.priority-support.row", "FAIL", "No 'Priority support' row found")

async def test_invoice_checker(page):
    await page.goto(f"{BASE}/ai-tools/invoice-checker", wait_until="domcontentloaded")
    await page.wait_for_timeout(2000)
    await dismiss_cookie(page)

    # Look at the sample output section
    sample = await page.query_selector('[data-testid="invoice-sample-output"]')
    if not sample:
        log("invoice.sample.section", "FAIL", "invoice-sample-output not present")
        return
    log("invoice.sample.section", "PASS")

    badge = await page.query_selector('[data-testid="invoice-sample-badge"]')
    if badge:
        btxt = await badge.inner_text()
        if "Sample check" in btxt and "not a real person" in btxt.lower():
            log("invoice.sample.badge", "PASS", btxt.strip())
        else:
            log("invoice.sample.badge", "FAIL", f"Unexpected badge text: {btxt!r}")
    else:
        log("invoice.sample.badge", "FAIL", "badge missing")

    # Ensure we're on overcharge tab
    oc_tab = await page.query_selector('[data-testid="invoice-sample-tab-overcharge"]')
    if oc_tab:
        await oc_tab.click(force=True)
        await page.wait_for_timeout(500)

    blurb = await page.query_selector('[data-testid="invoice-sample-blurb"]')
    if blurb:
        btxt = await blurb.inner_text()
        checks = [
            ("example October invoice", "example October invoice" in btxt),
            ("Blueberry Care is not a real provider", "Blueberry Care is not a real provider" in btxt),
            ("eleven findings, ten of them worth raising", "eleven findings, ten of them worth raising" in btxt),
        ]
        for name, ok in checks:
            log(f"invoice.sample.blurb.{name}", "PASS" if ok else "FAIL",
                "" if ok else f"blurb was: {btxt!r}")
    else:
        log("invoice.sample.blurb", "FAIL", "blurb missing")

    # Intro paragraph: 'example invoice' not 'real invoice'
    body = await page.inner_text("body")
    # Look for intro paragraph — anywhere above the sample
    if "real invoice" in body.lower():
        # find context
        idx = body.lower().find("real invoice")
        ctx = body[max(0, idx-80):idx+80]
        log("invoice.intro.no-real-invoice", "FAIL", f"Found 'real invoice' phrasing. Context: {ctx!r}")
    else:
        log("invoice.intro.no-real-invoice", "PASS")
    if "example invoice" in body.lower():
        log("invoice.intro.example-invoice", "PASS")
    else:
        log("invoice.intro.example-invoice", "FAIL", "'example invoice' not found in intro/body")

async def test_tools_redirect(page):
    # /tools -> /ai-tools
    await page.goto(f"{BASE}/tools", wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)
    url = page.url
    if "/ai-tools" in url:
        log("redirect.tools.root", "PASS", url)
    else:
        log("redirect.tools.root", "FAIL", f"URL after /tools: {url}")

    # /tools/statement-decoder -> /ai-tools
    await page.goto(f"{BASE}/tools/statement-decoder", wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)
    url = page.url
    if "/ai-tools" in url and "/login" not in url:
        log("redirect.tools.statement-decoder", "PASS", url)
    else:
        log("redirect.tools.statement-decoder", "FAIL", f"URL: {url}")

async def login(page, email, pw):
    await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
    await page.wait_for_timeout(1000)
    await dismiss_cookie(page)
    # try common test IDs
    for sel in ['[data-testid="login-email"]', 'input[type="email"]', 'input[name="email"]']:
        el = await page.query_selector(sel)
        if el:
            await el.fill(email)
            break
    for sel in ['[data-testid="login-password"]', 'input[type="password"]', 'input[name="password"]']:
        el = await page.query_selector(sel)
        if el:
            await el.fill(pw)
            break
    for sel in ['[data-testid="login-submit"]', '[data-testid="login-submit-btn"]', 'button[type="submit"]']:
        el = await page.query_selector(sel)
        if el:
            await el.click(force=True)
            break
    await page.wait_for_timeout(3500)

async def test_pacing_redirect(page):
    await login(page, "samburke@test.com", "CarTest123$")
    # Verify login worked
    if "/login" in page.url:
        log("login.sam", "FAIL", f"Still on login page: {page.url}")
        return
    log("login.sam", "PASS", page.url)

    await page.goto(f"{BASE}/app/pacing", wait_until="domcontentloaded")
    await page.wait_for_timeout(2500)
    url = page.url
    body = await page.inner_text("body")
    if "/app/pacing" not in url or "/app" in url and "pacing" not in url:
        pass
    if url.rstrip("/").endswith("/app") or ("/app" in url and "pacing" not in url):
        log("redirect.pacing", "PASS", url)
    else:
        if "quarterly pacing" in body.lower():
            log("redirect.pacing", "FAIL", f"Pacing screen rendered. URL={url}")
        else:
            log("redirect.pacing", "PASS", f"URL={url} (no quarterly pacing content)")

    # Check statement detail doesn't have the reconcile prompt
    # Navigate to statements list first
    await page.goto(f"{BASE}/app/statements", wait_until="domcontentloaded")
    await page.wait_for_timeout(2500)
    # click first statement link
    links = await page.query_selector_all('a[href*="/statements/"]')
    opened = False
    for link in links:
        href = await link.get_attribute("href")
        if href and "/statements/" in href and href.count("/") >= 3:
            try:
                await link.click(force=True)
                await page.wait_for_timeout(2500)
                opened = True
                break
            except Exception:
                continue
    if not opened:
        # try testid
        el = await page.query_selector('[data-testid^="statement-row"]')
        if el:
            await el.click(force=True)
            await page.wait_for_timeout(2500)
            opened = True
    if not opened:
        log("statement.detail.open", "SKIP", "No statement row found; cannot verify reconcile prompt")
        return

    reconcile = await page.query_selector('[data-testid="statement-reconcile-prompt"]')
    if reconcile:
        log("statement.detail.no-reconcile-prompt", "FAIL", "statement-reconcile-prompt element still present")
    else:
        log("statement.detail.no-reconcile-prompt", "PASS")

    body = await page.inner_text("body")
    if "reconcile this statement against quarterly pacing" in body.lower():
        log("statement.detail.no-reconcile-text", "FAIL", "Reconcile text still present")
    else:
        log("statement.detail.no-reconcile-text", "PASS")

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1920, "height": 1080})
        page = await ctx.new_page()
        page.on("pageerror", lambda e: print(f"PAGEERROR: {e}"))
        try:
            await test_signup(page)
        except Exception as e:
            log("test_signup", "FAIL", f"Exception: {e}")
        try:
            await test_pricing(page)
        except Exception as e:
            log("test_pricing", "FAIL", f"Exception: {e}")
        try:
            await test_invoice_checker(page)
        except Exception as e:
            log("test_invoice_checker", "FAIL", f"Exception: {e}")
        try:
            await test_tools_redirect(page)
        except Exception as e:
            log("test_tools_redirect", "FAIL", f"Exception: {e}")
        try:
            await test_pacing_redirect(page)
        except Exception as e:
            log("test_pacing_redirect", "FAIL", f"Exception: {e}")
        await browser.close()

    with open("/app/test_reports/iter418_results.json", "w") as f:
        json.dump(results, f, indent=2)
    passed = sum(1 for t in results["tests"] if t["status"] == "PASS")
    failed = sum(1 for t in results["tests"] if t["status"] == "FAIL")
    print(f"\n=== Summary: {passed} PASS, {failed} FAIL ===")

asyncio.run(main())
