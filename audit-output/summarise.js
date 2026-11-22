#!/usr/bin/env node
/* Summarise baseline-report.json + lighthouse/scores.json into a readable .md */
const fs = require("fs");
const data = JSON.parse(fs.readFileSync("/app/audit-output/baseline-report.json", "utf8"));
const lh = JSON.parse(fs.readFileSync("/app/audit-output/lighthouse/scores.json", "utf8"));

const pages = data.pages.filter((p) => !p.error);
const errored = data.pages.filter((p) => p.error);

const lines = [];
const push = (s = "") => lines.push(s);

push("# Wayly — Phase 0 Baseline Audit");
push(`*Generated ${data.generated} · Origin ${data.origin} · ${data.pages.length} URLs crawled*`);
push();

// Headline metrics
push("## 1. Headline metrics");
push("| Metric | Result |");
push("| --- | --- |");
push(`| URLs in sitemap | ${data.pages.length} |`);
push(`| Pages crawled OK | ${pages.length} |`);
push(`| Pages erroring | ${errored.length} |`);
push(`| Pages missing canonical | ${pages.filter((p) => !p.canonical).length} |`);
push(`| Pages missing og:locale | ${pages.filter((p) => !p.ogLocale).length} |`);
push(`| Pages missing og:title | ${pages.filter((p) => !p.ogTitle).length} |`);
push(`| Pages missing og:image | ${pages.filter((p) => !p.ogImage).length} |`);
push(`| Pages missing twitter:card | ${pages.filter((p) => !p.twCard).length} |`);
push(`| Pages missing theme-color | ${pages.filter((p) => !p.themeColor).length} |`);
push(`| Pages with NO json-ld schema | ${pages.filter((p) => p.schemaTypes.length === 0).length} |`);
push(`| Pages with multiple H1 (SEO smell) | ${pages.filter((p) => p.h1.length > 1).length} |`);
push(`| Pages with NO H1 | ${pages.filter((p) => p.h1.length === 0).length} |`);
push(`| Pages with title > 60 chars | ${pages.filter((p) => p.titleLen > 60).length} |`);
push(`| Pages with title < 30 chars | ${pages.filter((p) => p.titleLen < 30).length} |`);
push(`| Pages with desc > 160 chars | ${pages.filter((p) => p.descLen > 160).length} |`);
push(`| Pages with desc < 120 chars | ${pages.filter((p) => p.descLen < 120).length} |`);
push(`| Pages with axe violations | ${pages.filter((p) => p.axeTotal > 0).length} |`);
push(`| Total axe violations sitewide | ${pages.reduce((a, b) => a + b.axeTotal, 0)} |`);

const extTotal = Object.keys(data.externalLinks).length;
const extBroken = Object.values(data.externalLinks).filter((l) => !l.ok && l.status !== 405).length;
push(`| External links checked | ${extTotal} |`);
push(`| External links broken (non-405) | ${extBroken} |`);
push();

// Lighthouse scores
push("## 2. Lighthouse scores (curated 8 URLs)");
push("Mobile target: P 80+ · A 95+ · BP 90+ · SEO 95+. Currently far below on Performance.");
push();
push("| URL | Form | Perf | A11y | BP | SEO | LCP | CLS |");
push("| --- | --- | --- | --- | --- | --- | --- | --- |");
lh.forEach((r) => {
    if (r.error) return push(`| ${r.url.replace("https://wayly.com.au", "")} | ${r.form} | ERR | - | - | - | - | - |`);
    const lcp = r.metrics.LCP ? (r.metrics.LCP / 1000).toFixed(1) + "s" : "-";
    const cls = r.metrics.CLS != null ? r.metrics.CLS.toFixed(3) : "-";
    push(`| ${r.url.replace("https://wayly.com.au", "") || "/"} | ${r.form} | ${r.performance} | ${r.accessibility} | ${r["best-practices"]} | ${r.seo} | ${lcp} | ${cls} |`);
});
push();

// axe violations summary
push("## 3. Accessibility — sitewide axe-core violations");
const axeMap = {};
pages.forEach((p) => p.axeViolations.forEach((v) => {
    const k = v.id;
    axeMap[k] ??= { id: v.id, impact: v.impact, help: v.help, pages: 0, nodes: 0 };
    axeMap[k].pages++;
    axeMap[k].nodes += v.count;
}));
const axeRanked = Object.values(axeMap).sort((a, b) => b.nodes - a.nodes);
push("| Rule | Impact | Pages affected | Total node count | Description |");
push("| --- | --- | --- | --- | --- |");
axeRanked.forEach((v) => push(`| \`${v.id}\` | ${v.impact} | ${v.pages} | ${v.nodes} | ${v.help} |`));
push();

// schema coverage
push("## 4. Schema markup — current coverage");
const schemaMap = {};
pages.forEach((p) => p.schemaTypes.forEach((t) => { schemaMap[t] = (schemaMap[t] || 0) + 1; }));
push("| @type | Pages |");
push("| --- | --- |");
Object.entries(schemaMap).sort((a, b) => b[1] - a[1]).forEach(([t, n]) => push(`| ${t} | ${n} |`));
push();
push("### Pages with NO schema at all");
const noSchema = pages.filter((p) => p.schemaTypes.length === 0);
noSchema.forEach((p) => push(`- ${p.url}`));
push();

// Per-URL summary
push("## 5. Per-URL inventory (titles, descs, H1, schemas, scores)");
push("| URL | Title (len) | Desc len | H1 | Schemas | Internal | Alt cov | Axe |");
push("| --- | --- | --- | --- | --- | --- | --- | --- |");
pages.forEach((p) => {
    const u = p.url.replace("https://wayly.com.au", "") || "/";
    const t = (p.title || "—").slice(0, 60);
    const h1 = (p.h1[0] || "—").slice(0, 40);
    const schemas = p.schemaTypes.join(", ") || "—";
    push(`| \`${u}\` | ${t} (${p.titleLen}) | ${p.descLen} | ${h1} | ${schemas} | ${p.internalCount} | ${p.images.altCoverage} | ${p.axeTotal} |`);
});
push();

// Broken external links
push("## 6. External links — status check");
const broken = Object.entries(data.externalLinks).filter(([, v]) => !v.ok && v.status !== 405 && v.status !== 403);
if (broken.length === 0) push("✅ No broken external links detected (excluding 403/405 which can be HEAD-not-allowed).");
else { push("| URL | Status |"); push("| --- | --- |"); broken.forEach(([u, v]) => push(`| ${u} | ${v.status || v.error} |`)); }
push();

// Critical findings ranked
push("## 7. Critical findings ranked (Phase 1+ priorities)");
push("### P0 — must fix this audit");
const p0 = [];
if (pages.filter((p) => !p.canonical).length > 0) p0.push(`**${pages.filter((p) => !p.canonical).length}** pages missing canonical (Phase 1.6)`);
if (pages.filter((p) => !p.ogLocale).length > 0) p0.push(`**${pages.filter((p) => !p.ogLocale).length}** pages missing \`og:locale\` (Phase 1.2)`);
if (pages.filter((p) => p.schemaTypes.length === 0).length > 0) p0.push(`**${pages.filter((p) => p.schemaTypes.length === 0).length}** pages have no schema markup (Phase 2)`);
if (lh.filter((r) => r.form === "mobile" && r.performance < 80).length > 0) p0.push(`**${lh.filter((r) => r.form === "mobile" && r.performance < 80).length}/${lh.filter((r) => r.form === "mobile").length}** sampled URLs fail mobile Performance 80+ target (Phase 7)`);
if (axeRanked.length > 0) p0.push(`**${axeRanked.length}** distinct axe violation rules across ${pages.filter((p) => p.axeTotal > 0).length} pages (Phase 6)`);
p0.forEach((s) => push(`- ${s}`));
push();
push("### P1 — should fix");
const p1 = [];
if (pages.filter((p) => p.descLen > 160 || p.descLen < 120).length > 0) p1.push(`**${pages.filter((p) => p.descLen > 160 || p.descLen < 120).length}** pages have meta descriptions outside the 120-160 char sweet spot`);
if (pages.filter((p) => p.titleLen > 60).length > 0) p1.push(`**${pages.filter((p) => p.titleLen > 60).length}** pages have titles longer than 60 chars (truncation in SERPs)`);
if (pages.filter((p) => p.h1.length !== 1).length > 0) p1.push(`**${pages.filter((p) => p.h1.length !== 1).length}** pages have either no H1 or multiple H1s`);
p1.forEach((s) => push(`- ${s}`));
push();

fs.writeFileSync("/app/audit-output/baseline-report.md", lines.join("\n"));
console.log("Wrote baseline-report.md");
