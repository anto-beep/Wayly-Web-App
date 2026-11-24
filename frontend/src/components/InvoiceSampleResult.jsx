import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Info, ArrowRight, Sparkles, ShieldAlert, CheckCircle2 } from "lucide-react";
import { InvoiceResultBody } from "@/components/invoices/InvoiceResultView";
import { useAuth } from "@/context/AuthContext";

// A STATIC, fully anonymised "what a checked invoice looks like" panel shown
// inline on the Invoice Checker page to logged-OUT visitors only. It renders the
// SAME output stack a real check uses (InvoiceResultBody → summary banner,
// insight donuts, metadata strip, Wayly Summary, issue register, charges table)
// fed with fixed example results, so the sample matches the live output exactly.
// No API/LLM call is made, no invoiceId is passed (so the download / compare /
// letter actions stay off). Authenticated users never see this, their page is
// unchanged.
//
// TWO tabs let a visitor flip between the two outcomes the tool produces:
//   1. "Genuine overcharge" (DEFAULT), the Sam Burke · Blueberry Care · October
//      2026 invoice run with the supporting records cross-referenced. Mirrors the
//      REAL engine output: $1,019.06 billed, ten things worth raising and one
//      note, $466.66 potentially owed back, $552.40 net payable.
//   2. "Clean invoice", an invoice that is fine to pay, $0 refund, with a single
//      informational note about the lifetime contribution cap.
// Every figure, line item, narrative and suggested question below is copied from
// the real result so the preview never promises findings the tool did not raise.

const SAMPLE_CLEAN_SUMMARY = `This invoice from Blueberry Care Pty Ltd is for $495.41 including GST and covers your care services for the period around early to mid October 2026. The biggest charge is everyday living contributions for cleaning and gardening at $193.40, which covers help around the home. You have also been billed $89.06 for personal care contributions, which is the daily help with showering and personal tasks. Meal preparation came to $60.00, transport and social support added $33.78, and there was a nursing visit on 14 October for $7.75. You will also see a cleaning charge of $28.70 for a visit on 30 October that was cancelled with notice, and a social support charge of $19.50.

This invoice looks fine to pay. All the charges match your care plan and the services listed are ones you have actually received or were scheduled for. As a heads up, you do have a lifetime limit on what you will pay towards your Support at Home care under the aged care rules, though the government has not yet set the final figure, so we cannot show you how close you are to it at the moment. If you have any questions about what you have been billed for, it is worth checking with Blueberry Care Pty Ltd directly to make sure everything lines up with what you expected.`;

const SAMPLE_CLEAN_RESULT = {
    provider_name: "Blueberry Care Pty Ltd",
    provider_abn: "12 345 678 901",
    invoice_date: "2026-11-05",
    document_shape: "invoice",
    invoice_total: 495.41,
    reconciliation: {
        invoice_total: 495.41,
        invoice_gst: 43.22,
        invoice_subtotal: 432.19,
        refund_total: 0,
        summary_md: SAMPLE_CLEAN_SUMMARY,
        lines: [
            { line_id: "L1", service_date: null, service_type: "Everyday living, cleaning and gardening", service_category: "everyday_living", units_or_hours: null, unit_price: null, gross_cost: 193.40, gst_amount: null, contribution_amount: 193.40 },
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
                description: "You have a lifetime limit on what you will pay towards your Support at Home care under the aged care rules. The government has not yet set the final figure, so we cannot show you how close you are to it at the moment. There is nothing to do right now, it is just good to know.",
                financial_impact: { amount: 0 },
                line_ids: [],
            },
        ],
    },
};

const SAMPLE_OVERCHARGE_SUMMARY = `This invoice from Blueberry Care Pty Ltd is for $1,019.06 and covers Sam Burke's Support at Home services through October 2026. Most of the care, the registered-nurse visits, personal care and everyday living help, lines up with the care plan. But after reading every line and cross-checking it against the service agreement and care diary, we found ten things worth raising before you pay, adding up to about $466.66 you may be owed back.

The biggest one: personal care has been fully government-funded since 1 October 2026, yet a contribution is still showing on eleven personal-care lines ($186.05). There is also a separate travel charge of $60.76 and a $22.00 monthly administration fee, neither is allowed under Support at Home. Two services were billed that should not have been: a respite visit on 17 October that was cancelled with notice ($42.75), and a social-support visit on 20 October while Sam was in hospital ($19.50). Meal preparation and one domestic-assistance line were charged above the rates in the service agreement, a gardening line has a maths error, one domestic-assistance line looks duplicated, and the invoice total is $20.00 higher than the individual lines add up to.

None of this means the provider has done anything deliberate, these are exactly the kinds of things worth a friendly question. Raise them with Blueberry Care before paying, and Wayly can draft the email for you.`;

const OC = (sd, type, cat, hrs, price, gross, contrib, id) => ({
    line_id: id, service_date: sd, service_type: type, service_category: cat,
    units_or_hours: hrs, unit_price: price, gross_cost: gross, gst_amount: null, contribution_amount: contrib,
});

const SAMPLE_OVERCHARGE_RESULT = {
    provider_name: "Blueberry Care Pty Ltd",
    provider_abn: "12 345 678 901",
    invoice_date: "2026-11-04",
    due_date: "2026-11-18",
    document_shape: "invoice",
    invoice_total: 1019.06,
    reconciliation: {
        invoice_total: 1019.06,
        refund_total: 466.66,
        summary_md: SAMPLE_OVERCHARGE_SUMMARY,
        supporting_records: { filename: "Service agreement + care diary", has_rates: true, cancellations: 1, absences: 1 },
        lines: [
            OC("2026-10-01", "Domestic assistance", "everyday_living", 2.0, 76.0, 152.0, 64.6, "L1"),
            OC("2026-10-02", "Meal preparation", "everyday_living", 2.0, 79.0, 158.0, 67.15, "L2"),
            OC("2026-10-02", "Personal care", "personal_care", 1.5, 82.0, 123.0, 15.38, "L3"),
            OC("2026-10-05", "Personal care", "personal_care", 1.5, 172.0, 258.0, 32.25, "L4"),
            OC("2026-10-06", "Social support - individual", "independence", 2.0, 78.0, 156.0, 19.5, "L5"),
            OC("2026-10-07", "Nursing care - registered nurse", "clinical", 0.75, 148.0, 111.0, 0.0, "L6"),
            OC("2026-10-07", "Personal care", "personal_care", 1.5, 82.0, 123.0, 15.38, "L7"),
            OC("2026-10-08", "Gardening", "everyday_living", 2.0, 80.0, 180.0, 76.5, "L8"),
            OC("2026-10-09", "Meal preparation", "everyday_living", 2.0, 79.0, 158.0, 67.15, "L9"),
            OC("2026-10-09", "Personal care", "personal_care", 1.5, 82.0, 123.0, 15.38, "L10"),
            OC("2026-10-12", "Personal care", "personal_care", 1.5, 82.0, 123.0, 15.38, "L11"),
            OC("2026-10-14", "Nursing care - registered nurse", "clinical", 0.75, 148.0, 111.0, 0.0, "L12"),
            OC("2026-10-14", "Personal care", "personal_care", 1.5, 82.0, 123.0, 15.38, "L13"),
            OC("2026-10-15", "Domestic assistance", "everyday_living", 2.0, 76.0, 152.0, 64.6, "L14"),
            OC("2026-10-15", "Domestic assistance", "everyday_living", 2.0, 76.0, 152.0, 64.6, "L15"),
            OC("2026-10-16", "Meal preparation", "everyday_living", 2.0, 79.0, 158.0, 67.15, "L16"),
            OC("2026-10-16", "Personal care", "personal_care", 1.5, 82.0, 123.0, 15.38, "L17"),
            OC("2026-10-17", "Flexible respite - individual", "independence", 3.0, 114.0, 342.0, 42.75, "L18"),
            OC("2026-10-17", "Nursing care - registered nurse", "clinical", 0.75, 200.0, 150.0, 0.0, "L19"),
            OC("2026-10-19", "Personal care", "personal_care", 1.5, 82.0, 123.0, 15.38, "L20"),
            OC("2026-10-20", "Social support - individual", "independence", 2.0, 78.0, 156.0, 19.5, "L21"),
            OC("2026-10-26", "Personal care", "personal_care", 1.5, 82.0, 123.0, 15.38, "L22"),
            OC("2026-10-27", "Social support - individual", "independence", 2.0, 78.0, 156.0, 19.5, "L23"),
            OC("2026-10-28", "Nursing care - registered nurse", "clinical", 0.75, 148.0, 111.0, 0.0, "L24"),
            OC("2026-10-28", "Personal care", "personal_care", 1.5, 82.0, 123.0, 15.38, "L25"),
            OC("2026-10-29", "Domestic assistance", "everyday_living", 2.0, 106.0, 212.0, 90.1, "L26"),
            OC("2026-10-30", "Meal preparation", "everyday_living", 2.0, 79.0, 158.0, 67.15, "L27"),
            OC("2026-10-30", "Personal care", "personal_care", 1.5, 82.0, 123.0, 15.38, "L28"),
            OC("2026-10-31", "Care management", "care_management", null, 411.38, 411.38, 0.0, "L29"),
            OC("2026-10-31", "Monthly account administration fee", "admin_fee", null, 22.0, 22.0, 22.0, "L30"),
            OC("2026-10-31", "Travel - carer vehicle", "unknown", 62.0, 0.98, 60.76, 60.76, "L31"),
        ],
        findings: [
            {
                check_id: "C2", tier: 4, severity: "high",
                title: "Personal care contribution charged after it became free",
                description: "From 1 October 2026 personal care under Support at Home is fully government-funded, yet eleven personal-care lines still show a contribution totalling $186.05.",
                suggested_question: "From 1 October 2026, personal care under Support at Home is fully government-funded. Can you check why a contribution is showing on these personal-care lines?",
                financial_impact: { amount: 186.05, basis: "sum of the contribution charged on the affected lines" },
                line_ids: ["L3", "L4", "L7", "L10", "L11", "L13", "L17", "L20", "L22", "L25", "L28"],
            },
            {
                check_id: "C4", tier: 4, severity: "high",
                title: "A separate travel charge that may not be allowed",
                description: "A separate travel/mileage line of $60.76 appears on this invoice. Support at Home unit prices are meant to be all-inclusive of travel.",
                suggested_question: "Support at Home unit prices are meant to be all-inclusive of travel. Can you check this separate travel charge of $60.76 and remove it if it applies?",
                financial_impact: { amount: 60.76, basis: "the travel line charged to you" },
                line_ids: ["L31"],
            },
            {
                check_id: "C4", tier: 4, severity: "high",
                title: "Care management or fees that shouldn't be charged",
                description: "A prohibited administration fee of $22.00 appears on this invoice. Support at Home does not permit separate administration fees on top of care management.",
                suggested_question: "Support at Home does not permit separate administration fees on top of care management. Can you check this line and remove it if it applies?",
                financial_impact: { amount: 22.0, basis: "the admin fee charged to you" },
                line_ids: ["L30"],
            },
            {
                check_id: "C5", tier: 4, severity: "high",
                title: "Charged for a service you cancelled with notice",
                description: "Flexible respite - individual on 17/10/2026 was cancelled with notice but still billed $42.75.",
                suggested_question: "Your records show the Flexible respite - individual on 17/10/2026 was cancelled with at least 24 hours notice, so under your agreement no charge applies. Can you remove it?",
                financial_impact: { amount: 42.75, basis: "the contribution charged for the cancelled service" },
                line_ids: ["L18"],
            },
            {
                check_id: "C5", tier: 4, severity: "high",
                title: "Charged for a service during a hospital stay",
                description: "Social support - individual on 20/10/2026 was billed $19.50 while the participant was in hospital / on leave.",
                suggested_question: "Your records show you were in hospital / on leave on 20/10/2026 and no service was delivered, so under your agreement this Social support - individual charge should not apply. Can you remove it?",
                financial_impact: { amount: 19.5, basis: "the contribution charged during the hospital stay" },
                line_ids: ["L21"],
            },
            {
                check_id: "C12", tier: 3, severity: "medium",
                title: "Domestic Assistance charged above your agreed rate",
                description: "Domestic Assistance billed at $106.00/hr against the agreed weekday rate of $76.00/hr; your contribution overcharge is $25.50.",
                suggested_question: "Your service agreement lists domestic assistance at $76.00 an hour for a weekday, but this invoice charges $106.00. Can you check the rate and refund the difference?",
                financial_impact: { amount: 25.5, basis: "your contribution share of the rate above the agreed price" },
                line_ids: ["L26"],
            },
            {
                check_id: "C12", tier: 3, severity: "medium",
                title: "Meal Preparation charged above your agreed rate",
                description: "Meal Preparation billed at $79.00/hr against the agreed weekday rate of $74.00/hr; your contribution overcharge is $17.00.",
                suggested_question: "Your service agreement lists meal preparation at $74.00 an hour for a weekday, but this invoice charges $79.00. Can you check the rate and refund the difference?",
                financial_impact: { amount: 17.0, basis: "your contribution share of the rate above the agreed price" },
                line_ids: ["L2", "L9", "L16", "L27"],
            },
            {
                check_id: "C11", tier: 3, severity: "medium",
                title: "Duplicate line",
                description: "Two domestic-assistance lines on 15 October look identical, same amount, same service, same date.",
                suggested_question: "Two lines on this invoice look identical (same amount, same service, same date). Can you check whether one is a duplicate?",
                financial_impact: { amount: 64.6, basis: "one copy of the duplicated line's contribution" },
                line_ids: ["L14", "L15"],
            },
            {
                check_id: "C6", tier: 3, severity: "medium",
                title: "The maths on a line doesn't add up (quantity × rate)",
                description: "The gardening line charges $180.00, but 2.0 × $80.00 works out to $160.00, a $20.00 difference.",
                suggested_question: "This line charges $180.00, but 2.0 × $80.00 works out to $160.00. Can you check the arithmetic and correct the total?",
                financial_impact: { amount: 8.5, basis: "your contribution share of the over-stated line total" },
                line_ids: ["L8"],
            },
            {
                check_id: "C13", tier: 3, severity: "medium",
                title: "The invoice total is higher than the lines add up to",
                description: "The amount payable is $1,019.06, but the individual contribution amounts on the invoice add up to $999.06, a $20.00 difference.",
                suggested_question: "The amount payable is $1,019.06, but the individual contribution amounts on the invoice add up to $999.06. Can you check the $20.00 difference?",
                financial_impact: { amount: 20.0, basis: "the gap between the printed total and the lines" },
                line_ids: [],
            },
            {
                check_id: "C10", tier: 1, severity: "info",
                title: "About your lifetime contribution cap",
                description: "There is a lifetime limit on the total you will ever pay towards your Support at Home care. The government has not published the final cap figure yet, so we cannot show how close you are to it. This note is here for your information only, not because anything on this invoice is wrong.",
                financial_impact: { amount: 0 },
                line_ids: [],
            },
        ],
    },
};

const TABS = [
    {
        key: "overcharge",
        label: "Genuine overcharge",
        sub: "$466.66 to claim back",
        Icon: ShieldAlert,
        result: SAMPLE_OVERCHARGE_RESULT,
        blurb: "Here is an example October invoice, built from the billing patterns Wayly sees most often (Blueberry Care is not a real provider), run through Wayly with the service agreement and care diary cross-referenced. The tool read all 31 lines and surfaced eleven findings, ten of them worth raising before you pay, personal care billed after it became free, a prohibited admin fee, a cancelled visit, rates above the agreement and more, adding up to $466.66 you may be owed back.",
    },
    {
        key: "clean",
        label: "Clean invoice",
        sub: "Fine to pay",
        Icon: CheckCircle2,
        result: SAMPLE_CLEAN_RESULT,
        blurb: "And here is an invoice that checks out. Every line matches the care plan and the services were received or scheduled, so there is nothing to dispute, just a plain-English read of what you are paying for and a quick note about the lifetime contribution cap.",
    },
];

function SampleTabs({ active, setActive }) {
    return (
        <div className="mt-6 inline-flex rounded-full border border-kindred bg-surface-2 p-1" data-testid="invoice-sample-tabs" role="tablist">
            {TABS.map((t) => {
                const isActive = active === t.key;
                return (
                    <button
                        key={t.key}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => setActive(t.key)}
                        data-testid={`invoice-sample-tab-${t.key}`}
                        className={`inline-flex items-center gap-2 rounded-full px-4 sm:px-5 py-2.5 text-sm font-semibold transition-colors ${
                            isActive
                                ? (t.key === "overcharge" ? "bg-[#A5512B] text-white shadow-sm" : "bg-primary-k text-white shadow-sm")
                                : "text-primary-k hover:bg-surface"
                        }`}
                    >
                        <t.Icon className="h-4 w-4" />
                        <span className="flex flex-col items-start leading-tight">
                            <span>{t.label}</span>
                            <span className={`text-[11px] font-medium ${isActive ? "text-white/80" : "text-muted-k"}`}>{t.sub}</span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

export default function InvoiceSampleResult() {
    const { user } = useAuth();
    const [active, setActive] = useState("overcharge");
    // Marketing sample, show only to unauthenticated visitors, not logged-in users.
    if (user) return null;
    const tab = TABS.find((t) => t.key === active) || TABS[0];
    return (
        <section className="mx-auto max-w-[1720px] px-6 mt-4 mb-6" data-testid="invoice-sample-output" aria-label="Example checked invoice">
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
                <p className="mt-3 text-muted-k leading-relaxed">
                    Flip between an example invoice with genuine-style overcharges and one that is fine to pay. Either way you get the
                    same output a live check gives you, the money at a glance, every line read in plain English, and a clear
                    verdict on whether to pay or ask a question first. No upload needed to look.
                </p>

                <SampleTabs active={active} setActive={setActive} />

                <p className="mt-4 text-sm text-primary-k/80 leading-relaxed" data-testid="invoice-sample-blurb">
                    {tab.blurb}
                </p>

                {/* The REAL output stack, matching a live check. No invoiceId → no
                    download / compare / letter actions; it is a static preview. */}
                <div className="mt-6 space-y-6" key={tab.key} data-testid={`invoice-sample-body-${tab.key}`}>
                    <InvoiceResultBody result={tab.result} />
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
