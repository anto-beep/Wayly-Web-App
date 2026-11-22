#!/usr/bin/env node
/**
 * SEO-1.1 APPLY (runs in every build's postbuild — NO Chromium needed).
 *
 * Injects the committed prerendered head SEO + #root body into the FRESHLY
 * built shell index.html per route, so the <script> asset hashes always come
 * from the current build (no preview-vs-prod hash drift). If the committed
 * artifact is absent, it logs and leaves the shell in place (seo-verify then
 * decides whether that is fatal).
 */
import fs from "node:fs";
import path from "node:path";
import {
    BUILD, PRERENDER_FILE, routeToFile, injectIntoShell,
} from "./prerender-lib.mjs";

if (!fs.existsSync(PRERENDER_FILE)) {
    console.warn(`prerender-apply: no committed prerender at ${PRERENDER_FILE} — leaving client-rendered shell.`);
    process.exit(0);
}

const shellPath = path.join(BUILD, "index.html");
const shell = fs.readFileSync(shellPath, "utf8");
const { routes } = JSON.parse(fs.readFileSync(PRERENDER_FILE, "utf8"));

let applied = 0;
for (const [route, data] of Object.entries(routes)) {
    if (!data.rootHtml) continue;
    const out = injectIntoShell(shell, data);
    const file = routeToFile(route);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, out);
    applied += 1;
}
console.log(`prerender-apply: applied ${applied} committed prerendered routes into build/.`);
