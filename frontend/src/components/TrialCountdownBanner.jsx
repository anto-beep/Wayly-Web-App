import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Clock, Crown, AlertTriangle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

function formatRemaining(ms) {
    if (ms <= 0) return { label: "Trial ended", days: 0, hours: 0 };
    const days = Math.floor(ms / 86_400_000);
    const hours = Math.floor((ms % 86_400_000) / 3_600_000);
    const mins = Math.floor((ms % 3_600_000) / 60_000);
    if (days >= 1) {
        return { days, hours, label: `${days} day${days === 1 ? "" : "s"}, ${hours} hour${hours === 1 ? "" : "s"} remaining` };
    }
    return { days: 0, hours, label: `${hours}h ${mins}m remaining` };
}

/**
 * TrialCountdownBanner — shown on dashboard pages when the user is on a
 * 7-day free trial. Gold by default, terracotta when <24h remains.
 *
 * Reads `trial_ends_at` and `subscription_status` from the user object
 * exposed by /api/auth/me. Renders nothing when the user is not on a
 * trial (e.g. free, active paid, or cancelled).
 */
export default function TrialCountdownBanner({ className = "" }) {
    const { user } = useAuth();
    const [now, setNow] = useState(Date.now());

    const status = user?.subscription_status;
    const endsAt = user?.trial_ends_at;
    const onTrial = status === "trialing" && !!endsAt;

    useEffect(() => {
        if (!onTrial) return;
        const id = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(id);
    }, [onTrial]);

    if (!onTrial) return null;
    const remainingMs = new Date(endsAt).getTime() - now;
    if (remainingMs <= 0) return null;
    const { label, days } = formatRemaining(remainingMs);
    const lessThan24h = remainingMs < 86_400_000;

    return (
        <div
            data-testid="trial-countdown-banner"
            data-low={lessThan24h ? "true" : "false"}
            className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 ${
                lessThan24h
                    ? "bg-[#F4DBC9] border border-terracotta/60 text-[#7C2D12]"
                    : "bg-gold/15 border border-gold/40 text-primary-k"
            } ${className}`}
        >
            <div className="flex items-center gap-2.5 min-w-0">
                {lessThan24h ? (
                    <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                ) : (
                    <Clock className="h-4 w-4 flex-shrink-0" />
                )}
                <div className="text-sm min-w-0">
                    <span className="font-medium">Free trial:</span>{" "}
                    <span className="tabular-nums">{label}</span>
                    {days >= 1 && (
                        <span className="hidden sm:inline text-xs opacity-70 ml-2">
                            · trial ends {new Date(endsAt).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
                        </span>
                    )}
                </div>
            </div>
            <Link
                to="/settings/billing"
                data-testid="trial-banner-upgrade"
                className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-full whitespace-nowrap flex-shrink-0 transition-colors ${
                    lessThan24h
                        ? "bg-terracotta text-white hover:bg-[#a3431a]"
                        : "bg-primary-k text-white hover:bg-[#16294a]"
                }`}
            >
                <Crown className="h-3.5 w-3.5" />
                {lessThan24h ? "Upgrade now" : "Upgrade"}
            </Link>
        </div>
    );
}
