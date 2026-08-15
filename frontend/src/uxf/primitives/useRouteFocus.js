/**
 * useRouteFocus (Workstream B, spec 3.19).
 *
 * On every pathname change, waits one paint frame, finds the first
 * <h1> on the new route, and moves keyboard focus to it. This restores
 * WCAG 2.1 AAA compliance for screen-reader users and keyboard
 * navigation, and reduces cognitive load for everyone else because the
 * page announces itself.
 *
 * Guards:
 *   - If a hash target is present (e.g. /pricing#solo), we do NOT steal
 *     focus; the browser's native hash-scroll takes precedence.
 *   - If no <h1> is found, we fall back to `main` (any element with
 *     data-uxf-mainlanding="true") and finally the <body>.
 *   - Focus is set with `preventScroll: true` so the browser can still
 *     scroll to the natural top-of-page or hash target.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function useRouteFocus() {
    const { pathname, hash } = useLocation();

    useEffect(() => {
        if (hash) return undefined; // let the browser handle the hash

        let raf1 = 0, raf2 = 0;
        raf1 = window.requestAnimationFrame(() => {
            raf2 = window.requestAnimationFrame(() => {
                const target =
                    document.querySelector('main h1, [role="main"] h1, h1')
                    || document.querySelector('[data-uxf-mainlanding="true"]')
                    || document.body;
                if (!target) return;
                // Ensure the target is focusable without wrecking the
                // native semantics (h1 elements are focusable when they
                // carry tabindex="-1"; we set it just-in-time and clear
                // it on blur so the DOM stays clean). We also mark the
                // element as `data-uxf-autofocus` so CSS can suppress
                // the visible focus ring, this focus is for screen
                // readers, not sighted keyboard users.
                const previousTabIndex = target.getAttribute("tabindex");
                if (previousTabIndex === null) target.setAttribute("tabindex", "-1");
                target.setAttribute("data-uxf-autofocus", "true");
                target.focus({ preventScroll: true });
                const cleanup = () => {
                    if (previousTabIndex === null) target.removeAttribute("tabindex");
                    target.removeAttribute("data-uxf-autofocus");
                    target.removeEventListener("blur", cleanup);
                };
                target.addEventListener("blur", cleanup);
            });
        });
        return () => {
            if (raf1) cancelAnimationFrame(raf1);
            if (raf2) cancelAnimationFrame(raf2);
        };
    }, [pathname, hash]);
}
