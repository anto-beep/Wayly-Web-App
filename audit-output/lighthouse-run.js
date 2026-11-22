#!/usr/bin/env node
/* Run Lighthouse on a curated set of canonical pages — mobile + desktop. */
const fs = require("fs");
const lighthouse = require("lighthouse").default;
const chromeLauncher = require("chrome-launcher");

const OUT = "/app/audit-output/lighthouse";
const URLS = [
    "https://wayly.com.au/",
    "https://wayly.com.au/features",
    "https://wayly.com.au/pricing",
    "https://wayly.com.au/ai-tools/statement-decoder",
    "https://wayly.com.au/ai-tools/budget-calculator",
    "https://wayly.com.au/resources/articles",
    "https://wayly.com.au/resources/articles/support-at-home-statement",
    "https://wayly.com.au/resources/articles/wayly-statement-decoder-support-at-home-statement-explained",
];

async function run(url, form) {
    const chrome = await chromeLauncher.launch({ chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"], chromePath: "/usr/bin/google-chrome" });
    try {
        const opts = { logLevel: "error", output: "json", port: chrome.port, formFactor: form, screenEmulation: form === "mobile" ? { mobile: true, width: 360, height: 800, deviceScaleFactor: 2 } : { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }, onlyCategories: ["performance", "accessibility", "best-practices", "seo"] };
        const result = await lighthouse(url, opts);
        const c = result.lhr.categories;
        return {
            url, form,
            performance: Math.round((c.performance.score || 0) * 100),
            accessibility: Math.round((c.accessibility.score || 0) * 100),
            "best-practices": Math.round((c["best-practices"].score || 0) * 100),
            seo: Math.round((c.seo.score || 0) * 100),
            metrics: {
                LCP: result.lhr.audits["largest-contentful-paint"]?.numericValue,
                CLS: result.lhr.audits["cumulative-layout-shift"]?.numericValue,
                TBT: result.lhr.audits["total-blocking-time"]?.numericValue,
                FCP: result.lhr.audits["first-contentful-paint"]?.numericValue,
            },
        };
    } finally {
        await chrome.kill();
    }
}

(async () => {
    const all = [];
    for (const url of URLS) {
        for (const form of ["mobile", "desktop"]) {
            try {
                console.log(`LH ${form}: ${url}`);
                const r = await run(url, form);
                console.log(`   perf=${r.performance} a11y=${r.accessibility} bp=${r["best-practices"]} seo=${r.seo}`);
                all.push(r);
            } catch (e) {
                console.log(`   ERR: ${e.message}`);
                all.push({ url, form, error: e.message });
            }
        }
    }
    fs.writeFileSync(`${OUT}/scores.json`, JSON.stringify(all, null, 2));
    console.log("Saved scores.json");
})();
