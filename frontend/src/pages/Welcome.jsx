import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { CheckCircle2, ArrowRight } from "lucide-react";
import SeoHead from "@/seo/SeoHead";
import MarketingHeader from "@/components/MarketingHeader";

/**
 * /welcome — one-time trial confirmation page.
 *
 * Reached ONLY via the post-trial-checkout redirect (BillingSuccess sets the
 * `wayly_welcome_entry` session token). Any other way of landing here (typed
 * URL, bookmark, search engine) is redirected to the app. The page is noindex
 * and is not linked from any menu, footer or sitemap. It carries the Google
 * tag because it is a public route (see GoogleAds.jsx).
 */

let welcomeConsumed = false;
function hasEntryToken() {
    if (welcomeConsumed) return true;
    let ok = false;
    try { ok = sessionStorage.getItem("wayly_welcome_entry") === "1"; } catch { /* ignore */ }
    if (ok) {
        welcomeConsumed = true;
        try { sessionStorage.removeItem("wayly_welcome_entry"); } catch { /* ignore */ }
    }
    return ok;
}

export default function Welcome() {
    const nav = useNavigate();
    const [allowed] = useState(() => hasEntryToken());

    if (!allowed) return <Navigate to="/app" replace />;

    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead
                title="Your trial has started"
                description="Your Wayly 7-day free trial is active."
                path="/welcome"
                noindex
            />
            <MarketingHeader />
            <section className="mx-auto max-w-xl px-6 py-20 text-center" data-testid="welcome-page">
                <div className="h-12 w-12 mx-auto rounded-full bg-sage flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6 text-white" />
                </div>
                <h1
                    className="font-heading text-4xl text-primary-k tracking-tight mt-6"
                    data-testid="welcome-heading"
                >
                    Your trial has started
                </h1>
                <p className="mt-3 text-muted-k">
                    You have 7 days of full access to Wayly. Let&apos;s set up your household so Wayly can
                    start watching the statements.
                </p>
                <button
                    type="button"
                    onClick={() => nav("/app")}
                    data-testid="welcome-continue"
                    className="mt-7 bg-primary-k text-white rounded-full px-6 py-3 inline-flex items-center gap-2 hover:bg-[#091D33]"
                >
                    Go to my dashboard <ArrowRight className="h-4 w-4" />
                </button>
            </section>
        </div>
    );
}
