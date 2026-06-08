import React, { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, RefreshCw } from "lucide-react";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import SeoHead from "@/seo/SeoHead";

/**
 * Phase 8 — Custom 500 page (used by the global error boundary).
 *
 * Renders when an uncaught exception bubbles up through <ErrorBoundary> in
 * App.js. Logs the error to PostHog so we can triage from the dashboard.
 */
export default function ServerError({ error, resetError }) {
    const location = useLocation();

    useEffect(() => {
        document.title = "Something went wrong · Wayly";
        if (typeof window !== "undefined") {
            try { window.plausible && window.plausible("500", { props: { path: location.pathname } }); } catch (_) {}
            try {
                window.posthog && window.posthog.capture("uncaught_error", {
                    path: location.pathname,
                    message: error?.message,
                    stack: (error?.stack || "").slice(0, 800),
                });
            } catch (_) {}
        }
    }, [location.pathname, error]);

    const handleReload = () => {
        if (typeof resetError === "function") resetError();
        else if (typeof window !== "undefined") window.location.reload();
    };

    return (
        <div className="min-h-screen bg-kindred" data-testid="server-error">
            <SeoHead
                title="Something went wrong · Wayly"
                description="An unexpected error occurred. We've logged it. Try refreshing the page or returning home."
                canonical={`https://wayly.com.au${location.pathname}`}
                noindex
            />
            <MarketingHeader />
            <main id="main-content" className="mx-auto max-w-3xl px-6 pt-16 pb-20 text-center">
                <div className="font-heading text-[120px] sm:text-[160px] leading-none text-[#0E2A47]/15 tracking-tight">500</div>
                <h1 className="font-heading text-3xl sm:text-4xl text-[#0E2A47] -mt-6">Something on our side broke.</h1>
                <p className="mt-4 text-[#3F506B] leading-relaxed max-w-xl mx-auto">
                    Don't worry. We've logged the error and our team will look into it. Try refreshing the page, or email <a href="mailto:hello@wayly.com.au" className="text-[#075866] font-medium underline underline-offset-2">hello@wayly.com.au</a> if it keeps happening.
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                    <button onClick={handleReload} data-testid="500-retry" className="inline-flex items-center gap-2 rounded-full bg-[#0E2A47] hover:bg-[#091D33] text-white px-5 py-3 text-sm font-semibold">
                        <RefreshCw className="h-4 w-4" /> Try again
                    </button>
                    <Link to="/" data-testid="500-home" className="inline-flex items-center gap-2 rounded-full bg-white text-[#0E2A47] border border-[#CFE0F0] px-5 py-3 text-sm font-semibold hover:border-[#2BC4D6]">
                        <Home className="h-4 w-4" /> Back to home
                    </Link>
                </div>
                {error?.message && (
                    <details className="mt-8 text-left text-xs text-[#3F506B] max-w-xl mx-auto">
                        <summary className="cursor-pointer">Technical detail</summary>
                        <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-[11px]">{error.message}</pre>
                    </details>
                )}
            </main>
            <Footer />
        </div>
    );
}
