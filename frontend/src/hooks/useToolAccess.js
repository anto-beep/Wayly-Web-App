import { useAuth } from "@/context/AuthContext";

/**
 * Returns the access state for the 7 paid AI tools.
 *  - "loading"   → auth check still pending
 *  - "allowed"   → user is on Solo/Family/Advisor or active 7-day trial
 *  - "blocked"   → unauth visitor OR Free / expired-trial user
 * Mirrors the backend _require_paid_plan rules.
 */
export default function useToolAccess() {
    const { user, loading } = useAuth();
    if (loading) return "loading";
    if (!user) return "blocked";
    const plan = (user.plan || "free").toLowerCase();
    if (["solo", "family", "advisor", "advisor_pro"].includes(plan)) return "allowed";
    if (user.trial_ends_at) {
        try {
            if (new Date(user.trial_ends_at) > new Date()) return "allowed";
        } catch { /* fall through */ }
    }
    return "blocked";
}
