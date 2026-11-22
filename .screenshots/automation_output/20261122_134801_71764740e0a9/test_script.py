async def run_test(page, output_dir, page_url):

    # Confirmation pass: log in, wait for toast to disappear, then zoom on the exact separator region
    try:
        await page.set_viewport_size({"width": 1440, "height": 900})
        await page.wait_for_load_state("networkidle", timeout=15000)
        await page.evaluate("document.documentElement.classList.remove('dark')")

        await page.fill('input[type="email"]', "samburke@test.com")
        await page.fill('input[type="password"]', "CarTest123$")
        await page.click('button[type="submit"]', force=True)
        await page.wait_for_url("**/app**", timeout=20000)
        await page.wait_for_load_state("networkidle", timeout=10000)

        # Wait for the welcome toast to auto-dismiss
        await page.wait_for_timeout(6000)

        # Force-hide any remaining toast/alert overlays in the header area
        await page.evaluate("""() => {
            document.querySelectorAll('[role="status"], [role="alert"], .sonner-toast, [class*="toast"]').forEach(n => { n.style.display = 'none'; });
        }""")

        # Also re-check computed background on the separators now
        sep_bg = await page.evaluate("""() => {
            const spans = Array.from(document.querySelectorAll('header span[aria-hidden="true"].h-6.w-px'));
            return spans.map(s => {
                const cs = getComputedStyle(s);
                const r = s.getBoundingClientRect();
                return {bg: cs.backgroundColor, w: r.width, h: r.height, x: r.left, y: r.top};
            });
        }""")
        print(f"Separator computed bg (post-toast-dismiss): {sep_bg}")

        # Zoom tightly on the right side of the header
        header = await page.query_selector('header.app-topbar')
        box = await header.bounding_box()
        clip = {"x": max(0, box["x"] + box["width"] - 550), "y": box["y"], "width": 550, "height": box["height"]}
        await page.screenshot(path="/app/.screenshots/automation_output/20261122_134801_71764740e0a9/header_right_clean.jpeg", type="jpeg", quality=40, full_page=False, clip=clip)
        print(f"Clean header right screenshot saved: {clip}")

        # Also pixel-sample the vertical line at the separator x in a 3x3 patch via canvas trick: we'll use JS to read styles only (no canvas)
        # Compare against a known-visible border below (header border-b border-kindred)
        border_sample = await page.evaluate("""() => {
            const h = document.querySelector('header.app-topbar');
            const cs = getComputedStyle(h);
            return {borderBottomColor: cs.borderBottomColor, borderBottomWidth: cs.borderBottomWidth, background: cs.backgroundColor};
        }""")
        print(f"Header border/bg: {border_sample}")

    except Exception as e:
        print(f"Error: {e}")

