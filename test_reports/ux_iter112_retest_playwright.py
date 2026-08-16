"""
Focused UI retest for iteration 112:
- /app/wall rich PageIntro with three instructional cards
- Regression PageIntro presence on previously verified routes
- Sidebar Today + Guided Journeys grouping/order
- Title Case checks on selected routed pages

Run target: https://wayly-rn-build.preview.emergentagent.com
Credentials: cathy@example.com / testpass123
"""

BASE_URL = "https://wayly-rn-build.preview.emergentagent.com"


async def run(page):
    # This body is also passed to the MCP browser automation harness, which
    # provides an initialized async Playwright `page` object.
    import json

    await page.set_viewport_size({"width": 1920, "height": 1080})
    failures = []

    async def fail(msg):
        print(f"FAIL: {msg}")
        failures.append(msg)

    async def pass_step(msg):
        print(f"PASS: {msg}")

    async def get_page_intro_details():
        return await page.evaluate("""() => {
            const intro = document.querySelector('[data-testid="page-intro"]');
            if (!intro) return null;
            const cards = Array.from(intro.querySelectorAll('.grid > div')).map(card => ({
                title: (card.querySelector('p.text-xs')?.textContent || '').trim(),
                text: (card.textContent || '').replace(/\s+/g, ' ').trim(),
                liCount: card.querySelectorAll('li').length,
            }));
            return {
                h1: (intro.querySelector('h1')?.textContent || '').trim(),
                text: (intro.textContent || '').replace(/\s+/g, ' ').trim(),
                cardCount: cards.length,
                cards,
            };
        }""")

    async def assert_page_intro(route, label):
        await page.goto(f"{BASE_URL}{route}", wait_until="domcontentloaded")
        await page.wait_for_selector('[data-testid="page-intro"]', timeout=20000)
        details = await get_page_intro_details()
        if not details:
            await fail(f"{label} {route}: missing [data-testid=page-intro]")
            return None
        required = ["What This Does", "How to Use It", "What You Get"]
        missing = [title for title in required if title not in details["text"]]
        if missing:
            await fail(f"{label} {route}: PageIntro missing cards {missing}; text={details['text'][:200]}")
        elif details["cardCount"] != 3:
            await fail(f"{label} {route}: expected 3 PageIntro cards, got {details['cardCount']}")
        else:
            await pass_step(f"{label} {route}: PageIntro has three instructional cards; h1='{details['h1']}'")
        return details

    try:
        await page.context.clear_cookies()
        await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
        await page.evaluate("""() => { localStorage.clear(); sessionStorage.clear(); }""")
        await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")

        # Ensure desktop nav groups start open when the authenticated layout mounts.
        await page.evaluate("""() => {
            sessionStorage.setItem('wayly_nav_group_today', '1');
            sessionStorage.setItem('wayly_nav_group_guided_journeys', '1');
            sessionStorage.setItem('wayly_nav_group_ai_tools', '1');
            sessionStorage.setItem('wayly_nav_group_money', '1');
            sessionStorage.setItem('wayly_nav_group_care', '1');
            sessionStorage.setItem('wayly_nav_group_providers', '1');
        }""")

        await page.locator('[data-testid="login-email-input"]').fill('cathy@example.com')
        await page.locator('[data-testid="login-password-input"]').fill('testpass123')
        await page.locator('[data-testid="login-submit-button"]').click()
        await page.wait_for_url(lambda url: '/app' in url or '/onboarding' in url, timeout=25000)
        await page.wait_for_selector('[data-testid="primary-nav"]', timeout=25000)
        await pass_step("Logged in and authenticated sidebar rendered")

        # Sidebar group regression: Today and Guided Journeys order.
        nav_orders = await page.evaluate("""() => {
            const labels = (selector) => Array.from(document.querySelectorAll(`${selector} a span.flex-1`)).map(el => el.textContent.trim());
            return {
                today: labels('[data-testid="nav-group-today"]'),
                guided: labels('[data-testid="nav-group-guided_journeys"]'),
            };
        }""")
        expected_today = ["Dashboard", "Profile", "Family Wall", "All AI Tools"]
        expected_guided = ["Ask Wayly", "Carer Self-Check", "Classification Prep", "AT & HM Projects", "CHSP Tools", "Switch Provider"]
        if nav_orders["today"] != expected_today:
            await fail(f"Today nav order mismatch. expected={expected_today}, actual={nav_orders['today']}")
        else:
            await pass_step(f"Today nav contains only expected items/order: {nav_orders['today']}")
        if nav_orders["guided"] != expected_guided:
            await fail(f"Guided Journeys nav order mismatch. expected={expected_guided}, actual={nav_orders['guided']}")
        else:
            await pass_step(f"Guided Journeys order correct: {nav_orders['guided']}")

        # Fresh assertion for the previously missed route: /app/wall.
        wall = await assert_page_intro('/app/wall', 'fresh /app/wall retest')
        if wall:
            body_checks = {
                'What This Does': any(c['title'] == 'What This Does' and len(c['text']) > 60 for c in wall['cards']),
                'How to Use It': any(c['title'] == 'How to Use It' and c['liCount'] >= 3 for c in wall['cards']),
                'What You Get': any(c['title'] == 'What You Get' and c['liCount'] >= 2 for c in wall['cards']),
            }
            bad = [k for k, ok in body_checks.items() if not ok]
            if bad:
                await fail(f"/app/wall PageIntro cards present but insufficient instructional body content: {bad}; cards={json.dumps(wall['cards'])}")
            else:
                await pass_step("/app/wall PageIntro sub-cards all contain instructional/outcome text")

        # Regression routes from the review request.
        regression_routes = [
            ('/app/ask-wayly', 'Ask Wayly'),
            ('/app/carer/self-assessment', 'Carer Self-Check'),
            ('/app/csc/stream-mix-and-iat', 'Classification Prep'),
            ('/app/athm/projects', 'AT & HM Projects'),
            ('/app/chsp/tools', 'CHSP Tools'),
            ('/app/statements', 'Statements'),
            ('/app/statements/upload', 'Statement Upload'),
            ('/app/documents', 'Documents'),
            ('/app/reports', 'Reports'),
            ('/app/care-plans', 'Care Plans'),
            ('/app/tools/provider-price-checker/compare', 'Provider Comparison'),
            ('/app/tools/contribution-estimator/hardship-walkthrough', 'Hardship Walkthrough'),
        ]
        for route, label in regression_routes:
            await assert_page_intro(route, f"regression {label}")

        # Title Case regression checks.
        title_expectations = {
            '/app/csc/stream-mix-and-iat': 'Prepare for Your SAH Assessment',
            '/app/chsp/tools': 'Verify CHSP Billing. Consider a Move to Support at Home.',
            '/app/ask-wayly': 'Your Context-Aware Aged Care Assistant',
            '/app/documents': 'All Your Aged-Care Paperwork, in One Place',
            '/app/statements': 'Your Support at Home Statements',
        }
        for route, expected in title_expectations.items():
            await page.goto(f"{BASE_URL}{route}", wait_until="domcontentloaded")
            await page.wait_for_selector('[data-testid="page-intro"] h1', timeout=20000)
            actual = (await page.locator('[data-testid="page-intro"] h1').first.text_content() or '').strip()
            if actual != expected:
                await fail(f"Title mismatch on {route}: expected '{expected}', actual '{actual}'")
            else:
                await pass_step(f"Title case OK on {route}: '{actual}'")

        # Required specific error scan selector pattern from testing harness instructions.
        error_text = await page.evaluate("""() => {
            const errorElements = Array.from(document.querySelectorAll('.error, [class*="error"], [id*="error"]'));
            return errorElements.map(el => el.textContent).join(", ");
        }""")
        if error_text:
            print(f"Found error message: {error_text}")
        else:
            print("No error messages found on the page")

        if failures:
            raise AssertionError("; ".join(failures))
        print("RESULT: fixed - all focused UI checks passed")
    except Exception as exc:
        print(f"RESULT: failure - {exc}")
        raise
