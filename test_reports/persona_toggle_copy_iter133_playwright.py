"""Focused Playwright verification for homepage persona toggle copy fix.

Run context: this body is also executed via the browser automation harness.
It verifies the root page labels exactly match the requested copy, old strings
are absent from rendered page text, and the toggle still switches active state
and hero content.
"""

try:
    await page.set_viewport_size({"width": 1920, "height": 1080})
    await page.goto("https://mobile-parity-sweep.preview.emergentagent.com/", wait_until="networkidle", timeout=60000)
    print("Loaded homepage root URL")

    await page.evaluate("localStorage.removeItem('wayly_persona_intent')")
    await page.reload(wait_until="networkidle", timeout=60000)
    print("Cleared persona localStorage and reloaded")

    toggle = page.get_by_test_id("persona-toggle")
    await toggle.wait_for(state="visible", timeout=15000)
    caregiver = page.get_by_test_id("persona-toggle-caregiver")
    participant = page.get_by_test_id("persona-toggle-participant")

    caregiver_text = (await caregiver.inner_text()).strip()
    participant_text = (await participant.inner_text()).strip()
    print(f"Caregiver label: {caregiver_text}")
    print(f"Participant label: {participant_text}")
    assert caregiver_text == "I am a Caregiver", f"Caregiver label mismatch: {caregiver_text!r}"
    assert participant_text == "I am a Participant", f"Participant label mismatch: {participant_text!r}"
    print("Exact requested labels are visible")

    body_text = await page.locator("body").inner_text()
    assert "I'm a caregiver" not in body_text, "Old caregiver label is still visible in body text"
    assert "I'm the participant" not in body_text, "Old participant label is still visible in body text"
    print("Old persona toggle strings are absent from page body")

    initial_headline = (await page.get_by_test_id("hero-headline").inner_text()).strip()
    initial_caregiver_selected = await caregiver.get_attribute("aria-selected")
    initial_participant_selected = await participant.get_attribute("aria-selected")
    print(f"Initial active states: caregiver={initial_caregiver_selected}, participant={initial_participant_selected}; headline={initial_headline}")
    assert initial_caregiver_selected == "true", "Caregiver should be the default selected persona after localStorage clear"
    assert initial_participant_selected == "false", "Participant should be unselected by default"

    await participant.click()
    await page.wait_for_timeout(500)
    participant_headline = (await page.get_by_test_id("hero-headline").inner_text()).strip()
    participant_selected = await participant.get_attribute("aria-selected")
    caregiver_selected_after = await caregiver.get_attribute("aria-selected")
    print(f"After participant click: caregiver={caregiver_selected_after}, participant={participant_selected}; headline={participant_headline}")
    assert participant_selected == "true", "Participant did not become selected after click"
    assert caregiver_selected_after == "false", "Caregiver stayed selected after participant click"
    assert participant_headline != initial_headline, "Hero headline did not update after switching to participant"

    await caregiver.click()
    await page.wait_for_timeout(500)
    caregiver_headline = (await page.get_by_test_id("hero-headline").inner_text()).strip()
    caregiver_selected_final = await caregiver.get_attribute("aria-selected")
    participant_selected_final = await participant.get_attribute("aria-selected")
    print(f"After caregiver click: caregiver={caregiver_selected_final}, participant={participant_selected_final}; headline={caregiver_headline}")
    assert caregiver_selected_final == "true", "Caregiver did not become selected after click"
    assert participant_selected_final == "false", "Participant stayed selected after caregiver click"
    assert caregiver_headline == initial_headline, "Hero headline did not return to caregiver copy"

    error_text = await page.evaluate("""() => {
    const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
    return errorElements.map(el => el.textContent).join(", ");
    }""")
    if error_text:
        print(f"Found error message: {error_text}")
    else:
        print("No error messages found on the page")

    print("PERSONA_TOGGLE_COPY_TEST_PASS")
except Exception as exc:
    print(f"PERSONA_TOGGLE_COPY_TEST_FAIL: {exc}")
    raise