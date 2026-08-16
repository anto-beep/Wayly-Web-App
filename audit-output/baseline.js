#!/usr/bin/env node
/**
 * Wayly baseline auditor — Phase 0
 * Crawls every URL in the production sitemap and captures:
 *   - title, meta description, H1 / H2 hierarchy
 *   - canonical, og:* / twitter:* tags
 *   - JSON-LD @types present
 *   - internal vs external links, broken-link 4xx/5xx flags
 *   - image alt-text coverage, word count
 *   - simplified axe-core scan (Playwright)
 * Lighthouse is run separately (one URL at a time, expensive).
 */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { default: AxeBuilder } = require("@axe-core/playwright");
const cheerio = require("cheerio");

const OUT = "/app/audit-output";
const ORIGIN = "https://wayly.com.au";

async function fetchSitemap() {
    const res = await fetch(`${ORIGIN}/api/public/seo/sitemap.xml`);
    const xml = await res.text();
    return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

async function inspect(page, url) {
    const errors = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch((e) => { errors.push(`nav: ${e.message}`); return null; });
    const status = resp?.status() ?? 0;
    if (status >= 400) return { url, status, error: `HTTP ${status}` };
    await page.waitForTimeout(800);
    const html = await page.content();
    const $ = cheerio.load(html);

    const title = $("title").first().text().trim();
    const desc = $('meta[name="description"]').attr("content") || "";
    const canonical = $('link[rel="canonical"]').attr("href") || "";
    const ogLocale = $('meta[property="og:locale"]').attr("content") || "";
    const ogTitle = $('meta[property="og:title"]').attr("content") || "";
    const ogImage = $('meta[property="og:image"]').attr("content") || "";
    const twCard = $('meta[name="twitter:card"]').attr("content") || "";
    const themeColor = $('meta[name="theme-color"]').attr("content") || "";
    const robots = $('meta[name="robots"]').attr("content") || "";

    const h1 = $("h1").map((_, el) => $(el).text().trim()).get().filter(Boolean);
    const h2 = $("h2").map((_, el) => $(el).text().trim()).get().filter(Boolean);

    const linksAll = $("a[href]").map((_, el) => $(el).attr("href")).get();
    const internal = [...new Set(linksAll.filter((h) => h && (h.startsWith("/") || h.startsWith(ORIGIN))).map((h) => h.startsWith("/") ? `${ORIGIN}${h}` : h))];
    const external = [...new Set(linksAll.filter((h) => h && /^https?:\/\//i.test(h) && !h.startsWith(ORIGIN)))];

    const images = $("img").map((_, el) => ({ src: $(el).attr("src") || "", alt: $(el).attr("alt") ?? null })).get();
    const imgCoverage = images.length === 0 ? 1 : images.filter((i) => i.alt !== null).length / images.length;

    const jsonLd = $('script[type="application/ld+json"]').map((_, el) => {
        try { return JSON.parse($(el).text()); } catch { return null; }
    }).get().filter(Boolean);
    const schemaTypes = [];
    const collectTypes = (obj) => {
        if (!obj) return;
        if (Array.isArray(obj)) return obj.forEach(collectTypes);
        if (obj["@type"]) schemaTypes.push(Array.isArray(obj["@type"]) ? obj["@type"].join("|") : obj["@type"]);
        if (obj["@graph"]) obj["@graph"].forEach(collectTypes);
    };
    jsonLd.forEach(collectTypes);

    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    const wordCount = bodyText.split(" ").length;

    // axe-core a11y scan
    let axeViolations = [];
    try {
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
        axeViolations = results.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            count: v.nodes.length,
        }));
    } catch (e) {
        errors.push(`axe: ${e.message}`);
    }

    return {
        url, status,
        title, titleLen: title.length,
        desc, descLen: desc.length,
        canonical, ogLocale, ogTitle, ogImage, twCard, themeColor, robots,
        h1, h2Count: h2.length, h2: h2.slice(0, 8),
        internalCount: internal.length, externalCount: external.length,
        external,
        images: { total: images.length, withAlt: images.filter((i) => i.alt !== null && i.alt !== "").length, decorative: images.filter((i) => i.alt === "").length, missing: images.filter((i) => i.alt === null).length, altCoverage: Number(imgCoverage.toFixed(2)) },
        schemaTypes: [...new Set(schemaTypes)],
        wordCount,
        axeViolations,
        axeTotal: axeViolations.reduce((a, b) => a + b.count, 0),
        errors,
    };
}

(async () => {
    const sitemap = await fetchSitemap();
    fs.writeFileSync(path.join(OUT, "url-inventory.json"), JSON.stringify({ generated: new Date().toISOString(), origin: ORIGIN, count: sitemap.length, urls: sitemap }, null, 2));
    console.log(`Inventory: ${sitemap.length} URLs`);

    const browser = await chromium.launch();
    const ctx = await browser.newContext({ userAgent: "WaylyAudit/1.0 (+SEO baseline)" });
    const results = [];
    for (let i = 0; i < sitemap.length; i++) {
        const url = sitemap[i];
        console.log(`[${i + 1}/${sitemap.length}] ${url}`);
        const page = await ctx.newPage();
        try {
            const r = await inspect(page, url);
            results.push(r);
        } catch (e) {
            results.push({ url, error: e.message });
        } finally {
            await page.close();
        }
    }
    await browser.close();

    // Linkinator scan for broken links — separate concurrent fetch
    const allLinks = new Set();
    results.forEach((r) => (r.external || []).forEach((l) => allLinks.add(l)));
    const linkCheck = {};
    await Promise.all([...allLinks].map(async (u) => {
        try {
            const r = await fetch(u, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(10000) });
            linkCheck[u] = { status: r.status, ok: r.ok };
        } catch (e) {
            linkCheck[u] = { status: 0, ok: false, error: e.message };
        }
    }));

    fs.writeFileSync(path.join(OUT, "baseline-report.json"), JSON.stringify({
        generated: new Date().toISOString(),
        origin: ORIGIN,
        pages: results,
        externalLinks: linkCheck,
    }, null, 2));

    console.log(`Done. ${results.length} pages audited.`);
})();
