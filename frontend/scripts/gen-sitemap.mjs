#!/usr/bin/env node
/**
 * Keep public/sitemap.xml in sync with the structured article data — ADDITIVELY.
 *
 * Parses every article defined in src/data/seoArticles2026.js and
 * seoToolArticles.js and ensures each one's URL is present in the committed
 * public/sitemap.xml. It ONLY ADDS missing article URLs; it never removes or
 * reorders existing entries, so hand-curated URLs, legacy articles and
 * tool-page URLs are always preserved (no GSC regression).
 *
 * This is the drift fix for the build-time guard in seo-verify.mjs: add an
 * article to the data, run `yarn sitemap:generate`, commit.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SITEMAP = path.join(__dirname, "..", "public", "sitemap.xml");
const DATA = path.join(__dirname, "..", "src", "data");
const DOMAIN = "https://wayly.com.au";

function parseArticles() {
    const out = new Map();
    for (const f of ["seoArticles2026.js", "seoToolArticles.js"]) {
        const fp = path.join(DATA, f);
        if (!fs.existsSync(fp)) continue;
        const src = fs.readFileSync(fp, "utf8");
        for (const chunk of src.split(/slug:\s*["']/).slice(1)) {
            const m = chunk.match(/^([a-z0-9][a-z0-9-]*)/);
            if (!m) continue;
            const win = chunk.slice(0, 2500);
            const cp = win.match(/canonical_path:\s*["']([^"']+)["']/);
            const up = win.match(/updated_at:\s*["']([0-9-]+)["']/);
            const pub = win.match(/published_at:\s*["']([0-9-]+)["']/);
            const p = (cp ? cp[1] : `/resources/articles/${m[1]}`).replace(/\/$/, "");
            out.set(p, { path: p, lastmod: (up && up[1]) || (pub && pub[1]) || null });
        }
    }
    return [...out.values()];
}

const xml = fs.readFileSync(SITEMAP, "utf8");
const present = new Set(
    (xml.match(/<loc>\s*([^<]+?)\s*<\/loc>/gi) || []).map((loc) => {
        const u = loc.replace(/<\/?loc>/gi, "").trim();
        let p; try { p = new URL(u).pathname; } catch { p = u; }
        return p !== "/" ? p.replace(/\/$/, "") : "/";
    }),
);

const today = new Date().toISOString().slice(0, 10);
const missing = parseArticles().filter((a) => !present.has(a.path));

if (missing.length === 0) {
    console.log(`sitemap:generate — all structured articles already present (${present.size} URLs). No change.`);
    process.exit(0);
}

const blocks = missing.map((a) =>
    `  <url><loc>${DOMAIN}${a.path}</loc>` +
    `<lastmod>${a.lastmod || today}</lastmod>` +
    `<changefreq>monthly</changefreq><priority>0.8</priority></url>`,
).join("\n");

const updated = xml.replace(/<\/urlset>\s*$/i, `${blocks}\n</urlset>\n`);
fs.writeFileSync(SITEMAP, updated);
console.log(`sitemap:generate — ADDED ${missing.length} missing article URL(s):\n${missing.map((m) => "  + " + m.path).join("\n")}`);
