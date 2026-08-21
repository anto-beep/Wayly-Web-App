"""
Focused browser verification for the /resources article pinning bug.

Target URL: https://statement-checker-3.preview.emergentagent.com/resources
This script verifies that the invoice article is the first "Latest articles" card,
the Support at Home vs HCP article is second, the landing grid still has 6 cards,
top-level resource cards render, the invoice article detail page contains the
expected structured body/table/takeaways/FAQs, and the all-articles index still
renders a full article list rather than only the landing-page six.
"""

import asyncio
from playwright.async_api import async_playwright, expect


BASE_URL = "https://statement-checker-3.preview.emergentagent.com"
INVOICE_SLUG = "sah-invoice-checker-verify-support-at-home-invoice-five-minutes"
SECOND_SLUG = "support-at-home-vs-home-care-packages-what-changed"


async def run(page):
    await page.set_viewport_size({"width": 1920, "height": 1080})
    await page.goto(f"{BASE_URL}/resources", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle")

    await expect(page.get_by_test_id("resources-card-articles")).to_be_visible()
    await expect(page.get_by_test_id("resources-card-glossary")).to_be_visible()
    await expect(page.get_by_test_id("resources-card-templates")).to_be_visible()
    await expect(page.get_by_text("Latest articles", exact=True)).to_be_visible()
    await expect(page.get_by_role("heading", name="Where to Start", exact=True)).to_be_visible()

    cards = page.locator('[data-testid^="resources-article-"]')
    card_count = await cards.count()
    assert card_count == 6, f"Expected exactly 6 article cards, got {card_count}"

    first_testid = await cards.nth(0).get_attribute("data-testid")
    second_testid = await cards.nth(1).get_attribute("data-testid")
    assert first_testid == f"resources-article-{INVOICE_SLUG}", first_testid
    assert second_testid == f"resources-article-{SECOND_SLUG}", second_testid

    first_title = await cards.nth(0).locator("h3").inner_text()
    second_title = await cards.nth(1).locator("h3").inner_text()
    assert "Verify Your Support at Home Invoice in Five Minutes" in first_title, first_title
    assert "Support at Home vs Home Care Packages" in second_title, second_title

    await cards.nth(0).click()
    await page.wait_for_url(f"**/resources/articles/{INVOICE_SLUG}")
    await page.wait_for_load_state("networkidle")

    await expect(page.get_by_test_id(f"article-{INVOICE_SLUG}")).to_be_visible()
    await expect(page.get_by_role("heading", name="The SAH Invoice Checker: How to Verify Your Support at Home Invoice in Five Minutes", exact=True)).to_be_visible()
    await expect(page.get_by_test_id("article-key-takeaways")).to_be_visible()
    takeaways = page.locator('[data-testid="article-key-takeaways"] li')
    assert await takeaways.count() == 5, f"Expected 5 key takeaways, got {await takeaways.count()}"
    await expect(page.get_by_text("What the C1–C12 rule engine actually checks", exact=True)).to_be_visible()
    body_text = await page.locator("article").inner_text()
    assert "C1" in body_text and "C12" in body_text, "C1/C12 rule table markers missing"
    assert "Exit fee" in body_text and "Care management above 10%" in body_text, "Expected rule table content missing"
    word_count = len(body_text.split())
    assert word_count >= 1500, f"Article body looks too short: {word_count} words"
    faqs = page.locator('[data-testid^="faq-question-"]')
    assert await faqs.count() == 7, f"Expected 7 FAQs, got {await faqs.count()}"

    await page.goto(f"{BASE_URL}/resources/articles", wait_until="domcontentloaded")
    await page.wait_for_load_state("networkidle")
    article_cards = page.locator('[data-testid^="articles-card-"]')
    all_count = await article_cards.count()
    assert all_count > 6, f"All-articles page appears truncated; count={all_count}"
    await expect(page.get_by_test_id(f"articles-card-{INVOICE_SLUG}")).to_be_visible()
    await expect(page.get_by_test_id(f"articles-card-{SECOND_SLUG}")).to_be_visible()
    await expect(page.get_by_test_id("articles-card-the-three-streams")).to_be_visible()


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await run(page)
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())