from pathlib import Path

base = "https://statement-checker-3.preview.emergentagent.com"
fixture_path = "/app/test_reports/invoice_checker_ui_fixture.txt"

try:
    await page.set_viewport_size({"width": 1920, "height": 1080})
    print("STEP 1: Logging in as caregiver")
    await page.goto(f"{base}/login", wait_until="domcontentloaded")
    await page.get_by_test_id("login-email-input").fill("cathy@example.com")
    await page.get_by_test_id("login-password-input").fill("testpass123")
    await page.get_by_test_id("login-submit-button").click()
    await page.wait_for_url("**/app", timeout=30000)
    print("PASS: Login reached /app")

    print("STEP 2: Verify Invoice Checker upload panel and upload fixture")
    await page.goto(f"{base}/ai-tools/invoice-checker", wait_until="domcontentloaded")
    await page.get_by_test_id("inv1-upload-card").wait_for(state="visible", timeout=20000)
    print("PASS: Upload panel visible")
    await page.get_by_test_id("inv1-file-input").set_input_files(fixture_path)
    await page.get_by_test_id("inv1-file-name").wait_for(state="visible", timeout=5000)
    await page.get_by_test_id("inv1-upload-submit").click()
    await page.get_by_test_id("inv1-result").wait_for(state="visible", timeout=90000)
    print("PASS: Upload returned result view")

    result_order = await page.evaluate("""() => Array.from(document.querySelector('[data-testid="inv1-result"]').children).map(el => el.getAttribute('data-testid') || el.tagName).slice(0, 5)""")
    print(f"Result child order: {result_order}")
    assert result_order[0] == "inv1-summary-banner", "summary banner is not first in result view"
    assert result_order[1] == "inv1-meta-strip", "metadata strip is not second in result view"
    assert await page.get_by_test_id("inv1-summary-banner").is_visible(), "InvoiceResultBanner missing"
    assert await page.get_by_test_id("inv1-meta-strip").is_visible(), "InvoiceMetadataStrip missing"
    assert await page.get_by_test_id("inv1-issue-register").is_visible(), "InvoiceIssueRegister missing"
    assert await page.get_by_text("Things worth raising", exact=True).count() == 0, "legacy Things worth raising section still visible"
    details = page.get_by_test_id("inv1-findings-ladder-toggle")
    await details.wait_for(state="visible", timeout=10000)
    is_open_initially = await details.evaluate("el => el.open")
    assert is_open_initially is False, "legacy consequence ladder details starts expanded"
    await details.locator("summary").click()
    await page.wait_for_timeout(500)
    is_open_after = await details.evaluate("el => el.open")
    assert is_open_after is True, "legacy consequence ladder details did not expand"
    print("PASS: New result components appear before verdict, old ladder is hidden behind details toggle")

    print("STEP 3: Verify desktop sidebar Invoices nav and list page")
    await page.goto(f"{base}/app", wait_until="domcontentloaded")
    await page.get_by_test_id("primary-nav").wait_for(state="visible", timeout=15000)
    if not await page.get_by_test_id("nav-invoices").is_visible():
        await page.get_by_test_id("nav-group-toggle-money").click()
        await page.wait_for_timeout(300)
    invoice_nav = page.get_by_test_id("nav-invoices")
    await invoice_nav.wait_for(state="visible", timeout=5000)
    href = await invoice_nav.get_attribute("href")
    assert href and href.endswith("/app/invoices"), f"Invoices nav href wrong: {href}"
    await invoice_nav.click()
    await page.wait_for_url("**/app/invoices", timeout=15000)
    await page.get_by_test_id("invoices-list-page").wait_for(state="visible", timeout=20000)
    assert await page.get_by_text("Your Support at Home Invoices", exact=True).is_visible(), "Invoices PageIntro title missing"
    assert await page.get_by_test_id("invoices-list-upload-btn").is_visible(), "Check a new invoice button missing"
    assert await page.get_by_test_id("smart-ai-summary-invoices-list").is_visible(), "SmartAISummary missing on invoices list"
    await page.get_by_test_id("invoices-list-table").wait_for(state="visible", timeout=30000)
    table_text = await page.get_by_test_id("invoices-list-table").inner_text()
    table_text_l = table_text.lower()
    for col in ["invoice date", "provider", "uploaded", "amount", "findings", "verdict"]:
        assert col in table_text_l, f"missing invoices table column {col}"
    row_count = await page.locator('[data-testid^="invoice-row-"]').count()
    assert row_count > 0, "no invoice rows found after upload"
    print(f"PASS: Invoices list has expected header, upload button, summary, table columns, and {row_count} row(s)")

    print("STEP 4: Click invoice row and verify detail page")
    await page.locator('[data-testid^="invoice-row-"]').first.click()
    await page.wait_for_url("**/app/invoices/*", timeout=15000)
    await page.get_by_test_id("invoice-detail-page").wait_for(state="visible", timeout=30000)
    assert await page.get_by_test_id("inv1-summary-banner").is_visible(), "detail summary banner missing"
    assert await page.get_by_test_id("inv1-meta-strip").is_visible(), "detail metadata strip missing"
    assert await page.get_by_test_id("smart-ai-summary-invoice-detail").is_visible(), "detail SmartAISummary missing"
    assert await page.get_by_test_id("invoice-detail-summary").is_visible(), "Wayly Summary card missing"
    assert await page.get_by_test_id("inv1-issue-register").is_visible(), "detail Issue Register missing"
    banner_text = await page.get_by_test_id("inv1-summary-banner").inner_text()
    for label in ["Amount billed", "Potential refund", "Net payable", "Issues"]:
        assert label.lower() in banner_text.lower(), f"summary banner missing {label}"
    meta_text = await page.get_by_test_id("inv1-meta-strip").inner_text()
    meta_text_l = meta_text.lower()
    for label in ["provider", "invoice date", "due date"]:
        assert label in meta_text_l, f"metadata strip missing {label}"
    issue_count = await page.locator('li[data-testid^="inv1-issue-"]').count()
    assert issue_count > 0, "Issue Register has no issue cards"
    issue_texts = await page.evaluate("""() => Array.from(document.querySelectorAll('li[data-testid^="inv1-issue-"]')).map(li => li.innerText)""")
    print(f"Issue cards found: {issue_count}")
    joined_issues = "\n---\n".join(issue_texts)
    assert "None" not in joined_issues.split("What to do")[0], "Issue title area contains literal None"
    assert "What to do:" in joined_issues, "Issue cards missing What to do boxes"
    assert any(code in joined_issues for code in ["C1", "C2", "C4", "C5", "C8", "C10", "C11", "C12"]), "Issue cards missing check_id badges"
    assert any(sev in joined_issues.lower() for sev in ["critical", "high", "medium", "low", "info"]), "Issue cards missing severity chips"
    assert "Line " in joined_issues, "Issue cards missing line hints"
    print("PASS: Invoice detail contains Statement-like banner, metadata, summaries, and Issue Register fields")

    print("STEP 5: Verify mobile bottom nav regression")
    await page.set_viewport_size({"width": 390, "height": 844})
    await page.goto(f"{base}/app", wait_until="domcontentloaded")
    await page.get_by_test_id("mobile-bottom-nav").wait_for(state="visible", timeout=15000)
    mobile_labels = await page.evaluate("""() => Array.from(document.querySelectorAll('[data-testid="mobile-bottom-nav"] span')).map(el => el.textContent.trim()).filter(Boolean)""")
    print(f"Mobile bottom nav labels: {mobile_labels}")
    assert mobile_labels == ["Dashboard", "AI Tools", "Statements", "Settings"], f"mobile bottom nav changed: {mobile_labels}"
    print("PASS: Mobile bottom nav remains Dashboard, AI Tools, Statements, Settings")

    error_text = await page.evaluate("""() => {
    const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
    return errorElements.map(el => el.textContent).join(", ");
    }""")
    if error_text:
        print(f"Found error message: {error_text}")
    else:
        print("No error messages found on the page")
    print("TEST_RESULT: PASS")
except Exception as e:
    print(f"TEST_RESULT: FAIL: {e}")
    await page.screenshot(path="/app/test_reports/invoice_checker_invoices_iter135_failure.jpeg", quality=40, full_page=False)
    raise