/**
 * Per-route verification of Phase 1+2+3 fixes on production.
 * Runs Playwright (JS-aware) against the 13 previously broken pages.
 */
const { chromium } = require("playwright");

const checks = [
    { url: "https://wayly.com.au/legal/terms", expectTitle: /Terms of Service · Wayly/, expectSchemaTypes: ["Organization", "WebSite"] },
    { url: "https://wayly.com.au/legal/privacy", expectTitle: /Privacy Policy · Wayly/, expectSchemaTypes: ["Organization", "WebSite"] },
    { url: "https://wayly.com.au/legal/cookies", expectTitle: /Cookie Policy · Wayly/, expectSchemaTypes: ["Organization", "WebSite"] },
    { url: "https://wayly.com.au/legal/accessibility", expectTitle: /Accessibility Statement · Wayly/, expectSchemaTypes: ["Organization", "WebSite"] },
    { url: "https://wayly.com.au/legal/ai-disclaimer", expectTitle: /AI Accuracy Disclaimer · Wayly/, expectSchemaTypes: ["Organization", "WebSite"] },
    { url: "https://wayly.com.au/legal/ai-intent", expectTitle: /commitment when our AI gets it wrong · Wayly/, expectSchemaTypes: ["Organization", "WebSite"] },
    { url: "https://wayly.com.au/ai-tools/budget-calculator", expectTitle: /Budget Calculator · Wayly/, expectSchemaTypes: ["Organization", "WebSite", "SoftwareApplication"] },
    { url: "https://wayly.com.au/ai-tools/provider-price-checker", expectTitle: /Provider Price Checker · Wayly/, expectSchemaTypes: ["Organization", "WebSite", "SoftwareApplication"] },
    { url: "https://wayly.com.au/ai-tools/classification-self-check", expectTitle: /Classification Self-?Check · Wayly/, expectSchemaTypes: ["Organization", "WebSite", "SoftwareApplication"] },
    { url: "https://wayly.com.au/ai-tools/reassessment-letter", expectTitle: /Reassessment Letter Generator · Wayly/, expectSchemaTypes: ["Organization", "WebSite", "SoftwareApplication"] },
    { url: "https://wayly.com.au/ai-tools/contribution-estimator", expectTitle: /Contribution Estimator · Wayly/, expectSchemaTypes: ["Organization", "WebSite", "SoftwareApplication"] },
    { url: "https://wayly.com.au/ai-tools/care-plan-reviewer", expectTitle: /Care Plan Reviewer · Wayly/, expectSchemaTypes: ["Organization", "WebSite", "SoftwareApplication"] },
    { url: "https://wayly.com.au/ai-tools/family-coordinator", expectTitle: /Family Coordinator · Wayly/, expectSchemaTypes: ["Organization", "WebSite", "SoftwareApplication"] },
    { url: "https://wayly.com.au/pricing", expectTitle: /Pricing · Wayly|Wayly pricing/, expectSchemaTypes: ["Organization", "WebSite", "FAQPage", "Product"] },
    { url: "https://wayly.com.au/resources/articles/wayly-statement-decoder-support-at-home-statement-explained", expectTitle: /Statement Decoder/, expectSchemaTypes: ["Organization", "WebSite", "Article", "FAQPage", "BreadcrumbList", "HowTo"], expectByline: "Antony Chiware", expectReviewer: "To be confirmed" },
];

(async () => {
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    const results = [];
    for (const c of checks) {
        const page = await ctx.newPage();
        try {
            await page.goto(c.url, { waitUntil: "networkidle", timeout: 30000 });
            await page.waitForTimeout(800);
            const title = await page.title();
            const titleOk = c.expectTitle.test(title);
            const canonical = await page.evaluate(() => document.querySelector('link[rel=canonical]')?.href);
            const ogLocale = await page.evaluate(() => document.querySelector('meta[property="og:locale"]')?.content);
            const types = await page.evaluate(() => {
                const out = [];
                document.querySelectorAll('script[type="application/ld+json"]').forEach((s) => {
                    try {
                        const j = JSON.parse(s.textContent);
                        const collect = (o) => {
                            if (!o) return;
                            if (Array.isArray(o)) return o.forEach(collect);
                            if (o["@type"]) out.push(Array.isArray(o["@type"]) ? o["@type"].join("|") : o["@type"]);
                            if (o["@graph"]) o["@graph"].forEach(collect);
                        };
                        collect(j);
                    } catch {}
                });
                return [...new Set(out)];
            });
            const schemaOk = c.expectSchemaTypes.every((t) => types.includes(t));
            let bylineOk = true, reviewerOk = true;
            if (c.expectByline) {
                const byline = await page.locator("[data-testid=article-byline]").textContent().catch(() => "");
                bylineOk = byline.includes(c.expectByline);
            }
            if (c.expectReviewer) {
                const r = await page.locator("[data-testid=article-reviewer]").textContent().catch(() => "");
                reviewerOk = r.includes(c.expectReviewer);
            }
            const allOk = titleOk && schemaOk && canonical && ogLocale === "en_AU" && bylineOk && reviewerOk;
            results.push({ url: c.url, title, titleOk, canonical: !!canonical, ogLocale, types, schemaOk, bylineOk, reviewerOk, allOk });
            console.log(`${allOk ? "✅" : "❌"} ${c.url.replace("https://wayly.com.au", "")} | title=${titleOk} schema=${schemaOk} canonical=${!!canonical} ogLocale=${ogLocale}${c.expectByline ? ` byline=${bylineOk}` : ""}${c.expectReviewer ? ` reviewer=${reviewerOk}` : ""}`);
        } catch (e) {
            results.push({ url: c.url, error: e.message });
            console.log(`❌ ${c.url} → ${e.message}`);
        } finally {
            await page.close();
        }
    }
    await browser.close();
    const passed = results.filter((r) => r.allOk).length;
    console.log(`\n${passed}/${checks.length} checks passed`);
    require("fs").writeFileSync("/app/audit-output/verify.json", JSON.stringify(results, null, 2));
})();
