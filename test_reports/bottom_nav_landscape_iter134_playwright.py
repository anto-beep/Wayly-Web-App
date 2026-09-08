"""
Focused Playwright verification for the mobile bottom nav / mobile landscape layout bug.

Run target: preview frontend at http://localhost:3000
Credentials: cathy@example.com / testpass123
"""

import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright, expect


BASE_URL = "http://localhost:3000"
EMAIL = "cathy@example.com"
PASSWORD = "testpass123"


async def element_state(page, selector):
    return await page.evaluate(
        """(selector) => {
            const el = document.querySelector(selector);
            if (!el) return { exists: false, visible: false, display: null, visibility: null, width: 0, height: 0 };
            const cs = window.getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return {
                exists: true,
                display: cs.display,
                visibility: cs.visibility,
                opacity: cs.opacity,
                width: r.width,
                height: r.height,
                left: r.left,
                top: r.top,
                visible: cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0 && r.width > 0 && r.height > 0,
            };
        }""",
        selector,
    )


async def h1_metrics(page, expected_text=None):
    selector = "h1"
    if expected_text:
        selector = f"xpath=//h1[normalize-space()='{expected_text}']"
    loc = page.locator(selector).first
    await expect(loc).to_be_visible(timeout=15000)
    return await loc.evaluate(
        """(el) => {
            const cs = window.getComputedStyle(el);
            const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
            const r = el.getBoundingClientRect();
            return {
                text: el.textContent.trim(),
                height: r.height,
                width: r.width,
                lineHeight,
                lines: Math.round(r.height / lineHeight),
                fontSize: cs.fontSize,
                display: cs.display,
            };
        }"""
    )


async def page_intro_card_layout(page):
    return await page.evaluate(
        """() => {
            const intro = document.querySelector('[data-testid="page-intro"]');
            if (!intro) return { exists: false, cards: [] };
            const labels = ['What This Does', 'How to Use It', 'What You Get'];
            const cards = labels.map(label => {
                const labelEl = Array.from(intro.querySelectorAll('p')).find(p => p.textContent.trim() === label);
                const card = labelEl ? labelEl.closest('.rounded-2xl') : null;
                if (!card) return null;
                const r = card.getBoundingClientRect();
                return { label, left: r.left, top: r.top, width: r.width, height: r.height };
            }).filter(Boolean);
            const tops = [...new Set(cards.map(c => Math.round(c.top)))];
            const lefts = [...new Set(cards.map(c => Math.round(c.left)))];
            return { exists: true, cardCount: cards.length, cards, uniqueTops: tops.length, uniqueLefts: lefts.length };
        }"""
    )


async def bottom_nav_overlap_metrics(page):
    """Detect the landscape 768-1023px case where bottom nav is visible but main has no bottom spacer."""
    await page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
    await page.wait_for_timeout(250)
    return await page.evaluate(
        """() => {
            const nav = document.querySelector('[data-testid="mobile-bottom-nav"]');
            const main = document.querySelector('main');
            if (!nav || !main) return { checked: false };
            const navRect = nav.getBoundingClientRect();
            const mainRect = main.getBoundingClientRect();
            const mainStyle = getComputedStyle(main);
            return {
                checked: true,
                path: location.pathname,
                viewportHeight: window.innerHeight,
                scrollY: window.scrollY,
                documentHeight: document.documentElement.scrollHeight,
                navVisible: getComputedStyle(nav).display !== 'none' && navRect.height > 0,
                navTop: navRect.top,
                navHeight: navRect.height,
                mainBottom: mainRect.bottom,
                mainPaddingBottom: mainStyle.paddingBottom,
                overlappedAtDocumentEnd: getComputedStyle(nav).display !== 'none' && mainRect.bottom > navRect.top,
            };
        }"""
    )


async def login(page):
    await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
    await page.wait_for_timeout(500)
    if "/app" in page.url:
        return
    await page.get_by_test_id("login-email-input").fill(EMAIL)
    await page.get_by_test_id("login-password-input").fill(PASSWORD)
    await page.get_by_test_id("login-submit-button").click()
    await page.wait_for_url("**/app", timeout=30000)
    await page.wait_for_load_state("domcontentloaded")


async def run():
    results = {"checks": [], "failures": []}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        try:
            await page.set_viewport_size({"width": 393, "height": 852})
            await login(page)

            # Portrait mobile: exact bottom nav, widgets hidden.
            await page.goto(f"{BASE_URL}/app", wait_until="domcontentloaded")
            await expect(page.get_by_test_id("mobile-bottom-nav")).to_be_visible(timeout=15000)
            nav_labels = await page.eval_on_selector_all(
                '[data-testid="mobile-bottom-nav"] a span',
                "els => els.map(e => e.textContent.trim()).filter(Boolean)",
            )
            expected_nav = ["Dashboard", "AI Tools", "Statements", "Settings"]
            results["checks"].append({"portrait_bottom_nav_labels": nav_labels})
            if nav_labels != expected_nav:
                results["failures"].append(f"Portrait bottom nav labels/order wrong: {nav_labels}")
            for sel in ["[data-testid='help-chat-launcher']", "[data-testid='a11y-launcher']"]:
                st = await element_state(page, sel)
                results["checks"].append({f"portrait_{sel}": st})
                if st.get("visible"):
                    results["failures"].append(f"{sel} visible on portrait mobile: {st}")

            # Landscape mobile: mobile layout, statements header clean.
            await page.set_viewport_size({"width": 852, "height": 393})
            await page.goto(f"{BASE_URL}/app/statements", wait_until="domcontentloaded")
            await expect(page.get_by_test_id("statements-list-page")).to_be_visible(timeout=20000)
            await expect(page.get_by_test_id("mobile-bottom-nav")).to_be_visible(timeout=15000)
            primary_nav_state = await element_state(page, "[data-testid='primary-nav']")
            bottom_nav_state = await element_state(page, "[data-testid='mobile-bottom-nav']")
            results["checks"].append({"landscape_primary_nav_state": primary_nav_state, "landscape_bottom_nav_state": bottom_nav_state})
            if primary_nav_state.get("visible"):
                results["failures"].append("Desktop sidebar is visible in landscape mobile")
            if not bottom_nav_state.get("visible"):
                results["failures"].append("Mobile bottom nav is not visible in landscape mobile")

            landscape_labels = await page.eval_on_selector_all(
                '[data-testid="mobile-bottom-nav"] a span',
                "els => els.map(e => e.textContent.trim()).filter(Boolean)",
            )
            results["checks"].append({"landscape_bottom_nav_labels": landscape_labels})
            if landscape_labels != expected_nav:
                results["failures"].append(f"Landscape bottom nav labels/order wrong: {landscape_labels}")

            for sel in ["[data-testid='help-chat-launcher']", "[data-testid='a11y-launcher']"]:
                st = await element_state(page, sel)
                results["checks"].append({f"landscape_{sel}": st})
                if st.get("visible"):
                    results["failures"].append(f"{sel} visible on landscape mobile: {st}")

            statements_h1 = await h1_metrics(page, "Your Support at Home Statements")
            results["checks"].append({"landscape_statements_h1": statements_h1})
            if statements_h1["lines"] >= 5:
                results["failures"].append(f"Statements h1 appears letter-wrapped: {statements_h1}")

            intro_layout = await page_intro_card_layout(page)
            results["checks"].append({"landscape_statements_intro_cards": intro_layout})
            if intro_layout.get("cardCount") == 3 and intro_layout.get("uniqueTops", 0) < 3:
                results["failures"].append(f"Statements PageIntro cards not stacked vertically in landscape: {intro_layout}")

            button_cluster = await page.locator('[data-testid="statements-export-csv-btn"]').locator("xpath=ancestor::div[contains(@class,'flex')][1]").evaluate(
                """(el) => { const r = el.getBoundingClientRect(); return {top:r.top, left:r.left, width:r.width, height:r.height}; }"""
            )
            intro_rect = await page.get_by_test_id("page-intro").evaluate(
                """(el) => { const r = el.getBoundingClientRect(); return {top:r.top, bottom:r.bottom, left:r.left, width:r.width, height:r.height}; }"""
            )
            results["checks"].append({"landscape_statements_intro_rect": intro_rect, "landscape_statements_button_cluster": button_cluster})
            if button_cluster["top"] < intro_rect["bottom"] - 2:
                results["failures"].append("Statements buttons are squeezed beside PageIntro instead of below it in landscape")

            overlap = await bottom_nav_overlap_metrics(page)
            results["checks"].append({"landscape_statements_bottom_overlap": overlap})
            if overlap.get("overlappedAtDocumentEnd"):
                results["failures"].append(f"Statements landscape content ends behind visible bottom nav: {overlap}")

            # Landscape mobile: Dashboard and Quarterly Pacing h1s are not letter-wrapped.
            for path, root_testid, name in [("/app", "caregiver-dashboard", "dashboard"), ("/app/pacing", "qp1-root", "quarterly_pacing")]:
                await page.goto(f"{BASE_URL}{path}", wait_until="domcontentloaded")
                await expect(page.get_by_test_id(root_testid)).to_be_visible(timeout=20000)
                metrics = await h1_metrics(page)
                results["checks"].append({f"landscape_{name}_h1": metrics})
                if metrics["lines"] >= 5:
                    results["failures"].append(f"{name} h1 appears letter-wrapped in landscape: {metrics}")
                side = await element_state(page, "[data-testid='primary-nav']")
                bottom = await element_state(page, "[data-testid='mobile-bottom-nav']")
                results["checks"].append({f"landscape_{name}_sidebar": side, f"landscape_{name}_bottom_nav": bottom})
                if side.get("visible") or not bottom.get("visible"):
                    results["failures"].append(f"{name} does not use mobile layout in landscape: sidebar={side}, bottom={bottom}")
                overlap = await bottom_nav_overlap_metrics(page)
                results["checks"].append({f"landscape_{name}_bottom_overlap": overlap})
                if overlap.get("overlappedAtDocumentEnd"):
                    results["failures"].append(f"{name} landscape content ends behind visible bottom nav: {overlap}")

            # Desktop: sidebar and widgets visible, mobile nav hidden, 3-column PageIntro/buttons right.
            await page.set_viewport_size({"width": 1440, "height": 900})
            await page.goto(f"{BASE_URL}/app/statements", wait_until="domcontentloaded")
            await expect(page.get_by_test_id("statements-list-page")).to_be_visible(timeout=20000)
            desktop_sidebar = await element_state(page, "[data-testid='primary-nav']")
            desktop_bottom = await element_state(page, "[data-testid='mobile-bottom-nav']")
            results["checks"].append({"desktop_sidebar": desktop_sidebar, "desktop_bottom_nav": desktop_bottom})
            if not desktop_sidebar.get("visible"):
                results["failures"].append("Desktop sidebar is not visible at 1440px")
            if desktop_bottom.get("visible"):
                results["failures"].append("Mobile bottom nav is visible at 1440px")
            for sel in ["[data-testid='help-chat-launcher']", "[data-testid='a11y-launcher']"]:
                st = await element_state(page, sel)
                results["checks"].append({f"desktop_{sel}": st})
                if not st.get("visible"):
                    results["failures"].append(f"{sel} not visible on desktop: {st}")

            desktop_intro_layout = await page_intro_card_layout(page)
            results["checks"].append({"desktop_statements_intro_cards": desktop_intro_layout})
            if desktop_intro_layout.get("cardCount") == 3 and desktop_intro_layout.get("uniqueTops") != 1:
                results["failures"].append(f"Desktop PageIntro cards are not in one row / 3 columns: {desktop_intro_layout}")
            desktop_h1 = await h1_metrics(page, "Your Support at Home Statements")
            results["checks"].append({"desktop_statements_h1": desktop_h1})

            results["passed"] = not results["failures"]
        except Exception as exc:
            results["failures"].append(f"Test exception: {type(exc).__name__}: {exc}")
            results["passed"] = False
        finally:
            await browser.close()

    out = Path("/app/test_reports/bottom_nav_landscape_iter134_results.json")
    out.write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))
    return results


if __name__ == "__main__":
    asyncio.run(run())