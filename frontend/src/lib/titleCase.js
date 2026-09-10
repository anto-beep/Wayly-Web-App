/**
 * Title-case utility for Wayly headings (Section 1.3 of the Dec 2026 refit brief).
 *
 * Rules:
 *   1. Capitalise the first letter of every word.
 *   2. Except these words when 3 letters or fewer:
 *        a, an, the, and, or, but, of, in, on, at, to, for, by, as, is, if
 *      (keep them lowercase).
 *   3. The first and last word of the heading are ALWAYS capitalised, even if
 *      they appear in the exception list.
 *   4. Hyphenated words: capitalise both halves (Voice-First, Care-Plan).
 *   5. Acronyms in the ALLOW-LIST stay fully uppercase (AT-HM, CSHC, PBS, AI,
 *      PDF, HCP, CHSP, ACQSC, OAIC, TGA, etc.).
 *   6. Possessives keep `'s` lowercase ("Accountant's", "Wayly's").
 *   7. Words that are already intentional brand-casing (Wayly) pass through.
 *
 * The brief's worked examples (must produce):
 *   "care plan store"                    -> "Care Plan Store"
 *   "voice-first home screen"            -> "Voice-First Home Screen"
 *   "care-plan changes"                  -> "Care-Plan Changes"
 *   "what you'll get"                    -> "What You'll Get"
 *   "how it works"                       -> "How It Works"
 *   "reports your accountant will love"  -> "Reports Your Accountant Will Love"
 */

const EXCEPTIONS = new Set([
    "a", "an", "the", "and", "or", "but", "of", "in", "on", "at",
    "to", "for", "by", "as", "is", "if",
]);

const ACRONYMS = new Set([
    "AT-HM", "CSHC", "PBS", "AI", "PDF", "HCP", "CHSP", "ACQSC", "OAIC",
    "TGA", "CMS", "CSS", "API", "SaaS", "PII", "GST", "ABN", "ACN",
    "MFA", "TOTP", "OTP", "URL", "MVP", "NDIS", "STRC",
    "YTD", "ATO", "JSON", "HTML", "XML", "SQL", "CSV", "JPG", "PNG", "SVG",
]);

const BRANDS = ["Wayly"];

function _capitaliseWord(word) {
    if (!word) return word;
    return word[0].toUpperCase() + word.slice(1).toLowerCase();
}

function _processToken(token) {
    // Acronym allow-list (exact uppercase match wins regardless of hyphenation).
    const upper = token.toUpperCase();
    if (ACRONYMS.has(upper)) return upper;
    // Brand-cased words pass through.
    for (const brand of BRANDS) {
        if (token.toLowerCase() === brand.toLowerCase()) return brand;
    }
    // Handle possessives: split on the apostrophe, capitalise the root, lower 's.
    const apoIdx = token.indexOf("'");
    if (apoIdx > 0) {
        const root = token.slice(0, apoIdx);
        const tail = token.slice(apoIdx).toLowerCase(); // 's, 're, 'll, 've, etc.
        return _capitaliseWord(root) + tail;
    }
    return _capitaliseWord(token);
}

function _processHyphenated(piece, position, totalWords) {
    // Multi-segment acronym wins over per-segment processing (e.g. AT-HM, AT&T).
    const upper = piece.toUpperCase();
    if (ACRONYMS.has(upper)) return upper;
    // Rule 4: capitalise both halves of a hyphenated compound. The exception
    // list only applies to a short connector, which is rare and never first
    // or last position; we process each segment independently.
    return piece.split("-").map(_processToken).join("-");
}

export function toTitleCase(input) {
    if (!input || typeof input !== "string") return input;
    const trimmed = input.trim();
    if (!trimmed) return input;

    // Split on whitespace, keep the original separator runs so we round-trip
    // double spaces / non-breaking spaces correctly.
    const parts = trimmed.split(/(\s+)/);
    const wordIndices = [];
    parts.forEach((p, i) => {
        if (!/^\s+$/.test(p) && p.length > 0) wordIndices.push(i);
    });
    const totalWords = wordIndices.length;

    wordIndices.forEach((idx, ordinal) => {
        const word = parts[idx];
        const isFirst = ordinal === 0;
        const isLast = ordinal === totalWords - 1;
        const lower = word.toLowerCase();
        const isShortException = EXCEPTIONS.has(lower) && lower.length <= 3;

        // Rule 3 (override), first and last word always capitalise.
        if (isShortException && !isFirst && !isLast) {
            parts[idx] = lower;
            return;
        }
        if (word.includes("-")) {
            parts[idx] = _processHyphenated(word, ordinal, totalWords);
        } else {
            parts[idx] = _processToken(word);
        }
    });
    return parts.join("");
}

/**
 * Returns true when `input === toTitleCase(input)`. Used by the copy-QA gate.
 */
export function isTitleCase(input) {
    return toTitleCase(input) === input;
}

export default toTitleCase;
