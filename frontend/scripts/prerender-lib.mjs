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

/** Inject committed head tags + root body into a fresh shell index.html string. */
export function injectIntoShell(shell, { headTags, rootHtml }) {
    let out = shell.replace(/<title[^>]*>[\s\S]*?<\/title>/i, "");
    out = out.replace("</head>", `${headTags.join("\n")}\n</head>`);
    out = out.replace('<div id="root"></div>', `<div id="root">${rootHtml}</div>`);
    return out;
}

export function isPrerendered(html) {
    const root = extractRoot(html);
    return !!(root && root.trim().length > 20);
}
