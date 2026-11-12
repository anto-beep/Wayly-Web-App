import React from "react";
import { Link } from "react-router-dom";
import { Info, ArrowRight, Sparkles } from "lucide-react";
import SmartAISummary from "@/components/SmartAISummary";
import StatementInsightGraphics from "@/components/StatementInsightGraphics";
import DecoderResultView from "@/components/DecoderResultView";

// A STATIC, fully anonymised "what a decoded statement looks like" panel shown
// inline on the Statement Decoder page. It renders the SAME output components a
// real decode uses (Wayly Summary → insight donuts → DecoderResultView) fed
// with a fixed example result, so the sample matches the live output exactly:
// same summary length/style, the three brand-coloured streams, the who-paid
// split, fee breakdown and anomaly cards. No API/LLM call is made — the Wayly
// Summary runs in static mode (autoLoad=false) with the example text.
//
// Example household: a Level 4 participant on Support at Home, October 2026,
// six services across the three streams. Clean statement with one informational
// note (personal care now funded as Clinical Supports from 1 October 2026).

const SAMPLE_SUMMARY = `In October, Sunrise Home Care billed $710.00 across six services. Two were clinical, a nursing visit for wound care and a physiotherapy session, and because clinical supports are fully government funded you paid nothing for either. Under Independence there were two personal care visits and a community access visit; personal care is now funded as Clinical Supports from 1 October 2026, so it cost you nothing too, and your share of the social support came to $7.00. The one everyday living service, a fortnightly clean, is where most of your contribution sat, at $22.75.

All up, the government covered $680.25 and your share was $29.75, which is about what you would expect at a full pension rate. Every line was charged in line with the Support at Home plan, nothing looked duplicated or out of place, and your Level 4 quarterly budget still has $6,922.04 left to spend. The only thing worth knowing is the personal care change from 1 October, which this statement has applied correctly, so there is nothing you need to do. Keep this statement and Wayly can compare next month against it.`;

const SAMPLE_RESULT = {
    publishable: true,
    low_confidence: false,
    summary: SAMPLE_SUMMARY,
    extracted: {
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        reported_total_gross: 710,
        care_management_deducted: 0,
        gst_total: 0,
        quarterly_allocation_received: 7632.04,
        opening_balance: 0,
        closing_balance: 6922.04,
        line_items: [
            { date: "2026-10-07", service_description: "Nursing visit (wound care)", stream: "Clinical", quantity: 1, unit: "hr", unit_rate: 120, gross: 120, participant_contribution: 0, government_paid: 120 },
            { date: "2026-10-14", service_description: "Physiotherapy", stream: "Clinical", quantity: 1, unit: "hr", unit_rate: 150, gross: 150, participant_contribution: 0, government_paid: 150 },
            { date: "2026-10-02", service_description: "Personal care (showering)", stream: "Independence", quantity: 1, unit: "hr", unit_rate: 85, gross: 85, participant_contribution: 0, government_paid: 85 },
            { date: "2026-10-16", service_description: "Personal care (showering)", stream: "Independence", quantity: 1, unit: "hr", unit_rate: 85, gross: 85, participant_contribution: 0, government_paid: 85 },
            { date: "2026-10-09", service_description: "Social support (community access)", stream: "Independence", quantity: 2, unit: "hr", unit_rate: 70, gross: 140, participant_contribution: 7, government_paid: 133 },
            { date: "2026-10-21", service_description: "Domestic assistance (cleaning)", stream: "EverydayLiving", quantity: 2, unit: "hr", unit_rate: 65, gross: 130, participant_contribution: 22.75, government_paid: 107.25 },
        ],
    },
    audit: {
        statement_summary: {
            provider: "Sunrise Home Care",
            classification: "Level 4",
            cadence: "monthly",
            total_gross: 710,
            total_participant_contribution: 29.75,
            total_government_paid: 680.25,
            budget_remaining: 6922.04,
        },
        anomaly_count: { high: 0, medium: 0, low: 0, advisory: 1 },
        anomalies: [
            {
                severity: "informational",
                headline: "Personal care is now funded as Clinical Supports",
                detail: "From 1 October 2026, personal care moves into Clinical Supports under Support at Home, so it is fully government funded and your contribution is $0. This statement has applied that correctly, so there is nothing you need to do.",
                suggested_action: null,
                evidence: [
                    "02/10/2026 Personal care (showering) $85.00, contribution $0.00",
                    "16/10/2026 Personal care (showering) $85.00, contribution $0.00",
                ],
            },
        ],
        stream_breakdown: [
            { stream: "Clinical", line_item_count: 2, gross_total: 270, participant_contribution: 0, government_paid: 270 },
            { stream: "Independence", line_item_count: 3, gross_total: 310, participant_contribution: 7, government_paid: 303 },
            { stream: "EverydayLiving", line_item_count: 1, gross_total: 130, participant_contribution: 22.75, government_paid: 107.25 },
        ],
    },
};

export default function DecoderSampleResult() {
    return (
        <section className="mt-10" data-testid="decoder-sample-output" aria-label="Example decoded statement">
            <div className="rounded-2xl border border-kindred bg-surface p-6 sm:p-8">
                <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-[#A5512B]"
                    data-testid="decoder-sample-badge"
                >
                    <Info className="h-3.5 w-3.5" /> Sample output · not a real person's data
                </span>
                <h2 className="font-heading text-2xl sm:text-3xl tracking-tight mt-4 leading-tight">
                    <span className="text-primary-k">See What a Decoded Statement </span>
                    <span className="text-[#A5512B]">Really Shows You</span>
                </h2>
                <p className="mt-3 text-muted-k leading-relaxed">
                    A worked example for a Level 4 participant on Support at Home. This is exactly what Wayly shows you
                    after a decode, the Wayly Summary, the who-paid split, every stream and the line-by-line read,
                    without uploading anything.
                </p>

                {/* The REAL output stack, matching a live decode. */}
                <div className="mt-6">
                    <SmartAISummary
                        pageKey="statement-decoder-sample"
                        autoLoad={false}
                        refreshable={false}
                        fallback={SAMPLE_SUMMARY}
                    />
                    <StatementInsightGraphics
                        stmt={{ audit_json: SAMPLE_RESULT.audit, anomalies: SAMPLE_RESULT.audit.anomalies }}
                    />
                    <div className="mt-5">
                        <DecoderResultView result={SAMPLE_RESULT} />
                    </div>
                </div>

                {/* Free vs trial clarifier + CTA */}
                <div className="mt-6 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0E4D52] to-[#13656B] p-6 text-white shadow-sm" data-testid="decoder-sample-cta-panel">
                    <div className="flex items-start gap-3">
                        <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-white/15 text-white">
                            <Sparkles className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                            <p className="font-heading text-lg leading-snug text-white">Free To Try, No Account Needed</p>
                            <p className="mt-1 text-sm leading-relaxed text-white/85">
                                Your first decode is free. After that it is one free decode every 120 days, or unlimited
                                on any Wayly plan with a 7-day free trial.
                            </p>
                        </div>
                    </div>
                    <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                        <a
                            href="#decode"
                            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-gold px-5 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
                            data-testid="decoder-sample-decode-cta"
                        >
                            Decode your own statement <ArrowRight className="h-4 w-4" />
                        </a>
                        <Link
                            to="/signup?plan=solo"
                            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-white/55 bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/20 transition-colors"
                            data-testid="decoder-sample-trial-cta"
                        >
                            Start a 7-day free trial
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
}
