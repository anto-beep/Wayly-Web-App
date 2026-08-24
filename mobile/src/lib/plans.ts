import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { apiFetch } from "@/src/lib/api";

const SITE_BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

// Mirrors the web signup plan picker (frontend/src/pages/Signup.jsx PLANS).
// Fortnightly AUD incl GST. Participant + seat counts match the web copy.
export const PLAN_OPTIONS = [
  {
    key: "solo",
    name: "Solo",
    price: "$24.50",
    period: "per fortnight",
    participants: "1 Participant tracked",
    seats: "1 Caregiver seat",
    popular: false,
    bullets: [
      "All 9 AI tools, unlimited",
      "Statement Decoder & Invoice Checker",
      "Anomaly Watch & budget tracker",
      "Quarterly Pacing dashboard",
      "Support Plan Reviewer & Letters tool",
      "Document Vault with secure storage",
      "1 Caregiver seat, 1 Participant tracked",
      "Priority email support",
    ],
  },
  {
    key: "family",
    name: "Family",
    price: "$49.50",
    period: "per fortnight",
    participants: "2 Participants",
    seats: "Up to 3 Caregiver seats",
    popular: true,
    bullets: [
      "Everything in Solo · all 9 AI tools",
      "Track two parents on one plan",
      "Up to 3 Caregiver seats",
      "Sunday digest emails to the whole family",
      "Adviser & GP role-based sharing links",
      "Family Wall for shared updates & notes",
      "Reassessment letter generator",
      "Invoice + statement history vault",
      "Priority support with same-day response",
    ],
  },
] as const;

export type PlanKey = "solo" | "family";

// Card-capture checkout, identical to the web signup path: creates a
// subscription-mode Stripe Checkout session with a 7-day trial (card is
// validated but not charged until day 8) and opens it in the browser.
// On native, we pass an app deep link so that after payment Stripe bounces
// back INTO the app (auto-closing the browser) instead of stranding the user
// in the browser — the caller then continues to onboarding.
// Returns true if the hosted checkout was opened.
export async function startCheckout(plan: PlanKey, trialDays = 7): Promise<boolean> {
  const returnUrl = Linking.createURL("billing-return");
  const res = await apiFetch<{ url?: string }>("/payments/checkout", {
    method: "POST",
    body: { plan, origin_url: SITE_BASE, trial_days: trialDays, app_return_url: returnUrl },
  });
  if (res?.url) {
    // openAuthSessionAsync watches for `returnUrl` and closes the in-app
    // browser automatically the moment Stripe redirects back to it.
    const result = await WebBrowser.openAuthSessionAsync(res.url, returnUrl);
    // On return, reconcile the subscription server-side using the session id
    // carried on the deep link, so the trial/plan reflects immediately even
    // if the webhook hasn't landed yet.
    const url = (result as any)?.url as string | undefined;
    const m = url?.match(/[?&]session_id=([^&]+)/);
    if (m?.[1]) {
      try { await apiFetch(`/payments/checkout/status/${decodeURIComponent(m[1])}`); } catch { /* non-fatal */ }
    }
    return true;
  }
  return false;
}
