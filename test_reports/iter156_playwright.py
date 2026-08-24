
EM = "\u2014"
EN = "\u2013"

async def run(page):
    await page.set_viewport_size({"width": 390, "height": 844})

    # LOGIN
    try:
        await page.goto("https://proration-preview.expo.preview.emergentagent.com/login", wait_until="networkidle", timeout=45000)
        await page.wait_for_timeout(2500)
        inputs = await page.query_selector_all("input")
        print("login inputs count", len(inputs))
        if len(inputs) >= 2:
            await inputs[0].fill("cathy@example.com")
            await inputs[1].fill("testpass123")
        submit = await page.query_selector('[data-testid="login-submit"]')
        if submit:
            await submit.click(force=True)
        else:
            btns = await page.query_selector_all('div[role="button"], button')
            for b in btns:
                t = (await b.text_content()) or ""
                if "sign in" in t.lower() or "log in" in t.lower():
                    await b.click(force=True); break
        await page.wait_for_timeout(7000)
        print("post-login URL:", page.url)
    except Exception as e:
        print("login error:", e)

    NEW_SCREENS = [
        ("/amendments", "amend-toggle", "Care"),
        ("/scenarios", "scenario-toggle", "Log a Scenario"),
        ("/athm", "athm-toggle", "AT"),
        ("/letters", "letters-new", "Letters"),
        ("/chsp-tools", None, "CHSP"),
        ("/classification-prep", None, "Classification"),
    ]
    for path, testid, label in NEW_SCREENS:
        try:
            await page.goto("https://proration-preview.expo.preview.emergentagent.com" + path, wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(3500)
            text = await page.evaluate("() => document.body.innerText.substring(0, 4000)")
            print("\n===", path, "===")
            print("URL:", page.url)
            print("Contains label:", label.lower() in text.lower())
            print("Unmatched:", "unmatched route" in text.lower())
            if testid:
                el = await page.query_selector('[data-testid="' + testid + '"]')
                print("has testID", testid, ":", el is not None)
            print("em-dashes:", text.count(EM), "en-dashes:", text.count(EN))
            fn = path.replace("/", "_")
            await page.screenshot(path="/app/test_reports/iter156" + fn + ".jpeg", quality=40, full_page=False)
        except Exception as e:
            print("error", path, ":", e)

    print("\nDONE PART1")

await run(page)
