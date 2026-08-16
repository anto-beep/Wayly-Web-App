"""Iteration 119 focused Playwright test for profile participant-switcher bug.

Executed via mcp_browser_automation against:
https://mobile-parity-sweep.preview.emergentagent.com

Credentials: cathy@example.com / testpass123
Result: PARTIAL PASS, final direct-navigation assertion failed.
"""

async def run(page):
    base = "https://mobile-parity-sweep.preview.emergentagent.com"
    await page.set_viewport_size({"width": 1920, "height": 1080})

    async def account_participants():
        return await page.evaluate("""async () => {
            const token = localStorage.getItem('kindred_token');
            const r = await fetch('/api/account', {headers: token ? {Authorization: `Bearer ${token}`} : {}});
            if (!r.ok) throw new Error(`/api/account ${r.status}`);
            return (await r.json()).participants || [];
        }""")

    async def expected_profile_names(pid):
        return await page.evaluate("""async (pid) => {
            const token = localStorage.getItem('kindred_token');
            const r = await fetch(`/api/core/participants/${pid}/profile`, {headers: token ? {Authorization: `Bearer ${token}`} : {}});
            if (!r.ok) return [];
            const p = (await r.json()).participant || {};
            return [p.preferred_name, p.first_name, p.display_name, p.name].filter(Boolean);
        }""", pid)

    def h1_matches(h1, names):
        h = (h1 or "").strip().lower()
        return any(h.startswith((n or "").strip().lower()) for n in names)

    # Anonymous /app/me regression.
    await page.goto(base, wait_until="domcontentloaded")
    await page.evaluate("localStorage.clear(); sessionStorage.clear();")
    await page.context.clear_cookies()
    await page.goto(f"{base}/app/me", wait_until="domcontentloaded")
    await page.wait_for_url("**/login", timeout=15000)

    # Login.
    await page.locator('[data-testid="login-email-input"]').fill("cathy@example.com")
    await page.locator('[data-testid="login-password-input"]').fill("testpass123")
    await page.locator('[data-testid="login-submit-button"]').click()
    await page.wait_for_url("**/app", timeout=30000)
    await page.wait_for_selector('[data-testid="participant-switcher-trigger"]', timeout=30000)

    participants = await account_participants()
    primary = next((p for p in participants if p.get("is_primary")), participants[0])
    nonprimary = next((p for p in participants if (p.get("first_name") or "").lower() == "andrew" and p.get("id") != primary.get("id")), None)
    nonprimary = nonprimary or next((p for p in participants if (p.get("first_name") or "").lower() == "robert" and p.get("id") != primary.get("id")), None)
    nonprimary = nonprimary or next(p for p in participants if p.get("id") != primary.get("id"))

    # Main bug: switch to non-primary, click Profile, verify body + highlight.
    await page.locator('[data-testid="participant-switcher-trigger"]').click()
    await page.locator(f'button[data-testid="participant-option-{nonprimary["id"]}"]').click(force=True)
    await page.locator('a[data-testid="nav-profile"]').click()
    await page.wait_for_url(f"**/app/participants/{nonprimary['id']}**", timeout=20000)
    await page.wait_for_selector('[data-testid="core1-participant-profile"]', timeout=20000)
    h1 = await page.locator('[data-testid="core1-profile-header"] h1').inner_text()
    assert h1_matches(h1, await expected_profile_names(nonprimary["id"]))
    klass = await page.locator('a[data-testid="nav-profile"]').get_attribute("class")
    assert "bg-primary-k" in klass and "text-white" in klass

    # Switch while already on a profile URL.
    await page.locator('[data-testid="participant-switcher-trigger"]').click()
    await page.locator(f'button[data-testid="participant-option-{primary["id"]}"]').click(force=True)
    await page.wait_for_url(f"**/app/participants/{primary['id']}**", timeout=20000)
    h1 = await page.locator('[data-testid="core1-profile-header"] h1').inner_text()
    assert h1_matches(h1, await expected_profile_names(primary["id"]))

    # Failing case found: direct/bookmarked non-primary URL is overwritten by stored active primary.
    await page.goto(f"{base}/app/participants/{nonprimary['id']}", wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="participant-switcher-trigger"]', timeout=30000)
    await page.wait_for_timeout(2500)
    h1 = await page.locator('[data-testid="core1-profile-header"] h1').inner_text()
    assert nonprimary["id"] in page.url and h1_matches(h1, await expected_profile_names(nonprimary["id"])), (
        f"Direct nav did not respect URL participant. URL={page.url}, h1={h1}"
    )