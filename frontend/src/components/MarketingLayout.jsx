import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import usePublicPageMotion from "@/hooks/usePublicPageMotion";

/**
 * MarketingLayout — a pathless layout route wrapping every public / marketing
 * page. It gives each page a soft cross-fade entrance on navigation (the keyed
 * `.wayly-public` container remounts per route) and reveals its `<section>`
 * blocks with a graceful rise as they scroll into view. The authenticated app
 * (dashboard) pages are intentionally NOT wrapped here — they keep their own
 * Layout-scoped `.wayly-route` motion and persistent chrome.
 */
export default function MarketingLayout() {
    const { pathname } = useLocation();
    usePublicPageMotion(pathname);
    return (
        <div key={pathname} className="wayly-public" data-testid="marketing-motion-root">
            <Outlet />
        </div>
    );
}
