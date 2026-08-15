import React from "react";
import { Navigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { canonicalFor } from "@/seo/SeoHead";

/**
 * Client-side redirect stub with SEO signals for Googlebot.
 *
 * Renders <meta name="robots" content="noindex, follow"> plus a
 * <link rel="canonical"> pointing at ``to`` before the browser navigates.
 * This is the SPA-side workaround for the "Page with redirect" flag in
 * Google Search Console, until Emergent hosting can serve a real
 * server-side 301, this at least tells crawlers to drop the source URL
 * and consolidate ranking signals onto the destination.
 *
 * ``to`` is expected to be an in-app path (leading slash).
 */
export default function StubRedirect({ to }) {
    const canonicalUrl = canonicalFor(to || "/");
    return (
        <>
            <Helmet prioritizeSeoTags>
                <meta name="robots" content="noindex, follow" />
                <link rel="canonical" href={canonicalUrl} />
            </Helmet>
            <Navigate to={to} replace />
        </>
    );
}
