#!/usr/bin/env node
/**
 * UXF-1 v3 QA lint (Workstream H).
 *
 * Scans the frontend source tree for anti-patterns the spec forbids:
 *
 *   1. Hardcoded hex codes (#RRGGBB) inside JSX components. Every colour
 *      must reference a semantic token from `src/uxf/tokens.css`.
 *
 *   2. `toast(` / `sonner` imports on files that also import from
 *      `@/uxf`. If a surface has adopted the UXF library, its persistent
 *      notices should live in `<StandingBanner>`, not an auto-dismissing
 *      toast.
 *
 *   3. Text-opacity modifiers ("text-opacity-*", "text-x/50" etc.) on
 *      user-facing prose classes. These reduce contrast below AAA.
 *
 * Exits 0 with a summary if there are only warnings; exits 1 if the
 * `--strict` flag is passed and any warning is present.
 *
 * Usage:
 *   node scripts/uxf-lint.js
 *   node scripts/uxf-lint.js --strict --path=src/pages/tools
 */

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const args = process.argv.slice(2);
const STRICT = args.includes("--strict");
const PATH_ARG = args.find((a) => a.startsWith("--path="));
const SCAN_ROOT = PATH_ARG ? path.join(ROOT, PATH_ARG.slice("--path=".length)) : path.join(ROOT, "src");

// Paths where hex is acceptable (token definitions, marketing hero art,
// third-party platform brands that must not be mode-swapped).
const HEX_ALLOWLIST = [
    /src\/uxf\/tokens\.css$/,
    /src\/uxf\/theme\.jsx$/,
    /src\/index\.css$/,
    /src\/App\.css$/,
    /branding\//,
    /tailwind\.config\.js$/,
];

const HEX_RE = /#[0-9A-Fa-f]{6}\b/g;
const TOAST_RE = /(?:^|[^A-Za-z_])toast\s*(?:\.[a-z]+)?\s*\(/;
const UXF_IMPORT_RE = /from\s+["']@\/uxf/;
const OPACITY_ON_PROSE_RE = /\b(text|bg)-(primary|muted|kindred|surface|ink|gold|sage|error|warning|success|info)(-\w+)?\/[0-9]{1,3}\b/;

const results = { hex: [], toast: [], opacity: [] };

function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === "node_modules" || e.name === "build" || e.name === ".git") continue;
            walk(full);
        } else if (/\.(jsx?|tsx?)$/.test(e.name)) {
            scanFile(full);
        }
    }
}

function scanFile(file) {
    const rel = path.relative(ROOT, file);
    if (HEX_ALLOWLIST.some((re) => re.test(rel))) return;
    const src = fs.readFileSync(file, "utf8");

    // Hex codes
    const hexes = src.match(HEX_RE);
    if (hexes && hexes.length) {
        results.hex.push({ file: rel, count: hexes.length, samples: Array.from(new Set(hexes)).slice(0, 3) });
    }

    // Toast in a UXF-migrated file
    if (UXF_IMPORT_RE.test(src) && TOAST_RE.test(src)) {
        results.toast.push({ file: rel });
    }

    // Opacity modifier on prose class
    const lines = src.split("\n");
    lines.forEach((line, i) => {
        const m = line.match(OPACITY_ON_PROSE_RE);
        if (m) results.opacity.push({ file: rel, line: i + 1, snippet: m[0] });
    });
}

walk(SCAN_ROOT);

const totalIssues = results.hex.length + results.toast.length + results.opacity.length;

console.log("");
console.log("UXF-1 v3 QA lint");
console.log("================");
console.log("");
console.log(`Scanned: ${path.relative(ROOT, SCAN_ROOT) || "src"}`);
console.log("");

if (results.hex.length) {
    console.log(`[hex] ${results.hex.length} file(s) contain hardcoded #RRGGBB codes:`);
    results.hex.slice(0, 20).forEach((r) => {
        console.log(`  · ${r.file} (${r.count}) — e.g. ${r.samples.join(", ")}`);
    });
    if (results.hex.length > 20) console.log(`  ... and ${results.hex.length - 20} more`);
    console.log("");
}

if (results.toast.length) {
    console.log(`[toast] ${results.toast.length} UXF-migrated file(s) still use sonner/toast():`);
    results.toast.forEach((r) => console.log(`  · ${r.file}`));
    console.log("");
}

if (results.opacity.length) {
    console.log(`[contrast] ${results.opacity.length} opacity modifier(s) on prose classes:`);
    results.opacity.slice(0, 20).forEach((r) => {
        console.log(`  · ${r.file}:${r.line}  ${r.snippet}`);
    });
    if (results.opacity.length > 20) console.log(`  ... and ${results.opacity.length - 20} more`);
    console.log("");
}

if (totalIssues === 0) {
    console.log("✓ No issues found.");
    process.exit(0);
}

console.log(`Summary: hex=${results.hex.length}  toast=${results.toast.length}  opacity=${results.opacity.length}  total=${totalIssues}`);
process.exit(STRICT ? 1 : 0);
