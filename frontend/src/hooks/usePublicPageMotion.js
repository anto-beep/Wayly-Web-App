import { useLayoutEffect } from "react";

/**
 * usePublicPageMotion — graceful on-scroll section reveals for public /
 * marketing pages. On every navigation (driven by the keyed `.wayly-public`
 * container in MarketingLayout) it hides each top-level `<section>` just before
 * paint, then reveals it with a soft rise + fade as it enters the viewport via
 * IntersectionObserver. Above-the-fold sections reveal immediately; below-the-
 * fold ones cascade in as you scroll — the classic premium feel.
 *
 * Robustness: runs in `useLayoutEffect` (before paint → no flash), always
 * self-heals via a safety timeout so content can never get stuck hidden, and
 * no-ops entirely under `prefers-reduced-motion`.
 */
const SAFETY_MS = 1800;

export default function usePublicPageMotion(pathname) {
    useLayoutEffect(() => {
        if (typeof window === "undefined" || typeof document === "undefined") return undefined;
        const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduce) return undefined;

        const root = document.querySelector(".wayly-public");
        if (!root) return undefined;
        const sections = Array.from(root.querySelectorAll("section"));
        if (sections.length === 0) return undefined;

        // Hide before the browser paints this commit (no flash of content).
        sections.forEach((el) => el.classList.add("wy-pre"));

        const reveal = (el) => {
            if (el.dataset.wyShown === "1") return;
            el.dataset.wyShown = "1";
            el.classList.remove("wy-pre");
            el.classList.add("wy-in");
        };

        let io;
        if ("IntersectionObserver" in window) {
            io = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        reveal(entry.target);
                        io.unobserve(entry.target);
                    }
                });
            }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });
            sections.forEach((el) => io.observe(el));
        } else {
            sections.forEach(reveal);
        }

        // Never leave a section hidden.
        const safety = window.setTimeout(() => {
            sections.forEach(reveal);
            if (io) io.disconnect();
        }, SAFETY_MS);

        return () => {
            window.clearTimeout(safety);
            if (io) io.disconnect();
        };
    }, [pathname]);
}
