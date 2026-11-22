async def run_test(page, output_dir, page_url):

    import asyncio

    console_errors = []
    page.on("console", lambda msg: console_errors.append(f"{msg.type}: {msg.text}") if msg.type in ("error", "warning") else None)
    page.on("pageerror", lambda err: console_errors.append(f"PAGEERROR: {err}"))

    try:
        await page.set_viewport_size({"width": 1440, "height": 900})
        await page.wait_for_load_state("networkidle", timeout=15000)

        # Ensure light mode: remove 'dark' class if present
        await page.evaluate("""() => {
            document.documentElement.classList.remove('dark');
            try { localStorage.setItem('theme', 'light'); } catch (e) {}
        }""")

        # Login
        await page.fill('input[type="email"]', "samburke@test.com")
        await page.fill('input[type="password"]', "CarTest123$")
        # Find submit
        submit = await page.query_selector('button[type="submit"]')
        await submit.click(force=True)
        print("Submitted login")

        # Wait for dashboard
        await page.wait_for_url("**/app**", timeout=20000)
        await page.wait_for_load_state("networkidle", timeout=15000)
        await page.wait_for_timeout(1500)

        # Re-assert light mode after any theme init
        is_dark = await page.evaluate("document.documentElement.classList.contains('dark')")
        print(f"Dark mode active? {is_dark}")
        if is_dark:
            await page.evaluate("document.documentElement.classList.remove('dark')")
            await page.wait_for_timeout(300)

        current_url = page.url
        print(f"Current URL: {current_url}")

        # Inspect the two header separator spans
        sep_info = await page.evaluate("""() => {
            const spans = Array.from(document.querySelectorAll('header span[aria-hidden="true"].h-6.w-px'));
            return spans.map(s => {
                const r = s.getBoundingClientRect();
                const cs = getComputedStyle(s);
                return {
                    className: s.className,
                    visible: r.width > 0 && r.height > 0,
                    width: r.width,
                    height: r.height,
                    top: r.top,
                    left: r.left,
                    backgroundColor: cs.backgroundColor,
                    display: cs.display,
                    opacity: cs.opacity
                };
            });
        }""")
        print(f"Header separators found: {len(sep_info)}")
        for i, s in enumerate(sep_info):
            print(f"  Separator {i}: {s}")

        # Also fetch header bg for contrast context
        header_bg = await page.evaluate("""() => {
            const h = document.querySelector('header.app-topbar');
            if (!h) return null;
            const cs = getComputedStyle(h);
            return { bg: cs.backgroundColor, color: cs.color };
        }""")
        print(f"Header styles: {header_bg}")

        # Screenshot full header
        await page.screenshot(path="/app/.screenshots/automation_output/20261122_134709_7d88d208e7bf/header_light.jpeg", type="jpeg", quality=40, full_page=False)
        print("Full header screenshot saved")

        # Zoomed screenshot of top-right header region (where separators live)
        header = await page.query_selector('header.app-topbar')
        if header:
            box = await header.bounding_box()
            if box:
                clip = {"x": max(0, box["x"] + box["width"] - 700), "y": box["y"], "width": 700, "height": box["height"]}
                await page.screenshot(path="/app/.screenshots/automation_output/20261122_134709_7d88d208e7bf/header_right_zoom.jpeg", type="jpeg", quality=40, full_page=False, clip=clip)
                print(f"Zoomed header right region saved: {clip}")

        # Verify dashboard key sections render
        dash_checks = await page.evaluate("""() => {
            const text = document.body.innerText || '';
            return {
                hasGreeting: /good (morning|afternoon|evening)|hello|welcome/i.test(text),
                hasQuarterBudget: text.includes("This quarter") || text.toLowerCase().includes("care budget"),
                hasFundtrack: text.toLowerCase().includes("fundtrack") || text.toLowerCase().includes("fund track") || !!document.querySelector('[data-testid*="fundtrack"]'),
            };
        }""")
        print(f"Dashboard checks: {dash_checks}")

        # Dashboard screenshot
        await page.screenshot(path="/app/.screenshots/automation_output/20261122_134709_7d88d208e7bf/dashboard_light.jpeg", type="jpeg", quality=40, full_page=False)
        print("Dashboard screenshot saved")

        # Report console errors
        if console_errors:
            print("Console errors/warnings:")
            for e in console_errors[:20]:
                print(f"  {e}")
        else:
            print("No console errors/warnings")

    except Exception as e:
        print(f"Error: {e}")
        await page.screenshot(path="/app/.screenshots/automation_output/20261122_134709_7d88d208e7bf/error.jpeg", type="jpeg", quality=40, full_page=False)

