/**
 * PaywallModal, Wave 2 hard paywall.
 * Triggers on any 402 'trial_expired' from the backend (see api.js interceptor).
 * Dismissible (§ Jun 2026 refinement): closing reveals the inert data
 * underneath — the backend 402 write-block still fully applies, so dismissing
 * never grants access. Reappears on the next blocked write.
 */
import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { api, extractErrorMessage } from "@/lib/api";
import { toast } from "sonner";
import { Lock, ArrowRight, X, Check } from "lucide-react";
import { TOOL_COUNT } from "@/config/toolRegistry";

const PLAN_CARDS = [
    {
        key: "solo",
        title: "Solo",
        price: "$24.50",
        period: "fortnight",
        cta: "Continue to Payment",
        bullets: [
            `All ${TOOL_COUNT} AI tools, unlimited`,
            "1 Participant tracked",
            "1 Caregiver seat",
            "Statement vault & budget tools",
        ],
        ring: "border-primary-k",
        cta_classes: "bg-primary-k text-white",
    },
    {
        key: "family",
        title: "Family",
        price: "$49.50",
        period: "fortnight",
        cta: "Continue to Payment",
        bullets: [
            "Everything in Solo",
            "2 Participants tracked",
            "Up to 5 Caregiver seats",
            "Sunday digest emails to the family",
        ],
        ring: "border-wayly-clay-500",
        cta_classes: "bg-wayly-clay-500 text-white",
        featured: true,
    },
];

export default function PaywallModal() {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState("");
    const { logout } = useAuth();
    const nav = useNavigate();

    const handler = useCallback(() => setOpen(true), []);

    useEffect(() => {
        window.addEventListener("wayly:trial-expired", handler);
        return () => window.removeEventListener("wayly:trial-expired", handler);
    }, [handler]);

    // Straight to Stripe Checkout — no internal billing detour. trial_days:0
    // because a view-only user has already used their trial (reactivation).
    const onUpgrade = async (plan) => {
        if (busy) return;
        setBusy(plan);
        try {
            const { data } = await api.post("/payments/checkout", {
                plan,
                origin_url: window.location.origin,
                trial_days: 0,
            });
            if (data?.url) {
                window.location.href = data.url;
                return;
            }
            toast.error("Could not open secure checkout. Please try again.");
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not start checkout. Please try again."));
        } finally {
            setBusy("");
        }
    };

    const onLogout = async () => {
        try { await logout(); } catch { /* ignore */ }
        setOpen(false);
        nav("/login");
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[10000] flex items-start sm:items-center justify-center bg-black/65 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto overscroll-contain"
            data-testid="paywall-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="paywall-heading"
        >
            <div className="relative bg-surface rounded-2xl max-w-3xl w-full my-3 sm:my-0 max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-10 shadow-2xl">
                <button
                    type="button"
                    onClick={() => setOpen(false)}
                    data-testid="paywall-dismiss"
                    aria-label="Close and keep viewing"
                    className="absolute top-3 right-3 sm:top-4 sm:right-4 h-9 w-9 inline-flex items-center justify-center rounded-full bg-surface-2/80 backdrop-blur text-muted-k hover:bg-surface-2 hover:text-primary-k focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-k z-10"
                >
                    <X className="h-5 w-5" />
                </button>

                <div className="flex items-start gap-4 mb-6 pr-8">
                    <div className="h-12 w-12 rounded-full bg-surface-2 flex items-center justify-center flex-none">
                        <Lock className="h-5 w-5 text-primary-k" />
                    </div>
                    <div>
                        <h2 id="paywall-heading" className="font-heading text-2xl sm:text-3xl text-primary-k tracking-tight">
                            Your Wayly plan is inactive
                        </h2>
                        <p className="mt-2 text-base text-muted-k leading-relaxed">
                            Pick up right where you left off. Reactivate to unlock every tool again — your statements,
                            care plans and family profiles are all safe and waiting for you.
                        </p>
                    </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                    {PLAN_CARDS.map((p) => (
                        <div
                            key={p.key}
                            className={`rounded-xl border-2 ${p.ring} bg-surface p-5 flex flex-col ${p.featured ? "shadow-md" : ""}`}
                            data-testid={`paywall-plan-${p.key}`}
                        >
                            {p.featured && (
                                <span className="self-start mb-2 inline-block text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full bg-wayly-clay-500 text-white font-semibold">
                                    Most popular
                                </span>
                            )}
                            <h3 className="font-heading text-xl text-primary-k">{p.title}</h3>
                            <div className="mt-1 flex items-baseline gap-1">
                                <span className="font-heading text-3xl text-primary-k">{p.price}</span>
                                <span className="text-sm text-muted-k">/{p.period}</span>
                            </div>
                            <ul className="mt-3 space-y-1.5 text-sm text-muted-k">
                                {p.bullets.map((b, i) => (
                                    <li key={i} className="flex items-start gap-2">
                                        <Check className="h-4 w-4 mt-0.5 flex-none text-wayly-clay-500" aria-hidden="true" />
                                        <span>{b}</span>
                                    </li>
                                ))}
                            </ul>
                            <button
                                type="button"
                                onClick={() => onUpgrade(p.key)}
                                disabled={!!busy}
                                data-testid={`paywall-cta-${p.key}`}
                                className={`mt-5 inline-flex items-center justify-center gap-2 rounded-md font-semibold py-2.5 text-sm disabled:opacity-70 ${p.cta_classes}`}
                            >
                                {busy === p.key ? "Opening secure checkout…" : (<>{p.cta} <ArrowRight className="h-3.5 w-3.5" /></>)}
                            </button>
                        </div>
                    ))}
                </div>

                <div className="mt-6 flex items-center justify-center gap-5 text-center">
                    <button
                        type="button"
                        onClick={() => setOpen(false)}
                        data-testid="paywall-keep-viewing"
                        className="text-xs text-muted-k underline hover:text-primary-k"
                    >
                        Keep viewing my data
                    </button>
                    <button
                        type="button"
                        onClick={onLogout}
                        data-testid="paywall-logout"
                        className="text-xs text-muted-k underline hover:text-primary-k"
                    >
                        Log Out
                    </button>
                </div>
            </div>
        </div>
    );
}
