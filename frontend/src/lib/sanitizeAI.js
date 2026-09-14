// Wayly punctuation rule: AI-generated copy must never contain em dashes or en
// dashes (and long spaced hyphens read like dashes too). This mirrors the
// mobile helper at mobile/src/utils/format.ts (sanitizeAI) so both platforms
// clean AI output identically, catching anything that slips past the server
// prompts. Use it on ANY text that originates from an LLM before rendering.
export function sanitizeAI(text) {
    if (!text) return "";
    return String(text)
        .replace(/\s*[—–]\s*/g, ", ")
        .replace(/\s+-\s+/g, ", ")
        .replace(/,\s*,/g, ",");
}

export default sanitizeAI;
