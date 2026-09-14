// plainText — turn AI/technical flag copy into plain, non-technical language
// that anyone can follow. Two goals across every tool:
//   1) dates always read DD/MM/YYYY
//   2) no developer/system jargon (JSON, arrays, field names, internal codes)
//
// Keep this conservative: we only rewrite well-known noise, never invent facts.

// YYYY-MM-DD -> DD/MM/YYYY (anywhere in a string)
export function toAUDate(input) {
    return String(input ?? "").replace(
        /\b(\d{4})-(\d{2})-(\d{2})\b/g,
        (_, y, m, d) => `${d}/${m}/${y}`,
    );
}

// Jargon -> plain English. Order matters (longer/more specific first).
const REPLACERS = [
    // Field-name jargon: "The extracted pension_status field is set to 'unknown'."
    [/(?:the\s+)?extracted\s+([a-z][a-z_]*?)\s+field\s+is\s+set\s+to\s+['"]?unknown['"]?\.?/gi,
        (_m, f) => `We don't have the ${f.replace(/_/g, " ")} on record yet.`],
    [/(?:the\s+)?extracted\s+([a-z][a-z_]*?)\s+field\s+is\s+set\s+to\s+['"]?([^'".]+)['"]?/gi,
        (_m, f, v) => `The ${f.replace(/_/g, " ")} shows ${String(v).trim()}`],
    [/(?:the\s+)?extracted\s+([a-z][a-z_]*?)\s+field\b/gi, (_m, f) => `the ${f.replace(/_/g, " ")}`],
    [/\bis\s+set\s+to\s+['"]?unknown['"]?/gi, "is not on record yet"],
    [/\bset\s+to\s+['"]?unknown['"]?/gi, "not recorded"],
    [/,?\s*(?:while\s+)?the\s+extracted\s+json\s+flags?\s+this\s+with[^.]*\./gi, "."],
    [/\b_[a-z_]+\s*[:=]\s*-?\d+/gi, ""],
    [/\bextracted\s+json\b/gi, "the reading we took"],
    [/\bin\s+the\s+json\b/gi, ""],
    [/\bthe\s+json\b/gi, "the reading"],
    [/\bjson\b/gi, "reading"],
    [/\bline[_\s]?items?(\s+array)?\b/gi, "line items"],
    [/\bstream\s*=\s*'?([a-z][a-z\s-]*?)'?(?=[\s.,)])/gi, "category \u201c$1\u201d"],
    [/\bAT[-\s]?HM\b/g, "government-funded support"],
    [/\bATHM\b/g, "government-funded support"],
    // Internal reference + rule codes must never reach the user.
    [/\bINDEX[-_\s]?1\b/gi, "the official price guide"],
    [/\bRULE[_\s]?[A-Z0-9]+(?:_[A-Z0-9]+)*\b/g, ""],
    [/\barray\b/gi, "list"],
    // Any leftover snake_case field token -> spaced words (e.g. pension_status).
    [/\b([a-z]+(?:_[a-z]+)+)\b/g, (m) => m.replace(/_/g, " ")],
];

export function humanize(input) {
    let out = toAUDate(input);
    if (!out) return out;
    for (const [re, rep] of REPLACERS) out = out.replace(re, rep);
    // tidy the seams left by removals
    out = out
        .replace(/\(\s*\)/g, "")
        .replace(/\s{2,}/g, " ")
        .replace(/\s+([.,;:])/g, "$1")
        .replace(/\.{2,}/g, ".")
        .replace(/,\s*\./g, ".")
        .trim();
    return out;
}

// Rotating soft tints so consecutive flag/issue cards each get their own
// background and visibly stand apart (teal / clay / sage / plum).
export const FLAG_TINTS = [
    "bg-[rgba(14,77,82,0.10)] border-[rgba(14,77,82,0.28)] border-l-4 border-l-[#0E4D52]",
    "bg-[rgba(165,81,43,0.10)] border-[rgba(165,81,43,0.28)] border-l-4 border-l-[#A5512B]",
    "bg-[rgba(62,106,76,0.13)] border-[rgba(62,106,76,0.30)] border-l-4 border-l-[#3E6A4C]",
    "bg-[rgba(95,78,118,0.12)] border-[rgba(95,78,118,0.28)] border-l-4 border-l-[#5F4E76]",
];
export function flagTint(i) {
    const n = FLAG_TINTS.length;
    return FLAG_TINTS[(((i || 0) % n) + n) % n];
}

// A short, scannable one-liner: humanised first sentence, capped.
export function shortSummary(input, max = 150) {
    const h = humanize(input);
    if (!h) return h;
    const first = h.split(/(?<=[.!?])\s+/)[0] || h;
    if (first.length <= max) return first;
    return h.slice(0, max).replace(/\s+\S*$/, "") + "\u2026";
}

// Collapse long inline runs of dates into "(N dates)" so an explanation stays
// readable instead of dumping 15 dates into one sentence.
export function condenseDates(input) {
    let s = String(input ?? "");
    // Parenthetical lists: "(03/08/2026, 10/08/2026, …)" -> "(5 dates)"
    s = s.replace(/\(([^)]*)\)/g, (m, inner) => {
        const dates = inner.match(/\d{2}\/\d{2}\/\d{4}/g);
        return dates && dates.length >= 3 ? `(${dates.length} dates)` : m;
    });
    // Bare inline runs of 3+ comma-separated dates.
    s = s.replace(/\d{2}\/\d{2}\/\d{4}(?:\s*,\s*\d{2}\/\d{2}\/\d{4}){2,}/g, (m) => {
        const dates = m.match(/\d{2}\/\d{2}\/\d{4}/g);
        return `${dates.length} dates`;
    });
    return s;
}

// A clean, short, properly-capitalised heading from a headline sentence. The
// backend headlines are already whole sentences — we only humanise them, drop
// any trailing parenthetical/second clause, strip the full stop and capitalise.
export function cleanTitle(input, max = 96) {
    let h = condenseDates(humanize(input || "")).trim();
    if (!h) return "Something to check";
    h = h.replace(/^line[-\s]?items?\s+(?:dated\s+\S+\s+)?(?:for\s+)?/i, "");
    h = h.split(/\s+\(/)[0];          // drop a trailing "(...)" parenthetical
    h = h.split(/,\s/)[0];            // keep just the first clause
    h = h.replace(/[.\s]+$/, "").trim();
    if (h.length > max) {
        const slice = h.slice(0, max);
        const sp = slice.lastIndexOf(" ");
        h = (sp > 0 ? slice.slice(0, sp) : slice).trim();
    }
    return h.charAt(0).toUpperCase() + h.slice(1);
}

// Plain, complete explanation: humanised + date-condensed, capped at a SENTENCE
// boundary (never mid-number) so nothing reads as a broken fragment.
export function plainBody(input, max = 340) {
    const h = condenseDates(humanize(input || "")).trim();
    if (!h || h.length <= max) return h;
    const slice = h.slice(0, max);
    const dot = slice.lastIndexOf(". ");
    if (dot > max * 0.5) return slice.slice(0, dot + 1);
    const sp = slice.lastIndexOf(" ");
    return (sp > 0 ? slice.slice(0, sp) : slice).trim() + "\u2026";
}
