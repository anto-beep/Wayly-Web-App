"""
Focused Playwright verification for bug: legacy article URL
/resources/articles/support-at-home-vs-hcp must redirect to the new canonical
Support at Home vs Home Care Packages article and render the updated structured
content.

This file mirrors the script body executed through mcp_browser_automation.
"""

# Script body for mcp_browser_automation (runs inside an async function with `page`).

await page.set_viewport_size({"width": 1920, "height": 1080})
base_url = "https://proration-preview.preview.emergentagent.com"
old_url = f"{base_url}/resources/articles/support-at-home-vs-hcp"
canonical_path = "/resources/articles/support-at-home-vs-home-care-packages-what-changed"
canonical_url = f"{base_url}{canonical_path}"
expected_title = "Support at Home vs Home Care Packages: What Actually Changed"
expected_takeaway = "Support at Home replaced Home Care Packages on 1 July 2025 for new participants; anyone on an HCP as at 12/09/2024 keeps their protections under the No Worse Off principle."
expected_sections = [
    "Why did the government replace Home Care Packages?",
    "The single biggest win: care management is capped at 10%",
    "The three streams: clinical, independence, everyday living",
    "Quarterly budgets and the greater-of $1,000 or 10% carryover",
    "What the No Worse Off principle actually protects",
    "Exit fees, refunds and the ACQSC's new power",
    "What actually stayed the same",
]

async def collect_errors():
    error_text = await page.evaluate("""() => {
const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
return errorElements.map(el => el.textContent).join(", ");
}""")
    if error_text:
        print(f"Found error message: {error_text}")
    else:
        print("No error messages found on the page")
    return error_text

async def assert_new_article_context(label):
    print(f"Checking updated article content on {label}: {page.url}")
    await page.get_by_role("heading", name=expected_title, exact=True).first.wait_for(timeout=15000)
    article = page.locator('[data-testid="article-support-at-home-vs-home-care-packages-what-changed"]')
    await article.wait_for(timeout=10000)
    meta_text = await page.locator('[data-testid="article-meta"]').inner_text(timeout=10000)
    print(f"Meta row: {meta_text}")
    assert "By Wayly Editorial" in meta_text, "Missing Wayly Editorial byline"
    assert "Reviewed by: Wayly Editorial" in meta_text, "Missing Wayly Editorial reviewer"
    assert "Published 3 February 2026" in meta_text, "Missing expected published date"

    takeaway_items = page.locator('[data-testid="article-key-takeaways"] li')
    takeaway_count = await takeaway_items.count()
    print(f"Key takeaway count: {takeaway_count}")
    assert takeaway_count == 5, f"Expected 5 key takeaways, got {takeaway_count}"
    takeaways_text = await page.locator('[data-testid="article-key-takeaways"]').inner_text()
    assert expected_takeaway in takeaways_text, "Expected No Worse Off key takeaway not present"

    section_count = await page.locator('article section[data-testid^="section-"]').count()
    print(f"Structured section count: {section_count}")
    assert section_count == 7, f"Expected 7 content sections, got {section_count}"
    for heading in expected_sections:
        await page.get_by_role("heading", name=heading, exact=True).first.wait_for(timeout=10000)
        print(f"Found section heading: {heading}")

    faq_count = await page.locator('[data-testid^="faq-question-"]').count()
    print(f"FAQ question count: {faq_count}")
    assert faq_count == 6, f"Expected 6 FAQ items, got {faq_count}"
    await collect_errors()

try:
    print("Step 1: Open legacy article URL and verify hard redirect to canonical slug")
    await page.goto(old_url, wait_until="networkidle", timeout=60000)
    await page.wait_for_url(f"**{canonical_path}", timeout=15000)
    print(f"Current URL after legacy navigation: {page.url}")
    assert canonical_path in page.url, f"Legacy URL did not redirect to canonical path. Current: {page.url}"
    assert "support-at-home-vs-hcp" not in page.url, "Old slug still present after redirect"
    await assert_new_article_context("legacy redirected URL")
    print("PASS: Legacy URL redirects and renders the new article")

    print("Step 2: Open canonical article URL directly and verify no redirect loop / same content")
    await page.goto(canonical_url, wait_until="networkidle", timeout=60000)
    await page.wait_for_url(f"**{canonical_path}", timeout=10000)
    print(f"Current URL after canonical navigation: {page.url}")
    assert canonical_path in page.url, "Canonical URL did not remain on canonical path"
    await assert_new_article_context("canonical URL")
    print("PASS: Canonical URL renders the same new article directly")

    print("Step 3: Regression check legacy static articles still render")
    regression_articles = {
        "the-three-streams": "The Three Streams, Explained Without Jargon",
        "switching-providers": "Switching Providers: The Practical Playbook",
    }
    for slug, title in regression_articles.items():
        await page.goto(f"{base_url}/resources/articles/{slug}", wait_until="networkidle", timeout=60000)
        await page.locator(f'[data-testid="article-{slug}"]').wait_for(timeout=10000)
        await page.get_by_role("heading", name=title, exact=True).first.wait_for(timeout=10000)
        body_text = await page.locator(f'[data-testid="article-{slug}"]').inner_text()
        assert "Article not found" not in body_text, f"{slug} rendered Article not found"
        print(f"PASS: {slug} renders with title {title}")
        await collect_errors()

    print("Step 4: Regression check articles index lists the new article")
    await page.goto(f"{base_url}/resources/articles", wait_until="networkidle", timeout=60000)
    await page.locator('[data-testid="articles-page"]').wait_for(timeout=10000)
    await page.locator('[data-testid="articles-card-support-at-home-vs-home-care-packages-what-changed"]').wait_for(timeout=15000)
    card_count = await page.locator('[data-testid^="articles-card-"]').count()
    heading_text = await page.locator('[data-testid="articles-page"] h1').inner_text()
    print(f"Articles index heading: {heading_text}; visible card count: {card_count}")
    assert card_count >= 32, f"Expected at least 32 article cards on index, got {card_count}"
    card_text = await page.locator('[data-testid="articles-card-support-at-home-vs-home-care-packages-what-changed"]').inner_text()
    assert expected_title in card_text, "New canonical article card missing expected title"
    for slug in ["the-three-streams", "switching-providers"]:
        await page.locator(f'[data-testid="articles-card-{slug}"]').wait_for(timeout=10000)
        print(f"PASS: Articles index still lists {slug}")
    print("PASS: Articles index lists the new canonical article")
    await collect_errors()

    print("RESULT: All focused article redirect/content checks passed")
except Exception as exc:
    print(f"FAIL: Focused article redirect/content verification failed: {exc}")
    await page.screenshot(path="/app/test_reports/support_article_redirect_failure_iter90.jpeg", quality=40, full_page=False)
    raise