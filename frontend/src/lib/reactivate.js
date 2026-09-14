import { api } from "@/lib/api";

/**
 * Start a paid Stripe Checkout to reactivate / subscribe. Sends the user
 * STRAIGHT to Stripe's hosted checkout (no internal billing detour) with
 * trial_days:0 — reactivation is an immediate paid purchase, not a new trial.
 * Returns true once the redirect has kicked off.
 */
export async function startReactivateCheckout(plan) {
    const chosen = plan === "family" ? "family" : "solo";
    const { data } = await api.post("/payments/checkout", {
        plan: chosen,
        origin_url: window.location.origin,
        trial_days: 0,
    });
    if (data?.url) {
        window.location.href = data.url;
        return true;
    }
    return false;
}
