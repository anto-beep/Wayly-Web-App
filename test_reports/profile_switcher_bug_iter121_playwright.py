"""Iteration 120 focused Playwright verification for participant profile switcher bug.

Preview: https://wayly-rn-build.preview.emergentagent.com
Credentials: cathy@example.com / testpass123
Focus: profile direct URL vs persisted active participant, switcher profile rerender,
/app/me active participant redirect, sidebar Profile highlight, and focused cascade
regression checks for ATHM/CSC/Ask Wayly/LF-2/BC-2.
"""

import json

BASE = "https://wayly-rn-build.preview.emergentagent.com"
DOROTHY_ID = "0c538637-b0dd-4982-8f78-b32814c6a5eb"
ROBERT_ID = "seed-robert_kowalski-f0844844"
EMAIL = "cathy@example.com"
PASSWORD = "testpass123"

results = []
failures = []
requests = []


def record(ok, name, detail=""):
    status = "PASS" if ok else "FAIL"
    msg = f"{status}: {name}"
    if detail:
        msg += f" -- {detail}"
    print(msg)
    results.append({"ok": bool(ok), "name": name, "detail": detail})
    if not ok:
        failures.append({"name": name, "detail": detail})


def on_request(req):
    try:
        if "/api/" in req.url:
            requests.append({
                "method": req.method,
                "url": req.url,
                "post_data": req.post_data or "",
                "x_participant_id": (req.headers or {}).get("x-participant-id"),
            })
    except Exception as exc:
        print(f"request capture error: {exc}")


page.on("request", on_request)


async def get_profile_names(pid):
    return await page.evaluate("""async (pid) => {
        const token = localStorage.getItem('kindred_token');
        const r = await fetch(`/api/core/participants/${pid}/profile`, {headers: token ? {Authorization: `Bearer ${token}`} : {}});
        if (!r.ok) throw new Error(`/api/core/participants/${pid}/profile ${r.status}`);
        const p = (await r.json()).participant || {};
        return [p.preferred_name, p.first_name, p.display_name, p.name].filter(Boolean);
    }""", pid)


def h1_matches_name(h1, names):
    h = (h1 or "").strip().lower()
    return any(h.startswith((n or "").strip().lower()) for n in names)


async def h1_text():
    await page.wait_for_selector('[data-testid="core1-participant-profile"]', timeout=30000)
    return await page.locator('[data-testid="core1-profile-header"] h1').inner_text()


async def trigger_text():
    await page.wait_for_selector('[data-testid="participant-switcher-trigger"]', timeout=30000)
    return (await page.locator('[data-testid="participant-switcher-trigger"]').inner_text()).strip()


async def switch_to(pid, expected_name):
    await page.locator('[data-testid="participant-switcher-trigger"]').click(force=True)
    await page.wait_for_selector('[data-testid="participant-switcher-menu"]', timeout=10000)
    await page.locator(f'[data-testid="participant-option-{pid}"]').click(force=True)
    await page.wait_for_timeout(900)
    active_id = await page.evaluate("() => localStorage.getItem('wayly_active_participant_id')")
    text = await trigger_text()
    record(active_id == pid and expected_name.lower() in text.lower(), f"switcher chip reflects {expected_name}", f"active_id={active_id}, trigger='{text}'")


try:
    await page.set_viewport_size({"width": 1920, "height": 1080})
    print("Test plan: login as Cathy; seed localStorage by opening Dorothy; direct navigate to Robert and verify URL/header/H1/Profile highlight; switch to Dorothy on profile; verify /app/me follows active Robert; then run focused ATHM/CSC/Ask Wayly/LF-2/BC-2 cascade checks.")
    print("No relevant testing skill found.")

    # Clean login.
    await page.goto(BASE, wait_until="domcontentloaded")
    await page.evaluate("localStorage.clear(); sessionStorage.clear();")
    await page.context.clear_cookies()
    await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
    await page.locator('[data-testid="login-email-input"]').fill(EMAIL)
    await page.locator('[data-testid="login-password-input"]').fill(PASSWORD)
    await page.locator('[data-testid="login-submit-button"]').click()
    await page.wait_for_url("**/app**", timeout=30000)
    await page.wait_for_selector('[data-testid="participant-switcher-trigger"]', timeout=30000)
    record(True, "Cathy login succeeded and participant switcher rendered")

    dorothy_names = await get_profile_names(DOROTHY_ID)
    robert_names = await get_profile_names(ROBERT_ID)
    record("Dorothy" in json.dumps(dorothy_names) and "Robert" in json.dumps(robert_names), "profile APIs expose Dorothy and Robert names", f"Dorothy={dorothy_names}, Robert={robert_names}")

    # Seed active participant/localStorage with Dorothy by first opening Dorothy's profile.
    await page.goto(f"{BASE}/app/participants/{DOROTHY_ID}", wait_until="domcontentloaded")
    await page.wait_for_timeout(2500)
    dorothy_h1 = await h1_text()
    dorothy_active = await page.evaluate("() => localStorage.getItem('wayly_active_participant_id')")
    record(DOROTHY_ID in page.url and dorothy_active == DOROTHY_ID and h1_matches_name(dorothy_h1, dorothy_names), "Dorothy profile loaded first and persisted active", f"url={page.url}, active={dorothy_active}, h1='{dorothy_h1}'")

    # Main retest: direct/bookmarked Robert URL must win over persisted Dorothy.
    await page.goto(f"{BASE}/app/participants/{ROBERT_ID}", wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="participant-switcher-trigger"]', timeout=30000)
    await page.wait_for_timeout(3000)
    robert_h1 = await h1_text()
    robert_trigger = await trigger_text()
    robert_active = await page.evaluate("() => localStorage.getItem('wayly_active_participant_id')")
    pathname = await page.evaluate("() => window.location.pathname")
    nav_profile_class = await page.locator('a[data-testid="nav-profile"]').get_attribute("class")
    record(pathname == f"/app/participants/{ROBERT_ID}" and DOROTHY_ID not in page.url, "direct Robert URL was not rewritten to Dorothy", f"url={page.url}, pathname={pathname}")
    record("Robert" in robert_trigger and robert_active == ROBERT_ID, "header participant chip shows Robert after direct URL", f"trigger='{robert_trigger}', active={robert_active}")
    record(h1_matches_name(robert_h1, robert_names) and "Dorothy" not in robert_h1 and "Mum" not in robert_h1, "profile H1 shows Robert data after direct URL", f"h1='{robert_h1}', expected_names={robert_names}")
    record("bg-primary-k" in (nav_profile_class or "") and "text-white" in (nav_profile_class or ""), "Profile nav item highlighted on canonical participant URL", f"class={nav_profile_class}")

    # Switcher wins after mount: while on Robert profile, selecting Dorothy updates URL and body.
    await switch_to(DOROTHY_ID, "Dorothy")
    await page.wait_for_url(f"**/app/participants/{DOROTHY_ID}**", timeout=20000)
    await page.wait_for_timeout(1500)
    switched_h1 = await h1_text()
    switched_trigger = await trigger_text()
    record(DOROTHY_ID in page.url and h1_matches_name(switched_h1, dorothy_names) and "Dorothy" in switched_trigger, "switcher on profile rerenders Dorothy profile and URL", f"url={page.url}, trigger='{switched_trigger}', h1='{switched_h1}'")

    # /app/me should redirect to active Robert when Profile nav is clicked.
    await switch_to(ROBERT_ID, "Robert")
    await page.locator('a[data-testid="nav-profile"]').click(force=True)
    await page.wait_for_url(f"**/app/participants/{ROBERT_ID}**", timeout=20000)
    await page.wait_for_timeout(1500)
    me_h1 = await h1_text()
    me_nav_class = await page.locator('a[data-testid="nav-profile"]').get_attribute("class")
    record(ROBERT_ID in page.url and h1_matches_name(me_h1, robert_names), "/app/me/Profile nav redirects to active Robert", f"url={page.url}, h1='{me_h1}'")
    record("bg-primary-k" in (me_nav_class or "") and "text-white" in (me_nav_class or ""), "Profile nav highlighted after /app/me active redirect", f"class={me_nav_class}")

    # Focused iter-117 cascade regressions.
    before = len(requests)
    await page.goto(f"{BASE}/app/athm/projects", wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="athm-projects-root"]', timeout=20000)
    await page.wait_for_timeout(1500)
    athm_reqs = [r for r in requests[before:] if r["method"] == "GET" and "/api/athm1/participants/" in r["url"] and "/projects" in r["url"]]
    record(any(ROBERT_ID in r["url"] for r in athm_reqs) and not any(DOROTHY_ID in r["url"] for r in athm_reqs), "ATHM cascade uses active Robert id", json.dumps(athm_reqs[-4:], indent=2))

    await page.goto(f"{BASE}/app/csc/stream-mix-and-iat", wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="csc2-root"]', timeout=20000)
    await page.locator('[data-testid="sm-toggle-hcp"] input').check(force=True)
    await page.locator('[data-testid="sm-toggle-hospital"] input').check(force=True)
    await switch_to(DOROTHY_ID, "Dorothy")
    await page.wait_for_selector('[data-testid="csc2-root"]', timeout=20000)
    await page.wait_for_timeout(700)
    hcp_after = await page.locator('[data-testid="sm-toggle-hcp"] input').is_checked()
    hosp_after = await page.locator('[data-testid="sm-toggle-hospital"] input').is_checked()
    record(not hcp_after and not hosp_after, "CSC switch remount clears previous participant form state", f"hcp_after={hcp_after}, hospital_after={hosp_after}")

    await switch_to(ROBERT_ID, "Robert")
    before = len(requests)
    await page.goto(f"{BASE}/app/ask-wayly", wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="aw2-root"]', timeout=20000)
    await page.wait_for_timeout(1200)
    aw_ctx_reqs = [r for r in requests[before:] if r["method"] == "GET" and "/api/aw2/context" in r["url"]]
    record(any(r.get("x_participant_id") == ROBERT_ID for r in aw_ctx_reqs), "Ask Wayly context request carries active Robert id", json.dumps(aw_ctx_reqs[-3:], indent=2))

    await page.goto(f"{BASE}/app/tools/contribution-estimator/hardship-walkthrough", wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="hardship-walkthrough-page"]', timeout=20000)
    for _ in range(10):
        if await page.locator('[data-testid="lf2-chain-generate-hardship_full"]').count() > 0:
            break
        await page.locator('[data-testid="hardship-next-btn"]').click(force=True)
        await page.wait_for_timeout(250)
    await switch_to(DOROTHY_ID, "Dorothy")
    for _ in range(10):
        if await page.locator('[data-testid="lf2-chain-generate-hardship_full"]').count() > 0:
            break
        await page.locator('[data-testid="hardship-next-btn"]').click(force=True)
        await page.wait_for_timeout(250)
    await page.locator('[data-testid="lf2-chain-generate-hardship_full"]').scroll_into_view_if_needed()
    async with page.expect_request(lambda req: req.method == "POST" and "/api/lf2/generate-chain" in req.url, timeout=15000) as lf_req_ctx:
        await page.locator('[data-testid="lf2-chain-generate-hardship_full"]').click(force=True)
    lf_req = await lf_req_ctx.value
    lf_payload = lf_req.post_data or ""
    record(DOROTHY_ID in lf_payload and ROBERT_ID not in lf_payload, "LF-2 generate-chain payload uses switched Dorothy id", lf_payload)

    await switch_to(ROBERT_ID, "Robert")
    before = len(requests)
    await page.goto(f"{BASE}/app", wait_until="domcontentloaded")
    await page.wait_for_timeout(2500)
    bc2_reqs = [r for r in requests[before:] if "/api/bc2/participants/" in r["url"] and "/projection" in r["url"]]
    bc2_visible = await page.locator('[data-testid="bc2-projection-card"], [data-testid="bc2-projection-loading"]').count()
    record(bc2_visible > 0 and any(ROBERT_ID in r["url"] for r in bc2_reqs), "BC-2 dashboard widget fetches active Robert id", json.dumps(bc2_reqs[-3:], indent=2))

    # Get error messages using specific selectors
    error_text = await page.evaluate("""() => {
    const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
    return errorElements.map(el => el.textContent).join(", ");
    }""")
    if error_text:
        print(f"Found error message: {error_text}")
    else:
        print("No error messages found on the page")

except Exception as exc:
    record(False, "script-level exception", repr(exc))

print("FINAL_RESULTS_JSON=" + json.dumps({"results": results, "failures": failures}, indent=2))
if failures:
    raise AssertionError(json.dumps(failures, indent=2))