import React, { useState } from "react";
import { Link } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { formatAUD, formatAUD2 } from "@/lib/api";
import Reveal from "@/components/Reveal";
import { ArrowRight, Phone, AlertOctagon, Clock, AlertTriangle } from "lucide-react";

import SeoHead from "@/seo/SeoHead";
import { SEO } from "@/seo/pageConfig";
const ROLES = [
    { v: "primary", label: "Cathy (Primary Caregiver)" },
    { v: "participant", label: "Dorothy (Participant)" },
    { v: "secondary", label: "Karen (Sibling)" },
];

const STATEMENT = {
    period: "April 2026",
    provider: "Bluebell Care Services Geelong",
    total: 1847.5,
    contribution: 187.3,
    govt: 1660.2,
    items: [
        { date: "2026-04-04", svc: "Personal care", stream: "Independence", units: 1, rate: 95, total: 95 },
        { date: "2026-04-04", svc: "Cleaning", stream: "Everyday Living", units: 1.5, rate: 75, total: 112.5 },
        { date: "2026-04-08", svc: "OT, home assessment", stream: "Clinical", units: 1, rate: 195, total: 195 },
        { date: "2026-04-11", svc: "Personal care", stream: "Independence", units: 1, rate: 95, total: 95 },
        { date: "2026-04-15", svc: "Cleaning", stream: "Everyday Living", units: 2, rate: 85, total: 170 },
    ],
};

const ANOMALY = {
    title: "Cleaning rate has gone up by 13% this month",
    detail: "Bluebell's published price for cleaning is $75/hour. They charged $85/hour on the 15 April visit, that's $20 more this month. Worth a polite query.",
    suggested: "Ask the provider why the rate increased.",
};

const FAMILY = [
    { who: "Cathy", when: "Sat 9:14am", body: "Just saw the OT report from last week, Priya thinks we should put a handrail in the laundry. Anyone got opinions?" },
    { who: "Karen", when: "Sat 11:02am", body: "Yes please, she's been complaining about that step for months. Can we use AT-HM funding for it?" },
    { who: "Wayly", when: "Sat 11:04am", body: "Hand rails are eligible under AT-HM Tier 1. Dorothy's tier was assessed Tier 1 in November. Estimated cost $200 to $450 in Geelong. Want me to draft a request to Bluebell?" },
    { who: "Cathy", when: "Sat 12:30pm", body: "Yes please. Get a non-Bluebell quote too so we can compare." },
];

function Caregiver() {
    return (
        <div className="space-y-6">
            <div className="grid sm:grid-cols-3 gap-4">
                {[
                    { stream: "Clinical", spent: 195, allocated: 2226, color: "#0F5648" },
                    { stream: "Independence", spent: 380, allocated: 3340, color: "#3DB8A8" },
                    { stream: "Everyday Living", spent: 282, allocated: 1115, color: "#E07A5F" },
                ].map((s) => {
                    const pct = (s.spent / s.allocated) * 100;
                    return (
                        <div key={s.stream} className="bg-surface border border-kindred rounded-xl p-5">
                            <div className="overline">{s.stream}</div>
                            <div className="mt-2 font-heading text-2xl text-primary-k tabular-nums">{formatAUD(s.allocated - s.spent)} <span className="text-sm font-sans text-muted-k">left</span></div>
                            <div className="mt-3 h-2 w-full bg-surface-2 rounded-full overflow-hidden">
                                <div className="h-full" style={{ width: `${Math.min(100, pct)}%`, background: s.color }} />
                            </div>
                            <div className="mt-2 text-xs text-muted-k">{formatAUD(s.spent)} of {formatAUD(s.allocated)}</div>
                        </div>
                    );
                })}
            </div>
            <div className="bg-surface border border-kindred rounded-xl p-5">
                <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-terracotta" /><span className="overline">Things to know</span></div>
                <div className="mt-3 flex items-start gap-3">
                    <div className="flex-1">
                        <div className="font-medium text-primary-k">{ANOMALY.title}</div>
                        <p className="text-sm text-muted-k mt-1">{ANOMALY.detail}</p>
                        <p className="text-sm text-primary-k italic mt-2">→ {ANOMALY.suggested}</p>
                    </div>
                </div>
            </div>
            <div className="bg-surface border border-kindred rounded-xl p-5">
                <div className="overline">Latest statement, {STATEMENT.period}</div>
                <p className="mt-3 text-primary-k leading-relaxed">
                    Dorothy received personal care twice, OT once, and two cleaning visits in April. Total billed: {formatAUD2(STATEMENT.total)} (your contribution: {formatAUD2(STATEMENT.contribution)}). One cleaning rate looks higher than usual, see above.
                </p>
                <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="text-muted-k"><tr><th className="text-left py-2">Date</th><th className="text-left py-2">Service</th><th className="text-left py-2">Stream</th><th className="text-right py-2">Total</th></tr></thead>
                        <tbody>
                            {STATEMENT.items.map((it, i) => (
                                <tr key={i} className="border-t border-kindred">
                                    <td className="py-2 tabular-nums">{it.date}</td>
                                    <td className="py-2">{it.svc}</td>
                                    <td className="py-2">{it.stream}</td>
                                    <td className="py-2 text-right tabular-nums">{formatAUD2(it.total)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            <div className="bg-surface border border-kindred rounded-xl p-5">
                <div className="overline">Family thread</div>
                <ul className="mt-3 space-y-3">
                    {FAMILY.map((m, i) => (
                        <li key={i} className="border-b border-kindred pb-2 last:border-0">
                            <div className="overline" style={{ fontSize: "0.62rem" }}>{m.who} · {m.when}</div>
                            <p className="mt-1 text-sm text-primary-k">{m.body}</p>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

function Participant() {
    return (
        <div className="space-y-6">
            <div className="bg-surface border border-kindred rounded-3xl p-8">
                <div className="flex items-center gap-3 text-muted-k"><Clock className="h-5 w-5" /><span className="text-xl">Today, Sunday 27 April</span></div>
                <p className="mt-4 text-2xl sm:text-3xl text-primary-k leading-snug">
                    At <span className="font-semibold">10:00 AM</span>, <span className="font-semibold">Sarah</span> is coming for personal care.
                </p>
                <p className="mt-1 text-xl text-muted-k">It will take about 1 hour.</p>
            </div>
            <div className="bg-surface-2 border border-kindred rounded-3xl p-8">
                <span className="overline">Your budget this quarter</span>
                <p className="mt-3 font-heading text-5xl text-primary-k tabular-nums">{formatAUD(5184.30)}</p>
                <p className="mt-2 text-xl text-primary-k">Plenty for the rest of April to June.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-primary-k text-white rounded-3xl p-8 flex flex-col items-center justify-center text-center gap-2 min-h-[160px]">
                    <Phone className="h-10 w-10" />
                    <span className="text-2xl font-semibold">Call Cathy</span>
                </div>
                <div className="bg-terracotta text-white rounded-3xl p-8 flex flex-col items-center justify-center text-center gap-2 min-h-[160px]">
                    <AlertOctagon className="h-10 w-10" />
                    <span className="text-2xl font-semibold">Something&apos;s not right</span>
                </div>
            </div>
        </div>
    );
}

function Secondary() {
    return (
        <div className="space-y-6">
            <div className="bg-surface-2 rounded-xl p-6 border border-kindred">
                <span className="overline">Sunday digest, read-only</span>
                <p className="mt-3 font-medium text-primary-k">Dorothy&apos;s week, Sun 27 April 2026</p>
                <p className="mt-2 text-sm text-muted-k leading-relaxed">It was a steady week, four appointments, no issues. Cleaning rate flagged for Cathy to query. Q3 budget at 47% used. Handrail install booked for Tuesday.</p>
            </div>
            <div className="bg-surface border border-kindred rounded-xl p-5">
                <div className="overline">Family thread</div>
                <ul className="mt-3 space-y-3">
                    {FAMILY.map((m, i) => (
                        <li key={i} className="border-b border-kindred pb-2 last:border-0">
                            <div className="overline" style={{ fontSize: "0.62rem" }}>{m.who} · {m.when}</div>
                            <p className="mt-1 text-sm text-primary-k">{m.body}</p>
                        </li>
                    ))}
                </ul>
                <p className="mt-3 text-xs text-muted-k italic">As Karen (sibling), you can comment but not act. Cathy is set up to make decisions.</p>
            </div>
        </div>
    );
}

export default function Demo() {
    const [role, setRole] = useState("primary");
    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead {...SEO.demo} />
            <MarketingHeader />
            <section className="mx-auto max-w-6xl px-6 pt-12 pb-6" data-testid="demo-page">
                <Reveal>
                    <span className="overline">Interactive Sample Household</span>
                    <h1 className="font-heading text-5xl text-primary-k tracking-tight mt-3 leading-tight">Meet the Anderson Family.</h1>
                    <p className="mt-4 text-lg text-muted-k max-w-2xl leading-relaxed">
                        Dorothy is 79, lives alone in Geelong, on Classification 4. Her daughter Cathy runs her care from Melbourne. Her sister Karen keeps an eye from Sydney. Tap between their views to see how the same account looks to each of them.
                    </p>
                    <p className="mt-3 text-sm text-muted-k italic">All data on this page is fabricated. Dorothy is not a real person and the provider is not a real provider, but the experience is exactly what real Wayly families see.</p>
                </Reveal>
            </section>

            <section className="mx-auto max-w-6xl px-6 pb-4">
                <div className="bg-surface border border-kindred rounded-2xl p-3 flex flex-wrap gap-2" data-testid="demo-role-toggle">
                    {ROLES.map((r) => (
                        <button
                            key={r.v}
                            onClick={() => setRole(r.v)}
                            data-testid={`demo-role-${r.v}`}
                            className={`px-4 py-2 rounded-full text-sm transition-colors ${role === r.v ? "bg-primary-k text-white" : "text-muted-k hover:bg-surface-2 hover:text-primary-k"}`}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            </section>

            <section className="mx-auto max-w-6xl px-6 pb-16 mt-6">
                <Reveal key={role}>
                    {role === "primary" && <Caregiver />}
                    {role === "participant" && <Participant />}
                    {role === "secondary" && <Secondary />}
                </Reveal>
            </section>

            <section className="bg-primary-k">
                <div className="mx-auto max-w-4xl px-6 py-14 text-center">
                    <h2 className="font-heading text-4xl text-white tracking-tight">Want This for Your Family?</h2>
                    <Link to="/signup" data-testid="demo-cta-trial" className="mt-6 inline-flex items-center gap-2 bg-gold text-white font-medium rounded-full px-6 py-3 hover:brightness-95 transition">Start Free Trial <ArrowRight className="h-4 w-4" /></Link>
                </div>
            </section>
            <Footer />
        </div>
    );
}
