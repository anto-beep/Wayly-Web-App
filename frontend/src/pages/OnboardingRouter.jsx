/**
 * OnboardingRouter, smart wrapper for the /onboarding route.
 *
 * Decision tree (runs on mount and whenever the URL params change):
 *   - Load current household participants + account (base plan).
 *   - If URL already has ?pid=…    → render the existing <Onboarding /> deep-link flow.
 *   - If URL has ?new=1            → force the "create new participant" flow
 *     (prefills first_name/last_name from the caregiver's *own* profile if the
 *     caregiver is a "participant" themselves, otherwise leaves blank).
 *   - If 0 participants exist      → render "create first participant" flow.
 *   - If 1+ participants exist and *all* have their Tier-1 required fields
 *                                  → straight to /app.
 *   - If exactly 1 has missing Tier-1 → auto-redirect to `?pid=THAT_ID`.
 *   - If 2+ have missing Tier-1  → show the participant selector so the
 *     caregiver can pick who to complete first (Family plan support).
 *
 * The selector doubles as the Family-plan "who still needs details" screen and
 * as the "Add second participant" prompt after finishing #1.
 */
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Loader2, User, CheckCircle2, PlusCircle, ChevronRight, Users, Sparkles } from "lucide-react";
import WaylyLogo from "@/components/WaylyLogo";
import Onboarding from "@/pages/Onboarding";

const TIER1_REQUIRED = [
    "first_name", "last_name", "dob", "pension_status",
    "classification_level", "provider_name", "statement_delivery",
];

const isTier1Complete = (p) => {
    for (const k of TIER1_REQUIRED) {
        const v = p?.[k];
        if (v === null || v === undefined || v === "" || v === 0) {
            if (k === "classification_level" && (v === "not_sure" || v === "unsure")) continue;
            return false;
        }
    }
    return Boolean(p?.authorisation_confirmed);
};

const missingCount = (p) => TIER1_REQUIRED.filter((k) => {
    const v = p?.[k];
    return v === null || v === undefined || v === "" || (k === "classification_level" && !v);
}).length + (p?.authorisation_confirmed ? 0 : 1);

const progressPct = (p) => {
    const total = TIER1_REQUIRED.length + 1; // + authorisation
    return Math.round(((total - missingCount(p)) / total) * 100);
};

export default function OnboardingRouter() {
    const nav = useNavigate();
    const [params, setParams] = useSearchParams();
    const { user, refreshHousehold } = useAuth();
    const [participants, setParticipants] = useState(null);
    const [account, setAccount] = useState(null);
    const [error, setError] = useState("");

    const pid = params.get("pid");
    const isNew = params.get("new") === "1";

    const load = useCallback(async () => {
        try {
            const [pRes, aRes] = await Promise.allSettled([
                api.get("/participants"),
                api.get("/account"),
            ]);
            const listData = pRes.status === "fulfilled"
                ? (pRes.value?.data?.participants
                   || pRes.value?.data?.items
                   || (Array.isArray(pRes.value?.data) ? pRes.value.data : []))
                : [];
            setParticipants(Array.isArray(listData) ? listData : []);
            setAccount(aRes.status === "fulfilled" ? aRes.value?.data : null);
        } catch (e) {
            setError("Could not load your account. Please refresh.");
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Once we know the state, decide whether to auto-route.
    useEffect(() => {
        if (participants === null || pid || isNew) return;
        const active = participants.filter((p) => (p.status || "ACTIVE") === "ACTIVE");
        if (active.length === 0) return; // fall through to Onboarding create-first
        const incomplete = active.filter((p) => !isTier1Complete(p));
        if (incomplete.length === 0) {
            nav(user?.role === "participant" ? "/participant" : "/app", { replace: true });
            return;
        }
        if (incomplete.length === 1) {
            // Auto-focus the one who needs it.
            setParams({ pid: incomplete[0].id }, { replace: true });
        }
        // 2+ incomplete → we render the selector below.
    }, [participants, pid, isNew, nav, user, setParams]);

    // While waiting for the participants list
    if (participants === null) {
        return (
            <div className="min-h-screen bg-kindred flex items-center justify-center" data-testid="onboarding-router-loading">
                <Loader2 className="h-6 w-6 text-primary-k animate-spin" />
            </div>
        );
    }
    if (error) {
        return (
            <div className="min-h-screen bg-kindred flex items-center justify-center p-6">
                <div className="rounded-2xl border border-terracotta/40 bg-terracotta/5 p-6 text-center max-w-md">
                    <div className="text-terracotta font-semibold mb-2">Something went wrong</div>
                    <div className="text-sm text-primary-k/80">{error}</div>
                </div>
            </div>
        );
    }

    // 1. Deep-link mode, pass through to the existing Onboarding.
    if (pid) return <Onboarding />;

    const active = participants.filter((p) => (p.status || "ACTIVE") === "ACTIVE");
    const incomplete = active.filter((p) => !isTier1Complete(p));

    // 2. Empty state (or ?new=1), pass through so the caregiver adds a participant.
    if (active.length === 0 || isNew) {
        return <Onboarding />;
    }

    // 3. 2+ incomplete → render the participant selector.
    if (incomplete.length >= 2) {
        return (
            <ParticipantSelector
                account={account}
                incomplete={incomplete}
                complete={active.filter((p) => isTier1Complete(p))}
                onPick={(id) => setParams({ pid: id }, { replace: false })}
                onFinishForNow={() => nav(user?.role === "participant" ? "/participant" : "/app")}
            />
        );
    }

    // Everything complete → the auto-redirect effect above already moved on.
    return (
        <div className="min-h-screen bg-kindred flex items-center justify-center" data-testid="onboarding-router-loading">
            <Loader2 className="h-6 w-6 text-primary-k animate-spin" />
        </div>
    );
}

function ParticipantSelector({ account, incomplete, complete, onPick, onFinishForNow }) {
    const planLabel = account?.base_plan === "FAMILY" ? "Family plan (up to 2 participants)"
        : account?.base_plan === "SOLO" ? "Solo plan"
        : "Wayly";
    const totalPending = incomplete.length;

    return (
        <div className="min-h-screen bg-kindred" data-testid="onboarding-selector">
            <header className="border-b border-kindred bg-white/80 backdrop-blur-xl sticky top-0 z-30 safe-top">
                <div className="mx-auto max-w-3xl px-6 py-4 flex items-center gap-3">
                    <WaylyLogo size={32} className="rounded-md" />
                    <div>
                        <div className="font-heading text-lg text-primary-k">Wayly</div>
                        <div className="text-xs text-muted-k">{planLabel}</div>
                    </div>
                </div>
            </header>
            <main className="mx-auto max-w-3xl px-6 py-10 space-y-8">
                <div className="text-center">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary-k/10 text-primary-k mb-4">
                        <Users className="h-7 w-7" aria-hidden="true" />
                    </div>
                    <h1 className="font-heading text-3xl sm:text-4xl text-primary-k">
                        Who would you like to complete first?
                    </h1>
                    <p className="mt-3 text-base text-primary-k/85">
                        {totalPending === 2
                            ? "Both people you look after still need a few details filled in."
                            : `${totalPending} people you look after still need details.`}
                        {" "}Complete one, then come back to the next. Nothing is lost if you step away.
                    </p>
                </div>

                {/* Incomplete list */}
                <div className="space-y-3">
                    {incomplete.map((p) => {
                        const pct = progressPct(p);
                        const missing = missingCount(p);
                        return (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => onPick(p.id)}
                                className="w-full text-left rounded-2xl border border-kindred bg-white p-5 hover:border-primary-k hover:shadow-md transition group focus:outline-none focus:ring-2 ring-primary-k"
                                data-testid={`onboarding-select-${p.id}`}
                            >
                                <div className="flex items-start gap-4">
                                    <div className="w-12 h-12 rounded-full bg-primary-k/10 text-primary-k inline-flex items-center justify-center shrink-0">
                                        <User className="h-6 w-6" aria-hidden="true" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-baseline justify-between gap-3">
                                            <h2 className="font-heading text-xl text-primary-k">
                                                {p.first_name || "Unnamed"} {p.last_name || ""}
                                            </h2>
                                            <span className="text-xs text-muted-k shrink-0">{missing} details left</span>
                                        </div>
                                        {p.preferred_name && (
                                            <div className="text-xs text-muted-k">Prefers &quot;{p.preferred_name}&quot;</div>
                                        )}
                                        {/* Progress bar */}
                                        <div className="mt-3">
                                            <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                                                <div
                                                    className="h-full bg-sage transition-all"
                                                    style={{ width: `${pct}%` }}
                                                    role="progressbar"
                                                    aria-valuenow={pct}
                                                    aria-valuemin={0}
                                                    aria-valuemax={100}
                                                    aria-label={`${p.first_name}'s profile is ${pct}% complete`}
                                                />
                                            </div>
                                            <div className="mt-1 text-xs text-muted-k">{pct}% complete</div>
                                        </div>
                                    </div>
                                    <ChevronRight className="h-5 w-5 text-muted-k group-hover:text-primary-k shrink-0 self-center" aria-hidden="true" />
                                </div>
                            </button>
                        );
                    })}
                </div>

                {complete.length > 0 && (
                    <div className="rounded-xl border border-sage/40 bg-sage/5 p-4 flex items-center gap-3" data-testid="onboarding-complete-summary">
                        <CheckCircle2 className="h-5 w-5 text-sage shrink-0" aria-hidden="true" />
                        <div className="text-sm text-primary-k">
                            <strong>{complete.length}</strong> {complete.length === 1 ? "profile is" : "profiles are"} already done:
                            {" "}
                            {complete.map((p) => p.first_name).join(", ")}.
                        </div>
                    </div>
                )}

                {account?.base_plan === "FAMILY" && (incomplete.length + complete.length) < 2 && (
                    <div className="rounded-xl border border-gold/40 bg-gold/5 p-4 flex items-start gap-3">
                        <Sparkles className="h-5 w-5 text-gold shrink-0 mt-0.5" aria-hidden="true" />
                        <div className="flex-1 text-sm text-primary-k">
                            <strong>Family plan includes a second participant.</strong>
                            {" "}Add them now while everything is fresh.
                            <button
                                type="button"
                                onClick={() => window.location.assign("/onboarding?new=1")}
                                className="ml-2 text-primary-k underline hover:no-underline"
                                data-testid="onboarding-add-second"
                            >
                                Add second participant
                            </button>
                        </div>
                    </div>
                )}

                <div className="text-center pt-4">
                    <button
                        type="button"
                        onClick={onFinishForNow}
                        className="text-sm text-muted-k hover:text-primary-k"
                        data-testid="onboarding-finish-for-now"
                    >
                        Finish for now, I&apos;ll come back later
                    </button>
                </div>
            </main>
        </div>
    );
}
