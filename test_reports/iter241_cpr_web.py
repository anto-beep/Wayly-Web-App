"""Iter241 — CPR mitigation-retired + B2 staged progress + C3 hard-delete web E2E."""
import os

FIXTURE = "/app/tests/fixtures/CPR-ERR-A-golden-v1/robert_henderson_q1_2027.txt"


async def _run(page):
    page.on("console", lambda msg: print(f"CONSOLE[{msg.type}]: {msg.text[:200]}"))
    page.on("pageerror", lambda err: print(f"PAGEERROR: {err}"))
    # Auto-accept all window.confirm dialogs
    page.on("dialog", lambda d: (print(f"DIALOG ({d.type}): {d.message[:120]}"), d.accept()))

    with open(FIXTURE) as f:
        fixture_text = f.read()

    await page.set_viewport_size({"width": 1440, "height": 900})
    base = os.environ.get("REACT_APP_BACKEND_URL", "https://statement-checker-3.preview.emergentagent.com").rstrip("/")

    # ============ LOGIN ============
    print("== login")
    await page.goto(f"{base}/login", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    await page.fill('input[type="email"]', "cathy@example.com")
    await page.fill('input[type="password"]', "testpass123")
    await page.get_by_role("button", name="Log in").click()
    await page.wait_for_timeout(3500)
    print("post-login url:", page.url)

    # ============ PART A: Reviewer flow (mitigation retired + B2 progress) ============
    await page.goto(f"{base}/ai-tools/care-plan-reviewer", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    await page.wait_for_timeout(1500)

    try:
        await page.wait_for_selector('[data-testid="cp-text"]', timeout=10000)
    except Exception as e:
        await page.screenshot(path="/app/test_reports/iter241_notool.jpeg", quality=40, full_page=False)
        print("cp-text not found:", e)
        return

    await page.fill('[data-testid="cp-text"]', fixture_text)
    await page.select_option('[data-testid="cp-classification"]', "5")
    await page.fill('[data-testid="cp-quarterly-budget"]', "9924.25")
    await page.click('[data-testid="cp-submit"]', force=True)
    print("submitted; polling for progress + result")

    # ---------- B2: staged progress ----------
    progress_seen = False
    stage_labels_seen = []
    initial_stage_txt = ""
    got_summary = False

    # Poll rapidly for first 8s to catch cp-progress + initial stage label
    for i in range(8):
        await page.wait_for_timeout(1000)
        prog_vis = await page.is_visible('[data-testid="cp-progress"]')
        stage_vis = await page.is_visible('[data-testid="cp-progress-stage"]')
        if prog_vis:
            progress_seen = True
        if stage_vis:
            try:
                t = await page.locator('[data-testid="cp-progress-stage"]').inner_text()
                if not initial_stage_txt:
                    initial_stage_txt = t
                if t not in stage_labels_seen:
                    stage_labels_seen.append(t)
                print(f"early tick {i}: cp-progress={prog_vis} stage='{t}'")
            except Exception as e:
                print(f"early tick {i}: stage read err {e}")
        else:
            print(f"early tick {i}: cp-progress={prog_vis} stage=<not visible>")
        # short-circuit if already finished
        if await page.is_visible('[data-testid="cp-plan-summary"]'):
            got_summary = True
            break

    await page.screenshot(path="/app/test_reports/iter241_progress.jpeg", quality=40, full_page=False)

    # Continue waiting for result up to ~120s more
    if not got_summary:
        for i in range(24):
            await page.wait_for_timeout(5000)
            stage_vis = await page.is_visible('[data-testid="cp-progress-stage"]')
            if stage_vis:
                try:
                    t = await page.locator('[data-testid="cp-progress-stage"]').inner_text()
                    if t not in stage_labels_seen:
                        stage_labels_seen.append(t)
                    print(f"wait tick {i}: stage='{t}'")
                except Exception:
                    pass
            got_summary = await page.is_visible('[data-testid="cp-plan-summary"]')
            got_findings = await page.is_visible('[data-testid="cp-file-findings"]')
            print(f"wait tick {i}: summary={got_summary} findings={got_findings}")
            if got_summary and got_findings:
                break

    await page.screenshot(path="/app/test_reports/iter241_result.jpeg", quality=40, full_page=False)

    print("=== B2 SUMMARY ===")
    print("  progress_seen:", progress_seen)
    print("  initial_stage_txt:", repr(initial_stage_txt))
    print("  all_stage_labels_seen:", stage_labels_seen)
    b2_ok = progress_seen and ("Reading the document" in initial_stage_txt)
    print("  B2 PASS:", b2_ok)

    # ---------- Mitigation-retired: safety banner MUST NOT appear ----------
    banner_vis = await page.is_visible('[data-testid="cp-safety-banner"]')
    print("=== M1-M4 RETIRED CHECK ===")
    print("  cp-safety-banner visible (should be FALSE):", banner_vis)

    # ---------- Findings + citation "Source:" ----------
    findings_count = await page.evaluate(
        "() => document.querySelectorAll('[data-testid^=\"cp-finding-\"]').length"
    )
    print("  findings count:", findings_count)

    # Grab full findings block text and look for 'Source:'
    findings_text = ""
    if await page.is_visible('[data-testid="cp-file-findings"]'):
        findings_text = await page.locator('[data-testid="cp-file-findings"]').inner_text()
    src_count = findings_text.count("Source:")
    print("  'Source:' occurrences in findings block:", src_count)
    # Show first ~1000 chars of findings text so we can inspect citation content
    print("  findings text sample:\n", findings_text[:1200].replace("\n", " | "))

    # Look for registry-style tokens (Aged Care Rules / Statement of Rights)
    has_reg_token = ("Aged Care Rules" in findings_text) or ("Statement of Rights" in findings_text) \
        or ("Aged Care Act" in findings_text)
    print("  registry token in findings:", has_reg_token)

    # ---------- Regression: cp-plan-summary, cp-download-summary, cp-verification-panel, cp-draft-letter-<i> ----------
    reg_summary = await page.is_visible('[data-testid="cp-plan-summary"]')
    reg_download = await page.is_visible('[data-testid="cp-download-summary"]')
    reg_verify = await page.is_visible('[data-testid="cp-verification-panel"]')
    reg_draft0 = await page.is_visible('[data-testid="cp-draft-letter-0"]')
    print("=== REGRESSION ===")
    print(f"  cp-plan-summary={reg_summary} cp-download-summary={reg_download} cp-verification-panel={reg_verify} cp-draft-letter-0={reg_draft0}")

    # ============ PART B: /app/care-plans C3 hard-delete flow ============
    await page.goto(f"{base}/app/care-plans", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle", timeout=15000)
    await page.wait_for_timeout(1500)
    await page.screenshot(path="/app/test_reports/iter241_store_active.jpeg", quality=40, full_page=False)

    # Find first active plan row via btn-delete-<id>
    target_id = await page.evaluate("""() => {
        const el = document.querySelector('[data-testid^="btn-delete-"]');
        if (!el) return null;
        const t = el.getAttribute('data-testid');
        return t ? t.replace('btn-delete-', '') : null;
    }""")
    print("=== C3 target plan id:", target_id)
    if not target_id:
        print("FAIL: no active plan available to soft-delete on /app/care-plans")
    else:
        # Click soft-delete (dialog auto-accepted)
        await page.click(f'[data-testid="btn-delete-{target_id}"]', force=True)
        await page.wait_for_timeout(2500)
        # Switch to Trash / archived tab
        try:
            await page.click('[data-testid="tab-archived"]', force=True)
        except Exception:
            await page.get_by_text("Trash / archived", exact=False).click(force=True)
        await page.wait_for_timeout(1500)
        await page.screenshot(path="/app/test_reports/iter241_store_trash.jpeg", quality=40, full_page=False)

        # Confirm both buttons visible
        restore_vis = await page.is_visible(f'[data-testid="btn-restore-{target_id}"]')
        hard_vis = await page.is_visible(f'[data-testid="btn-hard-delete-{target_id}"]')
        print(f"  btn-restore-{target_id}={restore_vis}")
        print(f"  btn-hard-delete-{target_id}={hard_vis}")

        # Capture DELETE hard=true request
        api_calls = []
        def _on_req(req):
            if "/api/care-plans/" in req.url and req.method == "DELETE":
                api_calls.append(req.url)
        page.on("request", _on_req)

        if hard_vis:
            await page.click(f'[data-testid="btn-hard-delete-{target_id}"]', force=True)
            await page.wait_for_timeout(3500)
            # Confirm DELETE request with hard=true was sent
            print("  DELETE requests captured:", api_calls)
            hard_true_seen = any("hard=true" in u for u in api_calls)
            print("  DELETE ?hard=true sent:", hard_true_seen)

            # Row should be gone
            still_vis = await page.is_visible(f'[data-testid="btn-hard-delete-{target_id}"]')
            print(f"  post-delete: btn-hard-delete-{target_id} still visible (should be FALSE): {still_vis}")

            # Reload — should NOT come back
            await page.reload(wait_until="domcontentloaded")
            await page.wait_for_load_state("networkidle", timeout=15000)
            await page.wait_for_timeout(1500)
            try:
                await page.click('[data-testid="tab-archived"]', force=True)
            except Exception:
                pass
            await page.wait_for_timeout(1500)
            after_reload = await page.is_visible(f'[data-testid="btn-hard-delete-{target_id}"]')
            print(f"  after-reload: btn-hard-delete-{target_id} still visible (should be FALSE): {after_reload}")
            await page.screenshot(path="/app/test_reports/iter241_store_after_hard_delete.jpeg", quality=40, full_page=False)

    print("DONE")


await _run(page)
