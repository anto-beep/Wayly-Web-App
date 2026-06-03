/**
 * ScrollToTop — scrolls the window to the top on every route change.
 * Mounted once inside <BrowserRouter>. No props.
 */
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
    const { pathname, hash } = useLocation();
    useEffect(() => {
        // Allow anchor scrolling (e.g. /features#trust) to still work
        if (hash) {
            const el = document.getElementById(hash.slice(1));
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "start" });
                return;
            }
        }
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }, [pathname, hash]);
    return null;
}
