import React from "react";
import { Link } from "react-router-dom";
import { Info, ArrowRight, Sparkles } from "lucide-react";
import { InvoiceResultBody } from "@/components/invoices/InvoiceResultView";
import { useAuth } from "@/context/AuthContext";

// A STATIC, fully anonymised "what a checked invoice looks like" panel shown
// inline on the Invoice Checker page to logged-OUT visitors only. It renders the
// SAME output stack a real check uses (InvoiceResultBody → summary banner,
// insight donuts, metadata strip, Wayly Summary, issue register, charges table)
// fed with a fixed example result, so the sample matches the live output exactly.
// No API/LLM call is made, no invoiceId is passed (so the download / compare /
// letter actions stay off). Authenticated users never see this — their page is
// unchanged.
//
// PARITY: this mirrors the REAL engine output for the "Sam Burke · Blueberry Care
// · October 2026" invoice when run while authenticated — a clean invoice that is
// fine to pay, $0 potential refund, 100% payable, with a single informational
// note about the lifetime contribution cap. The summary text, line items and the
// one finding are copied from that real result so the preview never promises
// findings the tool did not actually raise.

const SAMPLE_SUMMARY = `This invoice from Blueberry Care Pty Ltd is for $495.41 including GST and covers your care services for the period around early to mid October 2026. The biggest charge is everyday living contributions for cleaning and gardening at $193.40, which covers help around the home. You have also been billed $89.06 for personal care contributions, which is the daily help with showering and personal tasks. Meal preparation came to $60.00, transport and social support added $33.78, and there was a nursing visit on 14 October for $7.75. You will also see a cleaning charge of $28.70 for a visit on 30 October that was cancelled with notice, and a social support charge of $19.50.

This invoice looks fine to pay. All the charges match your care plan and the services listed are ones you have actually received or were scheduled for. As a heads up, you do have a lifetime limit on what you will pay towards your Support at Home care under the aged care rules, though the government has not yet set the final figure, so we cannot show you how close you are to it at the moment. If you have any questions about what you have been billed for, it is worth checking with Blueberry Care Pty Ltd directly to make sure everything lines up with what you expected.`;

const SAMPLE_RESULT = {
    provider_name: "Blueberry Care Pty Ltd",
    provider_abn: "12 345 678 901",
    invoice_date: "2026-11-05",
    document_shape: "invoice",
    invoice_total: 495.41,
    reconciliation: {
        invoice_total: 495.41,
        invoice_gst: 43.22,
        invoice_subtotal: 432.19,
        summary_md: SAMPLE_SUMMARY,
        lines: [
            { line_id: "L1", service_date: null, service_type: "Everyday living — cleaning and gardening", service_category: "everyday_living", units_or_hours: null, unit_price: null, gross_cost: 193.40, gst_amount: null, contribution_amount: 193.40 },
            { line_id: "L2", service_date: null, service_type: "Personal care", service_category: "personal_care", units_or_hours: null, unit_price: null, gross_cost: 89.06, gst_amount: null, contribution_amount: 89.06 },
            { line_id: "L3", service_date: null, service_type: "Meal preparation", service_category: "everyday_living", units_or_hours: null, unit_price: null, gross_cost: 60.00, gst_amount: null, contribution_amount: 60.00 },
            { line_id: "L4", service_date: null, service_type: "Transport and social support", service_category: "transport", units_or_hours: null, unit_price: null, gross_cost: 33.78, gst_amount: null, contribution_amount: 33.78 },
            { line_id: "L5", service_date: "2026-10-14", service_type: "Nursing visit", service_category: "nursing", units_or_hours: null, unit_price: null, gross_cost: 7.75, gst_amount: null, contribution_amount: 7.75 },
            { line_id: "L6", service_date: "2026-10-30", service_type: "Domestic assistance (cancelled with notice)", service_category: "everyday_living", units_or_hours: null, unit_price: null, gross_cost: 28.70, gst_amount: null, contribution_amount: 28.70 },
            { line_id: "L7", service_date: null, service_type: "Social support", service_category: "transport", units_or_hours: null, unit_price: null, gross_cost: 19.50, gst_amount: null, contribution_amount: 19.50 },
        ],
        findings: [
            {
                check_id: "C10",
                tier: 1,
                severity: "info",
                title: "About your lifetime contribution cap",
                description: "You have a lifetime limit on what you will pay towards your Support at Home care under the aged care rules. The government has not yet set the final figure, so we cannot show you how close you are to it at the moment. There is nothing to do right now — it is just good to know.",
                financial_impact: { amount: 0 },
                line_ids: [],
            },
        ],
    },
};

export default function InvoiceSampleResult() {
    const { user } = useAuth();
    // Marketing sample — show only to unauthenticated visitors, not logged-in users.
    if (user) return null;
    return (
        <section className="mx-auto max-w-[1100px] px-6 mt-4 mb-6" data-testid="invoice-sample-output" aria-label="Example checked invoice">
            <div className="rounded-2xl border border-kindred bg-surface p-6 sm:p-8">
                <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-[#A5512B]"
                    data-testid="invoice-sample-badge"
                >
                    <Info className="h-3.5 w-3.5" /> Sample check · not a real person&apos;s data
                </span>
                <h2 className="font-heading text-2xl sm:text-3xl tracking-tight mt-4 leading-tight">
                    <span className="text-primary-k">See Exactly What the Invoice Checker </span>
                    <span className="text-[#A5512B]">Hands You</span>
                </h2>
                <p className="mt-3 text-muted-k leading-relaxed max-w-2xl">
                    Here is a real October invoice run through Wayly. This is the exact output you get after a check —
                    the money at a glance, every line read for you in plain English, and a clear verdict on whether it
                    is fine to pay or worth a question. No upload needed to look.
                </p>

                {/* The REAL output stack, matching a live check. No invoiceId → no
                    download / compare / letter actions; it is a static preview. */}
                <div className="mt-6 space-y-6">
                    <InvoiceResultBody result={SAMPLE_RESULT} />
                </div>

                {/* CTA panel */}
                <div className="mt-6 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0E4D52] to-[#13656B] p-6 text-white shadow-sm" data-testid="invoice-sample-cta-panel">
                    <div className="flex items-start gap-3">
                        <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-white/15 text-white">
                            <Sparkles className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                            <p className="font-heading text-lg leading-snug text-white">Check Your Own Invoice In Seconds</p>
                            <p className="mt-1 text-sm leading-relaxed text-white/85">
                                Upload the invoice your provider sent and Wayly reads every line, tells you plainly
                                whether it is fine to pay or worth a question, and drafts the email for you if something
                                needs raising. Unlimited checks on any Wayly plan with a 7-day free trial, cancel any time.
                            </p>
                        </div>
                    </div>
                    <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                        <Link
                            to="/signup?plan=solo"
                            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-gold px-5 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
                            data-testid="invoice-sample-trial-cta"
                        >
                            Start a 7-day free trial <ArrowRight className="h-4 w-4" />
                        </Link>
                        <Link
                            to="/login"
                            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-white/55 bg-white/10 px-5 py-3 text-sm font-semibold text-white hover:bg-white/20 transition-colors"
                            data-testid="invoice-sample-signin-cta"
                        >
                            Sign in
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
}
