import React from "react";
import { Phone, MessageCircle, Calendar, AlertTriangle, ArrowRight, CheckCircle2, Smile, Meh, Frown, BellRing, Cloud, FileText, TrendingUp } from "lucide-react";

/**
 * Live React UI mockups for marketing screenshots.
 * No images — these are real DOM that always match the design system.
 * All wrapped in <BrowserFrame> or <PhoneFrame>.
 */

export function BrowserFrame({ url = "app.kindred.au", scale = 0.85, className = "", children, label }) {
    return (
        <div role="img" aria-label={label} className={`block max-w-full ${className}`}>
            <div className="rounded-[10px] overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.15)] border border-[#E2E2E2] bg-[#F5F5F5]">
                <div className="h-7 bg-[#F5F5F5] flex items-center gap-1.5 px-3 border-b border-[#E2E2E2]">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
                    <div className="ml-3 flex-1 max-w-md mx-auto bg-white border border-[#E2E2E2] rounded h-4 px-2 flex items-center text-[10px] text-[#7A7A7A] truncate">
                        {url}
                    </div>
                </div>
                <div className="overflow-hidden bg-[#FAF7F2]" style={{ width: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: "top left" }}>
                    <div className="origin-top-left">{children}</div>
                </div>
            </div>
        </div>
    );
}

export function PhoneFrame({ scale = 0.55, className = "", children, label }) {
    return (
        <div role="img" aria-label={label} className={`inline-block ${className}`}>
            <div className="rounded-[36px] overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.18)] border-[3px] border-black bg-black p-2">
                <div className="rounded-[28px] overflow-hidden bg-[#FAF7F2] relative" style={{ width: 320, height: 580 }}>
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 h-5 w-32 bg-black rounded-b-2xl z-10" />
                    <div className="origin-top-left h-full overflow-hidden" style={{ transform: `scale(${scale})`, transformOrigin: "top left", width: `${100 / scale}%` }}>
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ------------------------------- Screenshots ------------------------------ */

const NAV_ITEMS = ["Dashboard", "Statements", "Ask Kindred", "Family thread", "Audit log"];

function MiniSidebar({ active = "Dashboard" }) {
    return (
        <aside className="w-44 flex-shrink-0 pt-6 px-3">
            <div className="flex items-center gap-2 mb-6 px-2">
                <div className="h-7 w-7 rounded-md bg-[#1F3A5F] flex items-center justify-center text-white font-heading text-sm">K</div>
                <span className="font-heading text-[15px] text-[#1F3A5F]">Kindred</span>
            </div>
            <ul className="space-y-1 text-[13px]">
                {NAV_ITEMS.map((n) => (
                    <li key={n} className={`px-3 py-2 rounded-md ${n === active ? "bg-[#1F3A5F] text-white" : "text-[#5C6878]"}`}>{n}</li>
                ))}
            </ul>
        </aside>
    );
}

export function ScreenshotDashboard() {
    return (
        <div className="bg-[#FAF7F2] flex w-[1100px]">
            <MiniSidebar active="Dashboard" />
            <main className="flex-1 px-8 py-7 min-w-0">
                <div className="text-[10px] uppercase tracking-[0.18em] text-[#5C6878]">Wellbeing summary</div>
                <h1 className="font-heading text-[26px] text-[#1F3A5F] tracking-tight mt-1">Dorothy, this quarter</h1>
                <p className="text-[12px] text-[#5C6878] mt-1">Q2 2026 · Classification 4 · $6,681 per quarter · Bluebell Care</p>

                <div className="grid grid-cols-4 gap-3 mt-5">
                    {[
                        { l: "Budget remaining", v: "$3,810", sub: "57% of Q2 left", tone: "text-[#7A9B7E]" },
                        { l: "This quarter", v: "$2,891", sub: "spent so far", tone: "text-[#1F3A5F]" },
                        { l: "Anomalies", v: "2", sub: "unreviewed", tone: "text-[#C5734D]" },
                        { l: "Next visit", v: "Thu 8 May", sub: "Tom · personal care", tone: "text-[#1F3A5F]" },
                    ].map((c) => (
                        <div key={c.l} className="bg-white border border-[#E8E2D6] rounded-xl p-4">
                            <div className="text-[9px] uppercase tracking-[0.18em] text-[#5C6878]">{c.l}</div>
                            <div className={`mt-1.5 font-heading text-[22px] ${c.tone} tabular-nums`}>{c.v}</div>
                            <div className="text-[11px] text-[#5C6878] mt-0.5">{c.sub}</div>
                        </div>
                    ))}
                </div>

                <div className="mt-6 grid grid-cols-3 gap-4">
                    <div className="col-span-2 bg-white border border-[#E8E2D6] rounded-xl p-5">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] uppercase tracking-[0.18em] text-[#5C6878]">Things to know</span>
                            <span className="text-[10px] text-[#5C6878]">2 items</span>
                        </div>
                        <div className="mt-3 flex items-start gap-3 border-b border-[#E8E2D6] pb-3">
                            <span className="h-2 w-2 rounded-full bg-[#C5734D] mt-1.5 flex-shrink-0" />
                            <div className="flex-1">
                                <div className="text-[13px] font-medium text-[#1F3A5F]">Cleaning rate increased 11% — $14 extra this month</div>
                                <div className="text-[11px] text-[#5C6878] mt-0.5">Bluebell Care · 4 Nov + 11 Nov · Published rate $68 · Charged $75</div>
                            </div>
                            <button className="text-[11px] text-[#1F3A5F] underline whitespace-nowrap">Review →</button>
                        </div>
                        <div className="mt-3 flex items-start gap-3">
                            <span className="h-2 w-2 rounded-full bg-[#D4A24E] mt-1.5 flex-shrink-0" />
                            <div className="flex-1">
                                <div className="text-[13px] font-medium text-[#1F3A5F]">Possible duplicate visit — 22 Apr</div>
                                <div className="text-[11px] text-[#5C6878] mt-0.5">Two personal-care charges, same day, same worker.</div>
                            </div>
                            <button className="text-[11px] text-[#1F3A5F] underline whitespace-nowrap">Review →</button>
                        </div>
                    </div>
                    <div className="bg-white border border-[#E8E2D6] rounded-xl p-5">
                        <span className="text-[10px] uppercase tracking-[0.18em] text-[#5C6878]">Latest statement</span>
                        <div className="mt-3 flex items-start gap-2">
                            <FileText className="h-4 w-4 text-[#1F3A5F] mt-0.5" />
                            <div>
                                <div className="text-[13px] font-medium text-[#1F3A5F]">April 2026 statement</div>
                                <div className="text-[11px] text-[#5C6878]">Bluebell Care · Parsed ✓ · 2 anomalies</div>
                            </div>
                        </div>
                        <div className="mt-3 text-[10px] uppercase tracking-[0.18em] text-[#5C6878]">Quarter spent</div>
                        <div className="mt-1 h-2 w-full bg-[#F2EEE5] rounded-full overflow-hidden"><div className="h-full bg-[#7A9B7E]" style={{ width: "43%" }} /></div>
                        <div className="text-[11px] text-[#5C6878] mt-1.5">$2,891 of $6,681</div>
                    </div>
                </div>
            </main>
        </div>
    );
}

export function ScreenshotStatement() {
    return (
        <div className="bg-[#FAF7F2] p-7 w-[1000px]">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#5C6878]">November 2025 statement</div>
            <h2 className="font-heading text-[24px] text-[#1F3A5F] tracking-tight mt-1">Bluebell Care · Dorothy</h2>
            <p className="text-[12px] text-[#5C6878] mt-1 max-w-xl">In plain English: Dorothy used 3 services across 11 visits. Bluebell charged $1,102.50 — the government covered $1,015 and Dorothy contributed $87.56.</p>

            <div className="grid grid-cols-3 gap-4 mt-5">
                {[
                    { l: "Clinical", t: "$195.00", sub: "Government paid · 0% contribution", c: "#7A9B7E" },
                    { l: "Independence", t: "$570.00", sub: "Dorothy paid $28.50 (5%)", c: "#1F3A5F" },
                    { l: "Everyday Living", t: "$337.50", sub: "Dorothy paid $59.06 (17.5%)", c: "#D4A24E" },
                ].map((s) => (
                    <div key={s.l} className="bg-white border border-[#E8E2D6] rounded-xl p-4">
                        <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: s.c }} /><span className="text-[11px] uppercase tracking-[0.16em] text-[#5C6878]">{s.l}</span></div>
                        <div className="mt-2 font-heading text-[20px] text-[#1F3A5F] tabular-nums">{s.t}</div>
                        <div className="text-[10px] text-[#5C6878] mt-0.5">{s.sub}</div>
                    </div>
                ))}
            </div>

            <div className="mt-5 bg-white border-l-4 border-[#C5734D] rounded-r-xl rounded-l-md p-4 shadow-[0_2px_8px_rgba(197,115,77,0.15)]">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 text-[#C5734D] mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-[#C5734D] font-semibold">Anomaly · Possible overcharge</div>
                        <div className="text-[14px] text-[#1F3A5F] font-medium mt-1">Cleaning charged at $75/hr — published price is $68/hr.</div>
                        <div className="text-[11px] text-[#5C6878] mt-1">Two visits on 4 Nov + 11 Nov, 1hr each. Possible overcharge: <span className="font-semibold text-[#1F3A5F]">$14.00</span></div>
                        <button className="mt-3 text-[11px] bg-[#1F3A5F] text-white rounded px-3 py-1.5 inline-flex items-center gap-1">Draft a message to Bluebell <ArrowRight className="h-3 w-3" /></button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function ScreenshotBudget() {
    return (
        <div className="bg-[#FAF7F2] p-7 w-[1000px]">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#5C6878]">Q2 2026 budget</div>
            <h2 className="font-heading text-[24px] text-[#1F3A5F] tracking-tight mt-1">$3,810 of $6,681 remaining</h2>
            <div className="mt-3 h-3 w-full bg-white border border-[#E8E2D6] rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-[#7A9B7E] to-[#1F3A5F]" style={{ width: "57%" }} /></div>
            <div className="text-[11px] text-[#5C6878] mt-1">57% remaining · 8 weeks left in this quarter</div>

            <div className="grid grid-cols-3 gap-4 mt-6">
                {[
                    { l: "Clinical", spent: 195, cap: 1500, c: "#7A9B7E" },
                    { l: "Independence", spent: 1180, cap: 3210, c: "#1F3A5F" },
                    { l: "Everyday Living", spent: 1516, cap: 1971, c: "#D4A24E" },
                ].map((s) => (
                    <div key={s.l} className="bg-white border border-[#E8E2D6] rounded-xl p-4">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-[#5C6878]">{s.l}</div>
                        <div className="mt-1 text-[14px] text-[#1F3A5F] tabular-nums">${s.spent.toLocaleString()} / ${s.cap.toLocaleString()}</div>
                        <div className="mt-2 h-1.5 w-full bg-[#F2EEE5] rounded-full overflow-hidden"><div className="h-full" style={{ width: `${(s.spent / s.cap) * 100}%`, background: s.c }} /></div>
                    </div>
                ))}
            </div>

            <div className="mt-6 bg-white border border-[#E8E2D6] rounded-xl p-5">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-[#5C6878]">Lifetime contribution cap</span>
                    <span className="text-[10px] text-[#5C6878]">New entrant</span>
                </div>
                <div className="mt-2 font-heading text-[18px] text-[#1F3A5F] tabular-nums">$487 <span className="text-[12px] font-sans text-[#5C6878]">of $135,318.69 (0.36%)</span></div>
                <div className="mt-2 h-2 w-full bg-[#F2EEE5] rounded-full overflow-hidden"><div className="h-full bg-[#1F3A5F]" style={{ width: "0.36%", minWidth: "4px" }} /></div>
                <div className="text-[11px] text-[#5C6878] mt-2">At Dorothy's current pace: ~23.4 years to cap</div>
            </div>

            {/* Trend line — 6-quarter sparkline */}
            <div className="mt-6 bg-white border border-[#E8E2D6] rounded-xl p-5">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.16em] text-[#5C6878]">Quarterly spend trend</span>
                    <TrendingUp className="h-3.5 w-3.5 text-[#7A9B7E]" />
                </div>
                <svg viewBox="0 0 600 120" className="mt-3 w-full h-24">
                    <defs>
                        <linearGradient id="sparkfill" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#1F3A5F" stopOpacity="0.18" />
                            <stop offset="100%" stopColor="#1F3A5F" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    <line x1="0" y1="20" x2="600" y2="20" stroke="#D4A24E" strokeDasharray="3 3" strokeWidth="1.2" />
                    <text x="592" y="14" fontSize="9" fill="#D4A24E" textAnchor="end">Cap $6,681</text>
                    <path d="M 0 80 L 100 70 L 200 60 L 300 55 L 400 65 L 500 50 L 600 45 L 600 120 L 0 120 Z" fill="url(#sparkfill)" />
                    <path d="M 0 80 L 100 70 L 200 60 L 300 55 L 400 65 L 500 50 L 600 45" stroke="#1F3A5F" strokeWidth="2" fill="none" />
                    {["Q3'24", "Q4'24", "Q1'25", "Q2'25", "Q3'25", "Q4'25", "Q1'26"].map((q, i) => (
                        <text key={q} x={i * 100} y="115" fontSize="9" fill="#5C6878" textAnchor="middle">{q}</text>
                    ))}
                </svg>
            </div>
        </div>
    );
}

export function ScreenshotFamilyThread() {
    return (
        <div className="bg-[#FAF7F2] p-7 w-[760px]">
            <div className="text-[10px] uppercase tracking-[0.18em] text-[#5C6878]">Family thread · Dorothy's household</div>
            <h2 className="font-heading text-[22px] text-[#1F3A5F] tracking-tight mt-1">3 of you · 2 days of conversation</h2>

            <div className="mt-5 space-y-4">
                <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-full bg-[#7A9B7E] text-white text-[12px] font-semibold flex items-center justify-center">C</div>
                    <div className="bg-white rounded-2xl rounded-tl-sm p-3 max-w-[70%]">
                        <div className="text-[10px] text-[#5C6878] uppercase tracking-wider">Cathy · Mon 9:32am</div>
                        <div className="text-[13px] text-[#1F3A5F] mt-1">Mum mentioned the laundry handrail came loose again. Worth getting Bluebell to look?</div>
                    </div>
                </div>

                <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-full bg-[#D4A24E] text-[#1F3A5F] text-[12px] font-semibold flex items-center justify-center">K</div>
                    <div className="bg-white rounded-2xl rounded-tl-sm p-3 max-w-[80%]">
                        <div className="text-[10px] text-[#5C6878] uppercase tracking-wider">Karen · Mon 11:14am</div>
                        <div className="text-[13px] text-[#1F3A5F] mt-1">I'll be there Wednesday — can take a look. Is this something Support at Home covers?</div>
                    </div>
                </div>

                <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-full bg-[#1F3A5F] text-[#D4A24E] text-[13px] font-heading flex items-center justify-center">K</div>
                    <div className="bg-[#1F3A5F] text-white rounded-2xl rounded-tl-sm p-3 max-w-[80%]">
                        <div className="text-[10px] text-[#D4A24E] uppercase tracking-wider">Kindred · Mon 11:15am</div>
                        <div className="text-[13px] mt-1">Hand rails are eligible under AT-HM Tier 1. Estimated cost $200–450 installed in Geelong. Want me to draft the request to Bluebell?</div>
                        <div className="mt-3 flex gap-2">
                            <button className="text-[11px] bg-[#D4A24E] text-[#1F3A5F] rounded px-3 py-1.5 font-semibold">Yes, draft it</button>
                            <button className="text-[11px] border border-white/30 text-white rounded px-3 py-1.5">Not yet</button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-6 bg-white border border-[#E8E2D6] rounded-xl px-3 py-2.5 flex items-center gap-2">
                <input className="flex-1 text-[12px] text-[#5C6878] bg-transparent outline-none" placeholder="Message your family…" disabled />
                <button className="text-[11px] bg-[#1F3A5F] text-white rounded px-3 py-1.5">Send</button>
            </div>
        </div>
    );
}

export function ScreenshotParticipant() {
    return (
        <div className="bg-[#FAF7F2] w-full h-full px-5 pt-8 pb-5">
            <p className="text-[18px] text-[#5C6878]">Good morning,</p>
            <h1 className="font-heading text-[36px] text-[#1F3A5F] font-bold leading-tight">Dorothy.</h1>
            <p className="text-[12px] text-[#5C6878] mt-1 inline-flex items-center gap-1.5"><Cloud className="h-3.5 w-3.5" /> Mon 5 May · Geelong · 16°C</p>

            <div className="mt-6 bg-[#7A9B7E]/15 border border-[#7A9B7E]/40 rounded-2xl p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-[#7A9B7E] text-white font-semibold flex items-center justify-center text-[15px]">S</div>
                <div>
                    <div className="text-[10px] text-[#5C6878] uppercase tracking-wider">Today at 10:00am</div>
                    <div className="text-[18px] text-[#1F3A5F] font-semibold mt-0.5">Sarah — personal care</div>
                </div>
            </div>

            <div className="mt-5 bg-white border border-[#E8E2D6] rounded-2xl p-4">
                <div className="text-[14px] text-[#1F3A5F] font-medium">How are you feeling, Dorothy?</div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                    <button className="bg-[#7A9B7E] rounded-xl py-3 flex flex-col items-center gap-1"><Smile className="h-7 w-7 text-white" /><span className="text-[11px] text-white font-medium">Good</span></button>
                    <button className="bg-[#D4A24E] rounded-xl py-3 flex flex-col items-center gap-1"><Meh className="h-7 w-7 text-[#1F3A5F]" /><span className="text-[11px] text-[#1F3A5F] font-medium">OK</span></button>
                    <button className="bg-[#C5734D] rounded-xl py-3 flex flex-col items-center gap-1"><Frown className="h-7 w-7 text-white" /><span className="text-[11px] text-white font-medium">Not great</span></button>
                </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                    { l: "Call Cathy", Icon: Phone, c: "bg-[#1F3A5F] text-white" },
                    { l: "Ask Kindred", Icon: MessageCircle, c: "bg-white text-[#1F3A5F] border border-[#E8E2D6]" },
                    { l: "Appointments", Icon: Calendar, c: "bg-white text-[#1F3A5F] border border-[#E8E2D6]" },
                    { l: "I need help", Icon: AlertTriangle, c: "bg-[#C5734D] text-white" },
                ].map((b) => (
                    <button key={b.l} className={`${b.c} rounded-2xl p-3 flex flex-col items-center gap-1.5`}><b.Icon className="h-6 w-6" /><span className="text-[12px] font-medium">{b.l}</span></button>
                ))}
            </div>
        </div>
    );
}

export function ScreenshotAnomaly() {
    return (
        <div className="bg-[#FAF7F2] p-7 w-[760px]">
            <div className="inline-flex items-center gap-1.5 bg-[#D4A24E]/20 text-[#1F3A5F] rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.18em] font-semibold"><BellRing className="h-3 w-3" /> Medium severity</div>
            <h2 className="font-heading text-[24px] text-[#1F3A5F] tracking-tight mt-3">Cleaning rate increased 11% this month.</h2>
            <p className="text-[13px] text-[#5C6878] mt-2 leading-relaxed max-w-2xl">Bluebell's published price for cleaning is $68/hr. Dorothy was charged $75/hr on 4 Nov and 11 Nov. Two visits, 1 hour each — total difference: <span className="font-semibold text-[#1F3A5F]">$14.00</span>.</p>

            <div className="mt-5 bg-white border border-[#E8E2D6] rounded-xl">
                <div className="px-4 py-2.5 border-b border-[#E8E2D6] text-[10px] uppercase tracking-[0.16em] text-[#5C6878]">Evidence</div>
                {[
                    { d: "Mon 4 Nov 2025", s: "Cleaning · 1.0 hr", e: "$68", a: "$75" },
                    { d: "Mon 11 Nov 2025", s: "Cleaning · 1.0 hr", e: "$68", a: "$75" },
                ].map((r) => (
                    <div key={r.d} className="px-4 py-3 grid grid-cols-4 gap-2 text-[12px] border-b border-[#E8E2D6] last:border-0">
                        <div className="text-[#1F3A5F] font-medium">{r.d}</div>
                        <div className="text-[#5C6878]">{r.s}</div>
                        <div className="text-[#5C6878]">Expected <span className="text-[#1F3A5F] font-medium">{r.e}</span></div>
                        <div className="text-[#C5734D]">Charged <span className="font-semibold">{r.a}</span></div>
                    </div>
                ))}
            </div>

            <div className="mt-5 flex gap-2">
                <button className="text-[12px] bg-[#1F3A5F] text-white rounded-md px-4 py-2 inline-flex items-center gap-1.5">Draft a message to Bluebell <ArrowRight className="h-3 w-3" /></button>
                <button className="text-[12px] border border-[#E8E2D6] text-[#1F3A5F] rounded-md px-4 py-2 inline-flex items-center gap-1.5"><CheckCircle2 className="h-3 w-3" /> Mark as reviewed</button>
            </div>
        </div>
    );
}
