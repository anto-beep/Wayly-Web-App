/**
 * PaywallModal, Wave 2 hard paywall.
 * Triggers on any 402 'trial_expired' from the backend (see api.js interceptor).
 * Cannot be dismissed without subscribing or logging out (per §4.4).
 */
import React, { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Lock, ArrowRight } from "lucide-react";
import { TOOL_COUNT } from "@/config/toolRegistry";

const PLAN_CARDS = [
    {
        key: "solo",
        title: "Solo",
        price: "$24.50",
        period: "fortnight",
        cta: "Continue to Payment",
        bullets: [`All ${TOOL_COUNT} AI tools, unlimited`, "1 caregiver seat", "Statement vault and budget tools"],
        ring: "border-primary-k",
        cta_classes: "bg-primary-k text-white hover:brightness-95",
    },
    {
        key: "family",
        title: "Family",
        price: "$49.50",
        period: "fortnight",
        cta: "Continue to Payment",
        bullets: ["Everything in Solo", "Up to 5 family seats", "Sunday digest emails"],
        ring: "border-wayly-clay-500",
        cta_classes: "bg-wayly-clay-500 text-white hover:brightness-95",
        featured: true,
    },
];

export default function PaywallModal() {
    const [open, setOpen] = useState(false);
    const { logout } = useAuth();
    const nav = useNavigate();

    const handler = useCallback(() => setOpen(true), []);

    useEffect(() => {
        window.addEventListener("wayly:trial-expired", handler);
        return () => window.removeEventListener("wayly:trial-expired", handler);
    }, [handler]);

    const onUpgrade = async (plan) => {
        nav(`/settings/billing?plan=${plan}`);
        setOpen(false);
    };

    const onLogout = async () => {
        try { await logout(); } catch { /* ignore */ }
        setOpen(false);
        nav("/login");
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
            data-testid="paywall-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="paywall-heading"
        >
            <div className="bg-surface rounded-2xl max-w-3xl w-full p-6 sm:p-10 shadow-2xl">
                <div className="flex items-start gap-4 mb-6">
                    <div className="h-12 w-12 rounded-full bg-surface-2 flex items-center justify-center flex-none">
                        <Lock className="h-5 w-5 text-primary-k" />
                    </div>
                    <div>
                        <h2 id="paywall-heading" className="font-heading text-2xl sm:text-3xl text-primary-k tracking-tight">
                            Your free trial has ended.
                        </h2>
                        <p className="mt-2 text-base text-muted-k leading-relaxed">
                            Choose a plan to keep using Wayly. Your statements, care plans and family profiles are safe.
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
                                {p.bullets.map((b, i) => <li key={i}>{b}</li>)}
                            </ul>
                            <button
                                type="button"
                                onClick={() => onUpgrade(p.key)}
                                data-testid={`paywall-cta-${p.key}`}
                                className={`mt-5 inline-flex items-center justify-center gap-2 rounded-md font-semibold py-2.5 text-sm ${p.cta_classes}`}
                            >
                                {p.cta} <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    ))}
                </div>

                <div className="mt-6 text-center">
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
