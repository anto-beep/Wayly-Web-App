import React from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import {
    ArrowRight, FileSearch, Wallet, BarChart3, ListChecks, FileEdit, Receipt, ClipboardCheck,
    MessageCircle, Users2, AlertTriangle, Calendar, Mic, ShieldCheck, Check, FileText, Lock,
} from "lucide-react";

const TABS = [
    { id: "tools", label: "AI Tools" },
    { id: "wedge", label: "The Wedge" },
    { id: "caregiver", label: "Caregiver" },
    { id: "participant", label: "Participant" },
    { id: "family", label: "Family" },
    { id: "trust", label: "Trust" },
];

const TOOLS = [
    { slug: "statement-decoder", title: "Statement Decoder", body: "Paste any monthly statement; get a plain‑English breakdown in 60 seconds.", icon: FileSearch, plan: "Free" },
    { slug: "budget-calculator", title: "Budget & Lifetime Cap Calculator", body: "Annual + quarterly + per‑stream budget, with a lifetime cap projection.", icon: Wallet, plan: "Free" },
    { slug: "provider-price-checker", title: "Provider Price Checker", body: "Tell us the rate; we tell you whether it's fair against published medians.", icon: BarChart3, plan: "Solo+" },
    { slug: "classification-self-check", title: "Classification Self‑Check", body: "Twelve questions, one likely classification range, one clear next step.", icon: ListChecks, plan: "Solo+" },
    { slug: "reassessment-letter", title: "Reassessment Letter Drafter", body: "A polite, factual reassessment request, ready for My Aged Care.", icon: FileEdit, plan: "Solo+" },
    { slug: "contribution-estimator", title: "Contribution Estimator", body: "What the participant actually pays each quarter, in clear dollars.", icon: Receipt, plan: "Solo+" },
    { slug: "care-plan-reviewer", title: "Care Plan Reviewer", body: "Checks a care plan against the Statement of Rights and the National Quality Standards.", icon: ClipboardCheck, plan: "Solo+" },
    { slug: "family-coordinator", title: "Family Care Coordinator", body: "Ask anything about Australia's aged‑care system. Cited answers, no waffle.", icon: MessageCircle, plan: "Solo+" },
];

const WEDGE = [
    { icon: FileSearch, title: "Statement Auto‑Decode", body: "Forward the participant's statement to a private Kindred email; you'll have a Sunday digest by Monday morning." },
    { icon: AlertTriangle, title: "Anomaly Watch", body: "Rate spikes, duplicates, missing entitlements — flagged the day they show up, not the month after." },
    { icon: Wallet, title: "Budget Tracker", body: "Live position across Clinical · Independence · Everyday Living. Knows about rollover and the 10% care‑management deduction." },
    { icon: BarChart3, title: "Lifetime Cap Forecast", body: "Where you are vs. the $135,318.69 cap (or $84,571.66 grandfathered). Projected years, not just numbers." },
];

const CAREGIVER = [
    { icon: Calendar, title: "30‑second oversight", body: "One screen. What changed this week, what to action, what to ignore." },
    { icon: Users2, title: "Family thread", body: "Siblings, advisors, GPs in one place. Role‑based visibility — finance‑only access for the advisor, full access for the primary caregiver." },
    { icon: FileText, title: "Care plan store", body: "Every plan, every review, every quote — searchable, dated, never lost in an inbox." },
    { icon: ShieldCheck, title: "Audit log", body: "Every action by every person, immutable. Ready if you ever need to escalate to the ACQSC." },
];

const PARTICIPANT = [
    { icon: Mic, title: "Voice‑first home screen", body: "No menus. Today's appointment, this quarter's budget, two big buttons." },
    { icon: AlertTriangle, title: "One‑tap concern", body: "If something doesn't feel right, one button alerts the primary caregiver." },
    { icon: Calendar, title: "Today, simply", body: "Who's coming, when, what they'll do. In big text. Nothing else on the screen." },
];

const FAMILY = [
    { icon: Users2, title: "Sibling invites", body: "Read‑only seats for siblings. Sunday digest summarises the week so they don't need to log in to keep up." },
    { icon: ShieldCheck, title: "Granular permissions", body: "Advisor sees finance, GP sees clinical, sibling sees the digest. Cathy decides who sees what." },
    { icon: MessageCircle, title: "Threaded decisions", body: "Family conversations stay attached to the decisions they relate to — not buried in SMS." },
];

const TRUST = [
    { icon: ShieldCheck, title: "Australian‑hosted", body: "Data lives in AWS Sydney, encrypted with per‑household keys." },
    { icon: Lock, title: "Never sold, never trained on", body: "Your data is yours. We never sell it; we never use it to train models without explicit consent." },
    { icon: FileText, title: "Statement of Rights aligned", body: "Built around the 14 rights the Aged Care Act 2024 sets out — not retrofitted to them." },
    { icon: AlertTriangle, title: "Independent oversight", body: "We list the ACQSC complaints pathway prominently, always. We don't gatekeep your right to escalate." },
];

const PLAN_MATRIX = [
    { feature: "Public AI tools", values: ["2 of 8", "All 8", "All 8", "All 8"] },
    { feature: "Saved tool history", values: ["—", "Yes", "Yes", "Yes"] },
    { feature: "Statement Auto‑Decode (forward email)", values: ["—", "Yes", "Yes", "Yes"] },
    { feature: "Anomaly Watch", values: ["—", "Yes", "Yes", "Yes"] },
    { feature: "Family seats", values: ["—", "1", "5", "5"] },
    { feature: "Audit log + advisor finance‑only view", values: ["—", "Yes", "Yes", "Yes"] },
    { feature: "Care plan store", values: ["—", "Yes", "Yes", "Yes"] },
    { feature: "Pension discount (full‑pension households)", values: ["—", "50% off", "50% off", "—"] },
];
const PLAN_HEADERS = ["Free", "Solo $19/mo", "Family $39/mo", "Lifetime $799"];

const Section = ({ id, eyebrow, title, sub, children }) => (
    <section id={id} className="mx-auto max-w-7xl px-6 py-16" data-testid={`features-section-${id}`}>
        <span className="overline">{eyebrow}</span>
        <h2 className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight max-w-3xl leading-tight">{title}</h2>
        {sub && <p className="mt-4 text-lg text-muted-k max-w-2xl leading-relaxed">{sub}</p>}
        <div className="mt-10">{children}</div>
    </section>
);

const Card = ({ icon: Icon, title, body, plan }) => (
    <div className="rounded-xl border border-kindred bg-surface p-6 transition-all hover:-translate-y-1 hover:shadow-md" data-testid={`feat-card-${title.replace(/\W+/g, "-").toLowerCase()}`}>
        <div className="flex items-start justify-between gap-3">
            <div className="h-10 w-10 rounded-full bg-surface-2 flex items-center justify-center">
                <Icon className="h-5 w-5 text-primary-k" />
            </div>
            {plan && (
                <span className={`text-xs font-medium uppercase tracking-wider rounded-full px-2.5 py-1 ${plan === "Free" ? "bg-sage/20 text-[#3A5A40]" : "bg-gold/20 text-primary-k"}`}>
                    {plan}
                </span>
            )}
        </div>
        <h3 className="font-heading text-xl text-primary-k mt-4">{title}</h3>
        <p className="mt-2 text-sm text-muted-k leading-relaxed">{body}</p>
    </div>
);

export default function Features() {
    return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />

            {/* HERO */}
            <section className="mx-auto max-w-7xl px-6 pt-14 pb-8" data-testid="features-hero">
                <span className="overline">Everything Kindred does</span>
                <h1 className="font-heading text-5xl sm:text-6xl text-primary-k tracking-tight mt-4 leading-tight max-w-3xl">
                    Eight free AI tools, plus a connected co‑pilot for the whole household.
                </h1>
                <p className="mt-5 text-lg text-muted-k max-w-2xl leading-relaxed">
                    Kindred sits on top of Australia's Support at Home program. It reads the statements, watches the budget, drafts the letters,
                    and makes sure no one in the family is the only one paying attention.
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                    <Link to="/signup" className="inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-6 py-3 hover:bg-[#16294a]" data-testid="features-cta-trial">
                        Start free trial <ArrowRight className="h-4 w-4" />
                    </Link>
                    <Link to="/contact?intent=demo" className="inline-flex items-center gap-2 bg-gold text-primary-k rounded-full px-6 py-3 hover:bg-[#c8973f]" data-testid="features-cta-demo">
                        Book a demo
                    </Link>
                </div>
            </section>

            {/* STICKY TAB NAV */}
            <div className="sticky top-[68px] z-30 backdrop-blur-xl bg-[rgba(250,247,242,0.85)] border-y border-kindred" data-testid="features-tabs">
                <div className="mx-auto max-w-7xl px-6 py-3 overflow-x-auto">
                    <div className="flex gap-1">
                        {TABS.map((t) => (
                            <a key={t.id} href={`#${t.id}`} className="text-sm whitespace-nowrap px-4 py-2 rounded-full text-muted-k hover:text-primary-k hover:bg-surface-2" data-testid={`features-tab-${t.id}`}>
                                {t.label}
                            </a>
                        ))}
                    </div>
                </div>
            </div>

            <Section id="tools" eyebrow="AI Tools" title="Free for everyone. The basics, decoded." sub="Two tools are free and need no signup. The other six are part of any paid plan — no card needed for the 14‑day trial.">
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {TOOLS.map((t) => (
                        <Link key={t.slug} to={`/ai-tools/${t.slug}`} className="block">
                            <Card icon={t.icon} title={t.title} body={t.body} plan={t.plan} />
                        </Link>
                    ))}
                </div>
            </Section>

            <Section id="wedge" eyebrow="The Wedge" title="Forward your statement. Sleep through Sunday." sub="The paid product turns Kindred from a calculator into a co‑pilot. It watches every statement, every charge, every plan, every week.">
                <div className="grid sm:grid-cols-2 gap-5">
                    {WEDGE.map((w) => <Card key={w.title} {...w} />)}
                </div>
            </Section>

            <Section id="caregiver" eyebrow="For the primary caregiver" title="Thirty‑second oversight. Everything else when you want it." sub="You're working, parenting, sleeping. Kindred is your second brain for the parts of caregiving that don't fit in a Google calendar.">
                <div className="grid sm:grid-cols-2 gap-5">
                    {CAREGIVER.map((w) => <Card key={w.title} {...w} />)}
                </div>
            </Section>

            <Section id="participant" eyebrow="For the participant" title="Big text. Two buttons. Nothing else." sub="The participant view is voice‑first, single‑action, and quiet. No menus to navigate, no dashboards to learn.">
                <div className="grid sm:grid-cols-3 gap-5">
                    {PARTICIPANT.map((w) => <Card key={w.title} {...w} />)}
                </div>
            </Section>

            <Section id="family" eyebrow="For the family" title="Everyone informed. The right person deciding." sub="Siblings, advisors, GPs all see what they need to — nothing more. The primary caregiver decides who sees what.">
                <div className="grid sm:grid-cols-3 gap-5">
                    {FAMILY.map((w) => <Card key={w.title} {...w} />)}
                </div>
            </Section>

            <Section id="trust" eyebrow="Trust & compliance" title="Built around your rights, not retrofitted to them." sub="Australian‑hosted, encrypted, and never used to train models without your explicit consent.">
                <div className="grid sm:grid-cols-2 gap-5">
                    {TRUST.map((w) => <Card key={w.title} {...w} />)}
                </div>
            </Section>

            {/* COMPARISON */}
            <section className="mx-auto max-w-6xl px-6 pb-16" data-testid="features-plan-matrix">
                <span className="overline">Plans</span>
                <h2 className="font-heading text-4xl text-primary-k mt-3 tracking-tight">What you get at every tier</h2>
                <div className="mt-8 overflow-x-auto rounded-2xl border border-kindred bg-surface">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-kindred">
                                <th className="text-left py-4 px-5 font-medium text-muted-k">Feature</th>
                                {PLAN_HEADERS.map((h) => (
                                    <th key={h} className="text-left py-4 px-5 font-heading text-primary-k">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {PLAN_MATRIX.map((row) => (
                                <tr key={row.feature} className="border-b border-kindred last:border-0">
                                    <td className="py-3 px-5 text-primary-k">{row.feature}</td>
                                    {row.values.map((v, i) => (
                                        <td key={i} className="py-3 px-5 text-primary-k tabular-nums">
                                            {v === "Yes" ? <Check className="h-4 w-4 text-primary-k" /> : v}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* CLOSING CTA */}
            <section className="bg-primary-k">
                <div className="mx-auto max-w-4xl px-6 py-14 text-center">
                    <h2 className="font-heading text-4xl sm:text-5xl text-white tracking-tight">Ready when you are.</h2>
                    <p className="mt-4 text-white/80 max-w-xl mx-auto">Start the free 14‑day trial — no card needed — or book a 20‑minute call with a real person on our team.</p>
                    <div className="mt-7 flex flex-wrap gap-3 justify-center">
                        <Link to="/signup" className="inline-flex items-center gap-2 bg-gold text-primary-k font-medium rounded-full px-6 py-3 hover:bg-[#c8973f]" data-testid="features-bottom-cta-trial">
                            Start free trial <ArrowRight className="h-4 w-4" />
                        </Link>
                        <Link to="/contact?intent=demo" className="inline-flex items-center gap-2 bg-transparent border border-white/40 text-white rounded-full px-6 py-3 hover:bg-white/10" data-testid="features-bottom-cta-demo">
                            Book a demo
                        </Link>
                    </div>
                </div>
            </section>

            <Footer />
        </div>
    );
}
