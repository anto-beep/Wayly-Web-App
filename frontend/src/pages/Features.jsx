import React from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import SeoHead from "@/seo/SeoHead";
import { SEO } from "@/seo/pageConfig";
import {
    ArrowRight, FileSearch, Wallet, BarChart3, ListChecks, FileEdit, Receipt, ClipboardCheck,
    MessageCircle, Users2, AlertTriangle, Calendar, Mic, ShieldCheck, Check, FileText, Lock,
    Wrench, HeartPulse, Repeat, Sparkles, TrendingDown,
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
    { slug: "statement-decoder", title: "Statement Decoder", body: "Paste any monthly statement; get a plain-English breakdown in 60 seconds.", icon: FileSearch, plan: "Free" },
    { slug: "budget-calculator", title: "Budget & Lifetime Cap Calculator", body: "Annual + quarterly + per-stream budget, with a lifetime cap projection.", icon: Wallet, plan: "Solo+" },
    { slug: "provider-price-checker", title: "Provider Price Checker", body: "Tell us the rate; we tell you whether it's fair against published medians.", icon: BarChart3, plan: "Solo+" },
    { slug: "classification-self-check", title: "Classification Self-Check", body: "Twelve questions, one likely classification range, one clear next step.", icon: ListChecks, plan: "Solo+" },
    { slug: "letters-and-follow-ups", title: "Letters & Follow-ups", body: "Draft a polished letter to My Aged Care, your provider, ACQSC, or the Ombudsman. Track replies and escalate on time.", icon: FileEdit, plan: "Solo+" },
    { slug: "contribution-estimator", title: "Contribution Estimator", body: "What the participant actually pays each quarter, in clear dollars.", icon: Receipt, plan: "Solo+" },
    { slug: "care-plan-reviewer", title: "Support Plan Reviewer", body: "Checks a care plan against the Statement of Rights and the National Quality Standards.", icon: ClipboardCheck, plan: "Solo+" },
    { slug: "family-coordinator", title: "Aged Care Q&A", body: "Plain-English answers about the Support at Home program, grounded in the Aged Care Act 2024.", icon: MessageCircle, plan: "Solo+" },
];

const WEDGE = [
    { icon: FileSearch, title: "Statement Auto-Decode", body: "Forward the participant's statement to a private Wayly email; you'll have a Sunday digest by Monday morning." },
    { icon: AlertTriangle, title: "Anomaly Watch", body: "Rate spikes, duplicates, missing entitlements, flagged the day they show up, not the month after." },
    { icon: Wallet, title: "Budget Tracker", body: "Live position across Clinical, Independence and Everyday Living. Knows about rollover and the 10% care-management deduction." },
    { icon: BarChart3, title: "Lifetime Cap Forecast", body: "Where you are vs. the $135,318.69 cap (or $84,571.66 grandfathered). Projected years, not just numbers." },
];

const CAREGIVER = [
    { icon: Calendar, title: "30-Second Oversight", body: "One screen. What changed this week, what to action, what to ignore." },
    { icon: Users2, title: "Family Thread", body: "Siblings, advisors, GPs in one place. Role-based visibility, finance-only access for the advisor, full access for the primary caregiver." },
    { icon: FileText, title: "Care Plan Store", body: "Every plan, every review, every quote, searchable, dated, never lost in an inbox." },
    { icon: ShieldCheck, title: "Audit Log", body: "Every action by every person, immutable. Ready if you ever need to escalate to the ACQSC." },
];

const PARTICIPANT = [
    { icon: Mic, title: "Voice-First Home Screen", body: "No menus. Today's appointment, this quarter's budget, two big buttons." },
    { icon: AlertTriangle, title: "One-Tap Concern", body: "If something doesn't feel right, one button alerts the primary caregiver." },
    { icon: Calendar, title: "Today, Simply", body: "Who's coming, when, what they'll do. In big text. Nothing else on the screen." },
];

const FAMILY = [
    { icon: Users2, title: "Sibling Invites", body: "Read-only seats for siblings. Sunday digest summarises the week so they don't need to log in to keep up." },
    { icon: ShieldCheck, title: "Granular Permissions", body: "Advisor sees finance, GP sees clinical, sibling sees the digest. Cathy decides who sees what." },
    { icon: MessageCircle, title: "Threaded Decisions", body: "Family conversations stay attached to the decisions they relate to, not buried in SMS." },
];

const TRUST = [
    { icon: ShieldCheck, title: "Australian-Hosted", body: "Data lives in AWS Sydney, encrypted with per-household keys." },
    { icon: Lock, title: "Never Sold, Never Trained On", body: "Your data is yours. We never sell it; we never use it to train models without explicit consent." },
    { icon: FileText, title: "Statement of Rights Aligned", body: "Built around the 14 rights the Aged Care Act 2024 sets out, not retrofitted to them." },
    { icon: AlertTriangle, title: "Independent Oversight", body: "We list the ACQSC complaints pathway prominently, always. We don't gatekeep your right to escalate." },
];

/* ------------------------------------------------------------------ *
 * Decorative, image-free visual primitives (SVG + CSS only)
 * ------------------------------------------------------------------ */

// Soft dotted-grid texture for coloured sections.
function DotField({ className = "", color = "rgba(255,255,255,0.14)" }) {
    return (
        <svg className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} aria-hidden="true">
            <defs>
                <pattern id={`dots-${color.replace(/\W/g, "")}`} width="26" height="26" patternUnits="userSpaceOnUse">
                    <circle cx="2" cy="2" r="1.6" fill={color} />
                </pattern>
            </defs>
            <rect width="100%" height="100%" fill={`url(#dots-${color.replace(/\W/g, "")})`} />
        </svg>
    );
}

// Floating gradient orb.
function Orb({ style, className = "", from = "#1A696E", to = "#0E4D52" }) {
    return (
        <div
            aria-hidden="true"
            className={`pointer-events-none absolute rounded-full blur-3xl opacity-40 ${className}`}
            style={{ backgroundImage: `radial-gradient(circle at 30% 30%, ${from}, ${to})`, ...style }}
        />
    );
}

// Animated progress ring used in the hero glance card.
function GaugeRing({ pct = 74, size = 132, stroke = 12, track = "rgba(255,255,255,0.18)", bar = "#F0B267", label, sub }) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const off = c - (pct / 100) * c;
    return (
        <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90">
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
                <circle
                    cx={size / 2} cy={size / 2} r={r} fill="none" stroke={bar} strokeWidth={stroke}
                    strokeLinecap="round" strokeDasharray={c}
                    className="wayly-draw"
                    style={{ "--wy-dash": c, "--wy-off": off, strokeDashoffset: off }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-heading text-2xl text-white leading-none">{label}</span>
                {sub && <span className="text-[10px] uppercase tracking-[0.14em] text-white/70 mt-1">{sub}</span>}
            </div>
        </div>
    );
}

// Comparison bar (you-pay vs typical) for the glance card.
function CompareRow({ label, value, pct, tone = "#F0B267" }) {
    return (
        <div>
            <div className="flex items-center justify-between text-[11px] text-white/80">
                <span>{label}</span>
                <span className="tabular-nums font-medium text-white">{value}</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-white/15 overflow-hidden">
                <div className="h-full rounded-full wayly-grow-bar" style={{ width: `${pct}%`, backgroundColor: tone }} />
            </div>
        </div>
    );
}

// The hero "at a glance" visual card — a stylised decode summary.
function GlanceCard() {
    return (
        <div className="relative">
            <Orb className="wayly-float" style={{ width: 220, height: 220, top: -50, right: -30 }} from="#F0B267" to="#A5512B" />
            <Orb className="wayly-float-slow" style={{ width: 180, height: 180, bottom: -40, left: -30 }} from="#6B8F71" to="#425F47" />
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0E4D52] to-[#10363A] p-6 sm:p-7 shadow-[0_30px_70px_rgba(10,32,34,0.35)] border border-white/10">
                <DotField />
                <div className="relative">
                    <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-white/70">
                        <Sparkles className="h-3.5 w-3.5" /> Your Wayly glance
                    </div>
                    <div className="mt-5 flex items-center gap-5">
                        <GaugeRing pct={78} label="$1,847" sub="found / year" />
                        <div className="flex-1 space-y-3">
                            <CompareRow label="You pay" value="$80.60/hr" pct={92} tone="#F0857A" />
                            <CompareRow label="Typical rate" value="$72.00/hr" pct={72} tone="#8FBF95" />
                        </div>
                    </div>
                    <div className="mt-5 grid grid-cols-2 gap-2.5">
                        <div className="rounded-xl bg-white/10 border border-white/10 p-3">
                            <div className="text-[10px] uppercase tracking-wider text-white/60">This month</div>
                            <div className="font-heading text-lg text-white mt-0.5 tabular-nums">$6,681.60</div>
                        </div>
                        <div className="rounded-xl bg-white/10 border border-white/10 p-3">
                            <div className="text-[10px] uppercase tracking-wider text-white/60">Budget left</div>
                            <div className="font-heading text-lg text-[#8FBF95] mt-0.5 tabular-nums">$2,140.00</div>
                        </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#A5512B] p-3">
                        <TrendingDown className="h-4 w-4 text-white flex-none" />
                        <p className="text-xs text-white leading-snug">Cleaning visit on the 14th looks billed twice. Draft letter ready.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ *
 * Layout primitives
 * ------------------------------------------------------------------ */

const TONE_BG = {
    cream: "",
    teal: "bg-gradient-to-br from-[#0E4D52] to-[#10363A]",
    clay: "bg-gradient-to-br from-[#A5512B] to-[#7E3C1F]",
    sage: "bg-gradient-to-br from-[#4E6E54] to-[#33482F]",
};

const Section = ({ id, eyebrow, title, sub, tone = "cream", children }) => {
    const dark = tone !== "cream";
    return (
        <section id={id} data-testid={`features-section-${id}`} className={`relative overflow-hidden ${TONE_BG[tone]}`}>
            {dark && <DotField />}
            {dark && <Orb className="wayly-float-x" style={{ width: 260, height: 260, top: -80, right: -60 }} from="rgba(255,255,255,0.5)" to="rgba(255,255,255,0)" />}
            <div className="relative mx-auto max-w-7xl px-6 py-20">
                <Reveal>
                    <span className={`overline ${dark ? "!text-white/70" : ""}`}>{eyebrow}</span>
                    <h2 className={`font-heading text-4xl sm:text-5xl mt-3 tracking-tight max-w-3xl leading-tight ${dark ? "text-white" : "text-primary-k"}`}>{title}</h2>
                    {sub && <p className={`mt-4 text-lg max-w-2xl leading-relaxed ${dark ? "text-white/85" : "text-muted-k"}`}>{sub}</p>}
                </Reveal>
                <div className="mt-12">{children}</div>
            </div>
        </section>
    );
};

const ACCENTS = [
    { tile: "bg-[#0E4D52]", ring: "ring-[#0E4D52]/20" },
    { tile: "bg-[#A5512B]", ring: "ring-[#A5512B]/20" },
    { tile: "bg-[#4E6E54]", ring: "ring-[#4E6E54]/20" },
];

const Card = ({ icon: Icon, title, body, plan, dark = false, i = 0 }) => {
    const accent = ACCENTS[i % ACCENTS.length];
    if (dark) {
        return (
            <Reveal className="h-full" delay={(i % 4) * 70}>
                <div className="group h-full rounded-2xl border border-white/15 bg-white/10 backdrop-blur-sm p-6 transition-colors hover:bg-white/15" data-testid={`feat-card-${title.replace(/\W+/g, "-").toLowerCase()}`}>
                    <div className="flex items-start justify-between gap-3">
                        <div className="h-11 w-11 rounded-xl bg-white/15 flex items-center justify-center transition-transform group-">
                            <Icon className="h-5 w-5 text-white" strokeWidth={2} />
                        </div>
                        {plan && (
                            <span className="text-[10px] font-semibold uppercase tracking-wider rounded-full px-2.5 py-1 bg-white/20 text-white">{plan}</span>
                        )}
                    </div>
                    <h3 className="font-heading text-xl text-white mt-4">{title}</h3>
                    <p className="mt-2 text-sm text-white/80 leading-relaxed">{body}</p>
                </div>
            </Reveal>
        );
    }
    return (
        <Reveal className="h-full" delay={(i % 4) * 70}>
            <div className={`group relative h-full overflow-hidden rounded-2xl border border-kindred bg-surface p-6 transition-colors ring-1 ring-transparent hover:${accent.ring}`} data-testid={`feat-card-${title.replace(/\W+/g, "-").toLowerCase()}`}>
                <span className={`absolute left-0 top-0 h-1.5 w-full ${accent.tile} opacity-80`} />
                <div className="flex items-start justify-between gap-3">
                    <div className={`h-11 w-11 rounded-xl ${accent.tile} flex items-center justify-center shadow-sm transition-transform group-`}>
                        <Icon className="h-5 w-5 text-white" strokeWidth={2} />
                    </div>
                    {plan && (
                        <span className={`text-[10px] font-semibold uppercase tracking-wider rounded-full px-2.5 py-1 ${plan === "Free" ? "bg-sage/20 text-[#0F5648]" : "bg-gold/15 text-[#A5512B]"}`}>{plan}</span>
                    )}
                </div>
                <h3 className="font-heading text-xl text-primary-k mt-4">{title}</h3>
                <p className="mt-2 text-sm text-muted-k leading-relaxed">{body}</p>
            </div>
        </Reveal>
    );
};

function ToolGroup({ title, description, testId, items, startIndex = 0 }) {
    return (
        <div className="mb-12" data-testid={testId}>
            <Reveal className="mb-5">
                <h3 className="text-2xl font-heading text-primary-k tracking-tight flex items-center gap-3">
                    <span className="h-6 w-1.5 rounded-full bg-[#A5512B]" />
                    {title}
                </h3>
                {description && <p className="text-sm text-muted-k mt-2 max-w-2xl pl-4">{description}</p>}
            </Reveal>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {items.map((t, idx) => (
                    <Link key={t.title} to={t.to} className="block h-full">
                        <Card icon={t.icon} title={t.title} body={t.body} plan={t.plan} i={startIndex + idx} />
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
            <section className="relative overflow-hidden" data-testid="features-hero">
                <Orb className="wayly-float" style={{ width: 320, height: 320, top: -120, left: -80 }} from="#DCEAE9" to="#C4D4C8" />
                <Orb className="wayly-float-slow" style={{ width: 260, height: 260, bottom: -120, right: 40 }} from="#F3E7DE" to="#E9D4C6" />
                <div className="relative mx-auto max-w-7xl px-6 pt-16 pb-14 grid lg:grid-cols-12 gap-12 items-center">
                    <div className="lg:col-span-6">
                        <Reveal>
                            <span className="inline-flex items-center gap-2 rounded-full bg-[#0E4D52]/8 px-3 py-1 text-[11px] uppercase tracking-[0.16em] font-semibold text-[#0E4D52]">
                                <Sparkles className="h-3.5 w-3.5" /> Everything Wayly does
                            </span>
                            <h1 className="font-heading text-5xl sm:text-6xl text-primary-k tracking-tight mt-5 leading-[1.05] max-w-2xl">
                                {toolCountWord(TOOL_COUNT)} AI tools, plus a connected co-pilot for the whole household.
                            </h1>
                            <p className="mt-5 text-lg text-muted-k max-w-xl leading-relaxed">
                                Wayly sits on top of Australia&apos;s Support at Home program. It reads the statements, watches the budget, drafts the letters, and makes sure no one in the family is the only one paying attention.
                            </p>
                            <div className="mt-8 flex flex-wrap gap-3">
                                <Link to="/signup" className="inline-flex items-center gap-2 bg-[#A5512B] text-white font-semibold rounded-lg px-6 py-3 hover:bg-[#8E4523] shadow-md transition-colors" data-testid="features-cta-trial">
                                    Start free trial <ArrowRight className="h-4 w-4" />
                                </Link>
                                <Link to="/contact?intent=demo" className="inline-flex items-center gap-2 bg-[#0E4D52] text-white font-semibold rounded-lg px-6 py-3 hover:bg-[#0A3B3F] shadow-md transition-colors" data-testid="features-cta-demo">
                                    Book a demo
                                </Link>
                            </div>
                        </Reveal>
                    </div>
                    <div className="lg:col-span-6">
                        <Reveal delay={120} y={32}>
                            <GlanceCard />
                        </Reveal>
                    </div>
                </div>
            </section>

            {/* STICKY TAB NAV */}
            <div className="sticky top-[68px] z-30 backdrop-blur-xl bg-[rgba(250,247,242,0.9)] border-y border-kindred" data-testid="features-tabs">
                <div className="mx-auto max-w-7xl px-6 py-3 overflow-x-auto">
                    <div className="flex gap-1">
                        {TABS.map((t) => (
                            <a key={t.id} href={`#${t.id}`} className="text-sm whitespace-nowrap px-4 py-2 rounded-lg text-muted-k hover:text-white hover:bg-[#0E4D52] transition-colors" data-testid={`features-tab-${t.id}`}>
                                {t.label}
                            </a>
                        ))}
                    </div>
                </div>
            </div>

            <Section id="tools" eyebrow="Wayly Toolkit" title="Every Tool, Grouped by the Moment You Need It." sub="Start free with the Statement Decoder and its Smart Summaries. Upgrade to Solo or Family and the rest of the toolkit unlocks, grouped by the problem you are trying to solve.">
                {/* Featured: Statement Decoder + Smart Summaries */}
                <div className="mb-12" data-testid="features-featured">
                    <Reveal>
                    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0E4D52] to-[#10363A] p-6 sm:p-8 shadow-[0_30px_70px_rgba(10,32,34,0.28)] border border-white/10">
                        <DotField />
                        <span className="absolute -top-0 left-8 inline-flex items-center gap-1 text-[10px] uppercase tracking-widest bg-[#A5512B] text-white px-3 py-1 rounded-b-lg" data-testid="features-featured-badge">Start Here</span>
                        <div className="relative grid sm:grid-cols-2 gap-8 items-center pt-3">
                            <div>
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 rounded-xl bg-white/15"><FileSearch className="w-6 h-6 text-white" /></div>
                                    <h3 className="text-2xl font-heading text-white">Statement Decoder + Smart Summaries</h3>
                                </div>
                                <p className="text-sm text-white/85 mt-4 leading-relaxed">The 12-page statement lands every month and nobody explains it. Paste it or upload the PDF and Wayly returns a plain-English breakdown in about 60 seconds, then writes a Smart Summary, your one clear note on what changed, what to watch, and what to do next.</p>
                                <ul className="text-sm text-white mt-5 space-y-2">
                                    <li className="flex items-start gap-2"><Check className="w-4 h-4 text-[#8FBF95] mt-0.5 flex-none" /> Plain-English decode of every line: PDF, photo, DOCX or text</li>
                                    <li className="flex items-start gap-2"><Check className="w-4 h-4 text-[#8FBF95] mt-0.5 flex-none" /> 15 anomaly rules catch rate spikes, duplicates and missing entitlements</li>
                                    <li className="flex items-start gap-2"><Check className="w-4 h-4 text-[#8FBF95] mt-0.5 flex-none" /> Smart Summaries turn the numbers into one calm &quot;here is what matters&quot; note</li>
                                </ul>
                                <Link to="/ai-tools/statement-decoder" data-testid="features-featured-cta" className="inline-flex items-center gap-1 mt-6 px-5 py-2.5 rounded-lg bg-white text-[#0E4D52] text-sm font-semibold hover:bg-white/90 transition-colors">
                                    Try Statement Decoder Free <ArrowRight className="w-4 h-4" />
                                </Link>
                            </div>
                            <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-sm p-5 space-y-3" data-testid="features-smart-summary-preview">
                                <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider font-semibold text-[#F0B267]">
                                    <Sparkles className="w-3.5 h-3.5" /> Your Wayly Insight
                                </div>
                                <p className="text-sm text-white leading-relaxed">This month&apos;s statement is $6,681.60. Your Everyday Living stream rose 12% on last quarter, driven by a domestic assistance rate change from $72.00 to $80.60 an hour.</p>
                                <div className="rounded-xl bg-[#A5512B] p-3">
                                    <p className="text-xs text-white"><span className="font-semibold">Worth checking:</span> a cleaning visit on the 14th appears billed twice. We have drafted a query letter for you.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    </Reveal>
                </div>

                <ToolGroup title="When the Statement Doesn't Add Up" description="Every dollar in and out, checked against medians and your budget the moment it lands." testId="features-group-money" startIndex={0} items={[
                    { icon: Receipt, title: "Invoice Checker", body: "Verify every line item against medians and budget the moment the invoice lands.", to: "/ai-tools/invoice-checker", plan: "Solo+" },
                    { icon: FileSearch, title: "Bank-CSV Parsing", body: "Import a CSV once and Wayly maps every debit to the right provider, invoice, and stream.", to: "/app/statements", plan: "Solo+" },
                    { icon: BarChart3, title: "Financial Position Tracking", body: "Lifetime cap, quarterly burn, and contributions in one glanceable card.", to: "/app/pacing", plan: "Solo+" },
                    { icon: Wallet, title: "Multi-Quarter Budgeting", body: "Project the next 3 quarters, save scenarios, and compare them side-by-side.", to: "/app/pacing", plan: "Solo+" },
                ]} />

                <ToolGroup title="When You Need to Get the Care Right" description="Keep the plan, the price, and the whole care team on the same page." testId="features-group-care" startIndex={1} items={[
                    { icon: ClipboardCheck, title: "Support Plan Reviewer", body: "Checks a support plan against the Statement of Rights and the National Quality Standards.", to: "/ai-tools/support-plan-reviewer", plan: "Solo+" },
                    { icon: FileText, title: "Care Notes And Plans", body: "Support plan reviewer plus goal ledger, so every change is captured and diffed.", to: "/app/care-plans", plan: "Solo+" },
                    { icon: Wrench, title: "AT & HM Projects", body: "Track OT referrals, compare quotes side-by-side, and never miss a trial-return window.", to: "/app/athm/projects", plan: "Solo+" },
                    { icon: Repeat, title: "Provider Switcher", body: "Manage every switch end-to-end: notice, overlap, settlement, and refund tracking.", to: "/app/provider-switch", plan: "Solo+" },
                    { icon: HeartPulse, title: "CHSP Tools", body: "Verify Commonwealth Home Support billing and walk through a transition to Support at Home.", to: "/app/chsp/tools", plan: "Solo+" },
                ]} />

                <ToolGroup title="When You Need to Push Back" description="The polite, firm paper trail that stands up when you need it." testId="features-group-pushback" startIndex={2} items={[
                    { icon: MessageCircle, title: "Complaint Wizard", body: "A 4-step guided intake that opens a case and drafts every follow-up letter.", to: "/app/participants", plan: "Solo+" },
                    { icon: ShieldCheck, title: "ACQSC Bundle", body: "Bundle every complaint artefact ready to hand to the Aged Care regulator.", to: "/ai-tools/letters-and-follow-ups", plan: "Solo+" },
                    { icon: Lock, title: "Digital Signatures And Audit", body: "Every consent, every letter, every send is signed, timestamped, and immutable.", to: "/app/audit", plan: "Solo+" },
                ]} />

                <ToolGroup title="When the Whole Family's Involved" description="One shared view, so nobody is the only one paying attention." testId="features-group-family" startIndex={0} items={[
                    { icon: Users2, title: "Profile Management", body: "One profile per participant, with financial, care, and complaint history side by side.", to: "/app/me", plan: "Solo+" },
                    { icon: ClipboardCheck, title: "Medication And My Care Goals", body: "Micro check-ins on goals and meds to spot missed doses or drifting priorities early.", to: "/app/wall", plan: "Solo+" },
                ]} />
            </Section>

            <Section id="wedge" tone="teal" eyebrow="The Wedge" title="Forward your statement. Sleep through Sunday." sub="The paid product turns Wayly from a calculator into a co-pilot. It watches every statement, every charge, every plan, every week.">
                <div className="grid sm:grid-cols-2 gap-5">
                    {WEDGE.map((w, i) => <Card key={w.title} {...w} dark i={i} />)}
                </div>
            </Section>

            <Section id="caregiver" eyebrow="For the primary caregiver" title="Thirty-second oversight. Everything else when you want it." sub="You are working, parenting, sleeping. Wayly is your second brain for the parts of caregiving that don't fit in a Google calendar.">
                <div className="grid sm:grid-cols-2 gap-5">
                    {CAREGIVER.map((w, i) => <Card key={w.title} {...w} i={i} />)}
                </div>
            </Section>

            <Section id="participant" tone="sage" eyebrow="For the participant" title="Big text. Two buttons. Nothing else." sub="The participant view is voice-first, single-action, and quiet. No menus to learn, no dashboards to learn.">
                <div className="grid sm:grid-cols-3 gap-5">
                    {PARTICIPANT.map((w, i) => <Card key={w.title} {...w} dark i={i} />)}
                </div>
            </Section>

            <Section id="family" eyebrow="For the family" title="Everyone informed. The right person deciding." sub="Siblings, advisors, GPs all see what they need to. Nothing more. The primary caregiver decides who sees what.">
                <div className="grid sm:grid-cols-3 gap-5">
                    {FAMILY.map((w, i) => <Card key={w.title} {...w} i={i} />)}
                </div>

                {/* Multi-participant visual */}
                <div className="mt-14 grid lg:grid-cols-12 gap-10 items-center">
                    <div className="lg:col-span-7 hidden sm:block">
                        <Reveal>
                            <BrowserFrame url="app.wayly.com.au/participants" scale={0.88} label="Participant switcher showing Dorothy and Robert with separate budgets">
                                <ScreenshotMultiParticipant />
                            </BrowserFrame>
                        </Reveal>
                    </div>
                    <div className="lg:col-span-5">
                        <Reveal delay={90}>
                            <span className="overline">Multi-participant</span>
                            <h3 className="font-heading text-2xl sm:text-3xl text-primary-k mt-2 tracking-tight">One account. Every parent in one view.</h3>
                            <p className="mt-3 text-muted-k leading-relaxed">
                                Caring for both Mum and Dad? Add up to four participants on the Family plan. Their statements, budgets, concerns and family threads stay strictly separated, but you switch between them in a tap. The audit trail follows every action so siblings know who did what, when.
                            </p>
                            <ul className="mt-4 space-y-2 text-sm text-muted-k">
                                <li className="flex gap-2"><Check className="h-4 w-4 text-sage mt-0.5 flex-none" /> Per-participant budgets and lifetime cap tracking</li>
                                <li className="flex gap-2"><Check className="h-4 w-4 text-sage mt-0.5 flex-none" /> Notifications and the weekly digest scoped to the participant you are viewing</li>
                                <li className="flex gap-2"><Check className="h-4 w-4 text-sage mt-0.5 flex-none" /> Add or remove participants any time from Plan & Billing</li>
                            </ul>
                        </Reveal>
                    </div>
                </div>
            </Section>

            <Section id="trust" tone="clay" eyebrow="Trust & compliance" title="Built around your rights, not retrofitted to them." sub="Australian-hosted, encrypted, and never used to train models without your explicit consent.">
                <div className="grid sm:grid-cols-2 gap-5">
                    {TRUST.map((w, i) => <Card key={w.title} {...w} dark i={i} />)}
                </div>
            </Section>

            {/* CLOSING CTA */}
            <section className="relative overflow-hidden bg-gradient-to-br from-[#0E4D52] to-[#10363A]">
                <DotField />
                <Orb className="wayly-float" style={{ width: 240, height: 240, top: -80, right: 40 }} from="#F0B267" to="#A5512B" />
                <div className="relative mx-auto max-w-4xl px-6 py-20 text-center">
                    <Reveal>
                        <h2 className="font-heading text-4xl sm:text-5xl text-white tracking-tight">Ready when you are.</h2>
                        <p className="mt-4 text-white/80 max-w-xl mx-auto">Start the free 7-day trial, no card needed, or book a 20-minute call with a real person on our team.</p>
                        <div className="mt-8 flex flex-wrap gap-3 justify-center">
                            <Link to="/signup" className="inline-flex items-center gap-2 bg-[#A5512B] text-white font-semibold rounded-lg px-6 py-3 hover:bg-[#8E4523] shadow-md transition-colors" data-testid="features-bottom-cta-trial">
                                Start free trial <ArrowRight className="h-4 w-4" />
                            </Link>
                            <Link to="/contact?intent=demo" className="inline-flex items-center gap-2 bg-white text-[#0E4D52] font-semibold rounded-lg px-6 py-3 hover:bg-white/90 shadow-md transition-colors" data-testid="features-bottom-cta-demo">
                                Book a demo
                            </Link>
                        </div>
                    </Reveal>
                </div>
            </section>

            <Footer />
        </div>
    );
}
