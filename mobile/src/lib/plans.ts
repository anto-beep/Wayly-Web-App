import * as WebBrowser from "expo-web-browser";
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
    participants: "1 participant tracked",
    seats: "1 caregiver seat",
    popular: false,
    bullets: [
      "All 9 AI tools, unlimited",
      "Statement Decoder & Invoice Checker",
      "Anomaly Watch & budget tracker",
      "Quarterly Pacing dashboard",
      "Support Plan Reviewer & Letters tool",
      "Document Vault with secure storage",
      "1 caregiver seat, 1 participant tracked",
      "Priority email support",
    ],
  },
  {
    key: "family",
    name: "Family",
    price: "$49.50",
    period: "per fortnight",
    participants: "2 participants (two parents on one plan)",
    seats: "Up to 5 caregiver seats",
    popular: true,
    bullets: [
      "Everything in Solo · all 9 AI tools",
      "Track two parents on one plan",
      "Up to 5 caregiver seats",
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
// Returns true if the hosted checkout was opened.
export async function startCheckout(plan: PlanKey, trialDays = 7): Promise<boolean> {
  const res = await apiFetch<{ url?: string }>("/payments/checkout", {
    method: "POST",
    body: { plan, origin_url: SITE_BASE, trial_days: trialDays },
  });
  if (res?.url) {
    await WebBrowser.openBrowserAsync(res.url);
    return true;
  }
  return false;
}
