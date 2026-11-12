import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { gtmPageView } from "@/lib/ga4";

/**
 * Pushes a sanitized `wayly_page_view` onto the dataLayer on every route
 * change, across BOTH the public website and the signed-in app, so GTM/GA4
 * get one page_view per navigation. Record ids in paths are scrubbed to :id.
 * Production-host-gated inside ga4.js (dry-run on preview).
 */
export default function GtmRouteTracker() {
    const { pathname } = useLocation();
    useEffect(() => { gtmPageView(pathname); }, [pathname]);
    return null;
}
