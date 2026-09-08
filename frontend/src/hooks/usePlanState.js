/**
 * usePlanState, a single source of truth for a user's billing status.
 *
 * Returns:
 *   status:   "logged_out" | "free" | "trialing" | "paid"
 *   planName: "solo" | "family" | "advisor" | "advisor_pro" | "free" | null
 *   isPaid:   true when the user has an active paid subscription (excludes trial).
 *   isTrialing: true when the user is on a 7-day trial.
 *   isFreeOrOut: true when the user is either logged-out or on the free tier.
 *
 * We deliberately treat `subscription_status === "trialing"` as NOT paid, so
 * marketing-facing CTAs like "Start free trial" and "Solo & Family" chips
 * disappear the moment a user starts a trial. They reappear only if they
 * churn back to free.
 */
import { useAuth } from "@/context/AuthContext";

const PAID_PLANS = new Set(["solo", "family", "advisor", "advisor_pro"]);

export function usePlanState() {
    const { user } = useAuth();

    if (!user) {
        return {
            status: "logged_out",
            planName: null,
            isPaid: false,
            isTrialing: false,
            isFreeOrOut: true,
            hideTrialCtas: false,
            hidePlanChip: false,
        };
    }

    const planName = (user.plan || "free").toLowerCase();
    const subStatus = (user.subscription_status || "").toLowerCase();

    if (subStatus === "trialing") {
        return {
            status: "trialing",
            planName,
            isPaid: false,
            isTrialing: true,
            isFreeOrOut: false,
            hideTrialCtas: true,
            hidePlanChip: false,        // still show a chip, but as "7-day free trial"
        };
    }

    if (PAID_PLANS.has(planName) && subStatus !== "cancelled" && subStatus !== "expired") {
        return {
            status: "paid",
            planName,
            isPaid: true,
            isTrialing: false,
            isFreeOrOut: false,
            hideTrialCtas: true,
            hidePlanChip: true,
        };
    }

    return {
        status: "free",
        planName: "free",
        isPaid: false,
        isTrialing: false,
        isFreeOrOut: true,
        hideTrialCtas: false,
        hidePlanChip: false,
    };
}

export default usePlanState;
