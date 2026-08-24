#!/usr/bin/env node
/* Diff Phase 0 baseline vs post-redeploy baseline. */
const fs = require("fs");
const p0 = JSON.parse(fs.readFileSync("/app/audit-output/lighthouse/scores-phase0.json", "utf8"));
const p1 = JSON.parse(fs.readFileSync("/app/audit-output/lighthouse/scores.json", "utf8"));
const b0name = "/app/audit-output/baseline-phase0-original.json";
// We lost the original phase-0 baseline crawl JSON in renames, but the .md captured the metrics.
// Diff Lighthouse only here.

const lines = [];
const push = (s = "") => lines.push(s);

push("# Wayly — Phase 1+2+3 Redeploy Verification");
push("Lighthouse comparison: Phase 0 (pre-fix) vs Phase 1 (post-redeploy, code-split live).");
push();
push("| URL | Form | Perf Before → After | Δ | LCP Before → After | A11y | BP | SEO |");
push("| --- | --- | --- | --- | --- | --- | --- | --- |");

const map = (arr) => Object.fromEntries(arr.map((r) => [`${r.url}::${r.form}`, r]));
const m0 = map(p0), m1 = map(p1);
const keys = [...new Set([...Object.keys(m0), ...Object.keys(m1)])];
let totalPerfGain = 0, count = 0, totalLcpGain = 0, lcpCount = 0;
keys.forEach((k) => {
    const a = m0[k], b = m1[k];
    if (!a || !b || a.error || b.error) return;
    const url = a.url.replace("https://wayly.com.au", "") || "/";
    const dPerf = b.performance - a.performance;
    totalPerfGain += dPerf; count++;
    const lcp0 = a.metrics?.LCP ? (a.metrics.LCP / 1000).toFixed(1) : "?";
    const lcp1 = b.metrics?.LCP ? (b.metrics.LCP / 1000).toFixed(1) : "?";
    if (a.metrics?.LCP && b.metrics?.LCP) { totalLcpGain += (a.metrics.LCP - b.metrics.LCP); lcpCount++; }
    push(`| \`${url}\` | ${a.form} | ${a.performance} → **${b.performance}** | ${dPerf >= 0 ? "+" : ""}${dPerf} | ${lcp0}s → **${lcp1}s** | ${b.accessibility} | ${b["best-practices"]} | ${b.seo} |`);
});
push();
push(`**Average Performance gain:** +${(totalPerfGain / count).toFixed(1)} points across ${count} runs`);
push(`**Average LCP improvement:** ${(totalLcpGain / lcpCount / 1000).toFixed(2)}s faster across ${lcpCount} runs`);
push();

fs.writeFileSync("/app/audit-output/redeploy-diff.md", lines.join("\n"));
console.log("Wrote redeploy-diff.md");
