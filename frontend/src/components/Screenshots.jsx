import React, { useState, useEffect, useRef } from "react";
import { Phone, MessageCircle, Calendar, AlertTriangle, ArrowRight, CheckCircle2, Smile, Meh, Frown, BellRing, Cloud, FileText, TrendingUp, Bell, Download, Users, ChevronDown } from "lucide-react";

/**
 * Live React UI mockups for marketing screenshots.
 * No images, these are real DOM that always match the design system.
 * All wrapped in <BrowserFrame> or <PhoneFrame>.
 *
 * Mobile responsiveness: BrowserFrame/PhoneFrame measure the parent width
 * via ResizeObserver and scale the (fixed design-width) children down so the
 * whole illustration fits inside the viewport. No horizontal scroll required.
 */

const DESIGN_WIDTHS = {
    dashboard: 1100,
    statement: 1000,
    decoder: 1000,
    budget: 1000,
    contribution: 1000,
    aged_care_chat: 760,
    care_plan: 760,
};

function useResponsiveScale(designWidth, maxScale = 0.85) {
    const containerRef = useRef(null);
    const innerRef = useRef(null);
    const [scale, setScale] = useState(maxScale);
    const [innerH, setInnerH] = useState(0);
    useEffect(() => {
        if (!containerRef.current) return;
        const container = containerRef.current;
        const measure = () => {
            // Measure the parent (or the container itself), whichever is
            // narrower. The parent provides the *available* width which is
            // bounded by Tailwind max-w / overflow-hidden rules; the
            // containerRef itself will swell to fit its 1100px child unless
            // we constrain it.
            const parent = container.parentElement;
            const candidates = [
                parent ? parent.clientWidth : 0,
                container.clientWidth,
                container.getBoundingClientRect().width,
            ].filter((n) => n > 0);
            const w = Math.min(...candidates);
            if (!w || !designWidth) return;
            const fit = Math.min(maxScale, w / designWidth);
            setScale(Math.max(0.25, fit));
            if (innerRef.current) {
                const h = innerRef.current.scrollHeight || innerRef.current.getBoundingClientRect().height;
                if (h) setInnerH(h);
            }
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(container);
        if (container.parentElement) ro.observe(container.parentElement);
        if (innerRef.current) ro.observe(innerRef.current);
        return () => ro.disconnect();
    }, [designWidth, maxScale]);
    return [containerRef, innerRef, scale, innerH];
}

export function BrowserFrame({ url = "app.wayly.com.au", designWidth = 1100, scale: forcedScale, className = "", children, label }) {
    const [containerRef, innerRef, autoScale, innerH] = useResponsiveScale(designWidth, 1.0);
    // When a `scale` is passed, honour it on wide viewports but cap by the
    // auto-fit scale on narrow viewports so the illustration never overflows.
    const scale = forcedScale != null ? Math.min(forcedScale, autoScale) : Math.min(0.85, autoScale);
    const wrapperHeight = innerH ? innerH * scale : undefined;
    return (
        // BrowserFrame is visible on every page; only the AI-tool ToolGate
        // override (`hidden lg:block` on its outer wrapper) hides it on mobile.
        <figure aria-label={label} className={`block w-full max-w-full overflow-hidden ${className}`}>
            <div aria-hidden="true" inert={true} className="w-full max-w-full rounded-[10px] overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.15)] border border-[#E2E2E2] bg-[#F5F5F5]">
                {/* Browser chrome, hidden on phones to free vertical space. */}
                <div className="hidden sm:flex h-7 bg-[#F5F5F5] items-center gap-1.5 px-3 border-b border-[#E2E2E2]">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
                    <div className="ml-3 flex-1 max-w-md mx-auto bg-white border border-[#E2E2E2] rounded h-4 px-2 flex items-center text-[10px] text-[#5A5A5A] truncate">
                        {url}
                    </div>
                </div>
                <div
                    ref={containerRef}
                    className="w-full overflow-hidden bg-[#EAF4FB]"
                    style={wrapperHeight ? { height: `${wrapperHeight}px` } : undefined}
                >
                    <div
                        ref={innerRef}
                        style={{
                            width: `${designWidth}px`,
                            transform: `scale(${scale})`,
                            transformOrigin: "top left",
                        }}
                    >
                        {children}
                    </div>
                </div>
            </div>
        </figure>
    );
}

export function PhoneFrame({ scale = 0.55, className = "", children, label }) {
    return (
        <figure aria-label={label} className={`inline-block ${className}`}>
            <div aria-hidden="true" inert={true} className="rounded-[36px] overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.18)] border-[3px] border-black bg-black p-2">
                <div className="rounded-[28px] overflow-hidden bg-[#EAF4FB] relative" style={{ width: 320, height: 580 }}>
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 h-5 w-32 bg-black rounded-b-2xl z-10" />
                    <div className="origin-top-left h-full overflow-hidden" style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: `${100 / scale}%` }}>
                        {children}
                    </div>
                </div>
            </div>
        </figure>
    );
}

/* ------------------------------- Screenshots ------------------------------ */

/**
 * Auto-scaling wrapper for the fixed-design-width illustrations below. Pass
 * `designWidth` to match the inner `w-[NNNpx]` container. On screens narrower
 * than the design width the wrapper shrinks the children proportionally so
 * the whole illustration fits without horizontal scroll.
 */
export function ResponsiveScreenshot({ designWidth = 1000, children, className = "" }) {
    const [containerRef, innerRef, scale, innerH] = useResponsiveScale(designWidth, 1);
    const wrapperHeight = innerH ? innerH * scale : undefined;
    return (
        <div
            ref={containerRef}
            className={`block max-w-full overflow-hidden ${className}`}
            style={wrapperHeight ? { height: `${wrapperHeight}px` } : undefined}
        >
            <div
                ref={innerRef}
                style={{
                    width: `${designWidth}px`,
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                }}
            >
                {children}
            </div>
        </div>
    );
}

const NAV_ITEMS = ["Dashboard", "Statements", "Reports", "Ask Wayly", "Family thread", "Audit Log"];

function MiniSidebar({ active = "Dashboard" }) {
    return (
        <aside className="w-44 flex-shrink-0 pt-6 px-3">
            <div className="flex items-center gap-2 mb-6 px-2">
                <div className="h-7 w-7 rounded-md bg-[#0E2A47] flex items-center justify-center text-white font-heading text-sm">K</div>
                <span className="font-heading text-[15px] text-[#0E2A47]">Wayly</span>
            </div>
            <ul className="space-y-1 text-[13px]">
                {NAV_ITEMS.map((n) => (
                    <li key={n} className={`px-3 py-2 rounded-md ${n === active ? "bg-[#0E2A47] text-white" : "text-[#3F506B]"}`}>{n}</li>
                ))}
            </ul>
        </aside>
    );
}

export function ScreenshotDashboard() {
    return (
        <ResponsiveScreenshot designWidth={1100}>
        <div className="bg-[#EAF4FB] flex w-[1100px]">
            <MiniSidebar active="Dashboard" />
            <main className="flex-1 px-8 py-7 min-w-0">
                {/* Top bar: participant switcher + notifications bell */}
                <div className="flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-2 bg-white border border-[#CFE0F0] rounded-full pl-1 pr-3 py-1">
                        <div className="h-7 w-7 rounded-full bg-[#3DB8A8] text-white text-[11px] font-semibold flex items-center justify-center">D</div>
                        <div className="leading-tight">
                            <div className="text-[11px] font-medium text-[#0E2A47]">Dorothy Anderson</div>
                            <div className="text-[9px] text-[#3F506B] uppercase tracking-wider">Primary · 2 Participants</div>
                        </div>
                        <ChevronDown className="h-3 w-3 text-[#3F506B] ml-1" />
                    </div>
                    <div className="inline-flex items-center gap-2">
                        <button className="relative h-8 w-8 rounded-full bg-white border border-[#CFE0F0] flex items-center justify-center">
                            <Bell className="h-3.5 w-3.5 text-[#0E2A47]" />
                            <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-[#E07A5F] text-white text-[9px] font-semibold flex items-center justify-center">3</span>
                        </button>
                    </div>
                </div>

                <div className="text-[10px] uppercase tracking-[0.18em] text-[#3F506B] mt-4">Wellbeing summary</div>
                <h1 className="font-heading text-[26px] text-[#0E2A47] tracking-tight mt-1">Dorothy, this quarter</h1>
                <p className="text-[12px] text-[#3F506B] mt-1">Q2 2026 · Classification 4 · $7,424/quarter · Bluebell Care</p>

                <div className="grid grid-cols-4 gap-3 mt-5">
                    {[
                        { l: "Budget remaining", v: "$4,533", sub: "61% of Q2 left", tone: "text-[#1F8674]" },
                        { l: "This quarter", v: "$2,891", sub: "spent so far", tone: "text-[#0E2A47]" },
                        { l: "Anomalies", v: "2", sub: "unreviewed", tone: "text-[#B0533C]" },
                        { l: "Lifetime cap", v: "0.36%", sub: "of $135,318.69", tone: "text-[#0E2A47]" },
                    ].map((c) => (
                        <div key={c.l} className="bg-white border border-[#CFE0F0] rounded-xl p-4">
                            <div className="text-[9px] uppercase tracking-[0.18em] text-[#3F506B]">{c.l}</div>
                            <div className={`mt-1.5 font-heading text-[22px] ${c.tone} tabular-nums`}>{c.v}</div>
                            <div className="text-[11px] text-[#3F506B] mt-0.5">{c.sub}</div>
                        </div>
                    ))}
                </div>

                <div className="mt-6 grid grid-cols-3 gap-4">
                    <div className="col-span-2 bg-white border border-[#CFE0F0] rounded-xl p-5">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase tracking-[0.18em] text-[#3F506B]">Things to know</span>
                            <span className="text-[10px] text-[#3F506B]">2 items</span>
                        </div>
                        <div className="mt-3 flex items-start gap-3 border-b border-[#CFE0F0] pb-3">
                            <span className="h-2 w-2 rounded-full bg-[#E07A5F] mt-1.5 flex-shrink-0" />
                            <div className="flex-1">
                                <div className="text-[13px] font-medium text-[#0E2A47]">Cleaning rate increased 11%. Extra $14 this month.</div>
                                <div className="text-[11px] text-[#3F506B] mt-0.5">Bluebell Care · 4 Nov + 11 Nov · Published rate $68 · Charged $75</div>
                            </div>
                            <button className="text-[11px] text-[#0E2A47] underline whitespace-nowrap">Review</button>
                        </div>
                        <div className="mt-3 flex items-start gap-3">
                            <span className="h-2 w-2 rounded-full bg-[#2BC4D6] mt-1.5 flex-shrink-0" />
                            <div className="flex-1">
                                <div className="text-[13px] font-medium text-[#0E2A47]">Possible duplicate visit on 22 Apr.</div>
                                <div className="text-[11px] text-[#3F506B] mt-0.5">Two personal-care charges, same day, same worker.</div>
                            </div>
                            <button className="text-[11px] text-[#0E2A47] underline whitespace-nowrap">Review</button>
                        </div>
                    </div>
                    <div className="bg-white border border-[#CFE0F0] rounded-xl p-5">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase tracking-[0.18em] text-[#3F506B]">Latest reports</span>
                            <span className="text-[9px] text-[#1F8674] uppercase tracking-wider font-semibold">3 ready</span>
                        </div>
                        <div className="mt-3 space-y-2">
                            {[
                                { t: "Annual Financial Report", d: "Q1-Q2 2026 · 6 pp" },
                                { t: "Statement Digest", d: "April 2026 · 2 pp" },
                                { t: "Provider Performance", d: "Bluebell · A-" },
                            ].map((r) => (
                                <div key={r.t} className="flex items-start gap-2">
                                    <FileText className="h-3.5 w-3.5 text-[#0E2A47] mt-0.5 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-[12px] font-medium text-[#0E2A47] truncate">{r.t}</div>
                                        <div className="text-[10px] text-[#3F506B]">{r.d}</div>
                                    </div>
                                    <Download className="h-3 w-3 text-[#3F506B]" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </main>
        </div>
        </ResponsiveScreenshot>
    );
}

/**
 * ScreenshotReportsHub, 8-PDF report library with Provider Performance grade.
 * Used on Landing "Reports your accountant will love" strip.
 */
export function ScreenshotReportsHub() {
    return (
        <ResponsiveScreenshot designWidth={1000}>
        <div className="bg-[#EAF4FB] p-7 w-[1000px]">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#3F506B]">Reports hub</div>
            <div className="flex items-end justify-between gap-4 mt-1">
                <h2 className="font-heading text-[24px] text-[#0E2A47] tracking-tight">8 reports your accountant will love.</h2>
                <span className="text-[11px] text-[#3F506B]">Auto-generated end of quarter · S3-backed</span>
            </div>

            <div className="mt-5 grid grid-cols-4 gap-3">
                {[
                    { t: "Annual Financial", d: "FY25-26", tag: "PDF · 6 pp", c: "#0E2A47" },
                    { t: "Statement Digest", d: "April 2026", tag: "PDF · 2 pp", c: "#3DB8A8" },
                    { t: "Tax Summary", d: "FY25-26", tag: "PDF · 4 pp", c: "#2BC4D6" },
                    { t: "Lifetime Cap", d: "0.36% · $487", tag: "PDF · 3 pp", c: "#E07A5F" },
                    { t: "Budget Forecast", d: "Q3-Q4 outlook", tag: "PDF · 5 pp", c: "#0E2A47" },
                    { t: "Care Plan Diff", d: "v3 vs v4", tag: "PDF · 4 pp", c: "#3DB8A8" },
                    { t: "Provider Performance", d: "Bluebell Care", tag: "Grade A-", c: "#2BC4D6" },
                    { t: "Concerns Log", d: "12 months", tag: "PDF · 8 pp", c: "#E07A5F" },
                ].map((r) => (
                    <div key={r.t} className="bg-white border border-[#CFE0F0] rounded-xl p-3.5">
                        <div className="flex items-center justify-between">
                            <div className="h-7 w-7 rounded flex items-center justify-center" style={{ background: `${r.c}22` }}>
                                <FileText className="h-3.5 w-3.5" style={{ color: r.c }} />
                            </div>
                            <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: r.c }}>{r.tag}</span>
                        </div>
                        <div className="text-[12px] font-medium text-[#0E2A47] mt-3 leading-tight">{r.t}</div>
                        <div className="text-[10px] text-[#3F506B] mt-0.5">{r.d}</div>
                    </div>
                ))}
            </div>

            <div className="mt-5 bg-white border-l-4 border-[#3DB8A8] rounded-r-xl rounded-l-md p-4 flex items-center gap-3">
                <CheckCircle2 className="h-4 w-4 text-[#1F8674] flex-shrink-0" />
                <div className="flex-1">
                    <div className="text-[12px] font-medium text-[#0E2A47]">Provider Performance: Bluebell Care · Grade A-</div>
                    <div className="text-[11px] text-[#3F506B]">98% visit reliability · 1 substitution · 0 unjustified cancellations · Median rate 4% below network</div>
                </div>
                <button className="text-[11px] bg-[#0E2A47] text-white rounded px-3 py-1.5 inline-flex items-center gap-1">Download PDF <Download className="h-3 w-3" /></button>
            </div>
        </div>
        </ResponsiveScreenshot>
    );
}

/**
 * ScreenshotMultiParticipant, participant switcher with 2 named participants
 * + per-participant budget cards. Used on /features "One account, every parent" strip.
 */
export function ScreenshotMultiParticipant() {
    return (
        <ResponsiveScreenshot designWidth={1000}>
        <div className="bg-[#EAF4FB] p-7 w-[1000px]">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#3F506B]">Participants</div>
            <h2 className="font-heading text-[24px] text-[#0E2A47] tracking-tight mt-1">One account. Every parent in one view.</h2>
            <p className="text-[12px] text-[#3F506B] mt-1 max-w-xl">Switch between Dorothy and Robert in a tap. Budgets, statements and concerns stay strictly separated, with the same audit trail behind both.</p>

            <div className="mt-5 grid grid-cols-2 gap-4">
                {[
                    { name: "Dorothy Anderson", initial: "D", role: "Mum", level: "Level 4 · Bluebell Care", spent: 2891, cap: 7424, alerts: 2, color: "#3DB8A8", primary: true },
                    { name: "Robert Kowalski", initial: "R", role: "Dad", level: "Level 6 · Sunrise Community", spent: 4612, cap: 11020, alerts: 0, color: "#0E2A47", primary: false },
                ].map((p) => (
                    <div key={p.name} className="bg-white border border-[#CFE0F0] rounded-xl p-5">
                        <div className="flex items-start gap-3">
                            <div className="h-10 w-10 rounded-full text-white font-semibold flex items-center justify-center text-[15px]" style={{ background: p.color }}>{p.initial}</div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <div className="text-[14px] font-semibold text-[#0E2A47] truncate">{p.name}</div>
                                    {p.primary && <span className="text-[8px] uppercase tracking-wider bg-[#2BC4D6]/30 text-[#0E2A47] rounded-full px-2 py-0.5">Primary</span>}
                                </div>
                                <div className="text-[11px] text-[#3F506B] mt-0.5">{p.role} · {p.level}</div>
                            </div>
                            <button className="text-[10px] bg-[#0E2A47] text-white rounded px-2.5 py-1">View</button>
                        </div>
                        <div className="mt-4">
                            <div className="flex items-center justify-between text-[10px] text-[#3F506B] uppercase tracking-[0.16em]">
                                <span>Q2 budget</span>
                                <span className="tabular-nums">${p.spent.toLocaleString()} / ${p.cap.toLocaleString()}</span>
                            </div>
                            <div className="mt-1.5 h-1.5 w-full bg-[#DCEBF7] rounded-full overflow-hidden">
                                <div className="h-full" style={{ width: `${(p.spent / p.cap) * 100}%`, background: p.color }} />
                            </div>
                        </div>
                        <div className="mt-3 flex items-center gap-3 text-[10px] text-[#3F506B]">
                            <span className="inline-flex items-center gap-1">
                                <span className={`h-1.5 w-1.5 rounded-full ${p.alerts ? "bg-[#E07A5F]" : "bg-[#3DB8A8]"}`} />
                                {p.alerts ? `${p.alerts} anomalies` : "All clear"}
                            </span>
                            <span>·</span>
                            <span>Last statement 14 days ago</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="mt-4 bg-[#0E2A47]/5 border border-[#0E2A47]/20 rounded-xl p-3 inline-flex items-center gap-2">
                <Users className="h-3.5 w-3.5 text-[#0E2A47]" />
                <span className="text-[11px] text-[#0E2A47]">Family plan: 2 Participants included on one bill. Solo includes 1. Add a parent any time.</span>
            </div>
        </div>
        </ResponsiveScreenshot>
    );
}

export function ScreenshotStatement() {
    return (
        <ResponsiveScreenshot designWidth={1000}>
        <div className="bg-[#EAF4FB] p-7 w-[1000px]">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#3F506B]">November 2025 statement</div>
            <h2 className="font-heading text-[24px] text-[#0E2A47] tracking-tight mt-1">Bluebell Care · Dorothy</h2>
            <p className="text-[12px] text-[#3F506B] mt-1 max-w-xl">In plain English: Dorothy used 3 services across 11 visits. Bluebell charged $1,102.50, the government covered $1,015 and Dorothy contributed $87.56.</p>

            <div className="grid grid-cols-3 gap-4 mt-5">
                {[
                    { l: "Clinical", t: "$195.00", sub: "Government paid · 0% contribution", c: "#3DB8A8" },
                    { l: "Independence", t: "$570.00", sub: "Dorothy paid $28.50 (5%)", c: "#0E2A47" },
                    { l: "Everyday Living", t: "$337.50", sub: "Dorothy paid $59.06 (17.5%)", c: "#2BC4D6" },
                ].map((s) => (
                    <div key={s.l} className="bg-white border border-[#CFE0F0] rounded-xl p-4">
                        <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: s.c }} /><span className="text-[11px] uppercase tracking-[0.16em] text-[#3F506B]">{s.l}</span></div>
                        <div className="mt-2 font-heading text-[20px] text-[#0E2A47] tabular-nums">{s.t}</div>
                        <div className="text-[10px] text-[#3F506B] mt-0.5">{s.sub}</div>
                    </div>
                ))}
            </div>

            <div className="mt-5 bg-white border-l-4 border-[#E07A5F] rounded-r-xl rounded-l-md p-4 shadow-[0_2px_8px_rgba(197,115,77,0.15)]">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 text-[#B0533C] mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-[#B0533C] font-semibold">Anomaly · Possible overcharge</div>
                        <div className="text-[14px] text-[#0E2A47] font-medium mt-1">Cleaning charged at $75/hr, published price is $68/hr.</div>
                        <div className="text-[11px] text-[#3F506B] mt-1">Two visits on 4 Nov + 11 Nov, 1hr each. Possible overcharge: <span className="font-semibold text-[#0E2A47]">$14.00</span></div>
                        <button className="mt-3 text-[11px] bg-[#0E2A47] text-white rounded px-3 py-1.5 inline-flex items-center gap-1">Draft a message to Bluebell <ArrowRight className="h-3 w-3" /></button>
                    </div>
                </div>
            </div>
        </div>
        </ResponsiveScreenshot>
    );
}

export function ScreenshotBudget() {
    return (
        <ResponsiveScreenshot designWidth={1000}>
        <div className="bg-[#EAF4FB] p-7 w-[1000px]">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#3F506B]">Q2 2026 budget</div>
            <h2 className="font-heading text-[24px] text-[#0E2A47] tracking-tight mt-1">$3,810 of $6,681 remaining</h2>
            <div className="mt-3 h-3 w-full bg-white border border-[#CFE0F0] rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-[#3DB8A8] to-[#0E2A47]" style={{ width: "57%" }} /></div>
            <div className="text-[11px] text-[#3F506B] mt-1">57% remaining · 8 weeks left in this quarter</div>

            <div className="grid grid-cols-3 gap-4 mt-6">
                {[
                    { l: "Clinical", spent: 195, cap: 1500, c: "#3DB8A8" },
                    { l: "Independence", spent: 1180, cap: 3210, c: "#0E2A47" },
                    { l: "Everyday Living", spent: 1516, cap: 1971, c: "#2BC4D6" },
                ].map((s) => (
                    <div key={s.l} className="bg-white border border-[#CFE0F0] rounded-xl p-4">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-[#3F506B]">{s.l}</div>
                        <div className="mt-1 text-[14px] text-[#0E2A47] tabular-nums">${s.spent.toLocaleString()} / ${s.cap.toLocaleString()}</div>
                        <div className="mt-2 h-1.5 w-full bg-[#DCEBF7] rounded-full overflow-hidden"><div className="h-full" style={{ width: `${(s.spent / s.cap) * 100}%`, background: s.c }} /></div>
                    </div>
                ))}
            </div>

            <div className="mt-6 bg-white border border-[#CFE0F0] rounded-xl p-5">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-[#3F506B]">Lifetime contribution cap</span>
                    <span className="text-[10px] text-[#3F506B]">New entrant</span>
                </div>
                <div className="mt-2 font-heading text-[18px] text-[#0E2A47] tabular-nums">$487 <span className="text-[12px] font-sans text-[#3F506B]">of $135,318.69 (0.36%)</span></div>
                <div className="mt-2 h-2 w-full bg-[#DCEBF7] rounded-full overflow-hidden"><div className="h-full bg-[#0E2A47]" style={{ width: "0.36%", minWidth: "4px" }} /></div>
                <div className="text-[11px] text-[#3F506B] mt-2">At Dorothy's current pace: ~23.4 years to cap</div>
            </div>

            {/* Trend line, 6-quarter sparkline */}
            <div className="mt-6 bg-white border border-[#CFE0F0] rounded-xl p-5">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-[#3F506B]">Quarterly spend trend</span>
                    <TrendingUp className="h-3.5 w-3.5 text-[#1F8674]" />
                </div>
                <svg viewBox="0 0 600 120" className="mt-3 w-full h-24">
                    <defs>
                        <linearGradient id="sparkfill" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#0E2A47" stopOpacity="0.18" />
                            <stop offset="100%" stopColor="#0E2A47" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    <line x1="0" y1="20" x2="600" y2="20" stroke="#2BC4D6" strokeDasharray="3 3" strokeWidth="1.2" />
                    <text x="592" y="14" fontSize="9" fill="#2BC4D6" textAnchor="end">Cap $6,681</text>
                    <path d="M 0 80 L 100 70 L 200 60 L 300 55 L 400 65 L 500 50 L 600 45 L 600 120 L 0 120 Z" fill="url(#sparkfill)" />
                    <path d="M 0 80 L 100 70 L 200 60 L 300 55 L 400 65 L 500 50 L 600 45" stroke="#0E2A47" strokeWidth="2" fill="none" />
                    {["Q3'24", "Q4'24", "Q1'25", "Q2'25", "Q3'25", "Q4'25", "Q1'26"].map((q, i) => (
                        <text key={q} x={i * 100} y="115" fontSize="9" fill="#3F506B" textAnchor="middle">{q}</text>
                    ))}
                </svg>
            </div>
        </div>
        </ResponsiveScreenshot>
    );
}

export function ScreenshotFamilyThread() {
    return (
        <ResponsiveScreenshot designWidth={760}>
        <div className="bg-[#EAF4FB] p-7 w-[760px]">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#3F506B]">Family thread · Dorothy's household</div>
            <h2 className="font-heading text-[22px] text-[#0E2A47] tracking-tight mt-1">3 of you · 2 days of conversation</h2>

            <div className="mt-5 space-y-4">
                <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-full bg-[#3DB8A8] text-white text-[12px] font-semibold flex items-center justify-center">C</div>
                    <div className="bg-white rounded-2xl rounded-tl-sm p-3 max-w-[70%]">
                        <div className="text-[10px] text-[#3F506B] uppercase tracking-wider">Cathy · Mon 9:32am</div>
                        <div className="text-[13px] text-[#0E2A47] mt-1">Mum mentioned the laundry handrail came loose again. Worth getting Bluebell to look?</div>
                    </div>
                </div>

                <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-full bg-[#2BC4D6] text-[#0E2A47] text-[12px] font-semibold flex items-center justify-center">K</div>
                    <div className="bg-white rounded-2xl rounded-tl-sm p-3 max-w-[80%]">
                        <div className="text-[10px] text-[#3F506B] uppercase tracking-wider">Karen · Mon 11:14am</div>
                        <div className="text-[13px] text-[#0E2A47] mt-1">I'll be there Wednesday, can take a look. Is this something Support at Home covers?</div>
                    </div>
                </div>

                <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-full bg-[#0E2A47] text-[#2BC4D6] text-[13px] font-heading flex items-center justify-center">K</div>
                    <div className="bg-[#0E2A47] text-white rounded-2xl rounded-tl-sm p-3 max-w-[80%]">
                        <div className="text-[10px] text-[#2BC4D6] uppercase tracking-wider">Wayly · Mon 11:15am</div>
                        <div className="text-[13px] mt-1">Hand rails are eligible under AT-HM Tier 1. Estimated cost $200, 450 installed in Geelong. Want me to draft the request to Bluebell?</div>
                        <div className="mt-3 flex gap-2">
                            <button className="text-[11px] bg-[#2BC4D6] text-[#0E2A47] rounded px-3 py-1.5 font-semibold">Yes, draft it</button>
                            <button className="text-[11px] border border-white/30 text-white rounded px-3 py-1.5">Not yet</button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-6 bg-white border border-[#CFE0F0] rounded-xl px-3 py-2.5 flex items-center gap-2">
                <input className="flex-1 text-[12px] text-[#3F506B] bg-transparent outline-none" placeholder="Message your family…" disabled />
                <button className="text-[11px] bg-[#0E2A47] text-white rounded px-3 py-1.5">Send</button>
            </div>
        </div>
        </ResponsiveScreenshot>
    );
}

export function ScreenshotParticipant() {
    return (
        <div className="bg-[#EAF4FB] w-full h-full px-5 pt-8 pb-5">
            <p className="text-[18px] text-[#3F506B]">Good morning,</p>
            <h1 className="font-heading text-[36px] text-[#0E2A47] font-bold leading-tight">Dorothy.</h1>
            <p className="text-[12px] text-[#3F506B] mt-1 inline-flex items-center gap-1.5"><Cloud className="h-3.5 w-3.5" /> Mon 5 May · Geelong · 16°C</p>

            <div className="mt-6 bg-[#3DB8A8]/15 border border-[#3DB8A8]/40 rounded-2xl p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-[#3DB8A8] text-white font-semibold flex items-center justify-center text-[15px]">S</div>
                <div>
                    <div className="text-[10px] text-[#3F506B] uppercase tracking-wider">Today at 10:00am</div>
                    <div className="text-[18px] text-[#0E2A47] font-semibold mt-0.5">Sarah, personal care</div>
                </div>
            </div>

            <div className="mt-5 bg-white border border-[#CFE0F0] rounded-2xl p-4">
                <div className="text-[14px] text-[#0E2A47] font-medium">How are you feeling, Dorothy?</div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                    <button className="bg-[#3DB8A8] rounded-xl py-3 flex flex-col items-center gap-1"><Smile className="h-7 w-7 text-white" /><span className="text-[11px] text-white font-medium">Good</span></button>
                    <button className="bg-[#2BC4D6] rounded-xl py-3 flex flex-col items-center gap-1"><Meh className="h-7 w-7 text-[#0E2A47]" /><span className="text-[11px] text-[#0E2A47] font-medium">OK</span></button>
                    <button className="bg-[#E07A5F] rounded-xl py-3 flex flex-col items-center gap-1"><Frown className="h-7 w-7 text-white" /><span className="text-[11px] text-white font-medium">Not great</span></button>
                </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                    { l: "Call Cathy", Icon: Phone, c: "bg-[#0E2A47] text-white" },
                    { l: "Ask Wayly", Icon: MessageCircle, c: "bg-white text-[#0E2A47] border border-[#CFE0F0]" },
                    { l: "Appointments", Icon: Calendar, c: "bg-white text-[#0E2A47] border border-[#CFE0F0]" },
                    { l: "I need help", Icon: AlertTriangle, c: "bg-[#E07A5F] text-white" },
                ].map((b) => (
                    <button key={b.l} className={`${b.c} rounded-2xl p-3 flex flex-col items-center gap-1.5`}><b.Icon className="h-6 w-6" /><span className="text-[12px] font-medium">{b.l}</span></button>
                ))}
            </div>
        </div>
    );
}

export function ScreenshotAnomaly() {
    return (
        <ResponsiveScreenshot designWidth={760}>
        <div className="bg-[#EAF4FB] p-7 w-[760px]">
            <div className="inline-flex items-center gap-1.5 bg-[#2BC4D6]/20 text-[#0E2A47] rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.18em] font-semibold"><BellRing className="h-3 w-3" /> Medium severity</div>
            <h2 className="font-heading text-[24px] text-[#0E2A47] tracking-tight mt-3">Cleaning rate increased 11% this month.</h2>
            <p className="text-[13px] text-[#3F506B] mt-2 leading-relaxed max-w-2xl">Bluebell's published price for cleaning is $68/hr. Dorothy was charged $75/hr on 4 Nov and 11 Nov. Two visits, 1 hour each, total difference: <span className="font-semibold text-[#0E2A47]">$14.00</span>.</p>

            <div className="mt-5 bg-white border border-[#CFE0F0] rounded-xl">
                <div className="px-4 py-2.5 border-b border-[#CFE0F0] text-[10px] uppercase tracking-[0.16em] text-[#3F506B]">Evidence</div>
                {[
                    { d: "Mon 4 Nov 2025", s: "Cleaning · 1.0 hr", e: "$68", a: "$75" },
                    { d: "Mon 11 Nov 2025", s: "Cleaning · 1.0 hr", e: "$68", a: "$75" },
                ].map((r) => (
                    <div key={r.d} className="px-4 py-3 grid grid-cols-4 gap-2 text-[12px] border-b border-[#CFE0F0] last:border-0">
                        <div className="text-[#0E2A47] font-medium">{r.d}</div>
                        <div className="text-[#3F506B]">{r.s}</div>
                        <div className="text-[#3F506B]">Expected <span className="text-[#0E2A47] font-medium">{r.e}</span></div>
                        <div className="text-[#B0533C]">Charged <span className="font-semibold">{r.a}</span></div>
                    </div>
                ))}
            </div>

            <div className="mt-5 flex gap-2">
                <button className="text-[12px] bg-[#0E2A47] text-white rounded-md px-4 py-2 inline-flex items-center gap-1.5">Draft a message to Bluebell <ArrowRight className="h-3 w-3" /></button>
                <button className="text-[12px] border border-[#CFE0F0] text-[#0E2A47] rounded-md px-4 py-2 inline-flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3" /> Mark as reviewed</button>
            </div>
        </div>
        </ResponsiveScreenshot>
    );
}
