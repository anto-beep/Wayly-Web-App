#!/usr/bin/env node
/**
 * Wayly copy-QA build gate (§1.4 of the Dec 2026 refit brief).
 *
 * Scans extracted user-facing strings from JSX/JS/TS and reports violations.
 * Exits non-zero on any hit so CI can block the deploy.
 *
 *   node scripts/copy-qa.mjs              # scan, print, exit 0/1
 *   node scripts/copy-qa.mjs --silent     # exit codes only (for hooks)
 *   node scripts/copy-qa.mjs path/to/dir  # scan a custom root
 *
 * What it checks (subset of §1.4 — the high-value, low-false-positive set):
 *   • em-dash (—) and en-dash (–) used as em-dash in prose
 *   • "per cent", "percent", "percentage"
 *   • banned vocabulary from §0.3 (navigate, unlock, leverage, ...)
 *   • "AUD 1234" or "1234 dollars" patterns missing the $ prefix
 *
 * What it does NOT check (deliberately, to keep false positives down):
 *   • Title-case for headings (requires AST parsing to identify which strings
 *     are headings — out of scope for this CI gate; covered by the
 *     toTitleCase unit tests instead)
 *   • US spellings (high false-positive rate; will add as a second pass)
 *
 * Escape hatch: append `// qa-allow: <reason>` on the same line as a legitimate
 * exception (verbatim legislative quotes, etc.). Allowances are listed at the
 * end of the report.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.argv[2] && !process.argv[2].startsWith("--")
    ? path.resolve(process.argv[2])
    : path.resolve(process.cwd(), "src");
const SILENT = process.argv.includes("--silent");
const WARN_ONLY = process.argv.includes("--warn-only");
const FIX_DASHES = process.argv.includes("--fix-em-dashes") || process.argv.includes("--fix-dashes");
const DRY_RUN = process.argv.includes("--dry-run");

const SKIP_DIRS = new Set([
    "node_modules", "build", "dist", ".next", ".turbo", "coverage", "__tests__",
]);
const SKIP_FILES = new Set([
    "titleCase.js", // the utility itself uses these patterns as data
    "copy-qa.mjs",
]);
const SCAN_EXT = new Set([".js", ".jsx", ".ts", ".tsx", ".mdx"]);

// Banned vocabulary from §0.3. Word-boundary, case-insensitive.
const BANNED = [
    "navigate", "unlock", "leverage", "seamless", "embark", "delve",
    "robust", "harness", "empower", "streamline", "elevate",
    "revolutionise", "revolutionize", "game-changer", "cutting-edge",
    "world-class", "best-in-class",
];
const BANNED_RE = new RegExp(`\\b(${BANNED.join("|")})\\b`, "gi");

const RULES = [
    { id: "em-dash", regex: /\u2014/g,                                          msg: "em-dash (—) is banned; use a comma, a full stop, or restructure" },
    { id: "en-dash-spaced", regex: /\s\u2013\s/g,                               msg: "en-dash used as em-dash; use comma or full stop" },
    { id: "per-cent",  regex: /\b(per\s?cent|percent|percentage)\b/gi,          msg: "'per cent' / 'percent' / 'percentage' is banned; use % symbol or 'rate' / 'share' / 'proportion'" },
    { id: "dollars-suffix", regex: /\b\d[\d,]*\s+dollars\b/gi,                  msg: "money written as 'NN dollars'; use '$NN' with comma separators" },
    { id: "aud-prefix",     regex: /\bAUD\s*\d[\d,]*\b/g,                       msg: "money written as 'AUD NN'; use '$NN'" },
    { id: "banned-vocab",   regex: BANNED_RE,                                   msg: "banned vocabulary; pick a plain alternative" },
];

// Extract user-facing string-like spans from a source file. We deliberately
// keep this lightweight — JSX text nodes between > and <, plus quoted strings
// that look like prose (length >= 6 and contain a space). We skip strings
// that are obviously identifiers (imports/exports, className values).
function extractCandidates(src) {
    const candidates = [];

    // 1. JSX text content between > and <
    const jsxText = /\>([^<>{}\n][^<>{}]*[^<>{}\s])\</g;
    let m;
    while ((m = jsxText.exec(src)) !== null) {
        const text = m[1];
        // Skip JSX/JS syntax remnants — anything containing braces, equals, or
        // a leading punctuation that means we're inside an expression, not prose.
        if (/[={}]/.test(text)) continue;
        if (/^[)\]}]/.test(text.trim())) continue;
        if (text.length >= 6 && /\s/.test(text)) {
            candidates.push({ text, idx: m.index + 1 });
        }
    }

    // 2. Quoted string literals (single, double, backtick) that look like prose
    const quoted = /(["'`])((?:\\.|(?!\1).){8,400})\1/g;
    while ((m = quoted.exec(src)) !== null) {
        const text = m[2];
        if (!/\s/.test(text)) continue;
        // Skip JSX/JS syntax remnants inside template literals
        if (/<[A-Z]/.test(text) || /[={}]/.test(text)) continue;
        // Skip CSS-like, import paths, and className concatenations.
        if (/^[a-z0-9-]+ [a-z0-9-]+/.test(text) && !/[.!?,]/.test(text)) continue;
        // Skip URLs / paths
        if (/^(https?:|\/[a-z]|@\/|\.\/)/i.test(text)) continue;
        // Skip strings that look like CSS class lists (no sentence punctuation, lots of dashes)
        if (text.split("-").length > 4 && !/[a-z]\s[a-z]/.test(text)) continue;
        candidates.push({ text, idx: m.index + 1 });
    }
    return candidates;
}

function lineColOf(src, idx) {
    const before = src.slice(0, idx);
    const line = before.split("\n").length;
    const lastNl = before.lastIndexOf("\n");
    const col = idx - (lastNl + 1) + 1;
    return { line, col };
}

async function* walk(dir) {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
        if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) yield* walk(full);
        else if (SCAN_EXT.has(path.extname(e.name)) && !SKIP_FILES.has(e.name)) yield full;
    }
}

/**
 * --fix-em-dashes — one-shot autofix for the em-dash + en-dash-as-em-dash rules.
 *
 * Strategy: replace the dash + its surrounding whitespace inside known
 * user-facing contexts (JSX text nodes + quoted string literals) with the
 * safest substitute, chosen by the local context:
 *
 *   1. If the char preceding the dash is already terminal punctuation
 *      (`.`, `!`, `?`, `:`, `;`) → drop the dash and surrounding space.
 *   2. Otherwise → replace the entire `\s*[—–]\s*` run with `, ` (a single
 *      comma + space). This is the parenthetical-comma reading, which is
 *      the right move ~95% of the time in our copy.
 *
 * To avoid clobbering em-dashes that legitimately exist in code comments
 * or template strings (rare but possible — none in our repo today), we
 * only fix dashes that fall INSIDE a user-facing candidate span as
 * identified by `extractCandidates`. Dashes anywhere else are left
 * untouched.
 *
 * Returns { files_modified, dashes_replaced }.
 */
async function runFixEmDashes() {
    let filesModified = 0;
    let dashesReplaced = 0;
    const fixedFiles = [];

    for await (const file of walk(ROOT)) {
        const src = await fs.readFile(file, "utf8");
        // Collect every dash position that lives inside a candidate span.
        const spans = extractCandidates(src).map((c) => ({
            start: c.idx,
            end: c.idx + c.text.length,
        }));
        if (spans.length === 0) continue;

        // Build the new string by iterating chars; only rewrite dashes that
        // fall inside one of the candidate spans AND have prose-shaped context.
        let out = "";
        let i = 0;
        let fileChanged = 0;
        while (i < src.length) {
            const ch = src[i];
            const isDash = ch === "\u2014" || ch === "\u2013";
            if (!isDash) {
                out += ch;
                i += 1;
                continue;
            }
            // Is this dash inside a candidate span?
            const inSpan = spans.some((s) => i >= s.start && i < s.end);
            if (!inSpan) {
                out += ch;
                i += 1;
                continue;
            }

            // Find the contiguous whitespace before/after the dash. We may
            // also need to peel off an additional dash if double-dashes occur.
            let startGap = i;
            while (startGap > 0 && /\s/.test(src[startGap - 1])) startGap -= 1;
            let endGap = i + 1;
            while (endGap < src.length && /\s/.test(src[endGap])) endGap += 1;
            // Look at the char that precedes the leading whitespace.
            const prevChar = startGap > 0 ? src[startGap - 1] : "";
            const isTerminal = /[.!?:;,]/.test(prevChar);

            // The leading run from startGap to i was whitespace; drop it.
            // The trailing run from i+1 to endGap was whitespace; we'll re-add
            // a single space below if needed.
            // Truncate `out` back to startGap by reslicing — but it's already
            // appended; instead, slice off the trailing whitespace from `out`.
            while (out.length > 0 && /\s/.test(out[out.length - 1])) {
                out = out.slice(0, out.length - 1);
            }
            if (isTerminal) {
                // Drop the dash entirely. Re-emit a single space after if there
                // was content following.
                out += " ";
            } else {
                out += ", ";
            }
            dashesReplaced += 1;
            fileChanged += 1;
            i = endGap;
        }

        if (fileChanged > 0 && out !== src) {
            if (!DRY_RUN) await fs.writeFile(file, out, "utf8");
            filesModified += 1;
            fixedFiles.push({ file: path.relative(process.cwd(), file), dashes: fileChanged });
        }
    }

    if (!SILENT) {
        console.log(`\nWayly copy-QA — em-dash autofix ${DRY_RUN ? "(dry run)" : "(applied)"}`);
        console.log(`  files modified: ${filesModified}`);
        console.log(`  dashes replaced: ${dashesReplaced}`);
        if (filesModified > 0) {
            console.log(`  changes by file:`);
            for (const f of fixedFiles.slice(0, 25)) {
                console.log(`    ${f.file}  (${f.dashes} dash${f.dashes === 1 ? "" : "es"})`);
            }
            if (fixedFiles.length > 25) {
                console.log(`    ... and ${fixedFiles.length - 25} more`);
            }
        }
    }
    return { filesModified, dashesReplaced };
}

async function scan() {
    const violations = [];
    const allowances = [];
    let filesScanned = 0;

    for await (const file of walk(ROOT)) {
        const src = await fs.readFile(file, "utf8");
        filesScanned += 1;
        const lines = src.split("\n");
        for (const cand of extractCandidates(src)) {
            const { line, col } = lineColOf(src, cand.idx);
            const lineText = lines[line - 1] || "";
            const allowed = /\/\/\s*qa-allow:/.test(lineText);

            for (const rule of RULES) {
                rule.regex.lastIndex = 0;
                const hits = cand.text.match(rule.regex);
                if (!hits) continue;
                const record = {
                    file: path.relative(process.cwd(), file),
                    line, col, rule: rule.id, msg: rule.msg,
                    snippet: cand.text.length > 140 ? cand.text.slice(0, 137) + "..." : cand.text,
                    hits: [...new Set(hits.map((s) => s.trim()))].slice(0, 5),
                };
                (allowed ? allowances : violations).push(record);
            }
        }
    }

    if (!SILENT) {
        console.log(`\nWayly copy-QA: scanned ${filesScanned} files under ${ROOT}\n`);
        if (violations.length === 0) {
            console.log("✓ No violations found.");
        } else {
            console.log(`✗ ${violations.length} violation${violations.length === 1 ? "" : "s"}:\n`);
            for (const v of violations) {
                console.log(`  ${v.file}:${v.line}:${v.col}  [${v.rule}]  ${v.msg}`);
                console.log(`    > ${v.snippet}`);
                console.log(`      hits: ${v.hits.join(", ")}\n`);
            }
        }
        if (allowances.length > 0) {
            console.log(`\n— ${allowances.length} allowance${allowances.length === 1 ? "" : "s"} via "// qa-allow:" —`);
            for (const a of allowances) {
                console.log(`  ${a.file}:${a.line}  [${a.rule}]  ${a.hits.join(", ")}`);
            }
        }
    }

    process.exit((violations.length === 0 || WARN_ONLY) ? 0 : 1);
}

async function main() {
    if (FIX_DASHES) {
        await runFixEmDashes();
        // Fall through to scan() so the user sees the post-fix violation count.
    }
    await scan();
}

main().catch((err) => {
    console.error("copy-qa crashed:", err);
    process.exit(2);
});
