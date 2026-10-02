"""iter358 dark-mode re-verification. Runs inside async function with `page`."""
import asyncio, json, os

BASE = "https://statement-renderer.preview.emergentagent.com"
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYmFmOWNlYi05YmUzLTRjOWItYjFkNi1iY2ZlNGUxM2Q4NTIiLCJpYXQiOjE3OTA3NzEwMjQsImV4cCI6MTc5MDc3NDYyNCwidHlwZSI6ImFjY2VzcyIsImp0aSI6InJWTzNLNEJ3S0QzcnFFalJkYW8zaWcifQ.30WUhX91Hf7Xz64aWmhi9USxgoi_joAaXBk5yPRVKUU"
REFRESH = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYmFmOWNlYi05YmUzLTRjOWItYjFkNi1iY2ZlNGUxM2Q4NTIiLCJpYXQiOjE3OTA3NzEwMjQsImV4cCI6MTc5MzM2MzAyNCwidHlwZSI6InJlZnJlc2giLCJqdGkiOiJQOWlVeG1hM2dKWXpOU3FHdm1qUHh3In0.fnnQSJf2KQv9Susd86uM7ghCI0T5xUAlIKu7Cf-TO9c"
ENTRY_ID = "Y1RQZQEOLn2O0Qm_"

findings = {"dark": {}, "light": {}, "scale_detail": {}, "correspondence": {}}


async def rgb_of(sel):
    try:
        return await page.evaluate(
            """(s) => {
                const el = document.querySelector(s);
                if (!el) return null;
                const cs = getComputedStyle(el);
                return {bg: cs.backgroundColor, color: cs.color, bgImage: cs.backgroundImage, text: (el.innerText||'').slice(0,120)};
            }""", sel)
    except Exception as e:
        return {"error": str(e)}


async def label_of(sel):
    return await page.evaluate(
        """(s) => { const el = document.querySelector(s); return el ? (el.innerText||'').trim() : null; }""", sel)


page.on("console", lambda msg: None)  # silence


async def seed_auth(dark: bool):
    """Set localStorage BEFORE any nav (visit domain first)."""
    await page.goto(f"{BASE}/", wait_until="domcontentloaded")
    await page.evaluate(
        """(a) => {
            localStorage.setItem('kindred_token', a.token);
            if (a.refresh) localStorage.setItem('kindred_refresh_token', a.refresh);
            localStorage.setItem('wayly:app:appearance', a.dark ? 'dark' : 'light');
        }""",
        {"token": TOKEN, "refresh": REFRESH, "dark": dark})


async def check_theme(expected_dark: bool):
    cls = await page.evaluate("() => document.documentElement.className")
    print(f"    <html class>: {cls}  expected_dark={expected_dark}")
    return ("theme-dark" in cls) == expected_dark


async def run_price_checker(mode: str):
    print(f"\n=== Price Checker ({mode}) ===")
    await page.goto(f"{BASE}/ai-tools/provider-price-checker", wait_until="domcontentloaded")
    await page.wait_for_timeout(2500)
    # Fill form: choose service, rate, provider
    try:
        # First select is the service dropdown
        selects = await page.query_selector_all("select")
        if selects:
            await selects[0].select_option(label="Personal care")
            print("    selected: Personal care")
        # Rate input — find by role or by placeholder
        rate_input = await page.query_selector('input[type="number"], input[data-testid="pc-rate-input"]')
        if not rate_input:
            # try any numeric input
            inputs = await page.query_selector_all("input")
            for inp in inputs:
                t = await inp.get_attribute("type") or ""
                if t in ("number", "text"):
                    ph = (await inp.get_attribute("placeholder") or "").lower()
                    if "rate" in ph or "price" in ph or "hour" in ph or t == "number":
                        rate_input = inp
                        break
        if rate_input:
            await rate_input.fill("250")
            print("    rate=250")
        # Provider input
        prov_inputs = await page.query_selector_all('input[type="text"]')
        for inp in prov_inputs:
            ph = (await inp.get_attribute("placeholder") or "").lower()
            if "provider" in ph or "name" in ph:
                await inp.fill("Test Provider")
                print("    provider=Test Provider")
                break
        # Submit
        submit = await page.query_selector('button[type="submit"], [data-testid="pc-submit"], [data-testid="pc-check"]')
        if not submit:
            btns = await page.query_selector_all("button")
            for b in btns:
                t = (await b.inner_text()).lower()
                if "check" in t or "compare" in t:
                    submit = b
                    break
        if submit:
            await submit.click(force=True)
            print("    submitted")
        await page.wait_for_timeout(2500)
        # Dismiss guard
        guard = await page.query_selector('[data-testid="pc-guard-continue"]')
        if guard:
            await guard.click(force=True)
            print("    guard dismissed")
            await page.wait_for_timeout(2000)
    except Exception as e:
        print(f"    fill error: {e}")

    # Wait for result
    try:
        await page.wait_for_selector('[data-testid="pc-stat-charged"]', timeout=8000)
        print("    result loaded")
    except Exception:
        print("    result did NOT load")
        return

    data = {}
    for sel in [
        '[data-testid="pc-stat-charged"]',
        '[data-testid="pc-your-share"]',
        '[data-testid="pc-range"]',
        '[data-testid="pc-range-unavailable"]',
        '[data-testid="pc-save-check"]',
        '[data-testid="pc-pdf-export"]',
        '[data-testid="pc-open-email"]',
        '[data-testid="pc-compare-bars"] .dm-bar-track',
        '.pc-num-hl',
        '[data-testid="pc-position"]',
    ]:
        data[sel] = await rgb_of(sel)
        print(f"    {sel}: {data[sel]}")
    findings[mode]["price_checker"] = data
    await page.screenshot(path=f"/app/test_reports/iter358_dark/{mode}_pc.jpeg", quality=40, full_page=False)


async def csc_wizard_complete():
    """Answer 16 questions - pick 'significant'/'often'/high options for higher classification."""
    # We iterate 5 steps of CSC_STEPS by clicking any first available option per question
    # Actually simpler: for each visible csc-q-*-<value>, click 'significant' if present else the last option
    max_steps = 6
    for step_i in range(max_steps):
        # find all questions on current step
        await page.wait_for_timeout(800)
        qids = await page.evaluate("""() => {
            const nodes = document.querySelectorAll('[data-testid^="csc-q-"]');
            const ids = new Set();
            nodes.forEach(n => {
                const t = n.getAttribute('data-testid');
                const m = t.match(/^csc-q-([^\\-]+(?:_[^\\-]+)*?)(?:-(.+))?$/);
                if (m && !t.endsWith('-anchor')) ids.add(m[1]);
            });
            return Array.from(ids);
        }""")
        # Actually simpler: pick all csc-q-{id} containers - top-level ones (without option suffix)
        top_qs = await page.evaluate("""() => {
            const els = Array.from(document.querySelectorAll('[data-testid^="csc-q-"]'));
            return els
              .filter(el => {
                const t = el.getAttribute('data-testid');
                // parent question wrapper — contains multiple children
                return el.tagName === 'DIV' && !t.endsWith('-anchor') && el.querySelector('button');
              })
              .map(el => el.getAttribute('data-testid'));
        }""")
        print(f"  step {step_i}: {len(top_qs)} questions")
        if not top_qs:
            # Maybe already at result?
            done = await page.query_selector('[data-testid="csc-result-header"]')
            if done:
                print("  reached results")
                return True
        for qtid in top_qs:
            # find option buttons under this q
            opts = await page.query_selector_all(f'[data-testid="{qtid}"] button[data-testid^="{qtid}-"]')
            if not opts:
                continue
            # pick preferred - look for 'significant' / 'often' / 'a_lot' / 'more_than_three' / 'full_time'
            preferred = ["significant", "often", "a_lot", "more_than_three", "full_time"]
            chosen = None
            for opt in opts:
                tid = await opt.get_attribute("data-testid") or ""
                for p in preferred:
                    if tid.endswith(f"-{p}"):
                        chosen = opt
                        break
                if chosen:
                    break
            if not chosen:
                # pick middle option (index 2 of 5, or last-1)
                chosen = opts[min(2, len(opts) - 1)]
            try:
                await chosen.click(force=True)
            except Exception as e:
                print(f"    click err {qtid}: {e}")
        await page.wait_for_timeout(500)
        # Click Next or Submit
        submit_btn = await page.query_selector('[data-testid="csc-submit"]')
        if submit_btn:
            try:
                await submit_btn.click(force=True)
                print("  clicked submit")
                await page.wait_for_timeout(3500)
                done = await page.query_selector('[data-testid="csc-result-header"]')
                if done:
                    return True
            except Exception as e:
                print(f"  submit err: {e}")
        next_btn = await page.query_selector('[data-testid="csc-wizard-next"]')
        if next_btn:
            try:
                is_disabled = await next_btn.is_disabled()
                if is_disabled:
                    print(f"  next disabled at step {step_i}")
                await next_btn.click(force=True)
                await page.wait_for_timeout(700)
            except Exception as e:
                print(f"  next err: {e}")
    # Final check
    done = await page.query_selector('[data-testid="csc-result-header"]')
    return bool(done)


async def run_csc(mode: str):
    print(f"\n=== CSC ({mode}) ===")
    await page.goto(f"{BASE}/ai-tools/classification-self-check", wait_until="domcontentloaded")
    await page.wait_for_timeout(2500)
    ok = await csc_wizard_complete()
    if not ok:
        print("    CSC wizard did NOT reach result")
        return
    print("    at CSC results")
    data = {}
    for sel in [
        '[data-testid="csc-comparison"]',
        '[data-testid="csc-drivers"]',
        '[data-testid="csc-result-header"]',
        '[data-testid="csc-band-scale"]',
        '[data-testid="csc-scale-hint"]',
    ]:
        data[sel] = await rgb_of(sel)
        print(f"    {sel}: {data[sel]}")
    # Comparison bar rows and inner bar fill colours
    bar_data = await page.evaluate("""() => {
        const rows = Array.from(document.querySelectorAll('[data-testid^="csc-comparison-row-"]'));
        return rows.map(row => {
            const tid = row.getAttribute('data-testid');
            const rowCs = getComputedStyle(row);
            const fill = row.querySelector('[style*="width"]');
            const fillCs = fill ? getComputedStyle(fill) : null;
            return {tid, rowBg: rowCs.backgroundColor, fillBg: fillCs && fillCs.backgroundColor, fillW: fill && fill.style.width};
        });
    }""")
    data["comparison_rows"] = bar_data
    for r in bar_data:
        print(f"    {r}")
    findings[mode]["csc"] = data

    # Test scale click reveals detail
    print("    clicking csc-scale-3...")
    sc3 = await page.query_selector('[data-testid="csc-scale-3"]')
    if sc3:
        await sc3.click(force=True)
        await page.wait_for_timeout(600)
        panel = await page.query_selector('[data-testid="csc-scale-detail"]')
        if panel:
            txt = await panel.inner_text()
            print(f"    scale-3 panel visible: {txt[:200]}")
            findings["scale_detail"][mode + "_scale3"] = {"visible": True, "text": txt[:300]}
        else:
            print("    scale-3 panel NOT visible")
            findings["scale_detail"][mode + "_scale3"] = {"visible": False}
        # Click again to hide
        await sc3.click(force=True)
        await page.wait_for_timeout(400)
        panel2 = await page.query_selector('[data-testid="csc-scale-detail"]')
        hidden = panel2 is None
        print(f"    scale-3 click again hides: {hidden}")
        findings["scale_detail"][mode + "_toggle_hide"] = hidden
        # Click scale-6 then close via close btn
        sc6 = await page.query_selector('[data-testid="csc-scale-6"]')
        if sc6:
            await sc6.click(force=True)
            await page.wait_for_timeout(400)
            panel3 = await page.query_selector('[data-testid="csc-scale-detail"]')
            if panel3:
                txt3 = await panel3.inner_text()
                print(f"    scale-6 panel: {txt3[:200]}")
                findings["scale_detail"][mode + "_scale6_text"] = txt3[:300]
                close = await page.query_selector('[data-testid="csc-scale-detail-close"]')
                if close:
                    await close.click(force=True)
                    await page.wait_for_timeout(400)
                    panel4 = await page.query_selector('[data-testid="csc-scale-detail"]')
                    findings["scale_detail"][mode + "_close_hides"] = panel4 is None
                    print(f"    close hides: {panel4 is None}")
    else:
        print("    csc-scale-3 NOT found")
    await page.screenshot(path=f"/app/test_reports/iter358_dark/{mode}_csc.jpeg", quality=40, full_page=False)


async def run_correspondence(mode: str):
    print(f"\n=== Correspondence ({mode}) entry={ENTRY_ID} ===")
    if not ENTRY_ID:
        print("    no entry id")
        return
    await page.goto(f"{BASE}/tools/letters-and-follow-ups/{ENTRY_ID}", wait_until="domcontentloaded")
    await page.wait_for_timeout(3500)
    btn = await page.query_selector('[data-testid="lf1-detail-save-draft"]')
    if not btn:
        # try scrolling and waiting more
        await page.wait_for_timeout(3000)
        btn = await page.query_selector('[data-testid="lf1-detail-save-draft"]')
    if btn:
        style = await rgb_of('[data-testid="lf1-detail-save-draft"]')
        label = (await btn.inner_text()).strip()
        print(f"    button label: '{label}'  style={style}")
        findings["correspondence"][mode] = {"label": label, "style": style}
    else:
        print("    lf1-detail-save-draft NOT found")
        findings["correspondence"][mode] = {"error": "button not found"}
    await page.screenshot(path=f"/app/test_reports/iter358_dark/{mode}_lf.jpeg", quality=40, full_page=False)


# ---- MAIN ----
await page.set_viewport_size({"width": 1440, "height": 900})

# DARK MODE
print("\n########## DARK MODE ##########")
await seed_auth(dark=True)
await page.reload(wait_until="domcontentloaded")
await page.wait_for_timeout(1500)
await check_theme(True)
await run_price_checker("dark")
await run_csc("dark")
await run_correspondence("dark")

# LIGHT MODE regression
print("\n########## LIGHT MODE ##########")
await seed_auth(dark=False)
await page.reload(wait_until="domcontentloaded")
await page.wait_for_timeout(1500)
await check_theme(False)
await run_price_checker("light")
await run_csc("light")
await run_correspondence("light")

# Write findings
with open("/app/test_reports/iter358_dark/findings.json", "w") as f:
    json.dump(findings, f, indent=2, default=str)
print("\n=== DONE — findings.json written ===")
