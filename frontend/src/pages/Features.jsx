import React from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import SeoHead from "@/seo/SeoHead";
import { SEO } from "@/seo/pageConfig";
import {
    ArrowRight, FileSearch, Wallet, BarChart3, ListChecks, FileEdit, Receipt, ClipboardCheck,
    MessageCircle, Users2, AlertTriangle, Calendar, Mic, ShieldCheck, Check, FileText, Lock,
    Wrench, HeartPulse, Repeat, Sparkles,
} from "lucide-react";
import { BrowserFrame, ScreenshotMultiParticipant } from "@/components/Screenshots";
import { TOOL_COUNT, toolCountWord } from "@/config/toolRegistry";
import Reveal from "@/components/Reveal";

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
    { slug: "budget-calculator", title: "Budget & Lifetime Cap Calculator", body: "Annual + quarterly + per‑stream budget, with a lifetime cap projection.", icon: Wallet, plan: "Solo+" },
    { slug: "provider-price-checker", title: "Provider Price Checker", body: "Tell us the rate; we tell you whether it's fair against published medians.", icon: BarChart3, plan: "Solo+" },
    { slug: "classification-self-check", title: "Classification Self‑Check", body: "Twelve questions, one likely classification range, one clear next step.", icon: ListChecks, plan: "Solo+" },
    { slug: "letters-and-follow-ups", title: "Letters & Follow-ups", body: "Draft a polished letter to My Aged Care, your provider, ACQSC, or the Ombudsman. Track replies and escalate on time.", icon: FileEdit, plan: "Solo+" },
    { slug: "contribution-estimator", title: "Contribution Estimator", body: "What the participant actually pays each quarter, in clear dollars.", icon: Receipt, plan: "Solo+" },
    { slug: "care-plan-reviewer", title: "Support Plan Reviewer", body: "Checks a care plan against the Statement of Rights and the National Quality Standards.", icon: ClipboardCheck, plan: "Solo+" },
    { slug: "family-coordinator", title: "Aged Care Q&A", body: "Plain-English answers about the Support at Home program, grounded in the Aged Care Act 2024.", icon: MessageCircle, plan: "Solo+" },
];

const WEDGE = [
    { icon: FileSearch, title: "Statement Auto-Decode", body: "Forward the participant's statement to a private Wayly email; you'll have a Sunday digest by Monday morning." },
    { icon: AlertTriangle, title: "Anomaly Watch", body: "Rate spikes, duplicates, missing entitlements, flagged the day they show up, not the month after." },
    { icon: Wallet, title: "Budget Tracker", body: "Live position across Clinical · Independence · Everyday Living. Knows about rollover and the 10% care‑management deduction." },
    { icon: BarChart3, title: "Lifetime Cap Forecast", body: "Where you are vs. the $135,318.69 cap (or $84,571.66 grandfathered). Projected years, not just numbers." },
];

const CAREGIVER = [
    { icon: Calendar, title: "30-Second Oversight", body: "One screen. What changed this week, what to action, what to ignore." },
    { icon: Users2, title: "Family Thread", body: "Siblings, advisors, GPs in one place. Role‑based visibility, finance‑only access for the advisor, full access for the primary caregiver." },
    { icon: FileText, title: "Care Plan Store", body: "Every plan, every review, every quote, searchable, dated, never lost in an inbox." },
    { icon: ShieldCheck, title: "Audit Log", body: "Every action by every person, immutable. Ready if you ever need to escalate to the ACQSC." },
];

const PARTICIPANT = [
    { icon: Mic, title: "Voice-First Home Screen", body: "No menus. Today's appointment, this quarter's budget, two big buttons." },
    { icon: AlertTriangle, title: "One-Tap Concern", body: "If something doesn't feel right, one button alerts the primary caregiver." },
    { icon: Calendar, title: "Today, Simply", body: "Who's coming, when, what they'll do. In big text. Nothing else on the screen." },
];

const FAMILY = [
    { icon: Users2, title: "Sibling Invites", body: "Read‑only seats for siblings. Sunday digest summarises the week so they don't need to log in to keep up." },
    { icon: ShieldCheck, title: "Granular Permissions", body: "Advisor sees finance, GP sees clinical, sibling sees the digest. Cathy decides who sees what." },
    { icon: MessageCircle, title: "Threaded Decisions", body: "Family conversations stay attached to the decisions they relate to, not buried in SMS." },
];

const TRUST = [
    { icon: ShieldCheck, title: "Australian-Hosted", body: "Data lives in AWS Sydney, encrypted with per‑household keys." },
    { icon: Lock, title: "Never Sold, Never Trained On", body: "Your data is yours. We never sell it; we never use it to train models without explicit consent." },
    { icon: FileText, title: "Statement of Rights Aligned", body: "Built around the 14 rights the Aged Care Act 2024 sets out, not retrofitted to them." },
    { icon: AlertTriangle, title: "Independent Oversight", body: "We list the ACQSC complaints pathway prominently, always. We don't gatekeep your right to escalate." },
];

const Section = ({ id, eyebrow, title, sub, children }) => (
    <section id={id} className="mx-auto max-w-7xl px-6 py-16" data-testid={`features-section-${id}`}>
        <span className="overline">{eyebrow}</span>
        <h2 className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight max-w-3xl leading-tight">{title}</h2>
        {sub && <p className="mt-4 text-lg text-muted-k max-w-2xl leading-relaxed">{sub}</p>}
        <div className="mt-10">{children}</div>
    </section>
);

const Card = ({ icon: Icon, title, body, plan }) => (
    <Reveal className="h-full">
    <div className="h-full rounded-xl border border-kindred bg-surface p-6 transition-all hover:-translate-y-1 hover:shadow-md" data-testid={`feat-card-${title.replace(/\W+/g, "-").toLowerCase()}`}>
        <div className="flex items-start justify-between gap-3">
            <div className="h-10 w-10 rounded-full bg-surface-2 flex items-center justify-center">
                <Icon className="h-5 w-5 text-primary-k" />
            </div>
            {plan && (
                <span className={`text-xs font-medium uppercase tracking-wider rounded-full px-2.5 py-1 ${plan === "Free" ? "bg-sage/20 text-[#0F5648]" : "bg-gold/20 text-primary-k"}`}>
                    {plan}
                </span>
            )}
        </div>
        <h3 className="font-heading text-xl text-primary-k mt-4">{title}</h3>
        <p className="mt-2 text-sm text-muted-k leading-relaxed">{body}</p>
    </div>
    </Reveal>
);

function ToolGroup({ title, description, testId, items }) {
    return (
        <div className="mb-10" data-testid={testId}>
            <div className="mb-4">
                <h3 className="text-2xl font-heading text-primary-k tracking-tight">{title}</h3>
                {description && <p className="text-sm text-muted-k mt-1 max-w-2xl">{description}</p>}
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {items.map((t) => (
                    <Link key={t.title} to={t.to} className="block h-full">
                        <Card icon={t.icon} title={t.title} body={t.body} plan={t.plan} />
                    </Link>
                ))}
            </div>
        </div>
    );
}

export default function Features() {
    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead {...SEO.features} />
            <MarketingHeader />

            {/* HERO */}
            <section className="mx-auto max-w-7xl px-6 pt-14 pb-8" data-testid="features-hero">
                <span className="overline">Everything Wayly does</span>
                <h1 className="font-heading text-5xl sm:text-6xl text-primary-k tracking-tight mt-4 leading-tight max-w-3xl">
                    {toolCountWord(TOOL_COUNT)} AI tools, plus a connected co&#8209;pilot for the whole household.
                </h1>
                <p className="mt-5 text-lg text-muted-k max-w-2xl leading-relaxed">
                    Wayly sits on top of Australia&apos;s Support at Home program. It reads
                    the statements, watches the budget, drafts the letters, and makes sure
                    no one in the family is the only one paying attention.
                </p>
                <div className="mt-7 flex flex-wrap gap-3">
                    <Link
                        to="/signup"
                        className="inline-flex items-center gap-2 bg-wayly-clay-500 text-white font-semibold rounded-full px-6 py-3 hover:bg-wayly-clay-600 shadow-md transition-colors"
                        data-testid="features-cta-trial"
                    >
                        Start free trial <ArrowRight className="h-4 w-4" />
                    </Link>
                    <Link
                        to="/contact?intent=demo"
                        className="inline-flex items-center gap-2 bg-wayly-clay-700 text-white font-semibold rounded-full px-6 py-3 hover:bg-wayly-clay-800 shadow-md transition-colors"
                        data-testid="features-cta-demo"
                    >
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

            <Section id="tools" eyebrow="Wayly Toolkit" title="Every Tool, Grouped by the Moment You Need It." sub="Start free with the Statement Decoder and its Smart Summaries. Upgrade to Solo or Family and the rest of the toolkit unlocks, grouped by the problem you are trying to solve.">
                {/* Featured: Statement Decoder + Smart Summaries */}
                <div className="mb-8" data-testid="features-featured">
                    <div className="relative rounded-3xl border border-primary-k/15 bg-white p-6 sm:p-8 shadow-md">
                        <span className="absolute -top-3 left-6 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest bg-clay text-white px-3 py-1 rounded-full" data-testid="features-featured-badge">Start Here</span>
                        <div className="grid sm:grid-cols-2 gap-6 items-start">
                            <div>
                                <div className="flex items-center gap-3">
                                    <div className="p-2 rounded-full bg-primary-k/5"><FileSearch className="w-6 h-6 text-primary-k"/></div>
                                    <h3 className="text-2xl font-heading text-primary-k">Statement Decoder + Smart Summaries</h3>
                                </div>
                                <p className="text-sm text-muted-k mt-3 leading-relaxed">The 12-page statement lands every month and nobody explains it. Paste it or upload the PDF and Wayly returns a plain-English breakdown in about 60 seconds, then writes a Smart Summary, your one clear note on what changed, what to watch, and what to do next.</p>
                                <ul className="text-sm text-primary-k mt-4 space-y-1.5">
                                    <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 mt-0.5"/> Plain-English decode of every line: PDF, photo, DOCX or text</li>
                                    <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 mt-0.5"/> 15 anomaly rules catch rate spikes, duplicates and missing entitlements</li>
                                    <li className="flex items-start gap-2"><Check className="w-4 h-4 text-emerald-600 mt-0.5"/> Smart Summaries turn the numbers into one calm &quot;here is what matters&quot; note</li>
                                </ul>
                                <Link to="/ai-tools/statement-decoder" data-testid="features-featured-cta"
                                    className="inline-flex items-center gap-1 mt-5 px-5 py-2.5 rounded-full bg-primary-k text-white text-sm font-medium">
                                    Try Statement Decoder Free <ArrowRight className="w-4 h-4"/>
                                </Link>
                            </div>
                            <div className="rounded-2xl border border-primary-k/10 bg-surface-2 p-5 space-y-3" data-testid="features-smart-summary-preview">
                                <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold" style={{ color: "#A5512B" }}>
                                    <Sparkles className="w-3.5 h-3.5"/> Your Wayly Insight
                                </div>
                                <p className="text-sm text-primary-k leading-relaxed">This month&apos;s statement is $6,681.60. Your Everyday Living stream rose 12% on last quarter, driven by a domestic assistance rate change from $72.00 to $80.60 an hour.</p>
                                <div className="rounded-xl border p-3" style={{ borderColor: "rgba(165,81,43,0.3)", background: "#FBEEE7" }}>
                                    <p className="text-xs text-primary-k"><span className="font-semibold" style={{ color: "#A5512B" }}>Worth checking:</span> a cleaning visit on the 14th appears billed twice. We have drafted a query letter for you.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Grouped by pain-point */}
                <ToolGroup title="When the Statement Doesn't Add Up" description="Every dollar in and out, checked against medians and your budget the moment it lands." testId="features-group-money" items={[
                    { icon: Receipt, title: "Invoice Checker", body: "Verify every line item against medians and budget the moment the invoice lands.", to: "/ai-tools/invoice-checker", plan: "Solo+" },
                    { icon: FileSearch, title: "Bank-CSV Parsing", body: "Import a CSV once and Wayly maps every debit to the right provider, invoice, and stream.", to: "/app/statements", plan: "Solo+" },
                    { icon: BarChart3, title: "Financial Position Tracking", body: "Lifetime cap, quarterly burn, and contributions in one glanceable card.", to: "/app/pacing", plan: "Solo+" },
                    { icon: Wallet, title: "Multi-Quarter Budgeting", body: "Project the next 3 quarters, save scenarios, and compare them side-by-side.", to: "/app/pacing", plan: "Solo+" },
                ]}/>

                <ToolGroup title="When You Need to Get the Care Right" description="Keep the plan, the price, and the whole care team on the same page." testId="features-group-care" items={[
                    { icon: ClipboardCheck, title: "Support Plan Reviewer", body: "Checks a support plan against the Statement of Rights and the National Quality Standards.", to: "/ai-tools/support-plan-reviewer", plan: "Solo+" },
                    { icon: FileText, title: "Care Notes And Plans", body: "Support plan reviewer plus goal ledger, so every change is captured and diffed.", to: "/app/care-plans", plan: "Solo+" },
                    { icon: Wrench, title: "AT & HM Projects", body: "Track OT referrals, compare quotes side-by-side, and never miss a trial-return window.", to: "/app/athm/projects", plan: "Solo+" },
                    { icon: Repeat, title: "Provider Switcher", body: "Manage every switch end-to-end: notice, overlap, settlement, and refund tracking.", to: "/app/provider-switch", plan: "Solo+" },
                    { icon: HeartPulse, title: "CHSP Tools", body: "Verify Commonwealth Home Support billing and walk through a transition to Support at Home.", to: "/app/chsp/tools", plan: "Solo+" },
                ]}/>

                <ToolGroup title="When You Need to Push Back" description="The polite, firm paper trail that stands up when you need it." testId="features-group-pushback" items={[
                    { icon: MessageCircle, title: "Complaint Wizard", body: "A 4-step guided intake that opens a case and drafts every follow-up letter.", to: "/app/participants", plan: "Solo+" },
                    { icon: ShieldCheck, title: "ACQSC Bundle", body: "Bundle every complaint artefact ready to hand to the Aged Care regulator.", to: "/ai-tools/letters-and-follow-ups", plan: "Solo+" },
                    { icon: Lock, title: "Digital Signatures And Audit", body: "Every consent, every letter, every send is signed, timestamped, and immutable.", to: "/app/audit", plan: "Solo+" },
                ]}/>

                <ToolGroup title="When the Whole Family's Involved" description="One shared view, so nobody is the only one paying attention." testId="features-group-family" items={[
                    { icon: Users2, title: "Profile Management", body: "One profile per participant, with financial, care, and complaint history side by side.", to: "/app/me", plan: "Solo+" },
                    { icon: ClipboardCheck, title: "Medication And Voice Check", body: "Micro voice check-ins on goals and meds to spot missed doses or drifting priorities early.", to: "/app/wall", plan: "Solo+" },
                ]}/>
            </Section>

            <Section id="wedge" eyebrow="The Wedge" title="Forward your statement. Sleep through Sunday." sub="The paid product turns Wayly from a calculator into a co‑pilot. It watches every statement, every charge, every plan, every week.">
                <div className="grid sm:grid-cols-2 gap-5">
                    {WEDGE.map((w) => <Card key={w.title} {...w} />)}
                </div>
            </Section>

            <Section id="caregiver" eyebrow="For the primary caregiver" title="Thirty‑second oversight. Everything else when you want it." sub="You are working, parenting, sleeping. Wayly is your second brain for the parts of caregiving that don't fit in a Google calendar.">
                <div className="grid sm:grid-cols-2 gap-5">
                    {CAREGIVER.map((w) => <Card key={w.title} {...w} />)}
                </div>
            </Section>

            <Section id="participant" eyebrow="For the participant" title="Big text. Two buttons. Nothing else." sub="The participant view is voice‑first, single‑action, and quiet. No menus to learn, no dashboards to learn.">
                <div className="grid sm:grid-cols-3 gap-5">
                    {PARTICIPANT.map((w) => <Card key={w.title} {...w} />)}
                </div>
            </Section>

            <Section id="family" eyebrow="For the family" title="Everyone informed. The right person deciding." sub="Siblings, advisors, GPs all see what they need to. Nothing more. The primary caregiver decides who sees what.">
                <div className="grid sm:grid-cols-3 gap-5">
                    {FAMILY.map((w) => <Card key={w.title} {...w} />)}
                </div>

                {/* Multi-participant visual, added Iter 38 */}
                <div className="mt-12 grid lg:grid-cols-12 gap-10 items-center">
                    <div className="lg:col-span-7 hidden sm:block">
                        <BrowserFrame url="app.wayly.com.au/participants" scale={0.88} label="Participant switcher showing Dorothy and Robert with separate budgets">
                            <ScreenshotMultiParticipant />
                        </BrowserFrame>
                    </div>
                    <div className="lg:col-span-5">
                        <span className="overline">Multi-participant</span>
                        <h3 className="font-heading text-2xl sm:text-3xl text-primary-k mt-2 tracking-tight">One account. Every parent in one view.</h3>
                        <p className="mt-3 text-muted-k leading-relaxed">
                            Caring for both Mum and Dad? Add up to four participants on the Family plan. Their statements, budgets, concerns and family threads stay strictly separated, but you switch between them in a tap. The audit trail follows every action so siblings know who did what, when.
                        </p>
                        <ul className="mt-4 space-y-2 text-sm text-muted-k">
                            <li>• Per-participant budgets and lifetime cap tracking</li>
                            <li>• Notifications and the weekly digest are scoped to the participant you are viewing</li>
                            <li>• Add or remove participants any time from Plan and Billing</li>
                        </ul>
                    </div>
                </div>
            </Section>

            <Section id="trust" eyebrow="Trust & compliance" title="Built around your rights, not retrofitted to them." sub="Australian‑hosted, encrypted, and never used to train models without your explicit consent.">
                <div className="grid sm:grid-cols-2 gap-5">
                    {TRUST.map((w) => <Card key={w.title} {...w} />)}
                </div>
            </Section>

            {/* CLOSING CTA */}
            <section className="bg-primary-k">
                <div className="mx-auto max-w-4xl px-6 py-14 text-center">
                    <h2 className="font-heading text-4xl sm:text-5xl text-white tracking-tight">Ready when you are.</h2>
                    <p className="mt-4 text-white/80 max-w-xl mx-auto">Start the free 7-day trial, no card needed, or book a 20‑minute call with a real person on our team.</p>
                    <div className="mt-7 flex flex-wrap gap-3 justify-center">
                        <Link
                            to="/signup"
                            className="inline-flex items-center gap-2 bg-wayly-clay-500 text-white font-semibold rounded-full px-6 py-3 hover:bg-wayly-clay-600 shadow-md transition-colors"
                            data-testid="features-bottom-cta-trial"
                        >
                            Start free trial <ArrowRight className="h-4 w-4" />
                        </Link>
                        <Link
                            to="/contact?intent=demo"
                            className="inline-flex items-center gap-2 bg-wayly-clay-700 text-white font-semibold rounded-full px-6 py-3 hover:bg-wayly-clay-800 shadow-md transition-colors"
                            data-testid="features-bottom-cta-demo"
                        >
                            Book a demo
                        </Link>
                    </div>
                </div>
            </section>

            <Footer />
        </div>
    );
}
