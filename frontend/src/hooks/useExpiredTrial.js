/**
 * useExpiredTrial, Wave 2 read-only mode signal (§4.5 of Dec 2026 refit).
 *
 * Returns `true` when the authenticated user has reached the post-trial
 * unsubscribed state, i.e. `subscription_status === "expired"`. Components
 * can use this to:
 *   - mount the <ReadOnlyBanner /> (top-of-app Clay banner)
 *   - disable primary action buttons (Run, Calculate, Save, Generate, Upload, Analyse)
 *   - swap form inputs to disabled state with calm "Subscribe to use" placeholders
 *
 * Source of truth is the backend `users.subscription_status` field surfaced
 * on `/api/auth/me`, NOT a client-side flag. Per the brief §4.6, server-side
 * trial state is the only thing that gates the actual data path.
 */
import { useAuth } from "@/context/AuthContext";

export function useExpiredTrial() {
    const { user } = useAuth();
    if (!user) return false;
    // A user is in read-only mode when their subscription is expired AND they
    // are not on a paid plan. Users on Solo/Family/Adviser with an active
    // subscription must never see the read-only banner, even if a stale
    // `expired` flag is left over from a previous trial.
    const plan = (user.plan || "").toLowerCase();
    const isPaid = plan === "solo" || plan === "family" || plan === "adviser";
    if (isPaid) return false;
    return user.subscription_status === "expired";
}
