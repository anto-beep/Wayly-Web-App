"""Iter239 — CPR-FINDINGS-UX-1 v2 WS-B/C1/B9/B6 web E2E."""
import os

FIXTURE = "/app/tests/fixtures/CPR-ERR-A-golden-v1/robert_henderson_q1_2027.txt"

async def _run(page):
    page.on("console", lambda msg: print(f"CONSOLE[{msg.type}]: {msg.text}"))
    page.on("pageerror", lambda err: print(f"PAGEERROR: {err}"))

    with open(FIXTURE) as f:
        fixture_text = f.read()

    await page.set_viewport_size({"width": 1440, "height": 900})
    base = os.environ.get("REACT_APP_BACKEND_URL", "https://statement-checker-3.preview.emergentagent.com").rstrip("/")

    # LOGIN
    print("== login")
    await page.goto(f"{base}/login", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    await page.fill('input[type="email"]', "cathy@example.com")
    await page.fill('input[type="password"]', "testpass123")
    await page.get_by_role("button", name="Log in").click()
    await page.wait_for_timeout(3500)
    print("post-login url:", page.url)

    # ===== Part 1: Care Plan Reviewer flow (B7+B9+C1) =====
    await page.goto(f"{base}/ai-tools/care-plan-reviewer", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    await page.wait_for_timeout(1500)

    try:
        await page.wait_for_selector('[data-testid="cp-text"]', timeout=10000)
    except Exception as e:
        await page.screenshot(path="/app/test_reports/iter239_notool.jpeg", quality=40, full_page=False)
        print("cp-text not found:", e)
        return

    await page.fill('[data-testid="cp-text"]', fixture_text)
    await page.select_option('[data-testid="cp-classification"]', "5")
    await page.fill('[data-testid="cp-quarterly-budget"]', "9924.25")
    await page.click('[data-testid="cp-submit"]', force=True)
    print("submitted; waiting for result panel")

    got_summary = False
    for i in range(24):  # ~120s
        await page.wait_for_timeout(5000)
        got_summary = await page.is_visible('[data-testid="cp-plan-summary"]')
        got_panel = await page.is_visible('[data-testid="cp-verification-panel"]')
        got_findings = await page.is_visible('[data-testid="cp-file-findings"]')
        print(f"tick {i}: summary={got_summary} panel={got_panel} findings={got_findings}")
        if got_summary and got_findings:
            break

    await page.screenshot(path="/app/test_reports/iter239_result.jpeg", quality=40, full_page=False)

    if not got_summary:
        print("FAIL: cp-plan-summary NOT rendered")
        return

    # Read plan summary content
    summary_txt = await page.locator('[data-testid="cp-plan-summary"]').inner_text()
    print("SUMMARY TEXT (first 400):", summary_txt[:400].replace("\n", " | "))

    # Check download button present
    dl_visible = await page.is_visible('[data-testid="cp-download-summary"]')
    print("cp-download-summary visible:", dl_visible)
    assert dl_visible, "download-summary button missing"

    # ===== Click Download summary — expect PDF download =====
    async with page.expect_download(timeout=30000) as dl_info:
        await page.click('[data-testid="cp-download-summary"]', force=True)
    dl = await dl_info.value
    saved = f"/app/test_reports/iter239_summary.pdf"
    await dl.save_as(saved)
    sz = os.path.getsize(saved)
    print(f"PDF downloaded: path={saved} size={sz} bytes  suggested={dl.suggested_filename}")
    with open(saved, "rb") as f:
        head = f.read(8)
    print("PDF magic bytes:", head)
    assert head.startswith(b"%PDF-"), "downloaded file is not a PDF"

    # ===== C1: Draft letter about this =====
    findings_count = await page.evaluate(
        "() => document.querySelectorAll('[data-testid^=\"cp-finding-\"]').length"
    )
    print("findings count:", findings_count)

    # Find first finding with a Draft letter button
    draft_btn_present = await page.is_visible('[data-testid="cp-draft-letter-0"]')
    print("cp-draft-letter-0 visible:", draft_btn_present)

    # find an index that has the button
    idx_to_click = None
    for i in range(0, 15):
        if await page.is_visible(f'[data-testid="cp-draft-letter-{i}"]'):
            idx_to_click = i
            break
    print("first draft-letter idx:", idx_to_click)

    if idx_to_click is None:
        print("FAIL: no cp-draft-letter buttons rendered")
    else:
        # Click and wait for navigation to editor
        await page.click(f'[data-testid="cp-draft-letter-{idx_to_click}"]', force=True)
        # wait navigation
        for j in range(20):
            await page.wait_for_timeout(1000)
            u = page.url
            if "/tools/letters-and-follow-ups/" in u:
                print(f"navigated to LF-1 editor url: {u}")
                break
            print(f"wait nav tick {j}: url={u}")
        assert "/tools/letters-and-follow-ups/" in page.url, f"did not navigate to LF-1 editor; url={page.url}"
        await page.screenshot(path="/app/test_reports/iter239_lf1_editor.jpeg", quality=40, full_page=False)

    # ===== Part 2: Saved-plans register filters =====
    await page.goto(f"{base}/care-plans", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    await page.wait_for_timeout(1500)

    filters_vis = await page.is_visible('[data-testid="cp-filters"]')
    search_vis = await page.is_visible('[data-testid="cp-search"]')
    class_vis = await page.is_visible('[data-testid="cp-filter-classification"]')
    flag_vis = await page.is_visible('[data-testid="cp-filter-flagged"]')
    print(f"filters={filters_vis} search={search_vis} class={class_vis} flag={flag_vis}")

    # Count initial rows
    def count_rows():
        return page.evaluate(
            "() => document.querySelectorAll('[data-testid^=\"cp-plan-row-\"], [data-testid^=\"cp-row-\"], [data-testid=\"cp-plan-item\"]').length"
        )

    # Use generic — count anchor rows
    initial_html = await page.content()
    await page.screenshot(path="/app/test_reports/iter239_store_initial.jpeg", quality=40, full_page=False)

    # Type garbage into search to trigger empty state
    await page.fill('[data-testid="cp-search"]', "zzz_no_match_xxx")
    await page.wait_for_timeout(800)
    empty_vis = await page.is_visible('[data-testid="empty-state"]')
    print("empty-state visible after garbage search:", empty_vis)
    empty_txt = ""
    if empty_vis:
        empty_txt = await page.locator('[data-testid="empty-state"]').inner_text()
        print("empty-state text:", empty_txt[:200])
    await page.screenshot(path="/app/test_reports/iter239_store_empty.jpeg", quality=40, full_page=False)
    if "No plans match your filters" not in empty_txt:
        print(f"WARN/FAIL: expected 'No plans match your filters.' copy — got: {empty_txt!r}")

    # Clear search then toggle flagged-only
    await page.fill('[data-testid="cp-search"]', "")
    await page.wait_for_timeout(400)
    await page.click('[data-testid="cp-filter-flagged"]', force=True)
    await page.wait_for_timeout(600)
    await page.screenshot(path="/app/test_reports/iter239_store_flagged.jpeg", quality=40, full_page=False)
    print("flagged toggle applied")

    # Toggle classification
    await page.click('[data-testid="cp-filter-flagged"]', force=True)  # off
    await page.select_option('[data-testid="cp-filter-classification"]', "8")
    await page.wait_for_timeout(600)
    class_empty = await page.is_visible('[data-testid="empty-state"]')
    if class_empty:
        et = await page.locator('[data-testid="empty-state"]').inner_text()
        print("classification=8 empty text:", et[:200])
    else:
        rows = await page.evaluate("() => document.querySelectorAll('a[href^=\"/care-plans/\"]').length")
        print("classification=8 rows:", rows)

    print("DONE")

await _run(page)
