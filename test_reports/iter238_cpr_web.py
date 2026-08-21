import asyncio
import json
import os

FIXTURE = "/app/tests/fixtures/CPR-ERR-A-golden-v1/robert_henderson_q1_2027.txt"

async def _run(page):
    page.on("console", lambda msg: print(f"CONSOLE[{msg.type}]: {msg.text}"))
    page.on("pageerror", lambda err: print(f"PAGEERROR: {err}"))

    with open(FIXTURE) as f:
        fixture_text = f.read()

    await page.set_viewport_size({"width": 1440, "height": 900})

    base = os.environ.get("REACT_APP_BACKEND_URL", "https://statement-checker-3.preview.emergentagent.com").rstrip("/")

    # 1) LOGIN
    print("== login")
    await page.goto(f"{base}/login", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    await page.fill('input[type="email"]', "cathy@example.com")
    await page.fill('input[type="password"]', "testpass123")
    await page.get_by_role("button", name="Log in").click()
    await page.wait_for_timeout(3500)
    print("post-login url:", page.url)

    # 2) Go to Care Plan Reviewer
    await page.goto(f"{base}/ai-tools/care-plan-reviewer", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    await page.wait_for_timeout(1500)

    # If a paywall renders, capture and abort
    body_txt = (await page.evaluate("document.body.innerText")).lower()
    if "upgrade" in body_txt and "paywall" in body_txt:
        print("PAYWALL detected — will still try to interact")

    # 3) Fill textarea + classification + budget
    try:
        await page.wait_for_selector('[data-testid="cp-text"]', timeout=10000)
    except Exception as e:
        await page.screenshot(path="/app/test_reports/iter238_cpr_web_notool.jpeg", quality=40, full_page=False)
        print("cp-text not found:", e)
        return

    await page.fill('[data-testid="cp-text"]', fixture_text)
    await page.select_option('[data-testid="cp-classification"]', "5")
    await page.fill('[data-testid="cp-quarterly-budget"]', "9924.25")
    await page.screenshot(path="/app/test_reports/iter238_cpr_web_pre.jpeg", quality=40, full_page=False)

    # 4) Submit
    await page.click('[data-testid="cp-submit"]', force=True)
    print("submitted; waiting for cp-verification-panel or cp-file-findings")

    # 5) Wait for verification panel or fallback findings (LLM up to ~90s)
    got_panel = False
    got_findings = False
    for i in range(24):  # ~120s
        await page.wait_for_timeout(5000)
        got_panel = await page.is_visible('[data-testid="cp-verification-panel"]')
        got_findings = await page.is_visible('[data-testid="cp-file-findings"], [data-testid="cp-findings"]')
        loading_vis = await page.is_visible('[data-testid="cp-progress"]')
        print(f"tick {i}: panel={got_panel} findings={got_findings} loading={loading_vis}")
        if got_panel or (got_findings and not loading_vis):
            break

    await page.screenshot(path="/app/test_reports/iter238_cpr_web_result.jpeg", quality=40, full_page=False)

    if not got_panel:
        html = await page.content()
        print("NO cp-verification-panel found; page url:", page.url)
        # dump partial html
        with open("/app/test_reports/iter238_cpr_web_page.html","w") as f:
            f.write(html[:200000])
        return

    # 6) Enumerate the panel checks
    checks = await page.evaluate("""() => {
        const panel = document.querySelector('[data-testid=\"cp-verification-panel\"]');
        if (!panel) return null;
        const items = Array.from(panel.querySelectorAll('[data-testid^=\"cp-check-\"]'));
        return items.map(li => ({
          testid: li.getAttribute('data-testid'),
          text: li.innerText.trim()
        }));
    }""")
    print("panel checks count:", len(checks or []))
    for c in checks or []:
        print(" -", c["testid"], "|", c["text"][:180].replace("\\n"," | "))

    expected = [
        "cp-check-care_management_fee",
        "cp-check-at_hm_ring_fence",
        "cp-check-personal_care_placement",
        "cp-check-rollover_cap",
        "cp-check-quarterly_budget_vs_classification",
    ]
    found_ids = {c["testid"] for c in (checks or [])}
    missing = [e for e in expected if e not in found_ids]
    print("MISSING checks:", missing)

    # 7) Findings + safety banner + preview
    findings = await page.evaluate("""() => Array.from(document.querySelectorAll('[data-testid^=\"cp-finding-\"]')).map(f => f.innerText.trim().substring(0, 200))""")
    print("findings count:", len(findings))
    for i, f in enumerate(findings[:6]):
        print(f"  finding[{i}]:", f.replace("\\n"," | "))

    banner = await page.is_visible('[data-testid="cp-safety-banner"]')
    print("cp-safety-banner visible:", banner)
    if banner:
        btxt = await page.locator('[data-testid="cp-safety-banner"]').inner_text()
        print("banner text:", btxt[:300])

    preview = await page.locator('[data-testid="cp-preview"]').inner_text()
    print("preview:", preview[:400].replace("\\n"," | "))

    # 8) Check for stray comma / "Not stated" fallback in preview
    if ", ," in preview or preview.strip().endswith(","):
        print("PREVIEW COMMA BUG DETECTED")
    else:
        print("no stray comma in preview")

    # 9) Errors on page?
    errs = await page.evaluate("""() => Array.from(document.querySelectorAll('.error, [class*=\"error\"], [id*=\"error\"]')).map(e => e.textContent).filter(Boolean).slice(0, 8)""")
    print("error-ish elements:", errs)

await _run(page)
