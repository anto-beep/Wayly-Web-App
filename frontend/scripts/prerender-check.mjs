#!/usr/bin/env node
/**
 * SEO-1.1 preview-side staleness check (nice-to-have, non-blocking).
 *
 * Compares the committed prerender's mainJsHash against what the CURRENT source
 * would build, so the "regenerate and recommit" signal arrives at PR/review
 * time instead of at deploy. Requires a fresh `build/` (run `yarn build` with
 * SKIP_PRERENDER_GATE=1 first). Always exits 0 — advisory only.
 */
import fs from "node:fs";
import { PRERENDER_FILE, sourceHash } from "./prerender-lib.mjs";

if (!fs.existsSync(PRERENDER_FILE)) {
    console.warn("prerender-check: no committed prerender yet — run `yarn prerender:generate`.");
    process.exit(0);
}
const committed = JSON.parse(fs.readFileSync(PRERENDER_FILE, "utf8")).mainJsHash;
const current = sourceHash();
if (committed !== current) {
    console.warn(`\n⚠️  prerender-check: committed prerender is STALE (committed=${committed}, current=${current}).\n    Run: SKIP_PRERENDER_GATE=1 yarn build && yarn prerender:generate, then commit frontend/prerendered/**\n`);
} else {
    console.log(`prerender-check: committed prerender is fresh (mainJsHash=${committed}).`);
}
process.exit(0);
