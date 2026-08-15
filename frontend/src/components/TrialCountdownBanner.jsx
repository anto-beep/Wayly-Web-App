/**
 * TrialCountdownBanner, Wave 2 in-app shell banner (§4.2 / §4.3 of Dec 2026 refit).
 *
 * Copy:
 *   default (X > 1 day):  "Trial: X days remaining. Choose a plan to keep access."
 *   grace (≤ 24 hours):   "Your trial ends tomorrow. Choose a plan to keep using Wayly."
 *
 * Calm visual treatment, no red, no flashing. Clay CTA "Choose Plan" (Title Case).
 * Dismissible per session; reappears at the start of each new session.
 *
 * Reads `trial_ends_at` and `subscription_status` from /api/auth/me (user object).
 */
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const SESSION_DISMISS_KEY = "wayly_trial_banner_dismissed";

export default function TrialCountdownBanner({ className = "" }) {
    const { user } = useAuth();
    const [now, setNow] = useState(Date.now());
    const [dismissed, setDismissed] = useState(false);

    const status = user?.subscription_status;
    const endsAt = user?.trial_ends_at;
    const onTrial = status === "trialing" && !!endsAt;

    useEffect(() => {
        setDismissed(sessionStorage.getItem(SESSION_DISMISS_KEY) === "1");
    }, []);

    useEffect(() => {
        if (!onTrial) return;
        const id = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(id);
    }, [onTrial]);

    if (!onTrial || dismissed) return null;
    const remainingMs = new Date(endsAt).getTime() - now;
    if (remainingMs <= 0) return null;

    const hoursRemaining = remainingMs / 3_600_000;
    const isGrace = hoursRemaining <= 24;
    const daysRemaining = Math.max(1, Math.ceil(hoursRemaining / 24));
    const dayLabel = daysRemaining === 1 ? "1 day" : `${daysRemaining} days`;

    const dismiss = () => {
        sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
        setDismissed(true);
    };

    return (
        <div
            data-testid="trial-countdown-banner"
            data-low={isGrace ? "true" : "false"}
            className={`flex items-center gap-3 rounded-xl px-4 py-3 border bg-surface-2 border-kindred text-primary-k ${className}`}
        >
            <div className="flex-1 text-sm leading-relaxed">
                {isGrace
                    ? <>Your trial ends tomorrow. Choose a plan to keep using Wayly.</>
                    : <>Trial: <strong>{dayLabel} remaining</strong>. Choose a plan to keep access.</>}
            </div>
            <Link
                to="/settings/billing"
                data-testid="trial-banner-upgrade"
                className="inline-flex items-center gap-1.5 text-sm font-semibold px-3.5 py-1.5 rounded-md whitespace-nowrap flex-shrink-0 bg-wayly-clay-500 text-white hover:brightness-95"
            >
                Choose Plan
            </Link>
            <button
                type="button"
                onClick={dismiss}
                data-testid="trial-banner-dismiss"
                aria-label="Dismiss banner"
                className="p-1 rounded text-muted-k hover:text-primary-k focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-k"
            >
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}
