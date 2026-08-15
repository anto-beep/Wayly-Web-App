"""Focused debug for iter 121 participant switcher regression after direct URL wins."""

import json

BASE = "https://proration-preview.preview.emergentagent.com"
DOROTHY_ID = "0c538637-b0dd-4982-8f78-b32814c6a5eb"
ROBERT_ID = "seed-robert_kowalski-f0844844"
EMAIL = "cathy@example.com"
PASSWORD = "testpass123"

results = []


def record(ok, name, detail=""):
    print(("PASS" if ok else "FAIL") + f": {name}" + (f" -- {detail}" if detail else ""))
    results.append({"ok": bool(ok), "name": name, "detail": detail})


try:
    await page.set_viewport_size({"width": 1920, "height": 1080})
    await page.goto(BASE, wait_until="domcontentloaded")
    await page.evaluate("localStorage.clear(); sessionStorage.clear();")
    await page.context.clear_cookies()
    await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
    await page.locator('[data-testid="login-email-input"]').fill(EMAIL)
    await page.locator('[data-testid="login-password-input"]').fill(PASSWORD)
    await page.locator('[data-testid="login-submit-button"]').click()
    await page.wait_for_url("**/app**", timeout=30000)
    await page.wait_for_selector('[data-testid="participant-switcher-trigger"]', timeout=30000)

    await page.goto(f"{BASE}/app/participants/{DOROTHY_ID}", wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="core1-participant-profile"]', timeout=30000)
    await page.wait_for_timeout(2500)
    await page.goto(f"{BASE}/app/participants/{ROBERT_ID}", wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="core1-participant-profile"]', timeout=30000)
    await page.wait_for_timeout(3000)

    before = await page.evaluate("""() => ({
        url: window.location.href,
        active: localStorage.getItem('wayly_active_participant_id'),
        trigger: document.querySelector('[data-testid="participant-switcher-trigger"]')?.innerText,
        h1: document.querySelector('[data-testid="core1-profile-header"] h1')?.innerText
    })""")
    record(before["active"] == ROBERT_ID and "Robert" in before["h1"], "Robert is active before switch", json.dumps(before))

    await page.locator('[data-testid="participant-switcher-trigger"]').click()
    await page.wait_for_selector('[data-testid="participant-switcher-menu"]', timeout=10000)
    menu_state = await page.evaluate("""() => Array.from(document.querySelectorAll('[data-testid^="participant-option-"]')).map(el => ({
        testid: el.getAttribute('data-testid'),
        text: el.innerText,
        disabled: el.disabled,
        rect: (() => { const r = el.getBoundingClientRect(); return {x:r.x, y:r.y, w:r.width, h:r.height}; })()
    }))""")
    record(any(DOROTHY_ID in o["testid"] for o in menu_state), "Dorothy option exists in opened switcher", json.dumps(menu_state))

    dorothy_option = page.locator(f'[data-testid="participant-option-{DOROTHY_ID}"]')
    await dorothy_option.scroll_into_view_if_needed()
    await page.wait_for_timeout(200)
    await dorothy_option.click()
    await page.wait_for_timeout(2000)

    after = await page.evaluate("""() => ({
        url: window.location.href,
        path: window.location.pathname,
        search: window.location.search,
        active: localStorage.getItem('wayly_active_participant_id'),
        trigger: document.querySelector('[data-testid="participant-switcher-trigger"]')?.innerText,
        h1: document.querySelector('[data-testid="core1-profile-header"] h1')?.innerText
    })""")
    record(after["active"] == DOROTHY_ID and DOROTHY_ID in after["path"] and "Dorothy" in after["trigger"], "clicking Dorothy after direct Robert changes active/URL/chip", json.dumps(after))
except Exception as exc:
    record(False, "debug script exception", repr(exc))

print("FINAL_RESULTS_JSON=" + json.dumps(results, indent=2))
if any(not r["ok"] for r in results):
    raise AssertionError(json.dumps(results, indent=2))