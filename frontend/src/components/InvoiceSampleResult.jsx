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
// Example: a real-world Support at Home contribution invoice (October 2026) with
// a handful of deliberately seeded billing issues — a duplicate clean, personal
// care still charged a contribution after the 1 October 2026 change, a clinical
// nursing contribution, a cancelled-with-notice visit, and a doubled social
// support line — so visitors see exactly the kind of money Wayly can surface.

const SAMPLE_SUMMARY = `In October, Blueberry Care billed $495.41 across cleaning, gardening, meal preparation, transport, social support, personal care and one nursing visit. Most of it reads as ordinary month-to-month care for a Level 4 participant, but a few lines are worth pausing on. The clean on 16 October appears twice, personal care has been charged an $89.06 contribution even though personal care became fully government funded on 1 October 2026, and the nursing visit carries a small contribution even though clinical care should cost you nothing.

Added together, about $193 of the $495 billed is worth querying before you pay, which would leave roughly $302 as what you actually owe. None of this means the provider has done anything deliberately wrong — the contribution rules changed recently and billing systems slip — but these are exactly the lines to raise in a short, friendly email. Wayly has already written the questions for you, so you can work through them one by one and keep this invoice to compare against next month.`;

const SAMPLE_RESULT = {
    provider_name: "Blueberry Care Pty Ltd",
    provider_abn: "12 345 678 901",
    invoice_number: "INV-2026-1042",
    invoice_date: "2026-11-05",
    due_date: "2026-11-19",
    document_shape: "invoice",
    invoice_total: 495.41,
    reconciliation: {
        invoice_total: 495.41,
        invoice_gst: 43.22,
        invoice_subtotal: 432.19,
        invoice_number: "INV-2026-1042",
        summary_md: SAMPLE_SUMMARY,
        lines: [
            { line_id: "L1", service_date: "2026-10-02", service_type: "Domestic assistance (cleaning)", service_category: "everyday_living", units_or_hours: 1, unit_price: 48.35, gross_cost: 48.35, gst_amount: null, contribution_amount: 48.35 },
            { line_id: "L2", service_date: "2026-10-09", service_type: "Gardening", service_category: "everyday_living", units_or_hours: 1, unit_price: 48.35, gross_cost: 48.35, gst_amount: null, contribution_amount: 48.35 },
            { line_id: "L3", service_date: "2026-10-16", service_type: "Domestic assistance (cleaning)", service_category: "everyday_living", units_or_hours: 1, unit_price: 48.35, gross_cost: 48.35, gst_amount: null, contribution_amount: 48.35 },
            { line_id: "L4", service_date: "2026-10-16", service_type: "Domestic assistance (cleaning)", service_category: "everyday_living", units_or_hours: 1, unit_price: 48.35, gross_cost: 48.35, gst_amount: null, contribution_amount: 48.35 },
            { line_id: "L5", service_date: "2026-10-10", service_type: "Meal preparation", service_category: "everyday_living", units_or_hours: 1, unit_price: 60.00, gross_cost: 60.00, gst_amount: null, contribution_amount: 60.00 },
            { line_id: "L6", service_date: "2026-10-21", service_type: "Transport & social support", service_category: "transport", units_or_hours: 1, unit_price: 33.78, gross_cost: 33.78, gst_amount: null, contribution_amount: 33.78 },
            { line_id: "L7", service_date: "2026-10-23", service_type: "Social support", service_category: "transport", units_or_hours: 1, unit_price: 19.50, gross_cost: 19.50, gst_amount: null, contribution_amount: 19.50 },
            { line_id: "L8", service_date: "2026-10-28", service_type: "Personal care", service_category: "personal_care", units_or_hours: 1, unit_price: 89.06, gross_cost: 89.06, gst_amount: null, contribution_amount: 89.06 },
            { line_id: "L9", service_date: "2026-10-14", service_type: "Nursing visit", service_category: "nursing", units_or_hours: 1, unit_price: 7.75, gross_cost: 7.75, gst_amount: null, contribution_amount: 7.75 },
            { line_id: "L10", service_date: "2026-10-30", service_type: "Domestic assistance (cancelled with notice)", service_category: "everyday_living", units_or_hours: 1, unit_price: 28.70, gross_cost: 28.70, gst_amount: null, contribution_amount: 28.70 },
        ],
        findings: [
            {
                check_id: "C2",
                tier: 4,
                title: "Personal care should now be free",
                description: "From 1 October 2026 personal care under Support at Home is funded as Clinical Supports, so your contribution should be $0. This invoice still charges an $89.06 personal care contribution for 28 October, which is worth questioning before you pay.",
                recommended_action: "Ask Blueberry Care to remove the $89.06 personal care contribution, as personal care has been fully government funded since 1 October 2026.",
                evidence: ["28/10/2026 Personal care, contribution $89.06"],
                financial_impact: { amount: 89.06 },
                line_ids: ["L8"],
            },
            {
                check_id: "C11",
                tier: 4,
                title: "A cleaning visit looks charged twice",
                description: "There are two identical cleaning charges for 16 October, each $48.35. Unless two separate cleans really happened that day, one of them is a duplicate and should come off the invoice.",
                recommended_action: "Ask whether two cleans took place on 16 October. If not, request the duplicate $48.35 line be removed.",
                evidence: ["16/10/2026 Domestic assistance (cleaning), contribution $48.35", "16/10/2026 Domestic assistance (cleaning), contribution $48.35"],
                financial_impact: { amount: 48.35 },
                line_ids: ["L4"],
            },
            {
                check_id: "C1",
                tier: 4,
                title: "Nursing is clinical care and should be free",
                description: "The nursing visit on 14 October is a clinical support, which is fully government funded. Your contribution for it should be $0, but a $7.75 contribution has been charged.",
                recommended_action: "Ask for the $7.75 nursing contribution to be reversed, as clinical care carries no participant contribution.",
                evidence: ["14/10/2026 Nursing visit, contribution $7.75"],
                financial_impact: { amount: 7.75 },
                line_ids: ["L9"],
            },
            {
                check_id: "C5",
                tier: 3,
                title: "A cancelled visit was still charged",
                description: "The clean on 30 October is marked as cancelled with notice, yet a $28.70 contribution has still been billed. A visit cancelled with reasonable notice generally should not be charged.",
                recommended_action: "Confirm the 30 October clean was cancelled with notice and ask for the $28.70 to be removed.",
                evidence: ["30/10/2026 Domestic assistance (cancelled with notice), contribution $28.70"],
                financial_impact: { amount: 28.70 },
                line_ids: ["L10"],
            },
            {
                check_id: "C11",
                tier: 3,
                title: "Social support appears charged twice",
                description: "Social support shows up on both 21 October (bundled with transport) and again on 23 October for $19.50. It is worth checking the 23 October line is not a repeat of the same session.",
                recommended_action: "Ask Blueberry Care to confirm the 23 October social support is a separate session and not a repeat of the 21 October charge.",
                evidence: ["21/10/2026 Transport & social support, contribution $33.78", "23/10/2026 Social support, contribution $19.50"],
                financial_impact: { amount: 19.50 },
                line_ids: ["L7"],
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
                    Here is a real-world October invoice run through Wayly. This is the exact output you get after a
                    check — the money at a glance, every line read for you, and the specific things worth raising with
                    your provider before you pay. No upload needed to look.
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
                                Upload the invoice your provider sent and Wayly reads every line, flags anything worth
                                questioning, and drafts the email for you. Unlimited checks on any Wayly plan with a
                                7-day free trial, cancel any time.
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
