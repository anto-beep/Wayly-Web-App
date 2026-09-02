import asyncio
import os
import pyotp

BASE = "https://mobile-web-sync-35.preview.emergentagent.com"
EMAIL = "hello@wayly.com.au"
PASSWORD = "Admin!2026"
TOTP_SECRET = "M5A7R2XCCEXWYYKNJY55MVZYUHPYFA6W"

# Expected sections and nav items (per review request)
EXPECTED_SECTIONS = ["Analytics", "Platform", "Cost & Usage", "Data & Platform"]
REMOVED_LABELS = ["Funnels", "Cohorts", "Scenario Clocks", "V2 Add-ons", "V2 Free-tier",
                  "Tickets (Legacy)", "IndexNow (Ext)", "Global Search"]

# Collect page errors
page_errors = []
console_errors = []

def on_console(msg):
    if msg.type == "error":
        console_errors.append(msg.text)

def on_pageerror(err):
    page_errors.append(str(err))

page.on("console", on_console)
page.on("pageerror", on_pageerror)

await page.set_viewport_size({"width": 1920, "height": 1080})

# ---------- Login (do POSTs from browser context) ----------
try:
    code = pyotp.TOTP(TOTP_SECRET).now()
    print(f"TOTP code: {code}")

    # Navigate to admin/login to establish browser context
    await page.goto(f"{BASE}/admin/login", wait_until="domcontentloaded")
    await page.wait_for_timeout(1500)

    # Do login POSTs via fetch from the browser (avoids CF 1010)
    login_result = await page.evaluate(f"""async () => {{
        const r1 = await fetch("{BASE}/api/admin/auth/login", {{
            method: "POST",
            headers: {{"Content-Type": "application/json"}},
            body: JSON.stringify({{email: "{EMAIL}", password: "{PASSWORD}"}})
        }});
        const j1 = await r1.json();
        if (!j1.temp_token) return {{step: "login", status: r1.status, body: j1}};
        const r2 = await fetch("{BASE}/api/admin/auth/2fa/verify", {{
            method: "POST",
            headers: {{"Content-Type": "application/json"}},
            body: JSON.stringify({{temp_token: j1.temp_token, code: "{code}"}})
        }});
        const j2 = await r2.json();
        if (j2.token) {{
            localStorage.setItem("wayly_admin_token", j2.token);
        }}
        return {{step: "2fa", status: r2.status, has_token: !!j2.token, body: j2}};
    }}""")
    print(f"Login result: {login_result}")
    if not login_result.get("has_token"):
        print("FATAL: login failed")
        raise Exception("Login failed")
except Exception as e:
    print(f"Login exception: {e}")
    raise

# ---------- Test 1: Overview loads cleanly ----------
try:
    await page.goto(f"{BASE}/admin", wait_until="domcontentloaded")
    await page.wait_for_timeout(4000)  # allow overview to fetch

    # Check for error boundary card
    err = await page.query_selector('[data-testid="admin-screen-error"]')
    print(f"Overview error card present: {err is not None}")

    # Count metric cards - typically headings/labels
    body_text = await page.evaluate("() => document.body.innerText")
    has_overview_signals = 0
    for kw in ["Users", "Households", "Statements", "Payments", "Revenue",
               "Subscriptions", "AI", "Activity"]:
        if kw in body_text:
            has_overview_signals += 1
    print(f"Overview keyword signals matched: {has_overview_signals}/8")

    await page.screenshot(path="/app/test_reports/iter100_overview.png", quality=40, full_page=False)
    print("Overview screenshot saved")
except Exception as e:
    print(f"Overview test error: {e}")

# ---------- Test 2: Sidebar sections + removed items ----------
try:
    # Get all sidebar section labels
    section_labels = await page.evaluate("""() => {
        return Array.from(document.querySelectorAll('.admin-nav-section')).map(e => e.textContent.trim());
    }""")
    print(f"Sidebar sections found: {section_labels}")

    # Get all sidebar link labels
    nav_labels = await page.evaluate("""() => {
        return Array.from(document.querySelectorAll('.admin-nav-item')).map(e => e.textContent.trim());
    }""")
    print(f"Sidebar nav items count: {len(nav_labels)}")

    # Check expected sections present
    for sec in EXPECTED_SECTIONS:
        present = sec in section_labels
        print(f"  Section '{sec}' present: {present}")

    # Check removed items NOT present
    for rem in REMOVED_LABELS:
        found = any(rem == n or rem in n for n in nav_labels)
        print(f"  REMOVED '{rem}' still present: {found}")

    # Support label check (should be "Support" not "Support (SUP)")
    support_labels = [n for n in nav_labels if "Support" in n]
    print(f"  Support labels: {support_labels}")
except Exception as e:
    print(f"Sidebar test error: {e}")

# ---------- Test 3: /admin/statements columns ----------
try:
    await page.goto(f"{BASE}/admin/statements", wait_until="domcontentloaded")
    await page.wait_for_timeout(4000)

    err = await page.query_selector('[data-testid="admin-screen-error"]')
    print(f"Statements error card present: {err is not None}")

    # Get table headers
    headers = await page.evaluate("""() => {
        return Array.from(document.querySelectorAll('table thead th')).map(e => e.textContent.trim());
    }""")
    print(f"Statements table headers: {headers}")

    # Get first row cells
    first_row = await page.evaluate("""() => {
        const row = document.querySelector('table tbody tr');
        if (!row) return null;
        return Array.from(row.querySelectorAll('td')).map(e => e.textContent.trim());
    }""")
    print(f"Statements first row cells: {first_row}")

    # Count rows
    row_count = await page.evaluate("() => document.querySelectorAll('table tbody tr').length")
    print(f"Statements row count: {row_count}")

    await page.screenshot(path="/app/test_reports/iter100_statements.png", quality=40, full_page=False)
except Exception as e:
    print(f"Statements test error: {e}")

# ---------- Test 4: Regression - click through visible sidebar items ----------
try:
    # Get all nav items via testids for stable navigation
    nav_items = await page.evaluate("""() => {
        return Array.from(document.querySelectorAll('.admin-nav-item')).map(e => ({
            testid: e.getAttribute('data-testid'),
            label: e.textContent.trim(),
            href: e.getAttribute('href')
        })).filter(x => x.testid && x.href);
    }""")
    print(f"\nRegression: iterating {len(nav_items)} nav items")

    error_screens = []
    for item in nav_items:
        try:
            await page.goto(f"{BASE}{item['href']}", wait_until="domcontentloaded")
            await page.wait_for_timeout(1200)
            err = await page.query_selector('[data-testid="admin-screen-error"]')
            body_text = await page.evaluate("() => document.body.innerText.length")
            if err:
                error_screens.append({"label": item['label'], "href": item['href'], "reason": "error_boundary"})
                print(f"  ERROR ({item['label']} @ {item['href']}): error boundary shown")
            elif body_text < 500:
                error_screens.append({"label": item['label'], "href": item['href'], "reason": f"very_short_body_{body_text}"})
                print(f"  WARN ({item['label']} @ {item['href']}): body only {body_text} chars")
            else:
                pass  # OK
        except Exception as ex:
            error_screens.append({"label": item['label'], "href": item['href'], "reason": f"nav_ex_{ex}"})

    print(f"\nRegression summary: {len(error_screens)} screens with problems")
    for e in error_screens:
        print(f"  - {e}")
except Exception as e:
    print(f"Regression test error: {e}")

# ---------- Final: page errors ----------
print(f"\n=== Console errors captured: {len(console_errors)} ===")
for ce in console_errors[:20]:
    print(f"  {ce[:200]}")
print(f"=== Page errors captured: {len(page_errors)} ===")
for pe in page_errors[:20]:
    print(f"  {pe[:200]}")

print("\nAll admin tests completed.")
