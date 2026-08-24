/**
 * ReadOnlyLock, Dec 2026 Refit §4.5 hard lockdown.
 *
 * Drop-in wrapper that REPLACES its children with a calm Subscribe CTA when
 * the authenticated user's trial has expired and they're not on a paid plan.
 * Use this around any composer / form / action surface where typing or
 * uploading would otherwise be possible.
 *
 * Example:
 *   <ReadOnlyLock testId="wall-composer-lock">
 *       <textarea …/>
 *       <button>Share</button>
 *   </ReadOnlyLock>
 *
 * When the user IS on a paid plan or an active trial, the children render
 * exactly as before, the wrapper is transparent.
 */
import React from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { useExpiredTrial } from "@/hooks/useExpiredTrial";

export default function ReadOnlyLock({
    children,
    label = "Subscribe to add or change anything",
    sub = "Your trial has ended. You can still view everything you've already saved.",
    className = "",
    testId = "read-only-lock",
}) {
    const isExpired = useExpiredTrial();
    if (!isExpired) return children;
    return (
        <div
            data-testid={testId}
            role="region"
            aria-label="Subscribe to continue editing"
            className={`bg-surface-2 border border-dashed border-kindred rounded-2xl p-5 sm:p-6 text-center ${className}`}
        >
            <div className="mx-auto h-9 w-9 rounded-full bg-wayly-clay-500/10 flex items-center justify-center mb-3">
                <Lock className="h-4 w-4 text-wayly-clay-500" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-primary-k">{label}</p>
            <p className="text-xs text-muted-k mt-1.5 max-w-sm mx-auto leading-relaxed">{sub}</p>
            <Link
                to="/settings/billing"
                data-testid={`${testId}-cta`}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-wayly-clay-500 text-white text-xs font-semibold px-4 py-2 hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-wayly-clay-500 focus-visible:ring-offset-2"
            >
                Subscribe
            </Link>
        </div>
    );
}
