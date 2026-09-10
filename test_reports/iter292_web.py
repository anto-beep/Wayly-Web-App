"""Iter292 — Wayly AI tools OUTPUT/RESULT legibility check.
For each tool: visit, submit valid input, screenshot output area, and compute contrast for key testIDs.
"""
import asyncio, json, os

REPORT = []

def check_contrast(fg_rgb, bg_rgb):
    def lin(c):
        c = c/255.0
        return c/12.92 if c <= 0.03928 else ((c+0.055)/1.055)**2.4
    def L(rgb):
        r,g,b = rgb
        return 0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(b)
    l1, l2 = L(fg_rgb), L(bg_rgb)
    hi, lo = max(l1,l2), min(l1,l2)
    return (hi+0.05)/(lo+0.05)

def parse_rgb(s):
    if not s: return None
    import re
    m = re.findall(r"[\d.]+", s)
    if len(m) >= 3:
        return (int(float(m[0])), int(float(m[1])), int(float(m[2])))
    return None

async def snap_and_measure(page, url, testids, screenshot_path, tool_name):
    result = {"tool": tool_name, "url": url, "issues": [], "measured": []}
    for tid in testids:
        try:
            el = await page.query_selector(f'[data-testid="{tid}"]')
            if not el:
                result["issues"].append(f"{tid}: NOT FOUND on page")
                continue
            # Get computed styles + text of the element and its innermost text nodes
            data = await page.evaluate("""(sel) => {
                const root = document.querySelector(`[data-testid="${sel}"]`);
                if (!root) return null;
                const rootCS = window.getComputedStyle(root);
                // Walk descendants; collect text nodes with their parent computed styles
                const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
                const items = [];
                let n;
                while ((n = walker.nextNode())) {
                    const t = (n.nodeValue || '').trim();
                    if (!t || t.length < 2) continue;
                    const p = n.parentElement;
                    if (!p) continue;
                    const cs = window.getComputedStyle(p);
                    // Walk up to find first non-transparent bg
                    let anc = p, bg = cs.backgroundColor;
                    while (anc && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) {
                        anc = anc.parentElement;
                        if (!anc) break;
                        bg = window.getComputedStyle(anc).backgroundColor;
                    }
                    items.push({text: t.slice(0,80), color: cs.color, bg, fontSize: cs.fontSize});
                    if (items.length >= 30) break;
                }
                return {rootBg: rootCS.backgroundColor, rootColor: rootCS.color, textNodes: items};
            }""", tid)
            if not data:
                continue
            root_bg = parse_rgb(data["rootBg"]) or (255,255,255)
            for tn in data["textNodes"]:
                fg = parse_rgb(tn["color"])
                bg = parse_rgb(tn["bg"]) or root_bg
                if not fg: continue
                ratio = check_contrast(fg, bg)
                same = fg == bg
                if same or ratio < 3.0:
                    result["issues"].append(
                        f"{tid}: LOW_CONTRAST ratio={ratio:.2f} fg={fg} bg={bg} text='{tn['text']}'"
                    )
                result["measured"].append({"testid": tid, "text": tn["text"][:40], "ratio": round(ratio,2), "fg": fg, "bg": bg})
        except Exception as e:
            result["issues"].append(f"{tid}: ERROR {e}")
    try:
        await page.screenshot(path=screenshot_path, quality=45, full_page=True)
    except Exception:
        try:
            await page.screenshot(path=screenshot_path, quality=45, full_page=False)
        except Exception as e:
            print(f"screenshot fail {tool_name}: {e}")
    REPORT.append(result)
    print(f"[{tool_name}] issues={len(result['issues'])} measured={len(result['measured'])}")
    if result["issues"]:
        for i in result["issues"][:8]:
            print("   -", i)

async def login(page, base):
    await page.goto(f"{base}/login", wait_until="domcontentloaded")
    await page.wait_for_selector('input[type="email"]', timeout=8000)
    await page.fill('input[type="email"]', 'cathy@example.com')
    await page.fill('input[type="password"]', 'testpass123')
    # find submit
    btn = await page.query_selector('[data-testid="login-submit"]') or await page.query_selector('button[type="submit"]')
    await btn.click()
    await page.wait_for_timeout(3500)
    print("Logged in, url=", page.url)

BASE = os.environ.get("BASE") or "https://mobile-parity-6.preview.emergentagent.com"
OUT = "/app/test_reports/iter292_web"

page.on("console", lambda msg: None)
await page.set_viewport_size({"width": 1440, "height": 900})

try:
    await login(page, BASE)
except Exception as e:
    print("LOGIN FAIL:", e)

# ----- 1) Contribution Estimator -----
try:
    await page.goto(f"{BASE}/ai-tools/contribution-estimator", wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="ce-submit"]', timeout=10000)
    await page.wait_for_timeout(500)
    await page.click('[data-testid="ce-submit"]', force=True)
    # Wait for result
    for _ in range(30):
        r = await page.query_selector('[data-testid="ce-result"]')
        if r: break
        await page.wait_for_timeout(1000)
    await page.wait_for_timeout(1500)
    tids = ["ce-result-headline","ce-govt-share-bar","ce-rate-breakdown","ce-safety-net","ce-oct-2026","ce-hcp-comparison","ce-what-if","ce-also-worth-knowing","ce-how-calculated"]
    await snap_and_measure(page, page.url, tids, f"{OUT}/ce.jpeg", "ContributionEstimator")
except Exception as e:
    print("CE fail:", e)

# ----- 2) Price Checker -----
try:
    await page.goto(f"{BASE}/ai-tools/provider-price-checker", wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="pc-title"]', timeout=10000)
    # Fill service (text input) and price
    svc = await page.query_selector('[data-testid="pc-service-input"]') or await page.query_selector('input[placeholder*="service" i]')
    if svc: await svc.fill("Personal care - weekday morning")
    price = await page.query_selector('[data-testid="pc-price-input"]') or await page.query_selector('input[type="number"]')
    if price: await price.fill("95")
    submit = await page.query_selector('[data-testid="pc-submit"]') or await page.query_selector('button:has-text("Check")')
    if submit: await submit.click(force=True)
    await page.wait_for_timeout(5000)
    tids = ["pc-how-this-compares","pc-range","pc-result","pc-verdict","pc-stat-card"]
    await snap_and_measure(page, page.url, tids, f"{OUT}/pc.jpeg", "PriceChecker")
except Exception as e:
    print("PC fail:", e)

# ----- 3) Budget Calculator -----
try:
    await page.goto(f"{BASE}/ai-tools/budget-calculator", wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="budget-calculator"]', timeout=10000)
    # click Class 5
    c5 = await page.query_selector('[data-testid="bc-class-class_5"]') or await page.query_selector('[data-testid="bc-class-5"]')
    if c5: await c5.click(force=True)
    bal = await page.query_selector('[data-testid="bc-balance"]')
    if bal: await bal.fill("15000")
    burn = await page.query_selector('[data-testid="bc-burn"]')
    if burn: await burn.fill("1200")
    submit = await page.query_selector('[data-testid="bc-submit"]') or await page.query_selector('button:has-text("Calculate")')
    if submit: await submit.click(force=True)
    await page.wait_for_timeout(4000)
    tids = ["bc-annual-summary","bc-streams","bc-supplements","bc-supplements-result"]
    await snap_and_measure(page, page.url, tids, f"{OUT}/bc.jpeg", "BudgetCalculator")
except Exception as e:
    print("BC fail:", e)

# ----- 4) Classification Self-Check -----
try:
    await page.goto(f"{BASE}/ai-tools/classification-self-check", wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)
    # Answer all visible csc-q-* option buttons — pick first option each time, loop
    for i in range(15):
        opts = await page.query_selector_all('[data-testid^="csc-q-"][data-testid*="-"]:visible')
        # Try clicking first option
        btns = await page.query_selector_all('button[data-testid*="csc-q-"]')
        clicked = False
        for b in btns:
            tid = await b.get_attribute("data-testid")
            # skip progress
            if tid and tid.count("-") >= 3:
                try:
                    if await b.is_visible():
                        await b.click(force=True)
                        clicked = True
                        break
                except Exception:
                    pass
        if not clicked: break
        await page.wait_for_timeout(500)
    # If a submit exists
    sub = await page.query_selector('[data-testid="csc-submit"]') or await page.query_selector('button:has-text("See")')
    if sub:
        try: await sub.click(force=True)
        except: pass
    await page.wait_for_timeout(4000)
    tids = ["csc-result-header","csc-band","csc-gap-badge","csc-summary","csc-recommendation"]
    await snap_and_measure(page, page.url, tids, f"{OUT}/csc.jpeg", "ClassificationCheck")
except Exception as e:
    print("CSC fail:", e)

# ----- 5) Statement Decoder (FREE) -----
try:
    await page.goto(f"{BASE}/ai-tools/statement-decoder", wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="statement-decoder-tool"]', timeout=10000)
    # try paste text mode
    ta = await page.query_selector('[data-testid="decoder-textarea"]')
    if ta:
        await ta.fill("Personal Care 142.50\nDomestic 88.00\nTransport 55.00\nAdmin fee 12.00")
    submit = await page.query_selector('[data-testid="decoder-submit"]') or await page.query_selector('button:has-text("Decode")')
    if submit: await submit.click(force=True)
    await page.wait_for_timeout(8000)
    tids = ["decoder-result","decoder-summary","decoder-lines","sd-result-headline","sd-charges","sd-verdict"]
    await snap_and_measure(page, page.url, tids, f"{OUT}/sd.jpeg", "StatementDecoder")
except Exception as e:
    print("SD fail:", e)

# ----- 6) Invoice Checker -----
try:
    await page.goto(f"{BASE}/ai-tools/invoice-checker", wait_until="domcontentloaded")
    await page.wait_for_timeout(2000)
    ta = await page.query_selector('[data-testid="inv1-textarea"]') or await page.query_selector('textarea')
    if ta:
        await ta.fill("Invoice #1234\nDate: 15 May 2026\nProvider: BlueBerry Care\nPersonal Care 2h @ $71.25 = $142.50\nDomestic 1h @ $88 = $88.00\nTotal: $230.50")
    sub = await page.query_selector('[data-testid="inv1-submit"]') or await page.query_selector('button:has-text("Check")')
    if sub: await sub.click(force=True)
    await page.wait_for_timeout(8000)
    tids = ["inv1-verdict-ok","inv1-verdict-overcharge","inv1-verdict-warn","inv1-clean-reconciliation","inv1-meta-card","inv1-summary"]
    await snap_and_measure(page, page.url, tids, f"{OUT}/inv.jpeg", "InvoiceChecker")
except Exception as e:
    print("INV fail:", e)

# ----- 7) Care Plan Reviewer -----
try:
    await page.goto(f"{BASE}/ai-tools/care-plan-reviewer", wait_until="domcontentloaded")
    await page.wait_for_timeout(2000)
    ta = await page.query_selector('[data-testid="cp-textarea"]') or await page.query_selector('textarea')
    if ta:
        await ta.fill("Support Plan for Dorothy (Classification 4). Goals: maintain independence, morning showering with assistance, weekly meal prep, social outings twice monthly.")
    sub = await page.query_selector('[data-testid="cp-submit"]') or await page.query_selector('button:has-text("Review")')
    if sub: await sub.click(force=True)
    await page.wait_for_timeout(10000)
    tids = ["cp-result","cp-summary","cp-goals","cp-recommendations","cp-verdict"]
    await snap_and_measure(page, page.url, tids, f"{OUT}/cp.jpeg", "CarePlanReviewer")
except Exception as e:
    print("CP fail:", e)

# ----- 8) Family Coordinator -----
try:
    await page.goto(f"{BASE}/ai-tools/family-coordinator", wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="aged-care-qa"]', timeout=10000)
    inp = await page.query_selector('[data-testid="fc-input"]')
    if inp: await inp.fill("How does the government contribute to aged care fees under Support at Home?")
    sub = await page.query_selector('[data-testid="fc-send"]')
    if sub: await sub.click(force=True)
    await page.wait_for_timeout(9000)
    tids = ["fc-msg-user","fc-msg-assistant","aged-care-qa"]
    await snap_and_measure(page, page.url, tids, f"{OUT}/fc.jpeg", "FamilyCoordinator")
except Exception as e:
    print("FC fail:", e)

# Save aggregate
with open(f"{OUT}/results.json","w") as f:
    json.dump(REPORT, f, indent=2, default=str)
print("DONE - report at", f"{OUT}/results.json")
