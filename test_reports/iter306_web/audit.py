"""
Iter306 — Responsive audit at phone(390), tablet(768), desktop(1440).
Logs per screen: page width/scroll width (horizontal overflow), any elements wider than viewport, screenshots for review.
"""
import os
BASE = os.environ.get("BASE_URL", "https://mobile-parity-6.preview.emergentagent.com")
EMAIL = "cathy@example.com"
PWD = "testpass123"

VIEWPORTS = [
    ("phone", 390, 844),
    ("tablet", 768, 1024),
    ("desktop", 1440, 900),
]

SCREENS = [
    ("landing", "/", False),
    ("pricing", "/pricing", False),
    ("dashboard", "/app", True),
    ("statements", "/app/statements", True),
    ("stmt_detail", "/app/statements/d5267556-57c4-4925-90c7-13eca0ba24f3", True),
    ("ai_tools", "/app/ai-tools", True),
    ("reports", "/app/reports", True),
    ("pacing", "/app/pacing", True),
    ("invoices", "/app/invoices", True),
    ("profile", "/settings/profile", True),
    ("billing", "/settings/billing", True),
]

async def login(page):
    await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
    try:
        await page.wait_for_selector('input[type="email"]', timeout=10000)
        await page.fill('input[type="email"]', EMAIL)
        await page.fill('input[type="password"]', PWD)
        await page.get_by_role("button", name="Sign in", exact=False).first.click(force=True)
        await page.wait_for_url("**/app**", timeout=15000)
        print("LOGIN: OK")
    except Exception as e:
        print(f"LOGIN FAIL: {e}")

async def audit(page):
    findings = []
    # login once (desktop viewport)
    await page.set_viewport_size({"width": 1440, "height": 900})
    await login(page)
    for vp_name, w, h in VIEWPORTS:
        await page.set_viewport_size({"width": w, "height": h})
        for name, path, needs_auth in SCREENS:
            if not needs_auth and vp_name != "phone" and name not in ("landing","pricing"):
                pass
            url = f"{BASE}{path}"
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=20000)
                await page.wait_for_timeout(2500)
                # measure scroll widths
                metrics = await page.evaluate("""() => {
                    const overflow_els = [];
                    const vpw = window.innerWidth;
                    document.querySelectorAll('*').forEach(el => {
                        const r = el.getBoundingClientRect();
                        if (r.width > vpw + 4 && r.width < 100000) {
                            const tid = el.getAttribute('data-testid') || '';
                            const cls = (el.className && el.className.toString ? el.className.toString() : '').slice(0,60);
                            const tag = el.tagName;
                            const txt = (el.innerText || '').slice(0,40).replace(/\\s+/g,' ');
                            if (tag !== 'HTML' && tag !== 'BODY') {
                                overflow_els.push({tag, tid, cls, w: Math.round(r.width), txt});
                            }
                        }
                    });
                    // Dedup by tid+cls
                    const seen = new Set();
                    const dedup = [];
                    for (const o of overflow_els) {
                        const k = o.tid + '|' + o.cls + '|' + o.w;
                        if (!seen.has(k)) { seen.add(k); dedup.push(o); }
                    }
                    return {
                        scrollW: document.documentElement.scrollWidth,
                        clientW: document.documentElement.clientWidth,
                        bodyScrollW: document.body.scrollWidth,
                        overflow: dedup.slice(0, 15)
                    };
                }""")
                horiz = metrics['scrollW'] - metrics['clientW']
                entry = {
                    "vp": vp_name, "screen": name, "path": path,
                    "clientW": metrics['clientW'], "scrollW": metrics['scrollW'],
                    "horiz_overflow_px": horiz,
                    "overflow_elements": metrics['overflow'],
                }
                findings.append(entry)
                print(f"[{vp_name}] {name}: scrollW={metrics['scrollW']} clientW={metrics['clientW']} overflow={horiz}px  overflowingEls={len(metrics['overflow'])}")
                # screenshot only phone + stmt_detail specifically; and any page with overflow
                if vp_name == "phone" and (name == "stmt_detail" or horiz > 4):
                    await page.screenshot(path=f"/app/test_reports/iter306_web/{vp_name}_{name}.jpeg", quality=40, full_page=True)
            except Exception as e:
                print(f"[{vp_name}] {name}: ERROR {e}")
                findings.append({"vp": vp_name, "screen": name, "error": str(e)})

    # Additional: statement detail deep-dive for the orange section on phone
    await page.set_viewport_size({"width": 390, "height": 844})
    try:
        await page.goto(f"{BASE}/app/statements/d5267556-57c4-4925-90c7-13eca0ba24f3", wait_until="domcontentloaded", timeout=20000)
        await page.wait_for_timeout(3000)
        # scroll down to trigger anything
        for y in [400, 800, 1200, 1800, 2400, 3200]:
            await page.evaluate(f"window.scrollTo(0,{y})")
            await page.wait_for_timeout(500)
        await page.evaluate("window.scrollTo(0,0)")
        await page.screenshot(path="/app/test_reports/iter306_web/phone_stmt_detail_full.jpeg", quality=40, full_page=True)
        # inspect orange 'WHAT WE FOUND' block
        orange = await page.evaluate("""() => {
            const nodes = Array.from(document.querySelectorAll('*'));
            const found = [];
            for (const n of nodes) {
                const t = (n.innerText || '').toUpperCase();
                if (t.includes('WHAT WE FOUND') || t.includes('THINGS TO KNOW')) {
                    const r = n.getBoundingClientRect();
                    if (r.width > 100 && r.width < 3000) {
                        found.push({
                          w: Math.round(r.width),
                          h: Math.round(r.height),
                          left: Math.round(r.left),
                          right: Math.round(r.right),
                          tag: n.tagName,
                          cls: (n.className.toString ? n.className.toString() : '').slice(0,120),
                          tid: n.getAttribute('data-testid')||''
                        });
                    }
                }
            }
            return found.slice(0,10);
        }""")
        print("STMT DETAIL orange/what-we-found nodes:", orange)
        findings.append({"vp":"phone","screen":"stmt_detail_deepdive","orange_nodes": orange})
    except Exception as e:
        print(f"stmt_detail deep-dive err: {e}")

    # Mobile drawer + bottom nav
    try:
        await page.goto(f"{BASE}/app", wait_until="domcontentloaded", timeout=15000)
        await page.wait_for_timeout(2000)
        has_hamburger = await page.locator('[data-testid="mobile-hamburger"], [aria-label="Menu"], button:has-text("Menu")').count()
        has_drawer = await page.locator('[data-testid="mobile-drawer"]').count()
        has_bottom = await page.locator('[data-testid="mobile-bottom-nav"]').count()
        print(f"phone hamburger={has_hamburger} drawer={has_drawer} bottom={has_bottom}")
        findings.append({"vp":"phone","screen":"nav_widgets","hamburger":has_hamburger,"drawer":has_drawer,"bottom":has_bottom})
    except Exception as e:
        print("nav check err:", e)

    import json
    with open("/app/test_reports/iter306_web/findings.json","w") as f:
        json.dump(findings, f, indent=2)
    print("DONE — wrote findings.json")

await audit(page)
