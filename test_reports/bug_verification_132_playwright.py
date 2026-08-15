import asyncio
import json
import os
import re
import traceback
from urllib.parse import urljoin, urlparse

from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError


BASE_URL = os.environ.get("BASE_URL", "https://proration-preview.preview.emergentagent.com").rstrip("/")
OUT_PATH = "/app/test_reports/bug_verification_132_results.json"
EMAIL = os.environ.get("WAYLY_TEST_EMAIL", "cathy@example.com")
PASSWORD = os.environ.get("WAYLY_TEST_PASSWORD", "testpass123")
STATEMENT_ID = "408fcbf3-c126-4897-a9b1-c76628c49ca7"


def ok_step(results, name, details=None):
    results["steps"].append({"name": name, "ok": True, "details": details or {}})


def fail_step(results, name, details=None):
    results["steps"].append({"name": name, "ok": False, "details": details or {}})


MEASURE_JS = r"""
() => {
  function parseColor(s) {
    if (!s || s === 'transparent') return {r:0,g:0,b:0,a:0,raw:s};
    const m = String(s).match(/rgba?\(([^)]+)\)/);
    if (!m) return {r:0,g:0,b:0,a:0,raw:s};
    const parts = m[1].split(',').map(x => x.trim());
    return {r: Number(parts[0]), g: Number(parts[1]), b: Number(parts[2]), a: parts[3] == null ? 1 : Number(parts[3]), raw:s};
  }
  function composite(top, bottom) {
    const a = top.a + bottom.a * (1 - top.a);
    if (a <= 0) return {r:0,g:0,b:0,a:0};
    return {
      r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a,
      g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a,
      b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a,
      a
    };
  }
  function luminance(c) {
    const vals = [c.r, c.g, c.b].map(v => {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * vals[0] + 0.7152 * vals[1] + 0.0722 * vals[2];
  }
  function ratio(c1, c2) {
    const l1 = luminance(c1), l2 = luminance(c2);
    const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }
  function visible(el) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) !== 0 && r.width > 0 && r.height > 0;
  }
  function effectiveBg(el, skipSelf=false) {
    const chain = [];
    for (let n = skipSelf ? el.parentElement : el; n; n = n.parentElement) chain.unshift(n);
    let bg = {r:255,g:255,b:255,a:1,raw:'white fallback'};
    for (const n of chain) {
      const c = parseColor(getComputedStyle(n).backgroundColor);
      if (c.a > 0) bg = composite(c, bg);
    }
    return bg;
  }
  function rgbString(c) { return `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`; }
  function measureEl(el) {
    const cs = getComputedStyle(el);
    const bg = effectiveBg(el);
    const parentBg = effectiveBg(el, true);
    let fg = parseColor(cs.color);
    if (fg.a < 1) fg = composite(fg, bg);
    const rect = el.getBoundingClientRect();
    return {
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 180),
      color: cs.color,
      background: cs.backgroundColor,
      effectiveBackground: rgbString(bg),
      parentEffectiveBackground: rgbString(parentBg),
      contrast: Number(ratio(fg, bg).toFixed(2)),
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      borderColor: cs.borderColor,
      borderWidth: cs.borderWidth,
      boxShadow: cs.boxShadow,
      className: typeof el.className === 'string' ? el.className : String(el.className || ''),
      tagName: el.tagName,
      rect: {x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height)},
    };
  }
  window.__waylyMeasure = {measureEl, visible, ratio, parseColor, effectiveBg, rgbString};
}
"""


async def setup_measure(page):
    await page.evaluate(MEASURE_JS)


async def measure_selector(page, selector, index=0):
    await setup_measure(page)
    return await page.evaluate(
        """({selector, index}) => {
          const els = Array.from(document.querySelectorAll(selector)).filter(window.__waylyMeasure.visible);
          const el = els[index];
          return el ? window.__waylyMeasure.measureEl(el) : null;
        }""",
        {"selector": selector, "index": index},
    )


async def page_not_found_state(page):
    return await page.evaluate(
        """() => {
          const h1 = Array.from(document.querySelectorAll('h1')).map(e => e.textContent.trim()).join(' | ');
          const title = document.title;
          const body = document.body ? document.body.innerText.trim() : '';
          const notFound = /Page not found/i.test(title) || /This page has gone for a walk/i.test(body) || new RegExp('(^|\\n)404(\\n|$)', 'i').test(body);
          return {url: location.href, pathname: location.pathname, title, h1, textLength: body.length, notFound, snippet: body.slice(0, 300)};
        }"""
    )


async def goto_path(page, path):
    await page.goto(urljoin(BASE_URL + "/", path.lstrip("/")), wait_until="domcontentloaded")
    await page.wait_for_timeout(1000)


async def login(page, results):
    await goto_path(page, "/login")
    if await page.locator('[data-testid="caregiver-dashboard"]').count():
        ok_step(results, "Already authenticated", {"url": page.url})
        return
    await page.locator('[data-testid="login-email-input"]').fill(EMAIL)
    await page.locator('[data-testid="login-password-input"]').fill(PASSWORD)
    await page.locator('[data-testid="login-submit-button"]').click()
    try:
        await page.wait_for_url(re.compile(r".*/app.*"), timeout=18000)
    except PlaywrightTimeoutError:
        pass
    await page.wait_for_timeout(1800)
    if "/app" in page.url and await page.locator('[data-testid="caregiver-dashboard"]').count():
        ok_step(results, "Login as caregiver", {"url": page.url})
    else:
        state = await page_not_found_state(page)
        fail_step(results, "Login as caregiver", state)
        raise RuntimeError(f"Login failed: {state}")


async def set_theme(page, results, theme):
    await page.evaluate("theme => localStorage.setItem('wayly:app:appearance', theme)", theme)
    await page.reload(wait_until="domcontentloaded")
    await page.wait_for_timeout(1200)
    is_dark = await page.evaluate("document.documentElement.classList.contains('theme-dark')")
    ok = is_dark == (theme == "dark")
    (ok_step if ok else fail_step)(results, f"Set {theme} theme", {"url": page.url, "isDark": is_dark})


async def set_range(page, selector, value):
    await page.evaluate(
        """({selector, value}) => {
          const el = document.querySelector(selector);
          if (!el) throw new Error(`Missing range ${selector}`);
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          setter.call(el, String(value));
          el.dispatchEvent(new Event('input', {bubbles: true}));
          el.dispatchEvent(new Event('change', {bubbles: true}));
        }""",
        {"selector": selector, "value": value},
    )
    await page.wait_for_timeout(900)


async def budget_column_styles(page):
    await setup_measure(page)
    return await page.evaluate(
        """() => {
          const base = document.querySelector('[data-testid="bc2-baseline-col"]');
          const adj = document.querySelector('[data-testid="bc2-adjusted-col"]');
          const badge = document.querySelector('[data-testid="bc2-adjusted-col-badge"]');
          return {
            baseline: base ? window.__waylyMeasure.measureEl(base) : null,
            adjusted: adj ? window.__waylyMeasure.measureEl(adj) : null,
            badge: badge ? window.__waylyMeasure.measureEl(badge) : null,
          };
        }"""
    )


async def budget_delta_state(page):
    await setup_measure(page)
    return await page.evaluate(
        """() => {
          const net = document.querySelector('[data-testid="bc2-adjusted-col-net-impact"]');
          const rows = Array.from(document.querySelectorAll('[data-testid^="bc2-adjusted-col-q"]'));
          const deltas = rows.flatMap(row => Array.from(row.querySelectorAll('span')).filter(s => /[+-]\$/.test(s.textContent || '')))
            .map(el => window.__waylyMeasure.measureEl(el));
          return {net: net ? window.__waylyMeasure.measureEl(net) : null, deltas};
        }"""
    )


def is_red(css_color):
    nums = [int(x) for x in re.findall(r"\d+", css_color or "")[:3]]
    return len(nums) == 3 and nums[0] > nums[1] and nums[0] > nums[2]


def is_green(css_color):
    nums = [int(x) for x in re.findall(r"\d+", css_color or "")[:3]]
    return len(nums) == 3 and nums[1] > nums[0] and nums[1] >= nums[2]


async def test_budget_scenarios(page, results, theme):
    await goto_path(page, "/app/budget-scenarios")
    await page.wait_for_selector('[data-testid="budget-scenarios-page"]', timeout=18000)
    if await page.locator('[data-testid="budget-scenarios-empty"]').count():
        fail_step(results, f"{theme}: budget scenarios baseline available", {"issue": "Empty state instead of projection"})
        return
    await page.wait_for_selector('[data-testid="bc2-adjusted-col"]', timeout=18000)
    styles = await budget_column_styles(page)
    distinct = bool(styles["badge"] and re.search(r"what-if", styles["badge"]["text"], re.I))
    distinct = distinct and styles["baseline"] and styles["adjusted"]
    # Contract: adjusted column is a visible clay-tinted/highlighted what-if state,
    # not merely a neutral card, and all its text/badge are readable in both themes.
    clayish = any(token in (styles["adjusted"].get("borderColor") or "") for token in ["165, 81, 43", "194, 104, 61", "232, 154, 111"])
    tinted = styles["adjusted"] and styles["adjusted"]["effectiveBackground"] != styles["adjusted"]["parentEffectiveBackground"]
    readable = styles["adjusted"] and styles["adjusted"]["contrast"] >= 4.5 and styles["badge"] and styles["badge"]["contrast"] >= 4.5
    strong_border = "2" in (styles["adjusted"].get("borderWidth") or "") or styles["adjusted"].get("boxShadow") != "none"
    distinct = distinct and tinted and readable and strong_border and clayish
    (ok_step if distinct else fail_step)(results, f"{theme}: Adjusted what-if column is visually distinct", styles)

    await set_range(page, '[data-testid="bc2-slider-spend"]', 30)
    try:
        await page.wait_for_function("""() => (document.querySelector('[data-testid="bc2-adjusted-col-net-impact"]')?.innerText || '').includes('Extra')""", timeout=7000)
    except PlaywrightTimeoutError:
        pass
    positive = await budget_delta_state(page)
    pos_ok = positive["net"] and "Extra" in positive["net"]["text"] and is_red(positive["net"]["color"])
    pos_ok = pos_ok and len(positive["deltas"]) >= 3 and all(d["text"].startswith("+$") and is_red(d["color"]) for d in positive["deltas"][:3])
    (ok_step if pos_ok else fail_step)(results, f"{theme}: Spending pace right shows red extra-cost net and quarter deltas", positive)

    await set_range(page, '[data-testid="bc2-slider-spend"]', -30)
    try:
        await page.wait_for_function("""() => (document.querySelector('[data-testid="bc2-adjusted-col-net-impact"]')?.innerText || '').includes('Saves')""", timeout=7000)
    except PlaywrightTimeoutError:
        pass
    negative = await budget_delta_state(page)
    neg_ok = negative["net"] and "Saves" in negative["net"]["text"] and is_green(negative["net"]["color"])
    neg_ok = neg_ok and len(negative["deltas"]) >= 3 and all(d["text"].startswith("-$") and is_green(d["color"]) for d in negative["deltas"][:3])
    (ok_step if neg_ok else fail_step)(results, f"{theme}: Spending pace left shows green savings net and quarter deltas", negative)

    save = await measure_selector(page, '[data-testid="bc2-save-scenario"]')
    save_ok = save and save["contrast"] >= 4.5 and save["color"] in ["rgb(255, 255, 255)", "rgba(255, 255, 255, 1)"] and save["background"] != save["parentEffectiveBackground"]
    (ok_step if save_ok else fail_step)(results, f"{theme}: Save scenario button contrast and non-flat fill", save)


async def test_dashboard_cta(page, results, theme):
    await goto_path(page, "/app")
    await page.wait_for_selector('[data-testid="caregiver-dashboard"]', timeout=15000)
    count = await page.locator('[data-testid="profile-completion-cta"]').count()
    if not count:
        fail_step(results, f"{theme}: dashboard Complete now CTA present", {"issue": "profile-completion-cta is not present for this seeded account, so cited CTA contrast could not be verified"})
        return
    m = await measure_selector(page, '[data-testid="profile-completion-cta"]')
    ok = m and m["contrast"] >= 4.5 and m["background"] != m["parentEffectiveBackground"]
    (ok_step if ok else fail_step)(results, f"{theme}: dashboard Complete now CTA high contrast", m)


async def primary_button_sweep(page, results, label):
    await setup_measure(page)
    data = await page.evaluate(
        """() => Array.from(document.querySelectorAll('.app-shell button, .app-shell a[role="button"], .app-shell a'))
          .filter(el => window.__waylyMeasure.visible(el))
          .filter(el => {
            const cls = typeof el.className === 'string' ? el.className : String(el.className || '');
            const text = (el.textContent || '').trim();
            return text && /(bg-primary-k|bg-terracotta|bg-gold|bg-clay|bg-wayly-gold|btn-accent|bg-wayly-clay|bg-\[\#0E4D52\])/.test(cls);
          })
          .map(el => window.__waylyMeasure.measureEl(el))"""
    )
    low = [d for d in data if d["contrast"] < 4.5]
    flat = [d for d in data if d["background"] == d["parentEffectiveBackground"]]
    transparent_intended_fill = [d for d in data if "rgba(0, 0, 0, 0)" in d["background"] and re.search(r"bg-(primary-k|terracotta|gold|clay|wayly-clay|wayly-gold)", d.get("className", ""))]
    ok = not low and not flat and not transparent_intended_fill
    (ok_step if ok else fail_step)(results, f"Dark primary/accent button sweep: {label}", {"count": len(data), "lowContrast": low, "flatSameAsParent": flat, "transparentIntendedFill": transparent_intended_fill, "sample": data[:12]})


async def test_statement_detail_contrast(page, results, theme):
    await goto_path(page, f"/app/statements/{STATEMENT_ID}")
    await page.wait_for_selector('[data-testid="statement-detail-page"]', timeout=20000)
    state = await page_not_found_state(page)
    if state["notFound"]:
        fail_step(results, f"{theme}: statement detail loads", state)
        return
    ok_step(results, f"{theme}: statement detail loads", state)

    disc_count = await page.locator('[data-testid="ai-anomaly-disclaimer"]').count()
    if disc_count:
        measurements = [await measure_selector(page, '[data-testid="ai-anomaly-disclaimer"]', i) for i in range(min(disc_count, 5))]
        min_ratio = min(m["contrast"] for m in measurements if m)
        (ok_step if min_ratio >= 4.5 else fail_step)(results, f"{theme}: anomaly AI disclaimer contrast", {"count": disc_count, "minContrast": min_ratio, "measurements": measurements})
    else:
        fail_step(results, f"{theme}: anomaly AI disclaimer present", {"issue": "No ai-anomaly-disclaimer found"})

    await setup_measure(page)
    badges = await page.evaluate(
        """() => Array.from(document.querySelectorAll('[data-testid^="anomaly-card-"] span, [data-testid^="advisory-card-"] span'))
          .filter(el => /^(High|Medium|Low)$/i.test((el.textContent || '').trim()) && window.__waylyMeasure.visible(el))
          .map(el => window.__waylyMeasure.measureEl(el))"""
    )
    if badges:
        min_badge = min(b["contrast"] for b in badges)
        (ok_step if min_badge >= 4.5 else fail_step)(results, f"{theme}: High/Medium/Low priority badge contrast", {"minContrast": min_badge, "badges": badges})
    else:
        fail_step(results, f"{theme}: High/Medium/Low priority badges present", {"issue": "No matching badges found"})

    rights_count = await page.locator('[data-testid="statement-rights-panel"]').count()
    if rights_count:
        rights = await page.evaluate(
            """() => {
              const root = document.querySelector('[data-testid="statement-rights-panel"]');
              return Array.from(root.querySelectorAll('p, div, span, li'))
                .filter(el => window.__waylyMeasure.visible(el))
                .filter(el => Array.from(el.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()))
                .map(el => window.__waylyMeasure.measureEl(el));
            }"""
        )
        min_rights = min([r["contrast"] for r in rights], default=0)
        (ok_step if min_rights >= 4.5 else fail_step)(results, f"{theme}: Your Rights panel text contrast", {"minContrast": min_rights, "measurements": rights[:20]})
    else:
        fail_step(results, f"{theme}: Your Rights panel present", {"issue": "No statement-rights-panel found"})


async def test_legacy_route(page, results):
    await goto_path(page, "/app/tools/invoice-checker/list")
    await page.wait_for_timeout(1800)
    state = await page_not_found_state(page)
    ok = not state["notFound"] and urlparse(page.url).path == "/ai-tools/invoice-checker" and state["textLength"] > 100
    (ok_step if ok else fail_step)(results, "Legacy /app/tools/invoice-checker/list redirects to invoice checker", state)


async def main():
    results = {
        "base_url": BASE_URL,
        "steps": [],
        "console_errors": [],
        "network_failures": [],
    }
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path=os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE", "/root/bin/chromium"))
        context = await browser.new_context(viewport={"width": 1920, "height": 1080})
        page = await context.new_page()
        page.on("console", lambda msg: results["console_errors"].append({"type": msg.type, "text": msg.text}) if msg.type in ["error", "warning"] else None)
        page.on("requestfailed", lambda req: results["network_failures"].append({"url": req.url, "failure": str(req.failure or "unknown")}))
        try:
            await login(page, results)

            await set_theme(page, results, "light")
            await test_budget_scenarios(page, results, "light")

            await set_theme(page, results, "dark")
            await test_budget_scenarios(page, results, "dark")
            await test_dashboard_cta(page, results, "dark")
            await primary_button_sweep(page, results, "dashboard")
            await test_statement_detail_contrast(page, results, "dark")
            await primary_button_sweep(page, results, "statement detail")
            await test_legacy_route(page, results)
        except Exception as e:
            fail_step(results, "Unhandled test exception", {"error": repr(e), "trace": traceback.format_exc()})
        finally:
            await browser.close()

    results["ok"] = all(s["ok"] for s in results["steps"])
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    asyncio.run(main())