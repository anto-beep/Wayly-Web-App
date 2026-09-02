#!/usr/bin/env node
/**
 * SEO-1.1 shared helpers — extract SEO head tags + #root body from prerendered
 * HTML, and inject them into a freshly-built shell. Regex-based (no extra deps).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FRONTEND = path.join(__dirname, "..");
export const BUILD = path.join(FRONTEND, "build");
export const PRERENDER_DIR = path.join(FRONTEND, "prerendered");
export const PRERENDER_FILE = path.join(PRERENDER_DIR, "prerendered.json");

/** Critical routes whose prerender is enforced by the fatal gate. */
export const CRITICAL_ROUTES = [
    "/", "/features", "/pricing", "/about", "/resources",
    "/ai-tools", "/ai-tools/budget-calculator", "/ai-tools/provider-price-checker",
    "/ai-tools/provider-price-checker/how-it-works",
    "/legal/privacy", "/legal/terms",
    "/resources/articles/nine-most-common-support-at-home-invoice-errors",
];

/**
 * Staleness hash based on SOURCE (deterministic across build environments).
 * The previous build-output hash differed between preview and Cloud Build even
 * for identical source, which wrongly failed the gate. Hashing src/ +
 * public/index.html means preview and prod agree, and the hash only changes
 * when the code/content that produces the prerender changes.
 */
export function sourceHash() {
    const roots = [path.join(FRONTEND, "src"), path.join(FRONTEND, "public", "index.html")];
    const files = [];
    const walk = (p) => {
        const st = fs.existsSync(p) && fs.statSync(p);
        if (!st) return;
        if (st.isDirectory()) {
            for (const e of fs.readdirSync(p).sort()) walk(path.join(p, e));
        } else files.push(p);
    };
    roots.forEach(walk);
    const h = crypto.createHash("sha256");
    for (const f of files.sort()) {
        h.update(path.relative(FRONTEND, f));
        h.update(fs.readFileSync(f));
    }
    return h.digest("hex").slice(0, 16);
}

/** route -> build file path (index.html at the route dir). */
export function routeToFile(route) {
    if (route === "/") return path.join(BUILD, "index.html");
    return path.join(BUILD, route.replace(/^\//, ""), "index.html");
}

/** Extract innerHTML of <div id="root"> using div-depth counting. */
export function extractRoot(html) {
    const marker = '<div id="root">';
    const start = html.indexOf(marker);
    if (start < 0) return null;
    const from = start + marker.length;
    const re = /<div\b|<\/div>/gi;
    re.lastIndex = from;
    let depth = 1, m;
    while ((m = re.exec(html))) {
        if (m[0].toLowerCase() === "</div>") {
            depth -= 1;
            if (depth === 0) return html.slice(from, m.index);
        } else depth += 1;
    }
    return null;
}

/** Extract the SEO-relevant head tags (as raw strings) from prerendered HTML. */
export function extractHeadTags(html) {
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    const head = headMatch ? headMatch[1] : html;
    const tags = [];
    const title = head.match(/<title[^>]*>[\s\S]*?<\/title>/i);
    if (title) tags.push(title[0]);
    for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
        const t = m[0];
        if (/name=["'](description|robots|msvalidate\.01|twitter:[^"']+)["']/i.test(t) ||
            /property=["']og:[^"']+["']/i.test(t)) tags.push(t);
    }
    for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
        if (/rel=["']canonical["']/i.test(m[0])) tags.push(m[0]);
    }
    for (const m of head.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi)) {
        tags.push(m[0]);
    }
    return tags;
}

/** react-helmet-async marks the head tags it manages with `data-rh`. On
 * hydration it only de-dupes tags carrying this marker; unmarked server tags
 * are treated as foreign and helmet APPENDS its own copies → the SEO-1.1.1
 * duplicate-head bug. Marking the prerendered title/meta/link tags lets helmet
 * recognise and replace them instead of duplicating. Idempotent. Scripts
 * (JSON-LD) are intentionally left unmarked — helmet must not remove them if a
 * given route doesn't re-render that exact script. */
export function markManaged(tag) {
    if (/\sdata-rh(\b|=)/i.test(tag)) return tag;
    return tag.replace(/^<(title|meta|link)\b/i, '<$1 data-rh="true"');
}

/** The eight head tags SEO-1.1.1 requires to appear exactly once and be
 * helmet-managed (so hydration cannot duplicate them). */
export const SEO_TAG_MATCHERS = [
    { name: "title", re: /<title\b[^>]*>[\s\S]*?<\/title>/gi },
    { name: "meta description", re: /<meta\b[^>]*\bname=["']description["'][^>]*>/gi },
    { name: "link canonical", re: /<link\b[^>]*\brel=["']canonical["'][^>]*>/gi },
    { name: "og:title", re: /<meta\b[^>]*\bproperty=["']og:title["'][^>]*>/gi },
    { name: "og:description", re: /<meta\b[^>]*\bproperty=["']og:description["'][^>]*>/gi },
    { name: "og:url", re: /<meta\b[^>]*\bproperty=["']og:url["'][^>]*>/gi },
    { name: "twitter:title", re: /<meta\b[^>]*\bname=["']twitter:title["'][^>]*>/gi },
    { name: "twitter:description", re: /<meta\b[^>]*\bname=["']twitter:description["'][^>]*>/gi },
];

/** Audit a rendered page's <head> for the SEO-1.1.1 invariants. Returns a list
 * of human-readable issues (empty = clean): any of the eight tags appearing
 * more than once (static duplication) OR present without a `data-rh` marker
 * (which would duplicate after react-helmet-async hydrates). */
export function auditSeoTags(html) {
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    let head = headMatch ? headMatch[1] : html;
    // Ignore HTML comments (the shell documents these tags in a comment; the
    // production build strips comments, but be robust either way).
    head = head.replace(/<!--[\s\S]*?-->/g, "");
    const issues = [];
    for (const { name, re } of SEO_TAG_MATCHERS) {
        const matches = head.match(re) || [];
        if (matches.length > 1) {
            issues.push(`${matches.length}× ${name} (duplicate in static HTML)`);
        }
        for (const m of matches) {
            if (!/\sdata-rh(\b|=)/i.test(m)) {
                issues.push(`${name} missing data-rh (would duplicate after hydration)`);
            }
        }
    }
    return issues;
}

/** Stable identity of a head tag for de-duplication. Null = never de-dupe
 * (JSON-LD scripts and anything unrecognised are kept as-is). */
function tagKey(tag) {
    if (/^<title\b/i.test(tag)) return "title";
    let m;
    if ((m = tag.match(/\bproperty=["']([^"']+)["']/i))) return "prop:" + m[1].toLowerCase();
    if (/\brel=["']canonical["']/i.test(tag)) return "link:canonical";
    if ((m = tag.match(/\bname=["']([^"']+)["']/i))) return "name:" + m[1].toLowerCase();
    return null;
}

/** Collapse duplicate SEO head tags (keep first per identity). Fixes artifacts
 * that were captured while the SEO-1.1.1 duplication bug was live. */
export function dedupeHeadTags(tags) {
    const seen = new Set();
    const out = [];
    for (const t of tags || []) {
        const k = tagKey(t);
        if (k) {
            if (seen.has(k)) continue;
            seen.add(k);
        }
        out.push(t);
    }
    return out;
}

/** Inject committed head tags + root body into a fresh shell index.html string.
 * Strips any pre-existing title/description/canonical/og/twitter tags from the
 * shell first so the injected (helmet-managed) tags are the only copy. */
export function injectIntoShell(shell, { headTags, rootHtml }) {
    const headMatch = shell.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    let out = shell;
    if (headMatch) {
        let head = headMatch[1];
        head = head.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, "");
        head = head.replace(/<meta\b[^>]*\bname=["'](?:description|twitter:[^"']+)["'][^>]*>/gi, "");
        head = head.replace(/<meta\b[^>]*\bproperty=["']og:[^"']+["'][^>]*>/gi, "");
        head = head.replace(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi, "");
        out = shell.slice(0, headMatch.index) +
              shell.slice(headMatch.index).replace(headMatch[1], head);
    } else {
        out = shell.replace(/<title[^>]*>[\s\S]*?<\/title>/i, "");
    }
    const marked = dedupeHeadTags((headTags || []).map(markManaged));
    out = out.replace("</head>", `${marked.join("\n")}\n</head>`);
    out = out.replace('<div id="root"></div>', `<div id="root">${rootHtml}</div>`);
    return out;
}

export function isPrerendered(html) {
    const root = extractRoot(html);
    return !!(root && root.trim().length > 20);
}
