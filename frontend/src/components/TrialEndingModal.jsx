import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Sparkles, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

/**
 * TrialEndingModal
 * Shown once per browser when an authenticated user has < 24h left on their
 * free trial. Dismissible. Persists dismissal so we don't nag every page-view.
 */

const DISMISS_KEY = "wayly_trial_ending_dismissed_v1";

const HIDE_ON_PATHS = [
    "/login", "/signup", "/forgot", "/reset",
    "/auth-callback", "/auth/callback",
    "/billing/success", "/invite",
    "/settings/billing", // already shows the trial pill, no need to nag
];

export default function TrialEndingModal() {
    const { user } = useAuth();
    const { pathname } = useLocation();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (!user || user.subscription_status !== "trialing" || !user.trial_ends_at) {
            setOpen(false);
            return;
        }
        const ms = new Date(user.trial_ends_at).getTime() - Date.now();
        const within24h = ms > 0 && ms <= 24 * 60 * 60 * 1000;
        if (!within24h) {
            setOpen(false);
            return;
        }
        // Dismiss key includes the trial_ends_at so a re-trial doesn't suppress.
        const key = `${DISMISS_KEY}:${user.trial_ends_at}`;
        try {
            if (localStorage.getItem(key)) {
                setOpen(false);
                return;
            }
        } catch {}
        setOpen(true);
    }, [user]);

    const dismiss = () => {
        if (user?.trial_ends_at) {
            try {
                localStorage.setItem(`${DISMISS_KEY}:${user.trial_ends_at}`, "1");
            } catch {}
        }
        setOpen(false);
    };

    const hidden = HIDE_ON_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (!open || hidden) return null;

    const ms = new Date(user.trial_ends_at).getTime() - Date.now();
    const hours = Math.max(0, Math.ceil(ms / 3_600_000));
    const planLabel = user.plan === "family" ? "Family" : "Solo";
    const price = user.plan === "family" ? "$39" : "$19";

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="trial-ending-modal-title"
            data-testid="trial-ending-modal"
            className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6 bg-black/60 backdrop-blur-sm"
            onClick={dismiss}
        >
            <div
                className="relative w-full max-w-md bg-surface border border-kindred rounded-2xl shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="bg-primary-k text-white px-6 py-5">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-gold/20 text-gold border border-gold/40 text-xs font-medium">
                                <Sparkles className="h-3 w-3" />
                                {hours} hour{hours === 1 ? "" : "s"} left in your trial
                            </div>
                            <h2 id="trial-ending-modal-title" className="font-heading text-2xl mt-3 leading-tight">
                                Keep all 8 AI tools — add a card today.
                            </h2>
                        </div>
                        <button
                            type="button"
                            onClick={dismiss}
                            aria-label="Dismiss"
                            data-testid="trial-modal-dismiss"
                            className="rounded-md p-1 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-gold"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>
                <div className="px-6 py-5 space-y-4">
                    <p className="text-sm text-primary-k leading-relaxed">
                        Your free trial of <strong>{planLabel}</strong> ends in {hours} hour{hours === 1 ? "" : "s"}.
                        Add payment now and you'll keep:
                    </p>
                    <ul className="text-sm text-primary-k space-y-1.5 list-disc pl-5">
                        <li>Unlimited Statement Decoder uses (PDF, Word, photos)</li>
                        <li>All 8 AI tools — budget calc, reassessment letters, family coordinator</li>
                        <li>Stream-by-stream budget burn + lifetime cap tracker</li>
                        <li>Anomaly alerts on every statement</li>
                        {user.plan === "family" && <li>Up to 5 family seats + weekly digest</li>}
                    </ul>
                    <div className="rounded-lg bg-surface-2 border border-kindred/40 p-3">
                        <p className="text-xs text-muted-k">After your trial</p>
                        <p className="text-sm text-primary-k mt-0.5">
                            <strong>{price}/month</strong> · cancel any time · no payment now means moving to the Free plan tomorrow.
                        </p>
                    </div>
                    <div className="flex gap-2 pt-1">
                        <Link
                            to="/settings/billing"
                            onClick={dismiss}
                            data-testid="trial-modal-upgrade"
                            className="flex-1 inline-flex items-center justify-center bg-primary-k text-white rounded-md py-2.5 text-sm font-medium hover:bg-[#16294a]"
                        >
                            Add card to keep {planLabel}
                        </Link>
                        <button
                            type="button"
                            onClick={dismiss}
                            data-testid="trial-modal-later"
                            className="px-3 text-sm text-muted-k hover:text-primary-k"
                        >
                            Maybe later
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
