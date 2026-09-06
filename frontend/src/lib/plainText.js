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
    [/\barray\b/gi, "list"],
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

// A short, scannable one-liner: humanised first sentence, capped.
export function shortSummary(input, max = 150) {
    const h = humanize(input);
    if (!h) return h;
    const first = h.split(/(?<=[.!?])\s+/)[0] || h;
    if (first.length <= max) return first;
    return h.slice(0, max).replace(/\s+\S*$/, "") + "\u2026";
}
