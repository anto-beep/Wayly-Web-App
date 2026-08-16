"""
Follow-up DOM probe for ambiguous checks from the main v11 bug verification.
Confirms homepage FAQ content and extracts exact stale pricing/adviser strings.
"""

BASE_URL = "https://wayly-rn-build.preview.emergentagent.com"

try:
    await page.set_viewport_size({"width": 1920, "height": 1080})
    await page.goto(f"{BASE_URL}/", wait_until="domcontentloaded")
    await page.wait_for_timeout(1200)
    faq_dump = await page.evaluate("""() => Array.from(document.querySelectorAll('details')).map((d, i) => ({ i, text: d.textContent.trim() })).filter(x => x.text.includes('How much'))""")
    print("HOMEPAGE_FAQ_MATCHES", faq_dump)

    await page.goto(f"{BASE_URL}/pricing", wait_until="domcontentloaded")
    await page.wait_for_timeout(1200)
    stale_pricing = await page.evaluate("""() => {
        const matches = [];
        const needles = ['Adviser', '$19/month', 'Billed monthly'];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            const text = walker.currentNode.textContent.trim();
            if (!text) continue;
            for (const n of needles) {
                if (text.includes(n)) matches.push({ needle: n, text });
            }
        }
        return matches;
    }""")
    print("PRICING_STALE_TEXT_MATCHES", stale_pricing)
except Exception as exc:
    print(f"FOLLOWUP_EXCEPTION: {type(exc).__name__}: {exc}")
    raise