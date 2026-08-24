/**
 * Onboarding Step 4, All done.
 *
 * Extracted verbatim from Onboarding.jsx (Feb 2026 split).
 */
import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
    Check, ArrowRight, Sparkles, Mail, FileText, Calculator,
    Pill, PlusCircle,
} from "lucide-react";
import { CompletenessRing } from "../helpers";

export default function StepAllDone({ doc, participantId, onFinish, user }) {
    void participantId; void user; // reserved for future analytics, silence unused-arg lint
    const pct = Math.round(doc?.profile_completeness_pct || 0);
    const [familyNeedsSecond, setFamilyNeedsSecond] = useState(false);
    // Second-participant intent (captured at signup for Family plan). If set,
    // the "Add second participant" prompt uses the pre-filled name and the
    // finish button auto-steers into the second-participant onboarding.
    const [secondIntent, setSecondIntent] = useState(null);
    useEffect(() => {
        try {
            const raw = localStorage.getItem("wayly_second_participant_intent");
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed?.first_name) setSecondIntent(parsed);
            }
        } catch { /* non-fatal */ }
    }, []);
    useEffect(() => {
        (async () => {
            try {
                const [aRes, pRes] = await Promise.allSettled([
                    api.get("/account"),
                    api.get("/participants"),
                ]);
                const acct = aRes.status === "fulfilled" ? aRes.value?.data : null;
                const list = pRes.status === "fulfilled"
                    ? (pRes.value?.data?.participants
                       || pRes.value?.data?.items
                       || (Array.isArray(pRes.value?.data) ? pRes.value.data : []))
                    : [];
                const activeCount = (list || []).filter((p) => (p.status || "ACTIVE") === "ACTIVE").length;
                if (acct?.base_plan === "FAMILY" && activeCount < 2) setFamilyNeedsSecond(true);
            } catch {
                // ignore, the prompt is nice-to-have.
            }
        })();
    }, []);
    const tier3Cards = [
        {
            field: "applicable_supplements",
            icon: Pill,
            title: "Add supplements",
            reason: "Add your parent's supplements so Wayly's budget calculator includes them.",
            href: "/ai-tools/budget-calculator",
        },
        {
            field: "part_pension_actual_independence_pct",
            icon: Calculator,
            title: "Add exact contribution rates",
            reason: "Paste the Independence + Everyday Living percentages from the Services Australia letter for precise contribution figures.",
            href: "/ai-tools/contribution-estimator",
        },
        {
            field: "full_address",
            icon: Mail,
            title: "Add full residential address",
            reason: "Wayly auto-fills the address on My Aged Care letters and reassessment requests.",
            href: "/ai-tools/letters-and-follow-ups",
        },
        {
            field: "care_manager_name",
            icon: FileText,
            title: "Add care manager details",
            reason: "Wayly pre-fills the care manager's name + email on letters so you don't have to retype it every time.",
            href: "/ai-tools/letters-and-follow-ups",
        },
    ];

    return (
        <div data-testid="step-all-done">
            {familyNeedsSecond && (
                <div className="mb-6 rounded-2xl border-2 border-gold/50 bg-gradient-to-br from-gold/15 to-gold/5 p-5" data-testid="onboarding-family-add-second">
                    <div className="flex items-start gap-3">
                        <div className="w-11 h-11 rounded-xl bg-gold/25 text-primary-k inline-flex items-center justify-center shrink-0">
                            <PlusCircle className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <div className="flex-1">
                            <div className="font-heading text-lg text-primary-k">
                                {secondIntent?.first_name
                                    ? `Ready to set up ${secondIntent.first_name}?`
                                    : "Add your second participant"}
                            </div>
                            <p className="text-sm text-primary-k/85 mt-1 leading-relaxed">
                                {secondIntent?.first_name
                                    ? `You told us at signup that you're caring for two. Let's finish ${secondIntent.first_name}'s profile now, we've pre-filled the name so it's quick.`
                                    : "Your Family plan covers two people at no extra cost. Add the second person now while everything's fresh, the same fields, and Wayly will speak in the right voice for both."}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <a
                                    href="/onboarding?new=1"
                                    className="inline-flex items-center gap-2 bg-primary-k text-white rounded-lg px-4 py-2 text-sm font-medium hover:brightness-95"
                                    data-testid="onboarding-add-second-cta"
                                >
                                    {secondIntent?.first_name
                                        ? `Set up ${secondIntent.first_name} now`
                                        : "Add second participant now"} <ArrowRight className="h-4 w-4" />
                                </a>
                                <span className="text-xs text-muted-k self-center">
                                    Or add them later from Settings.
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex items-start gap-3">
                <div className="flex-none h-10 w-10 rounded-lg bg-primary-k/10 border border-primary-k/30 flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-primary-k" />
                </div>
                <div>
                    <h1 className="font-heading text-2xl md:text-3xl text-primary-k tracking-tight">All done</h1>
                    <p className="text-muted-k mt-2 text-sm leading-relaxed">
                        {pct >= 90
                            ? "Your participant profile is ready, Wayly can give you its sharpest figures."
                            : pct >= 60
                                ? "Your participant profile has the essentials. You can sharpen Wayly's accuracy any time by filling the optional fields below."
                                : "Your participant profile is saved. Add the optional fields below whenever convenient."}
                    </p>
                </div>
            </div>

            <CompletenessRing pct={pct} />

            <div className="mt-6">
                <h2 className="font-heading text-lg text-primary-k">Sharpen Wayly&apos;s accuracy</h2>
                <p className="text-xs text-muted-k mt-1">Optional. Each card opens the relevant tool so you can fill the field in context.</p>
                <div className="mt-3 grid sm:grid-cols-2 gap-3">
                    {tier3Cards.map((c) => {
                        const Icon = c.icon;
                        return (
                            <a
                                key={c.field}
                                href={c.href}
                                data-testid={`tier3-card-${c.field}`}
                                className="group rounded-xl border border-kindred bg-surface-2 p-4 hover:bg-surface hover:border-primary-k transition-colors"
                            >
                                <Icon className="h-5 w-5 text-primary-k" />
                                <div className="mt-2 font-heading text-base text-primary-k">{c.title}</div>
                                <p className="text-xs text-muted-k mt-1 leading-relaxed">{c.reason}</p>
                                <div className="mt-2 inline-flex items-center gap-1 text-xs text-primary-k group-hover:gap-2 transition-all">
                                    Open tool <ArrowRight className="h-3 w-3" />
                                </div>
                            </a>
                        );
                    })}
                </div>
            </div>

            <button
                type="button"
                onClick={onFinish}
                data-testid="onboarding-finish"
                className="mt-7 w-full bg-primary-k text-white rounded-md py-3 text-base hover:bg-[#091D33] transition-colors inline-flex items-center justify-center gap-2"
            >
                <Check className="h-4 w-4" /> Go to dashboard
            </button>
        </div>
    );
}
