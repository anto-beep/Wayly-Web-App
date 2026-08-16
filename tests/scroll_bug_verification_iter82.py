import argparse
import asyncio
import json
import os
from pathlib import Path

from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError


BASE_URL = os.environ.get("SCROLL_TEST_BASE_URL", "https://wayly-rn-build.preview.emergentagent.com").rstrip("/")
VIEWPORT = {"width": 1920, "height": 1080}
ROUTES = ["/about", "/features", "/", "/pricing"]
OUT_PATH = Path("/app/test_reports/scroll_bug_iter82_results.json")


async def metrics(page):
    return await page.evaluate(
        """
        () => {
          const de = document.documentElement;
          const body = document.body;
          const root = document.getElementById('root');
          const csHtml = getComputedStyle(de);
          const csBody = getComputedStyle(body);
          const csRoot = root ? getComputedStyle(root) : null;
          const pageLevel = [de, body, root].filter(Boolean).map((el) => {
            const cs = getComputedStyle(el);
            return {
              tag: el === de ? 'html' : el === body ? 'body' : '#root',
              overflowY: cs.overflowY,
              overflowX: cs.overflowX,
              clientHeight: el.clientHeight,
              scrollHeight: el.scrollHeight,
              clientWidth: el.clientWidth,
              scrollWidth: el.scrollWidth,
              hasElementScrollbar: ['auto','scroll','overlay'].includes(cs.overflowY) && el.scrollHeight > el.clientHeight + 2
            };
          });
          return {
            href: location.href,
            scrollY: window.scrollY,
            innerHeight: window.innerHeight,
            innerWidth: window.innerWidth,
            scrollingElement: document.scrollingElement === de ? 'html' : document.scrollingElement === body ? 'body' : (document.scrollingElement && document.scrollingElement.tagName),
            docClientHeight: de.clientHeight,
            docScrollHeight: de.scrollHeight,
            bodyClientHeight: body.clientHeight,
            bodyScrollHeight: body.scrollHeight,
            rootClientHeight: root ? root.clientHeight : null,
            rootScrollHeight: root ? root.scrollHeight : null,
            viewportScrollbarWidth: window.innerWidth - de.clientWidth,
            htmlOverflowY: csHtml.overflowY,
            bodyOverflowY: csBody.overflowY,
            rootOverflowY: csRoot ? csRoot.overflowY : null,
            htmlOverflowX: csHtml.overflowX,
            bodyOverflowX: csBody.overflowX,
            rootOverflowX: csRoot ? csRoot.overflowX : null,
            pageLevel,
            verticalScrollable: de.scrollHeight > window.innerHeight + 2,
            horizontalOverflow: de.scrollWidth > de.clientWidth + 2,
            activeElement: document.activeElement ? document.activeElement.tagName : null
          };
        }
        """
    )


async def reset_top(page):
    await page.evaluate("window.scrollTo(0, 0)")
    await page.wait_for_timeout(250)


async def ensure_focus_not_in_form(page):
    await page.evaluate("document.activeElement && document.activeElement.blur && document.activeElement.blur()")
    await page.mouse.click(60, 180)
    await page.wait_for_timeout(100)


async def test_route(page, route):
    url = f"{BASE_URL}{route}"
    result = {"route": route, "url": url, "checks": {}, "errors": []}
    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=45000)
        try:
            await page.wait_for_load_state("networkidle", timeout=12000)
        except PlaywrightTimeoutError:
            result["errors"].append("networkidle timeout; continuing after DOMContentLoaded")
        await page.wait_for_selector("body", timeout=15000)
        await reset_top(page)
        start = await metrics(page)
        result["initial_metrics"] = start

        single_scrollbar_ok = (
            start["verticalScrollable"]
            and start["htmlOverflowY"] not in ["hidden", "clip"]
            and start["bodyOverflowY"] not in ["hidden", "clip", "auto", "scroll"]
            and start["rootOverflowY"] not in ["hidden", "clip", "auto", "scroll"]
            and len([x for x in start["pageLevel"] if x["hasElementScrollbar"]]) <= 1
        )
        result["checks"]["single_document_scrollbar"] = {
            "pass": single_scrollbar_ok,
            "details": {
                "verticalScrollable": start["verticalScrollable"],
                "scrollingElement": start["scrollingElement"],
                "htmlOverflowY": start["htmlOverflowY"],
                "bodyOverflowY": start["bodyOverflowY"],
                "rootOverflowY": start["rootOverflowY"],
                "pageLevelScrollContainers": [x for x in start["pageLevel"] if x["hasElementScrollbar"]],
                "viewportScrollbarWidth": start["viewportScrollbarWidth"],
            },
        }

        # Physical mouse-wheel scroll, matching a normal desktop mouse.
        await reset_top(page)
        await ensure_focus_not_in_form(page)
        before = (await metrics(page))["scrollY"]
        await page.mouse.wheel(0, 900)
        await page.wait_for_timeout(450)
        after = (await metrics(page))["scrollY"]
        result["checks"]["mouse_wheel_scroll"] = {"pass": after > before + 50, "before": before, "after": after}

        # Trackpad-like granular wheel deltas.
        await reset_top(page)
        await ensure_focus_not_in_form(page)
        before = (await metrics(page))["scrollY"]
        for _ in range(10):
            await page.mouse.wheel(0, 90)
            await page.wait_for_timeout(20)
        await page.wait_for_timeout(250)
        after = (await metrics(page))["scrollY"]
        result["checks"]["trackpad_like_wheel_scroll"] = {"pass": after > before + 50, "before": before, "after": after}

        # Keyboard scrolling: ArrowDown, PageDown, and Space from the top.
        await reset_top(page)
        await ensure_focus_not_in_form(page)
        before = (await metrics(page))["scrollY"]
        for _ in range(12):
            await page.keyboard.press("ArrowDown")
            await page.wait_for_timeout(20)
        await page.wait_for_timeout(250)
        after_arrow = (await metrics(page))["scrollY"]

        await reset_top(page)
        await ensure_focus_not_in_form(page)
        before_page = (await metrics(page))["scrollY"]
        await page.keyboard.press("PageDown")
        await page.wait_for_timeout(350)
        after_page = (await metrics(page))["scrollY"]

        await reset_top(page)
        await ensure_focus_not_in_form(page)
        before_space = (await metrics(page))["scrollY"]
        await page.keyboard.press("Space")
        await page.wait_for_timeout(350)
        after_space = (await metrics(page))["scrollY"]
        result["checks"]["keyboard_scroll"] = {
            "pass": after_arrow > before + 5 and after_page > before_page + 100 and after_space > before_space + 100,
            "arrow_before": before,
            "arrow_after": after_arrow,
            "pagedown_before": before_page,
            "pagedown_after": after_page,
            "space_before": before_space,
            "space_after": after_space,
        }

        # Native scrollbar interaction: click the scrollbar track and drag the thumb
        # at the far-right scrollbar gutter.
        # In headless Chromium this still exercises browser-level scrollbar hit testing.
        await reset_top(page)
        before_click = (await metrics(page))["scrollY"]
        x = VIEWPORT["width"] - 3
        await page.mouse.click(x, VIEWPORT["height"] - 80)
        await page.wait_for_timeout(600)
        after_track_click = (await metrics(page))["scrollY"]

        await reset_top(page)
        before_drag = (await metrics(page))["scrollY"]
        await page.mouse.move(x, 120)
        await page.mouse.down()
        await page.mouse.move(x, 820, steps=12)
        await page.mouse.up()
        await page.wait_for_timeout(600)
        after_drag = (await metrics(page))["scrollY"]
        result["checks"]["scrollbar_track_click"] = {
            "pass": after_track_click > before_click + 50,
            "before": before_click,
            "after_track_click": after_track_click,
        }
        result["checks"]["scrollbar_thumb_drag"] = {
            "pass": after_drag > before_drag + 50,
            "before": before_drag,
            "after_drag": after_drag,
        }

        # End-to-end: viewport can reach near the page bottom and return upward.
        await page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
        await page.wait_for_timeout(350)
        bottom = await metrics(page)
        await page.mouse.wheel(0, -700)
        await page.wait_for_timeout(350)
        up = await metrics(page)
        max_scroll = bottom["docScrollHeight"] - bottom["innerHeight"]
        result["checks"]["top_to_bottom_and_back"] = {
            "pass": bottom["scrollY"] >= max_scroll - 50 and up["scrollY"] < bottom["scrollY"] - 50,
            "bottom_scrollY": bottom["scrollY"],
            "max_scroll": max_scroll,
            "after_up_wheel": up["scrollY"],
        }

    except Exception as exc:
        result["errors"].append(repr(exc))

    result["pass"] = not result["errors"] and all(check.get("pass") for check in result.get("checks", {}).values())
    return result


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--headed", action="store_true", help="Run browser headed; useful under xvfb for native scrollbar hit-testing.")
    args = parser.parse_args()
    async with async_playwright() as p:
        launch_kwargs = {
            "headless": not args.headed,
            # Try to expose a non-overlay scrollbar gutter so the native
            # scrollbar hit-test portion can run where Chromium supports it.
            "args": ["--disable-features=OverlayScrollbar,OverlayScrollbars"],
        }
        executable_path = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE") or "/root/bin/chromium"
        if Path(executable_path).exists():
            launch_kwargs["executable_path"] = executable_path
        browser = await p.chromium.launch(**launch_kwargs)
        page = await browser.new_page(viewport=VIEWPORT)
        results = []
        for route in ROUTES:
            results.append(await test_route(page, route))
        await browser.close()

    summary = {
        "base_url": BASE_URL,
        "viewport": VIEWPORT,
        "routes": results,
        "overall_pass": all(r["pass"] for r in results),
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    if not summary["overall_pass"]:
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())