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

// Remove ONLY prerendered (`data-prerendered`) copies, and only when a live
// (React-managed) copy of the same tag already exists. Never touches a
// React-managed node, so it is safe to run on every <head> mutation, including
// during client-side navigation. Used by observeDedupeHead().
export function dedupePrerenderedHead() {
    if (typeof document === "undefined") return;
    const head = document.head;
    if (!head) return;
    for (const sel of SELECTORS) {
        const els = Array.from(head.querySelectorAll(sel));
        if (els.length <= 1) continue;
        const hasLive = els.some((e) => !e.hasAttribute("data-prerendered"));
        if (!hasLive) continue; // never drop to zero
        for (const el of els) {
            if (el.hasAttribute("data-prerendered")) el.remove();
        }
    }
}

// Deterministic dedupe: watch <head> and drop the prerendered copy the moment
// React 19 hoists its own. Replaces the timing race of scheduleDedupeHead(),
// where a snapshot taken between React's commit and the next timer (0/200/800/
// 2000 ms) captured two titles, descriptions and canonicals. Call BEFORE
// hydrateRoot. Stays connected so client-side navigation is covered too.
export function observeDedupeHead() {
    if (typeof window === "undefined" || typeof MutationObserver === "undefined") return null;
    const head = document.head;
    if (!head) return null;
    const observer = new MutationObserver(() => dedupePrerenderedHead());
    observer.observe(head, { childList: true });
    dedupePrerenderedHead();
    return observer;
}

// React 19 commits hoisted metadata asynchronously after hydration; run a few
// times over the first couple of seconds to catch it, then stop. Kept as a
// fallback behind observeDedupeHead().
export function scheduleDedupeHead() {
    if (typeof window === "undefined") return;
    const runs = [0, 200, 800, 2000];
    runs.forEach((ms) => setTimeout(dedupeHead, ms));
    if ("requestAnimationFrame" in window) {
        requestAnimationFrame(() => requestAnimationFrame(dedupeHead));
    }
}
