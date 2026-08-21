#!/usr/bin/env node
/**
 * SEO-1.1 GENERATE (preview only — needs the Chromium-prerendered build/).
 *
 * Run AFTER `react-snap` has prerendered build/. Walks every prerendered route,
 * extracts its SEO head tags + #root body (asset-hash-free), and writes them to
 * frontend/prerendered/prerendered.json along with the build's mainJsHash.
 * Commit frontend/prerendered/** so the deploy can apply it without Chromium.
 *
 * Usage (preview): SKIP_PRERENDER_GATE=1 yarn build && yarn prerender:generate
 */
import fs from "node:fs";
import path from "node:path";
import {
    BUILD, PRERENDER_DIR, PRERENDER_FILE, sourceHash,
    extractRoot, extractHeadTags, isPrerendered,
} from "./prerender-lib.mjs";

function walkIndexHtml(dir, base = "") {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (["static", "assets"].includes(entry.name)) continue;
            out.push(...walkIndexHtml(path.join(dir, entry.name), `${base}/${entry.name}`));
        } else if (entry.name === "index.html") {
            out.push({ route: base === "" ? "/" : base, file: path.join(dir, "index.html") });
        }
    }
    return out;
}

const pages = walkIndexHtml(BUILD);
const routes = {};
let captured = 0, skipped = 0;
for (const { route, file } of pages) {
    const html = fs.readFileSync(file, "utf8");
    if (!isPrerendered(html)) { skipped += 1; continue; }
    const rootHtml = extractRoot(html);
    const headTags = extractHeadTags(html);
    routes[route] = { headTags, rootHtml };
    captured += 1;
}

const payload = {
    generatedAt: new Date().toISOString(),
    mainJsHash: sourceHash(),
    routeCount: captured,
    routes,
};
fs.mkdirSync(PRERENDER_DIR, { recursive: true });
fs.writeFileSync(PRERENDER_FILE, JSON.stringify(payload));
console.log(`prerender-generate: captured ${captured} routes (skipped ${skipped} non-prerendered), mainJsHash=${payload.mainJsHash}`);
console.log(`prerender-generate: wrote ${path.relative(process.cwd(), PRERENDER_FILE)} — COMMIT frontend/prerendered/**`);
