"""
Focused browser verification for the reported dashboard navigation bug:
two Ask Wayly entries appeared in the authenticated sidebar.

Run against preview with cathy@example.com / testpass123.
Checks:
  - desktop sidebar has exactly one visible Ask Wayly nav link and no Beta label
  - the single nav link opens /app/ask-wayly with AW-2 UI (aw2-root, aw2-input,
    consent/retention panels after opening settings)
  - /app/chat and /app/ask-wayly-v2 client redirects land on /app/ask-wayly
"""

from playwright.async_api import expect
from urllib.parse import urlparse


async def run(page, base_url="https://mobile-parity-sweep.preview.emergentagent.com"):
    await page.set_viewport_size({"width": 1920, "height": 1080})
    await page.goto(f"{base_url}/login", wait_until="domcontentloaded")
    await page.get_by_test_id("login-email-input").fill("cathy@example.com")
    await page.get_by_test_id("login-password-input").fill("testpass123")
    await page.get_by_test_id("login-submit-button").click()
    await expect(page.get_by_test_id("caregiver-dashboard")).to_be_visible(timeout=30000)

    sidebar = page.get_by_test_id("primary-nav")
    await expect(sidebar).to_be_visible()
    sidebar_counts = await sidebar.evaluate("""(nav) => {
      const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      const links = Array.from(nav.querySelectorAll('a')).filter(visible).map(a => ({
        text: (a.innerText || a.textContent || '').trim(),
        href: a.getAttribute('href'),
        testid: a.getAttribute('data-testid')
      }));
      return {
        askExact: links.filter(l => l.text === 'Ask Wayly'),
        askContains: links.filter(l => /Ask Wayly/i.test(l.text)),
        beta: links.filter(l => /Beta/i.test(l.text)),
        links
      };
    }""")
    assert len(sidebar_counts["askExact"]) == 1, sidebar_counts
    assert len(sidebar_counts["askContains"]) == 1, sidebar_counts
    assert len(sidebar_counts["beta"]) == 0, sidebar_counts
    assert sidebar_counts["askExact"][0]["href"] == "/app/ask-wayly", sidebar_counts
    assert "Ask Wayly (Beta)" not in await page.locator("body").inner_text(), "Beta label still visible in page body"

    await page.get_by_test_id("nav-ask-wayly").click()
    await page.wait_for_url("**/app/ask-wayly", timeout=15000)
    assert urlparse(page.url).path == "/app/ask-wayly", page.url
    await expect(page.get_by_test_id("aw2-root")).to_be_visible(timeout=30000)
    await expect(page.get_by_test_id("aw2-input")).to_be_visible()
    await page.get_by_test_id("aw2-toggle-settings").click()
    await expect(page.get_by_test_id("aw2-consent-panel")).to_be_visible(timeout=10000)
    await expect(page.get_by_test_id("aw2-retention-panel")).to_be_visible()

    for old_path in ["/app/chat", "/app/ask-wayly-v2"]:
        await page.goto(f"{base_url}{old_path}", wait_until="domcontentloaded")
        await page.wait_for_url("**/app/ask-wayly", timeout=15000)
        assert urlparse(page.url).path == "/app/ask-wayly", {"old_path": old_path, "url": page.url}
        await expect(page.get_by_test_id("aw2-root")).to_be_visible(timeout=30000)
        await expect(page.get_by_test_id("aw2-input")).to_be_visible()

    await page.set_viewport_size({"width": 390, "height": 844})
    await page.goto(f"{base_url}/app", wait_until="domcontentloaded")
    await expect(page.get_by_test_id("mobile-bottom-nav")).to_be_visible(timeout=30000)
    await page.get_by_test_id("mobile-nav-more").click()
    await expect(page.get_by_test_id("mobile-drawer")).to_be_visible(timeout=10000)
    drawer_counts = await page.get_by_test_id("mobile-drawer").evaluate("""(drawer) => {
      const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      const links = Array.from(drawer.querySelectorAll('a')).filter(visible).map(a => ({
        text: (a.innerText || a.textContent || '').trim(),
        href: a.getAttribute('href'),
        testid: a.getAttribute('data-testid')
      }));
      return {
        askExact: links.filter(l => l.text === 'Ask Wayly'),
        askContains: links.filter(l => /Ask Wayly/i.test(l.text)),
        beta: links.filter(l => /Beta/i.test(l.text)),
        links
      };
    }""")
    assert len(drawer_counts["askExact"]) == 1, drawer_counts
    assert len(drawer_counts["askContains"]) == 1, drawer_counts
    assert len(drawer_counts["beta"]) == 0, drawer_counts
    assert drawer_counts["askExact"][0]["href"] == "/app/ask-wayly", drawer_counts

    return {"desktop": sidebar_counts, "mobile_drawer": drawer_counts}