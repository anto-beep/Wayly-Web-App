/**
 * ScrollToTop, scrolls to the top of the page on every route change.
 *
 * Mounted once inside <BrowserRouter>. No props.
 *
 * Why we set scrollTop on documentElement / body explicitly (rather than
 * relying on window.scrollTo alone): some browsers (Safari, older Chromium)
 * and some CSS configurations (e.g. `overflow-x: hidden` on html/body in
 * /app/frontend/src/index.css) move the scroll context away from the
 * window. Setting both `documentElement.scrollTop` and `body.scrollTop`
 * + calling `window.scrollTo(0, 0)` covers every case we've seen.
 *
 * We also use `behavior: "auto"` (universally supported) instead of
 * `"instant"`, which is spec-correct but rejected by Safari ≤ 16.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
    const { pathname, hash } = useLocation();
    useEffect(() => {
        // Allow anchor scrolling (e.g. /features#trust) to still work.
        if (hash) {
            const el = document.getElementById(hash.slice(1));
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "start" });
                return;
            }
        }
        // Defer one frame so the new route has rendered before we scroll.
        // Without this, lazy-loaded routes occasionally scroll *before*
        // their content mounts, leaving the user mid-page.
        const raf = window.requestAnimationFrame(() => {
            try {
                window.scrollTo({ top: 0, left: 0, behavior: "auto" });
            } catch {
                window.scrollTo(0, 0);
            }
            if (document.documentElement) document.documentElement.scrollTop = 0;
            if (document.body) document.body.scrollTop = 0;
        });
        return () => window.cancelAnimationFrame(raf);
    }, [pathname, hash]);
    return null;
}
