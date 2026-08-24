import React from "react";
import { Link } from "react-router-dom";
import { Lock, ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

// Map each tool's display name to its public marketing screenshot.
// These are real captures of the logged-in tool UI (Family-plan view).
const SCREENSHOT_BY_TOOL = {
    "Statement Decoder":         "/marketing/ai-tool-statement-decoder.png",
    "Budget Calculator":         "/marketing/ai-tool-budget-calculator.png",
    "Classification Self-Check": "/marketing/ai-tool-classification-self-check.png",
    "Provider Price Checker":    "/marketing/ai-tool-provider-price-checker.png",
    "Reassessment Letter Drafter": "/marketing/ai-tool-reassessment-letter.png",
    // LF-1 uses a tool-neutral preview until the tool-specific screenshot is captured
    // (the old ai-tool-reassessment-letter.png still shows the legacy title).
    "Letters & Follow-ups":       "/marketing/02-caregiver-dashboard.png",
    "Contribution Estimator":    "/marketing/ai-tool-contribution-estimator.png",
    "Support Plan Reviewer":        "/marketing/ai-tool-care-plan-reviewer.png",
    "Aged Care Q&A":             "/marketing/ai-tool-family-coordinator.png",
};

/**
 * Page-level access gate for the 7 paid AI tools.
 * - Variant A: unauthenticated visitor → trial CTA + sign-in + SD escape hatch
 * - Variant B: authenticated Free user → in-app upgrade CTAs
 * Below the card: a real screenshot of the actual tool UI (captured from the
 * logged-in Family-plan view). Responsive on every viewport: phones get an
 * aspect-cropped preview, tablets/desktops get the full frame.
 */
export default function ToolGate({ toolName }) {
    const { user } = useAuth();
    const variantB = !!user; // logged-in but on Free plan
    return (
        <div className="mx-auto max-w-5xl px-6 py-12" data-testid="tool-gate">
            <div className="mx-auto max-w-[520px] bg-surface border border-kindred rounded-2xl p-8 text-center shadow-[0_24px_64px_rgba(31,58,95,0.08)]">
                <div className="h-12 w-12 rounded-full bg-surface-2 flex items-center justify-center mx-auto mb-5">
                    <Lock className="h-5 w-5 text-primary-k" />
                </div>

                {variantB ? (
                    <>
                        <h2 className="font-heading text-2xl text-primary-k tracking-tight">
                            {toolName} requires a Solo or Family plan.
                        </h2>
                        <p className="mt-3 text-sm text-muted-k">
                            You are currently on the <span className="font-medium text-primary-k">Free plan</span>.
                        </p>
                        <div className="mt-6 flex flex-col gap-2.5">
                            <Link
                                to="/settings/billing"
                                state={{ plan: "solo" }}
                                data-testid="tool-gate-upgrade-solo"
                                className="bg-primary-k text-white font-semibold rounded-md py-3 px-5 text-sm hover:brightness-95 inline-flex items-center justify-center gap-2"
                            >
                                Upgrade to Solo, $24.50 per fortnight <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                            <Link
                                to="/settings/billing"
                                state={{ plan: "family" }}
                                data-testid="tool-gate-upgrade-family"
                                className="bg-wayly-clay-500 text-white rounded-md py-3 px-5 text-sm hover:brightness-95 inline-flex items-center justify-center gap-2"
                            >
                                Upgrade to Family, $49.50 per fortnight <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        </div>
                        <Link to="/pricing" className="mt-5 inline-block text-xs text-primary-k underline">
                            See what's included in each plan →
                        </Link>
                    </>
                ) : (
                    <>
                        <h2 className="font-heading text-2xl text-primary-k tracking-tight">
                            {toolName} is available on Solo and Family plans.
                        </h2>
                        <p className="mt-3 text-sm text-muted-k">
                            Start with a 7-day free trial. Full access to every tool. No card required to start.
                        </p>
                        <Link
                            to="/signup?plan=solo"
                            data-testid="tool-gate-trial-cta"
                            className="mt-6 w-full bg-gold text-white font-semibold rounded-md py-3 px-5 text-sm hover:brightness-95 inline-flex items-center justify-center gap-2"
                        >
                            Start free 7-day trial <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                        <p className="mt-4 text-xs text-muted-k">
                            Already have an account?{" "}
                            <Link to="/login" data-testid="tool-gate-signin-link" className="text-primary-k underline">Sign in</Link>
                        </p>
                    </>
                )}
            </div>

            {/* Real screenshot of the actual tool UI, captured from a logged-in
                Family-plan account. Shown on every viewport (responsive). */}
            <div className="mt-12">
                <div className="text-center text-[11px] uppercase tracking-[0.18em] text-muted-k mb-4" data-testid="tool-gate-preview-label">
                    Here's what happens 90 seconds after you sign up
                </div>
                <div className="max-w-4xl mx-auto" data-testid="tool-gate-live-preview">
                    <img
                        src={SCREENSHOT_BY_TOOL[toolName] || "/marketing/02-caregiver-dashboard.png"}
                        alt={`${toolName} screenshot showing the actual tool result`}
                        width="1440"
                        height="900"
                        loading="lazy"
                        decoding="async"
                        className="w-full aspect-[16/10] object-cover object-top rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.18)] border border-kindred"
                        data-testid="tool-gate-screenshot"
                    />
                </div>
            </div>
        </div>
    );
}
