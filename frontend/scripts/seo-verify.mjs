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
    extractRoot, auditSeoTags, auditJsonLd,
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

    // SEO-1.1.1 GATE — sweep EVERY applied route for duplicate SEO head tags,
    // unmarked (data-prerendered) tags that the runtime de-duplicator relies
    // on, and duplicate JSON-LD blocks. This is the check that would have
    // caught SEO-1.1.1 before it shipped.
    let sweptRoutes = 0;
    let dupRoutes = 0;
    for (const route of Object.keys(manifest.routes || {})) {
        const data = manifest.routes[route];
        if (!data || !data.rootHtml) continue; // only prerendered routes
        const file = routeToFile(route);
        if (!fs.existsSync(file)) continue;
        sweptRoutes += 1;
        const html = fs.readFileSync(file, "utf8");
        const issues = [...auditSeoTags(html), ...auditJsonLd(html)];
        if (issues.length) {
            dupRoutes += 1;
            failures.push(`${route}: ${issues.join("; ")}`);
        }
    }
    console.log(`SEO-1.1.1 head-tag + JSON-LD sweep: checked ${sweptRoutes} prerendered routes, ${dupRoutes} with issues.`);

    // SITEMAP FRESHNESS — every indexable prerendered route must appear in
    // sitemap.xml so new pages always get discovered. noindex routes are exempt.
    const sitemapPath = [path.join(BUILD, "sitemap.xml"), path.join(BUILD, "..", "public", "sitemap.xml")]
        .find((p) => fs.existsSync(p));
    if (!sitemapPath) {
        failures.push("sitemap.xml missing");
    } else {
        const xml = fs.readFileSync(sitemapPath, "utf8");
        const sitemapPaths = new Set(
            (xml.match(/<loc>\s*([^<]+?)\s*<\/loc>/gi) || []).map((loc) => {
                const url = loc.replace(/<\/?loc>/gi, "").trim();
                let p;
                try { p = new URL(url).pathname; } catch { p = url; }
                return p !== "/" ? p.replace(/\/$/, "") : "/";
            }),
        );
        let missing = 0;
        const SITEMAP_EXEMPT_PREFIXES = ["/app/", "/app", "/login", "/signup", "/logout"];
        for (const route of Object.keys(manifest.routes || {})) {
            const data = manifest.routes[route];
            if (!data || !data.rootHtml) continue;
            const file = routeToFile(route);
            if (!fs.existsSync(file)) continue;
            // Exempt authenticated app + auth routes (not meant for the sitemap).
            if (SITEMAP_EXEMPT_PREFIXES.some((p) => route === p || route.startsWith(p + "/") || route.startsWith(p))) continue;
            const html = fs.readFileSync(file, "utf8");
            if (/<meta[^>]*\bname=["']robots["'][^>]*\bnoindex/i.test(html)) continue; // exempt noindex
            const norm = route !== "/" ? route.replace(/\/$/, "") : "/";
            if (!sitemapPaths.has(norm)) {
                missing += 1;
                failures.push(`${route}: indexable public route missing from sitemap.xml — add it so it gets discovered`);
            }
        }
        console.log(`Sitemap freshness: ${sitemapPaths.size} sitemap URLs, ${missing} indexable routes missing.`);
    }
}

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
