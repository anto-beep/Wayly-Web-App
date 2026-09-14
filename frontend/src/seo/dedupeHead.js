// SEO-1.1.1 runtime de-duplication.
//
// Stack reality: this app runs React 19 + react-helmet-async v3, which use
// React 19's NATIVE metadata hoisting. Public pages are prerendered by
// react-snap, whose serialized <head> already contains one copy of each SEO
// tag (marked `data-prerendered="1"` by prerender-apply). On hydration React 19
// re-hoists the SAME <title>/<meta>/<link> from the component tree and does NOT
// match/reuse the react-snap copies, so every tag ends up duplicated in the
// live DOM (Bing executes JS and sees the doubles). `data-rh` marking cannot
// fix this because helmet v3 delegates these tags to React, not its legacy DOM
// path.
//
// Fix: once React has hoisted its own (live, SPA-updatable) copy, remove the
// prerendered duplicate. If React never added a second copy, keep the
// prerendered one so we never drop to zero.

const SELECTORS = [
    "title",
    'meta[name="description"]',
    'link[rel="canonical"]',
    'meta[property="og:title"]',
    'meta[property="og:description"]',
    'meta[property="og:url"]',
    'meta[name="twitter:title"]',
    'meta[name="twitter:description"]',
];

export function dedupeHead() {
    if (typeof document === "undefined") return;
    const head = document.head;
    if (!head) return;
    for (const sel of SELECTORS) {
        const els = Array.from(head.querySelectorAll(sel));
        if (els.length <= 1) continue; // nothing to collapse
        // Prefer keeping a React-managed (non-prerendered) copy so client-side
        // navigation can keep updating it; fall back to the last element.
        const live = els.filter((e) => !e.hasAttribute("data-prerendered"));
        const keep = live.length ? live[live.length - 1] : els[els.length - 1];
        for (const el of els) {
            if (el !== keep) el.remove();
        }
    }
    // Collapse EXACT-duplicate JSON-LD blocks (keep first of each content).
    const seen = new Set();
    for (const s of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
        const key = (s.textContent || "").replace(/\s+/g, " ").trim();
        if (seen.has(key)) s.remove();
        else seen.add(key);
    }
}

// React 19 commits hoisted metadata asynchronously after hydration; run a few
// times over the first couple of seconds to catch it, then stop.
export function scheduleDedupeHead() {
    if (typeof window === "undefined") return;
    const runs = [0, 200, 800, 2000];
    runs.forEach((ms) => setTimeout(dedupeHead, ms));
    if ("requestAnimationFrame" in window) {
        requestAnimationFrame(() => requestAnimationFrame(dedupeHead));
    }
}
