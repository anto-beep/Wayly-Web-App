#!/usr/bin/env node
/**
 * SEO-1.1 GATE (runs after prerender-apply, in postbuild). FATAL by default.
 *
 * Fails the build if any critical route's applied HTML is MISSING, EMPTY, or if
 * the committed prerender is STALE (its mainJsHash != the current build's hash,
 * meaning it was generated from different code — regenerate in preview and
 * recommit). Also asserts sitemap.xml is present.
 *
 * Escape hatch: SKIP_PRERENDER_GATE=1 turns failures into a LOUD warning and
 * exits 0. It is a per-deploy CLI env var (never a persistent config) for
 * emergency hotfixes only.
 */
import fs from "node:fs";
import path from "node:path";
import {
    BUILD, PRERENDER_FILE, CRITICAL_ROUTES, routeToFile, sourceHash,
    extractRoot,
} from "./prerender-lib.mjs";

const SKIP = process.env.SKIP_PRERENDER_GATE === "1";
const failures = [];

if (!fs.existsSync(PRERENDER_FILE)) {
    failures.push("committed prerender missing (frontend/prerendered/prerendered.json) — run `yarn prerender:generate` in preview and commit");
} else {
    const manifest = JSON.parse(fs.readFileSync(PRERENDER_FILE, "utf8"));
    const current = sourceHash();
    if (manifest.mainJsHash && current && manifest.mainJsHash !== current) {
        failures.push(`prerendered HTML is STALE (committed mainJsHash=${manifest.mainJsHash}, current build=${current}) — regenerate in preview and recommit`);
    }
    for (const route of CRITICAL_ROUTES) {
        const file = routeToFile(route);
        if (!fs.existsSync(file)) { failures.push(`${route}: applied file missing`); continue; }
        const html = fs.readFileSync(file, "utf8");
        const root = extractRoot(html);
        if (!root || root.trim().length < 20) failures.push(`${route}: empty #root (not prerendered)`);
        if (!/<title>[^<]*\S[^<]*<\/title>/i.test(html)) failures.push(`${route}: missing/empty <title>`);
        if (!/<meta[^>]*name=["']description["'][^>]*content=["'][^"']+["']/i.test(html) &&
            !/<meta[^>]*content=["'][^"']+["'][^>]*name=["']description["']/i.test(html)) failures.push(`${route}: missing meta description`);
        if (!/<link[^>]*rel=["']canonical["']/i.test(html)) failures.push(`${route}: missing canonical`);
        if (!/<h1[\s>]/i.test(html)) failures.push(`${route}: missing <h1>`);
    }
}

if (!fs.existsSync(path.join(BUILD, "..", "public", "sitemap.xml"))) failures.push("public/sitemap.xml missing");

if (failures.length === 0) {
    console.log(`SEO verify passed: ${CRITICAL_ROUTES.length} critical routes have title + description + canonical + H1 in raw HTML; prerender fresh.`);
    process.exit(0);
}

const banner = "================================================================";
if (SKIP) {
    console.warn(`\n${banner}\n[SKIP_PRERENDER_GATE=1] SEO PRERENDER GATE BYPASSED — shipping anyway.\nThis is an emergency hotfix hatch. Do NOT leave it on. Failures:\n${failures.map((f) => "  - " + f).join("\n")}\n${banner}\n`);
    process.exit(0);
}
console.error(`SEO verify FAILED (set SKIP_PRERENDER_GATE=1 for an emergency bypass):\n${failures.map((f) => "  - " + f).join("\n")}`);
process.exit(1);
