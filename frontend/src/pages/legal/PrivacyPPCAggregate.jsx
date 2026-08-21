import React from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import SeoHead from "@/seo/SeoHead";

/**
 * PPC-1 v2 §WS10 + WS13, Privacy Policy amendment for the Provider Price
 * Aggregate.
 *
 * Discloses:
 *   - What is written to `ppc_provider_aggregate` (hashed user id, provider
 *     name, service, rate, position, snapshot id, entered_at).
 *   - Why (community price transparency).
 *   - Retention + erasure controls (delete a check / bulk delete a
 *     provider's history / delete your account).
 */
export default function PrivacyPPCAggregatePage() {
    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead
                title="Privacy Policy, Provider Price Aggregate | Wayly"
                description="How Wayly uses anonymised price data from the Provider Price Checker to build a community-price picture."
                canonical="/legal/privacy/ppc-aggregate"
            />
            <MarketingHeader />
            <section className="mx-auto max-w-3xl px-6 pt-10 pb-16">
                <Link
                    to="/legal/privacy"
                    className="text-sm text-muted-k hover:text-primary-k inline-flex items-center gap-1"
                    data-testid="ppc-privacy-back"
                >
                    ← Back to full Privacy Policy
                </Link>
                <h1
                    className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight"
                    data-testid="ppc-privacy-title"
                >
                    Provider Price Aggregate, a plain-language amendment
                </h1>
                <p className="text-sm text-muted-k mt-3">Effective: February 2026 · Applies to: Provider Price Checker (v2)</p>

                <div className="mt-8 space-y-6 text-primary-k leading-relaxed">
                    <section>
                        <h2 className="font-heading text-2xl text-primary-k">What we write when you save a price check</h2>
                        <p className="mt-2">
                            When you click <em>Save this result</em> in the Provider Price Checker, we write two records:
                        </p>
                        <ul className="mt-3 space-y-2 list-disc pl-5">
                            <li>
                                <strong>Your saved check</strong>, visible to you at{" "}
                                <Link to="/tools/price-checker/history" className="underline">Your price history</Link>.
                                Includes the service, rate, provider name, date, and the position we assigned. This
                                record is deletable at any time.
                            </li>
                            <li>
                                <strong>An anonymised aggregate row</strong>, a companion record in the
                                <code className="mx-1 text-xs bg-surface-2 rounded px-1 py-0.5 border border-kindred">ppc_provider_aggregate</code>
                                collection with a one-way hash of your account ID, the normalised provider name, the
                                service, the rate, the unit, the position, and the snapshot ID.
                                <strong> No personal identifiers. </strong>
                                Because we store a hash of your account ID rather than the ID itself, we cannot reverse
                                the record back to you, but we can still remove your row when you delete a check
                                (because the hash is deterministic).
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="font-heading text-2xl text-primary-k">Why we keep the aggregate</h2>
                        <p className="mt-2">
                            The Department of Health publishes an indicative range once a quarter based on a survey of
                            {" ~300 providers. That's roughly one third of the market and only twice a year. The aggregate "}
                            lets Wayly show a community-price picture in near-real-time from the actual bills members
                            share with us.
                        </p>
                        <p className="mt-2 text-sm text-muted-k">
                            The aggregate is never sold. It is never surfaced with any information that could re-identify
                            a member. It is used only to compute median rates when at least ten distinct members have
                            saved a check for a given (provider, service) combination.
                        </p>
                    </section>

                    <section>
                        <h2 className="font-heading text-2xl text-primary-k">How to erase your data</h2>
                        <p className="mt-2">
                            You have three erasure controls, all instant:
                        </p>
                        <ol className="mt-3 space-y-2 list-decimal pl-5">
                            <li>
                                <strong>Delete a single check.</strong> Tap the trash icon on any row in{" "}
                                <Link to="/tools/price-checker/history" className="underline">Your price history</Link>.
                                Both the saved check and the matching aggregate row are removed.
                            </li>
                            <li>
                                <strong>Delete all history for one provider.</strong> On any provider card, tap{" "}
                                <em>Delete provider history</em>. Every saved check and every matching aggregate row is
                                removed.
                            </li>
                            <li>
                                <strong>Delete your Wayly account.</strong> Use{" "}
                                <Link to="/settings/account" className="underline">Settings → Delete account</Link>.
                                All saved checks are removed. All aggregate rows keyed to your hashed ID are removed.
                            </li>
                        </ol>
                        <p className="mt-2 text-sm text-muted-k">
                            Erasure is complete within 30 seconds. There are no soft-deletes, tombstones, or 30-day grace
                            windows on aggregate data.
                        </p>
                    </section>

                    <section>
                        <h2 className="font-heading text-2xl text-primary-k">Automated Decision Making disclosure</h2>
                        <p className="mt-2">
                            The Provider Price Checker uses a deterministic rule (is the entered rate inside or outside
                            the DoH indicative range) to categorise your result. No human reviews individual results.
                            {" Under the Privacy Act 2024 amendments (in force December 2026) we're required to tell you "}
                            this. The rule is documented in the{" "}
                            <em>How this flag works</em> modal on every result card.
                        </p>
                    </section>

                    <section>
                        <h2 className="font-heading text-2xl text-primary-k">Questions?</h2>
                        <p className="mt-2">
                            Contact us at{" "}
                            <a href="mailto:privacy@wayly.com.au" className="underline">privacy@wayly.com.au</a>{" "}
                            or open a support ticket via the <em>Report an issue</em> button on any Wayly tool.
                        </p>
                    </section>
                </div>
            </section>
            <Footer />
        </div>
    );
}
