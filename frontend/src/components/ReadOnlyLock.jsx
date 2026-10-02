/**
 * ReadOnlyLock, Dec 2026 Refit §4.5 hard lockdown.
 *
 * Drop-in wrapper that REPLACES its children with a calm Reactivate CTA when
 * the authenticated user's plan is inactive (view-only). Use this around any
 * composer / form / action surface where typing or uploading would otherwise
 * be possible. The CTA takes the user STRAIGHT to Stripe Checkout to make a
 * real payment — it never dead-ends on the internal billing page.
 *
 * When the user IS on a paid plan or an active trial, children render exactly
 * as before, the wrapper is transparent.
 */
import React, { useState } from "react";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { useExpiredTrial } from "@/hooks/useExpiredTrial";
import { startReactivateCheckout } from "@/lib/reactivate";
import { extractErrorMessage } from "@/lib/api";

export default function ReadOnlyLock({
    children,
    label = "Reactivate to add or change anything",
    sub = "Your plan is inactive. You can still view everything you've already saved.",
    className = "",
    testId = "read-only-lock",
}) {
    const isExpired = useExpiredTrial();
    const { user } = useAuth();
    const [busy, setBusy] = useState(false);
    if (!isExpired) return children;

    const reactivate = async () => {
        if (busy) return;
        setBusy(true);
        try {
            await startReactivateCheckout(user?.plan);
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not open secure checkout. Please try again."));
            setBusy(false);
        }
    };

    return (
        <div
            data-testid={testId}
            role="region"
            aria-label="Reactivate to continue editing"
            className={`bg-surface-2 border border-dashed border-kindred rounded-2xl p-5 sm:p-6 text-center ${className}`}
        >
            <div className="mx-auto h-9 w-9 rounded-full bg-wayly-clay-500/10 flex items-center justify-center mb-3">
                <Lock className="h-4 w-4 text-wayly-clay-500" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-primary-k">{label}</p>
            <p className="text-xs text-muted-k mt-1.5 max-w-sm mx-auto leading-relaxed">{sub}</p>
            <button
                type="button"
                onClick={reactivate}
                disabled={busy}
                data-testid={`${testId}-cta`}
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-wayly-clay-500 text-white text-xs font-semibold px-4 py-2 disabled:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-wayly-clay-500 focus-visible:ring-offset-2"
            >
                {busy ? "Opening secure checkout…" : "Reactivate"}
            </button>
        </div>
    );
}
