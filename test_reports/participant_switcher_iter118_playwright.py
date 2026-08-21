"""
Focused bug-verification script for participant switcher cascade/data isolation.
Iteration 118 retest: App.js reassessment-letter guard was relaxed for logged-in users.

Run context: Playwright Python body executed inside an async function with `page` available.
"""
import json

BASE = "https://statement-checker-3.preview.emergentagent.com"
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

async def current_active_id():
    return await page.evaluate("() => window.localStorage.getItem('wayly_active_participant_id')")

async def switch_to(participant, label):
    await page.locator('[data-testid="participant-switcher-trigger"]').click(force=True)
    await page.wait_for_selector('[data-testid="participant-switcher-menu"]', timeout=10000)
    await page.locator(f'[data-testid="participant-option-{participant["id"]}"]').click(force=True)
    await page.wait_for_timeout(900)
    trigger_text = await page.locator('[data-testid="participant-switcher-trigger"]').inner_text()
    active_id = await current_active_id()
    expected_first = participant.get("first_name") or (participant.get("name") or "").split(" ")[0]
    ok = active_id == participant["id"] and expected_first in trigger_text
    cls = participant.get("classification")
    if cls:
        ok = ok and (f"L{cls}" in trigger_text or f"Classification {cls}" in trigger_text)
    record(ok, f"header participant switcher reflects {label}", f"trigger='{trigger_text}', active_id={active_id}, expected={participant['id']}")

try:
    await page.set_viewport_size({"width": 1920, "height": 1080})
    await page.add_init_script("""() => { try { localStorage.clear(); sessionStorage.clear(); } catch(e) {} }""")

    print("Test plan: confirm no relevant testing skill found; inspect App.js guard; anonymous direct reassessment route must still redirect; login as Cathy, switch Robert/Dorothy in the header, then verify Reassessment Letter prefill and previously passing participant-scope cascade checks via UI state and API request evidence.")
    print("No relevant testing skill found.")

    # Anonymous regression first: no query params should redirect to Letters & Follow-ups hub.
    await page.goto(f"{BASE}/ai-tools/reassessment-letter", wait_until="domcontentloaded")
    await page.wait_for_timeout(2500)
    anon_url = page.url
    anon_rl_count = await page.locator('[data-testid="rl-participant"]').count()
    record("/ai-tools/letters-and-follow-ups" in anon_url and anon_rl_count == 0,
           "anonymous /ai-tools/reassessment-letter still redirects to Letters & Follow-ups",
           f"url={anon_url}, rl_count={anon_rl_count}")

    # Login.
    await page.goto(f"{BASE}/login", wait_until="domcontentloaded")
    await page.locator('[data-testid="login-email-input"]').fill(EMAIL)
    await page.locator('[data-testid="login-password-input"]').fill(PASSWORD)
    await page.locator('[data-testid="login-submit-button"]').click()
    await page.wait_for_url("**/app**", timeout=30000)
    await page.wait_for_selector('[data-testid="participant-switcher-trigger"]', timeout=30000)
    record(True, "Cathy login and participant switcher present")

    account = await page.evaluate("""async () => {
        const token = localStorage.getItem('kindred_token');
        const res = await fetch('/api/account', { headers: { Authorization: `Bearer ${token}` } });
        return await res.json();
    }""")
    participants = account.get("participants") or []
    print("Participants from /api/account:", json.dumps([{k:p.get(k) for k in ['id','first_name','last_name','name','classification','is_primary']} for p in participants], indent=2))
    dorothy = next((p for p in participants if (p.get("first_name") or "").lower() == "dorothy"), None) or next((p for p in participants if p.get("is_primary")), None) or (participants[0] if participants else None)
    robert = next((p for p in participants if (p.get("first_name") or "").lower() == "robert"), None) or next((p for p in participants if p.get("id") != (dorothy or {}).get("id")), None)
    if not dorothy or not robert:
        raise RuntimeError(f"Could not identify two participants; participants={participants}")
    dorothy_name = f"{dorothy.get('first_name','')} {dorothy.get('last_name','')}".strip() or dorothy.get("name") or "Dorothy"
    robert_name = f"{robert.get('first_name','')} {robert.get('last_name','')}".strip() or robert.get("name") or "Robert"
    record(True, "identified Dorothy and Robert participant ids", f"Dorothy={dorothy['id']}, Robert={robert['id']}")

    # Primary final check: authenticated direct reassessment route renders form and follows participant switch.
    await switch_to(robert, "Robert")
    await page.goto(f"{BASE}/ai-tools/reassessment-letter", wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="reassessment-form"]', timeout=30000)
    current_url = page.url
    rl_count = await page.locator('[data-testid="rl-participant"]').count()
    robert_prefill = await page.locator('[data-testid="rl-participant"]').input_value() if rl_count else ""
    record("/ai-tools/reassessment-letter" in current_url and "/ai-tools/letters-and-follow-ups" not in current_url and rl_count == 1 and robert_name in robert_prefill,
           "authenticated direct /ai-tools/reassessment-letter renders standalone form with Robert prefill",
           f"url={current_url}, rl_count={rl_count}, value='{robert_prefill}'")
    await switch_to(dorothy, "Dorothy")
    await page.wait_for_timeout(1500)
    dorothy_prefill = await page.locator('[data-testid="rl-participant"]').input_value()
    record(dorothy_name in dorothy_prefill and robert_name not in dorothy_prefill,
           "Reassessment Letter participant_name prefill updates to Dorothy after header switch",
           f"before='{robert_prefill}', after='{dorothy_prefill}'")

    # ATHM cascade: URL must include Robert id and not Dorothy id.
    await switch_to(robert, "Robert")
    before = len(requests)
    await page.goto(f"{BASE}/app/athm/projects", wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="athm-projects-root"]', timeout=20000)
    await page.wait_for_timeout(1500)
    athm_reqs = [r for r in requests[before:] if r["method"] == "GET" and "/api/athm1/participants/" in r["url"] and "/projects" in r["url"]]
    record(any(robert["id"] in r["url"] for r in athm_reqs) and not any(dorothy["id"] in r["url"] for r in athm_reqs),
           "ATHM projects fetch uses selected Robert id only",
           json.dumps(athm_reqs[-4:], indent=2))
    detail_count = await page.locator('[data-testid^="athm-project-detail-"]').count()
    record(detail_count == 0, "ATHM has no stale project detail open after participant-scoped load", f"detail_count={detail_count}")

    # CSC form state should reset on participant switch.
    await page.goto(f"{BASE}/app/csc/stream-mix-and-iat", wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="csc2-root"]', timeout=20000)
    await page.locator('[data-testid="sm-toggle-hcp"] input').check(force=True)
    await page.locator('[data-testid="sm-toggle-hospital"] input').check(force=True)
    hcp_before = await page.locator('[data-testid="sm-toggle-hcp"] input').is_checked()
    hosp_before = await page.locator('[data-testid="sm-toggle-hospital"] input').is_checked()
    record(hcp_before and hosp_before, "CSC partial stream-mix form accepts Robert-only temporary input")
    await switch_to(dorothy, "Dorothy")
    await page.wait_for_selector('[data-testid="csc2-root"]', timeout=20000)
    await page.wait_for_timeout(500)
    hcp_after = await page.locator('[data-testid="sm-toggle-hcp"] input').is_checked()
    hosp_after = await page.locator('[data-testid="sm-toggle-hospital"] input').is_checked()
    record(not hcp_after and not hosp_after, "CSC StreamMixForm remount clears previous participant form state", f"after hcp={hcp_after}, hospital={hosp_after}")

    # Ask Wayly: start as Robert, switch, panel resets, next start uses Dorothy.
    await switch_to(robert, "Robert")
    await page.goto(f"{BASE}/app/ask-wayly", wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="aw2-root"]', timeout=20000)
    await page.locator('[data-testid="aw2-input"]').fill("Can you give medication advice?")
    async with page.expect_request(lambda req: req.method == "POST" and "/api/aw2/conversations" in req.url, timeout=15000) as aw_req_ctx:
        await page.locator('[data-testid="aw2-send"]').click(force=True)
    aw_req = await aw_req_ctx.value
    aw_payload = aw_req.post_data or ""
    record(robert["id"] in aw_payload and dorothy["id"] not in aw_payload, "Ask Wayly initial conversation POST uses Robert id", aw_payload)
    await page.wait_for_selector('[data-testid^="aw2-msg-user-"]', timeout=45000)
    await switch_to(dorothy, "Dorothy")
    await page.wait_for_selector('[data-testid="aw2-empty"]', timeout=15000)
    msg_count_after_switch = await page.locator('[data-testid^="aw2-msg-"]').count()
    record(msg_count_after_switch == 0, "Ask Wayly conversation panel resets to empty after participant switch", f"message_count={msg_count_after_switch}")
    await page.locator('[data-testid="aw2-input"]').fill("Can you give medication advice?")
    async with page.expect_request(lambda req: req.method == "POST" and "/api/aw2/conversations" in req.url, timeout=15000) as aw_req2_ctx:
        await page.locator('[data-testid="aw2-send"]').click(force=True)
    aw_req2 = await aw_req2_ctx.value
    aw_payload2 = aw_req2.post_data or ""
    record(dorothy["id"] in aw_payload2 and robert["id"] not in aw_payload2, "Ask Wayly next conversation POST uses switched Dorothy id", aw_payload2)

    # LF2: navigate hardship, move to final step, switch participant, generate; payload must be current active id.
    await switch_to(robert, "Robert")
    await page.goto(f"{BASE}/app/tools/contribution-estimator/hardship-walkthrough", wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="hardship-walkthrough-page"]', timeout=20000)
    for _ in range(10):
        if await page.locator('[data-testid="lf2-chain-generate-hardship_full"]').count() > 0:
            break
        await page.locator('[data-testid="hardship-next-btn"]').click(force=True)
        await page.wait_for_timeout(250)
    await switch_to(dorothy, "Dorothy")
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
    record(dorothy["id"] in lf_payload and robert["id"] not in lf_payload, "LF2 generate-chain payload uses current switched Dorothy id", lf_payload)

    # Data isolation headers/paths on dashboard BC2, statements, care plans, aw2 context while Robert is selected.
    await switch_to(robert, "Robert")
    before = len(requests)
    await page.goto(f"{BASE}/app", wait_until="domcontentloaded")
    await page.wait_for_timeout(2500)
    bc2_reqs = [r for r in requests[before:] if "/api/bc2/participants/" in r["url"] and "/projection" in r["url"]]
    bc2_card_present = await page.locator('[data-testid="bc2-projection-card"], [data-testid="bc2-projection-loading"]').count()
    record(bc2_card_present > 0 and any(robert["id"] in r["url"] for r in bc2_reqs), "Dashboard BC2 widget updates/fetches with Robert id", json.dumps(bc2_reqs[-3:], indent=2))

    before = len(requests)
    await page.goto(f"{BASE}/app/statements", wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="statements-list-page"]', timeout=20000)
    await page.wait_for_timeout(1500)
    stmt_reqs = [r for r in requests[before:] if r["method"] == "GET" and ("/api/statements" in r["url"])]
    record(any(r.get("x_participant_id") == robert["id"] for r in stmt_reqs), "Statements requests carry selected Robert X-Participant-Id", json.dumps(stmt_reqs[-5:], indent=2))

    before = len(requests)
    await page.goto(f"{BASE}/app/care-plans", wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="care-plan-store"]', timeout=20000)
    await page.wait_for_timeout(1500)
    cp_reqs = [r for r in requests[before:] if r["method"] == "GET" and "/api/care-plans" in r["url"]]
    record(any(r.get("x_participant_id") == robert["id"] for r in cp_reqs), "Care plans requests carry selected Robert X-Participant-Id", json.dumps(cp_reqs[-5:], indent=2))

    before = len(requests)
    await page.goto(f"{BASE}/app/ask-wayly", wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="aw2-root"]', timeout=20000)
    await page.wait_for_timeout(1000)
    aw_ctx_reqs = [r for r in requests[before:] if r["method"] == "GET" and "/api/aw2/context" in r["url"]]
    record(any(r.get("x_participant_id") == robert["id"] for r in aw_ctx_reqs), "Ask Wayly context request carries selected Robert X-Participant-Id", json.dumps(aw_ctx_reqs[-3:], indent=2))

    # Get error messages using specific selectors.
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