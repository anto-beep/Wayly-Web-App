import asyncio
import json
import os
import re
import traceback
from urllib.parse import urljoin, urlparse

from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError


BASE_URL = os.environ.get("BASE_URL", "http://localhost:3000").rstrip("/")
OUT_PATH = "/app/test_reports/bug_verification_131_results.json"
EMAIL = os.environ.get("WAYLY_TEST_EMAIL", "cathy@example.com")
PASSWORD = os.environ.get("WAYLY_TEST_PASSWORD", "testpass123")
PARTICIPANT_ID = "0c538637-b0dd-4982-8f78-b32814c6a5eb"
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
  function effectiveBg(el) {
    const chain = [];
    for (let n = el; n; n = n.parentElement) chain.unshift(n);
    let bg = {r:255,g:255,b:255,a:1,raw:'white fallback'};
    for (const n of chain) {
      const c = parseColor(getComputedStyle(n).backgroundColor);
      if (c.a > 0) bg = composite(c, bg);
    }
    return bg;
  }
  function measureEl(el) {
    const cs = getComputedStyle(el);
    const bg = effectiveBg(el);
    let fg = parseColor(cs.color);
    if (fg.a < 1) fg = composite(fg, bg);
    const rect = el.getBoundingClientRect();
    return {
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160),
      color: cs.color,
      background: cs.backgroundColor,
      effectiveBackground: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
      contrast: Number(ratio(fg, bg).toFixed(2)),
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      className: el.className,
      tagName: el.tagName,
      rect: {x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height)},
    };
  }
  window.__waylyMeasure = {measureEl, visible, ratio, parseColor, effectiveBg};
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
          return {url: location.href, title, h1, textLength: body.length, notFound, snippet: body.slice(0, 240)};
        }"""
    )


async def login(page, results):
    await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
    await page.wait_for_timeout(700)
    if await page.locator('[data-testid="caregiver-dashboard"]').count():
        ok_step(results, "Already authenticated", {"url": page.url})
        return
    await page.locator('[data-testid="login-email-input"]').fill(EMAIL)
    await page.locator('[data-testid="login-password-input"]').fill(PASSWORD)
    await page.locator('[data-testid="login-submit-button"]').click()
    try:
        await page.wait_for_url(re.compile(r".*/app.*"), timeout=15000)
    except PlaywrightTimeoutError:
        pass
    await page.wait_for_timeout(1500)
    state = await page_not_found_state(page)
    if "/app" in page.url and await page.locator('[data-testid="caregiver-dashboard"]').count():
        ok_step(results, "Login", {"url": page.url})
    else:
        fail_step(results, "Login", state)
        raise RuntimeError(f"Login failed or did not reach dashboard: {state}")


async def set_theme(page, results, theme):
    await page.evaluate("theme => localStorage.setItem('wayly:app:appearance', theme)", theme)
    await page.reload(wait_until="domcontentloaded")
    await page.wait_for_timeout(1200)
    html = await page.evaluate("document.documentElement.className")
    is_dark = await page.evaluate("document.documentElement.classList.contains('theme-dark')")
    expected = theme == "dark"
    if is_dark == expected:
        ok_step(results, f"Set {theme} theme", {"htmlClass": html, "url": page.url})
    else:
        fail_step(results, f"Set {theme} theme", {"htmlClass": html, "url": page.url, "expectedDark": expected})


async def goto_path(page, path):
    await page.goto(urljoin(BASE_URL + "/", path.lstrip("/")), wait_until="domcontentloaded")
    await page.wait_for_timeout(1000)


async def test_dashboard_cta(page, results, theme):
    await goto_path(page, "/app")
    await page.wait_for_selector('[data-testid="caregiver-dashboard"]', timeout=12000)
    count = await page.locator('[data-testid="profile-completion-cta"]').count()
    if not count:
        fail_step(results, f"{theme}: dashboard Complete now CTA present", {"issue": "profile-completion-cta was not present, cannot verify cited warning-banner contrast"})
        return
    m = await measure_selector(page, '[data-testid="profile-completion-cta"]')
    ok = m and m["contrast"] >= 4.5 and re.search(r"rgb\(255, 255, 255\)|rgba\(255, 255, 255", m["color"])
    (ok_step if ok else fail_step)(results, f"{theme}: dashboard Complete now CTA contrast", m)


async def voice_rows(page):
    await setup_measure(page)
    return await page.evaluate(
        """() => Array.from(document.querySelectorAll('[data-testid^="voice-check-answer-0-"]')).map(input => {
          const label = input.closest('label');
          const cs = getComputedStyle(label);
          const m = window.__waylyMeasure.measureEl(label);
          return {testid: input.getAttribute('data-testid'), checked: input.checked, label: label.innerText.trim(), directBackground: cs.backgroundColor, borderColor: cs.borderColor, accentColor: getComputedStyle(input).accentColor, contrast: m.contrast, color: m.color, effectiveBackground: m.effectiveBackground};
        })"""
    )


async def test_voice_check(page, results, theme):
    await goto_path(page, f"/app/participants/{PARTICIPANT_ID}/voice-check")
    await page.wait_for_selector('[data-testid="voice-check-form"]', timeout=15000)
    rows_before = await voice_rows(page)
    if len(rows_before) < 5:
        fail_step(results, f"{theme}: voice-check five radio rows loaded", {"rows": rows_before})
        return
    unchecked_bgs = [r["directBackground"] for r in rows_before if not r["checked"]]
    all_unselected_solid_same = len(set(unchecked_bgs)) == 1 and unchecked_bgs[0] not in ["rgba(0, 0, 0, 0)", "transparent"] and "165, 81, 43" in unchecked_bgs[0]
    first = page.locator('[data-testid^="voice-check-answer-0-"]').first
    await first.click()
    await page.wait_for_timeout(300)
    rows_after = await voice_rows(page)
    selected = [r for r in rows_after if r["checked"]]
    unselected = [r for r in rows_after if not r["checked"]]
    selected_distinct = bool(selected) and all(r["directBackground"] != selected[0]["directBackground"] for r in unselected)
    neutral_unselected = all(r["directBackground"] in ["rgba(0, 0, 0, 0)", "transparent"] or "255, 255, 255" in r["directBackground"] for r in unselected)
    # In dark mode the requested fix is a distinct filled selected row. In light
    # mode the original/native UX uses the radio dot, so requiring a selected
    # row background would incorrectly fail the requested "light unchanged" regression.
    ok = (not all_unselected_solid_same and neutral_unselected and bool(selected)) if theme == "light" else (not all_unselected_solid_same and selected_distinct and neutral_unselected)
    (ok_step if ok else fail_step)(results, f"{theme}: voice-check radio selected/unselected contrast", {"before": rows_before, "after": rows_after, "selectedDistinct": selected_distinct, "neutralUnselected": neutral_unselected})


async def test_statement_detail(page, results, theme):
    await goto_path(page, f"/app/statements/{STATEMENT_ID}")
    await page.wait_for_selector('[data-testid="statement-detail-page"]', timeout=18000)
    state = await page_not_found_state(page)
    if state["notFound"] or "Statement not found" in state["snippet"]:
        fail_step(results, f"{theme}: statement detail loads", state)
        return
    ok_step(results, f"{theme}: statement detail loads", state)

    disc_count = await page.locator('[data-testid="ai-anomaly-disclaimer"]').count()
    if disc_count:
        measurements = []
        for i in range(min(disc_count, 5)):
            measurements.append(await measure_selector(page, '[data-testid="ai-anomaly-disclaimer"]', i))
        min_ratio = min(m["contrast"] for m in measurements if m)
        (ok_step if min_ratio >= 4.5 else fail_step)(results, f"{theme}: anomaly AI disclaimer contrast", {"count": disc_count, "minContrast": min_ratio, "measurements": measurements})
    else:
        fail_step(results, f"{theme}: anomaly AI disclaimer present", {"issue": "No ai-anomaly-disclaimer found on specified statement"})

    # Priority badges are tiny body text; require AA body contrast as requested.
    await setup_measure(page)
    badges = await page.evaluate(
        """() => Array.from(document.querySelectorAll('[data-testid^="anomaly-card-"] span, [data-testid^="advisory-card-"] span'))
          .filter(el => /^(High|Medium|Low)$/i.test((el.textContent || '').trim()) && window.__waylyMeasure.visible(el))
          .map(el => window.__waylyMeasure.measureEl(el))"""
    )
    if badges:
        min_badge = min(b["contrast"] for b in badges)
        (ok_step if min_badge >= 4.5 else fail_step)(results, f"{theme}: priority pill badge contrast", {"minContrast": min_badge, "badges": badges})
    else:
        fail_step(results, f"{theme}: priority pill badges present", {"issue": "No High/Medium/Low anomaly badges found on specified statement"})

    rights_count = await page.locator('[data-testid="statement-rights-panel"]').count()
    if rights_count:
        await setup_measure(page)
        rights = await page.evaluate(
            """() => {
              const root = document.querySelector('[data-testid="statement-rights-panel"]');
              const nodes = Array.from(root.querySelectorAll('p, div, span, li'))
                .filter(el => window.__waylyMeasure.visible(el))
                .filter(el => (Array.from(el.childNodes).filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join(' ').trim()).length > 0)
                .map(el => window.__waylyMeasure.measureEl(el));
              return nodes;
            }"""
        )
        min_rights = min([r["contrast"] for r in rights], default=0)
        (ok_step if min_rights >= 4.5 else fail_step)(results, f"{theme}: Your Rights panel text contrast", {"minContrast": min_rights, "measurements": rights[:20]})
    else:
        fail_step(results, f"{theme}: Your Rights panel present", {"issue": "No statement-rights-panel found for specified statement"})


async def check_route(page, path, source):
    try:
        await goto_path(page, path)
        state = await page_not_found_state(page)
        state["source"] = source
        state["path"] = path
        state["ok"] = not state["notFound"] and state["textLength"] > 80
        return state
    except Exception as e:
        return {"source": source, "path": path, "ok": False, "error": repr(e), "trace": traceback.format_exc()[-1200:]}


async def test_routing(page, results):
    await goto_path(page, "/app")
    await page.wait_for_selector('[data-testid="primary-nav"]', timeout=12000)
    toggles = await page.locator('[data-testid^="nav-group-toggle-"]').all()
    for t in toggles:
        try:
            if await t.get_attribute("aria-expanded") == "false":
                await t.click(force=True)
                await page.wait_for_timeout(120)
        except Exception:
            pass
    nav_links = await page.evaluate(
        """() => Array.from(document.querySelectorAll('[data-testid="primary-nav"] a[href]')).map(a => ({label: a.innerText.trim(), href: a.href, testid: a.getAttribute('data-testid')}))"""
    )
    local_nav = []
    for a in nav_links:
        parsed = urlparse(a["href"])
        if parsed.netloc == urlparse(BASE_URL).netloc:
            local_nav.append({**a, "path": parsed.path + (('?' + parsed.query) if parsed.query else '')})
    route_results = []
    seen = set()
    for a in local_nav:
        if a["path"] in seen:
            continue
        seen.add(a["path"])
        route_results.append(await check_route(page, a["path"], f"sidebar:{a['label']}"))

    broken = [r for r in route_results if not r.get("ok")]
    (ok_step if not broken else fail_step)(results, "Sidebar expanded groups route sweep", {"count": len(route_results), "broken": broken, "routes": route_results})

    # Feature page named links and footer local links.
    await goto_path(page, "/features")
    await page.wait_for_selector('[data-testid="features-featured-cta"]', timeout=10000)
    feature_named = await page.evaluate(
        """() => {
          const featured = document.querySelector('[data-testid="features-featured-cta"]');
          const support = Array.from(document.querySelectorAll('a[href]')).find(a => /Support Plan Reviewer/i.test(a.innerText));
          const footer = Array.from(document.querySelectorAll('footer a[href^="/"]')).map(a => ({label:a.innerText.trim(), href:a.getAttribute('href')}));
          return {featuredHref: featured && featured.getAttribute('href'), supportHref: support && support.getAttribute('href'), footer};
        }"""
    )
    feature_checks = []
    feature_checks.append({"name": "Featured Invoice Checker CTA href", "ok": feature_named["featuredHref"] == "/ai-tools/invoice-checker", "href": feature_named["featuredHref"]})
    feature_checks.append({"name": "Support Plan Reviewer card href", "ok": feature_named["supportHref"] == "/ai-tools/support-plan-reviewer", "href": feature_named["supportHref"]})
    for path, source in [(feature_named.get("featuredHref"), "features featured invoice"), (feature_named.get("supportHref"), "features support plan reviewer")]:
        if path:
            feature_checks.append(await check_route(page, path, source))
    footer_routes = []
    for f in feature_named.get("footer", []):
        href = f.get("href")
        if href and href.startswith("/") and href not in seen:
            footer_routes.append(await check_route(page, href, f"footer:{f.get('label')}"))
            seen.add(href)
    feature_broken = [c for c in feature_checks + footer_routes if not c.get("ok")]
    (ok_step if not feature_broken else fail_step)(results, "Features named CTAs and footer route sweep", {"named": feature_checks, "footerCount": len(footer_routes), "broken": feature_broken, "footerRoutes": footer_routes})

    await goto_path(page, "/app/tools/provider-price-checker/compare")
    await page.wait_for_selector('[data-testid="ppc3-compare-root"]', timeout=12000)
    back = await page.evaluate("""() => { const a = Array.from(document.querySelectorAll('a[href]')).find(a => /Back to Provider Price Checker/i.test(a.innerText)); return a && a.getAttribute('href'); }""")
    back_route = await check_route(page, back or "/missing", "provider compare back link")
    provider_ok = back == "/ai-tools/provider-price-checker" and back_route.get("ok")
    (ok_step if provider_ok else fail_step)(results, "Provider price checker compare back-link", {"href": back, "route": back_route})

    old = await check_route(page, "/app/tools/invoice-checker/list", "direct legacy invoice checker URL cited by bug")
    (ok_step if old.get("ok") else fail_step)(results, "Direct cited legacy route /app/tools/invoice-checker/list", old)


async def main():
    results = {
        "base_url": BASE_URL,
        "steps": [],
        "console_errors": [],
        "network_failures": [],
    }
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path=os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE", "/root/bin/chromium"))
        context = await browser.new_context(viewport={"width": 1400, "height": 1000})
        page = await context.new_page()
        page.on("console", lambda msg: results["console_errors"].append({"type": msg.type, "text": msg.text}) if msg.type in ["error", "warning"] else None)
        page.on("requestfailed", lambda req: results["network_failures"].append({"url": req.url, "failure": str(req.failure or "unknown")}))
        try:
            await login(page, results)
            await set_theme(page, results, "dark")
            await test_dashboard_cta(page, results, "dark")
            await test_voice_check(page, results, "dark")
            await test_statement_detail(page, results, "dark")
            await test_routing(page, results)
            await set_theme(page, results, "light")
            await test_dashboard_cta(page, results, "light")
            await test_voice_check(page, results, "light")
            await test_statement_detail(page, results, "light")
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