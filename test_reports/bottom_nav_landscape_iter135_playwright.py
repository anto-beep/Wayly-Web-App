"""
Focused Playwright verification for the mobile bottom-nav landscape overlap regression.

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
OUT = Path("/app/test_reports/bottom_nav_landscape_iter135_results.json")

ROUTES = [
    ("/app", "caregiver-dashboard", "dashboard"),
    ("/app/statements", "statements-list-page", "statements"),
    ("/app/pacing", "qp1-root", "pacing"),
]
EXPECTED_NAV = ["Dashboard", "AI Tools", "Statements", "Settings"]


async def element_state(page, selector):
    return await page.evaluate(
        """(selector) => {
            const el = document.querySelector(selector);
            if (!el) return { exists: false, visible: false, display: null, visibility: null, opacity: null, width: 0, height: 0 };
            const cs = window.getComputedStyle(el);
            const r = el.getBoundingClientRect();
            const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0 && r.width > 0 && r.height > 0;
            return {
                exists: true,
                display: cs.display,
                visibility: cs.visibility,
                opacity: cs.opacity,
                width: r.width,
                height: r.height,
                top: r.top,
                bottom: r.bottom,
                left: r.left,
                right: r.right,
                visible,
            };
        }""",
        selector,
    )


async def bottom_nav_labels(page):
    return await page.eval_on_selector_all(
        '[data-testid="mobile-bottom-nav"] a span',
        "els => els.map(e => e.textContent.trim()).filter(Boolean)",
    )


async def bottom_spacing_metrics(page):
    """Measure whether fixed bottom nav can cover the last content at document end.

    The explicit pass condition matches the review contract:
    - when the mobile bottom nav is visible, either the last content bottom is above
      the nav top, OR main has at least 4rem/64px bottom padding.
    """
    await page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
    await page.wait_for_timeout(300)
    return await page.evaluate(
        """() => {
            const nav = document.querySelector('[data-testid="mobile-bottom-nav"]');
            const main = document.querySelector('main');
            if (!nav || !main) return { checked: false, reason: 'missing nav or main' };

            const navStyle = getComputedStyle(nav);
            const navRect = nav.getBoundingClientRect();
            const mainStyle = getComputedStyle(main);
            const mainRect = main.getBoundingClientRect();
            const navVisible = navStyle.display !== 'none' && navStyle.visibility !== 'hidden' && Number(navStyle.opacity) > 0 && navRect.width > 0 && navRect.height > 0;
            const paddingBottomPx = parseFloat(mainStyle.paddingBottom) || 0;

            const visibleDesc = Array.from(main.querySelectorAll('*')).map((el) => {
                const cs = getComputedStyle(el);
                const r = el.getBoundingClientRect();
                const tag = el.tagName.toLowerCase();
                const hasContent = (el.textContent || '').trim().length > 0 || ['img','canvas','svg','button','input','select','textarea','a'].includes(tag);
                return { el, cs, r, tag, hasContent };
            }).filter(({ cs, r, tag, hasContent }) => {
                if (!hasContent) return false;
                if (['script','style','path','defs'].includes(tag)) return false;
                if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
                if (cs.position === 'fixed') return false;
                if (r.width <= 0 || r.height <= 0) return false;
                // Ignore very tall wrappers; descendants with actual text/buttons provide the content bottom.
                if (r.height > window.innerHeight * 1.5) return false;
                return true;
            }).map(({ el, r, tag }) => ({
                tag,
                testid: el.getAttribute('data-testid'),
                text: (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 100),
                top: Number(r.top.toFixed(2)),
                bottom: Number(r.bottom.toFixed(2)),
                height: Number(r.height.toFixed(2)),
                width: Number(r.width.toFixed(2)),
            }));

            visibleDesc.sort((a, b) => b.bottom - a.bottom);
            const lastContent = visibleDesc[0] || null;
            const lastContentBottom = lastContent ? lastContent.bottom : null;
            const geometryClear = !navVisible || lastContentBottom === null || lastContentBottom <= navRect.top + 1;
            const paddingClear = !navVisible || paddingBottomPx >= 64;

            return {
                checked: true,
                path: location.pathname,
                viewport: { width: window.innerWidth, height: window.innerHeight },
                scrollY: Number(window.scrollY.toFixed(2)),
                documentHeight: document.documentElement.scrollHeight,
                navVisible,
                navTop: Number(navRect.top.toFixed(2)),
                navBottom: Number(navRect.bottom.toFixed(2)),
                navHeight: Number(navRect.height.toFixed(2)),
                mainBottom: Number(mainRect.bottom.toFixed(2)),
                mainPaddingBottom: mainStyle.paddingBottom,
                mainPaddingBottomPx: paddingBottomPx,
                lastContentBottom,
                lastContent,
                geometryClear,
                paddingClear,
                noOverlapByContract: geometryClear || paddingClear,
            };
        }"""
    )


async def login(page):
    await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
    await page.wait_for_timeout(500)
    await page.get_by_test_id("login-email-input").fill(EMAIL)
    await page.get_by_test_id("login-password-input").fill(PASSWORD)
    await page.get_by_test_id("login-submit-button").click()
    await page.wait_for_url("**/app", timeout=30000)
    await page.wait_for_load_state("domcontentloaded")
    await expect(page.get_by_test_id("caregiver-dashboard")).to_be_visible(timeout=30000)


async def verify_mobile_viewport(page, width, height, label, results):
    await page.set_viewport_size({"width": width, "height": height})
    await page.wait_for_timeout(200)

    # Nav labels and floating widgets are global checks for this viewport.
    await page.goto(f"{BASE_URL}/app", wait_until="domcontentloaded")
    await expect(page.get_by_test_id("caregiver-dashboard")).to_be_visible(timeout=30000)
    await expect(page.get_by_test_id("mobile-bottom-nav")).to_be_visible(timeout=15000)

    labels = await bottom_nav_labels(page)
    results["checks"].append({f"{label}_bottom_nav_labels": labels})
    if labels != EXPECTED_NAV:
        results["failures"].append(f"{label}: bottom nav labels/order wrong: {labels}")

    bottom_state = await element_state(page, "[data-testid='mobile-bottom-nav']")
    sidebar_state = await element_state(page, "[data-testid='primary-nav']")
    results["checks"].append({f"{label}_bottom_nav_state": bottom_state, f"{label}_sidebar_state": sidebar_state})
    if not bottom_state.get("visible"):
        results["failures"].append(f"{label}: mobile bottom nav is not visible")
    if sidebar_state.get("visible"):
        results["failures"].append(f"{label}: desktop sidebar is visible")

    for sel in ["[data-testid='help-chat-launcher']", "[data-testid='a11y-launcher']"]:
        st = await element_state(page, sel)
        results["checks"].append({f"{label}_{sel}": st})
        if st.get("visible"):
            results["failures"].append(f"{label}: {sel} should be display:none/hidden but is visible: {st}")

    # Route-specific bottom-of-page overlap checks.
    for path, root_testid, name in ROUTES:
        await page.goto(f"{BASE_URL}{path}", wait_until="domcontentloaded")
        await expect(page.get_by_test_id(root_testid)).to_be_visible(timeout=30000)
        await page.wait_for_timeout(300)
        metrics = await bottom_spacing_metrics(page)
        results["checks"].append({f"{label}_{name}_bottom_spacing": metrics})
        if not metrics.get("noOverlapByContract"):
            results["failures"].append(f"{label}: {path} content can sit behind fixed bottom nav: {metrics}")


async def verify_desktop(page, results):
    await page.set_viewport_size({"width": 1440, "height": 900})
    await page.wait_for_timeout(200)
    for path, root_testid, name in ROUTES:
        await page.goto(f"{BASE_URL}{path}", wait_until="domcontentloaded")
        await expect(page.get_by_test_id(root_testid)).to_be_visible(timeout=30000)
        await page.wait_for_timeout(300)
        main_padding = await page.evaluate("parseFloat(getComputedStyle(document.querySelector('main')).paddingBottom) || 0")
        bottom_state = await element_state(page, "[data-testid='mobile-bottom-nav']")
        sidebar_state = await element_state(page, "[data-testid='primary-nav']")
        results["checks"].append({
            f"desktop_{name}_main_padding_bottom_px": main_padding,
            f"desktop_{name}_bottom_nav_state": bottom_state,
            f"desktop_{name}_sidebar_state": sidebar_state,
        })
        if main_padding > 1:
            results["failures"].append(f"desktop: {path} main padding-bottom should be 0 but was {main_padding}px")
        if bottom_state.get("visible"):
            results["failures"].append(f"desktop: mobile bottom nav is visible on {path}: {bottom_state}")
        if not sidebar_state.get("visible"):
            results["failures"].append(f"desktop: sidebar is not visible on {path}: {sidebar_state}")

    for sel in ["[data-testid='help-chat-launcher']", "[data-testid='a11y-launcher']"]:
        st = await element_state(page, sel)
        results["checks"].append({f"desktop_{sel}": st})
        if not st.get("visible"):
            results["failures"].append(f"desktop: {sel} should be visible but is hidden/missing: {st}")


async def run():
    results = {"checks": [], "failures": [], "console_errors": [], "network_errors": []}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path="/root/bin/chromium")
        context = await browser.new_context()
        page = await context.new_page()
        page.on("console", lambda msg: results["console_errors"].append(msg.text) if msg.type == "error" else None)

        def on_request_failed(req):
            try:
                failure = req.failure
                if callable(failure):
                    failure = failure()
                if isinstance(failure, dict):
                    failure_text = failure.get("errorText") or failure.get("error_text")
                else:
                    failure_text = str(failure) if failure else None
                # Route transitions abort in-flight fetches; keep only unexpected failures.
                if failure_text and "ERR_ABORTED" not in failure_text:
                    results["network_errors"].append({"url": req.url, "failure": failure_text})
            except Exception as listener_exc:
                results["network_errors"].append({"url": getattr(req, "url", "unknown"), "failure": f"listener error: {listener_exc}"})

        page.on("requestfailed", on_request_failed)

        try:
            await page.set_viewport_size({"width": 393, "height": 852})
            await login(page)
            await verify_mobile_viewport(page, 393, 852, "portrait_393x852", results)
            await verify_mobile_viewport(page, 852, 393, "landscape_852x393", results)
            await verify_desktop(page, results)
            results["passed"] = not results["failures"]
        except Exception as exc:
            results["failures"].append(f"Test exception: {type(exc).__name__}: {exc}")
            results["passed"] = False
        finally:
            await browser.close()

    OUT.write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))
    return results


if __name__ == "__main__":
    asyncio.run(run())