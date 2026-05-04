import React from "react";
import { Link } from "react-router-dom";
import { Lock, ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { BrowserFrame } from "@/components/Screenshots";
import LivePreviewLoop from "@/components/LivePreviewLoop";

/**
 * Page-level access gate for the 7 paid AI tools.
 * - Variant A: unauthenticated visitor → trial CTA + sign-in + SD escape hatch
 * - Variant B: authenticated Free user → in-app upgrade CTAs
 * Below the card: an auto-playing 6-second preview loop of a real result —
 * line items fade in, then an anomaly card flashes in. This is more visceral
 * than a static blurred screenshot — visitors see the product actually doing
 * the thing they'd pay for.
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
                            You're currently on the <span className="font-medium text-primary-k">Free plan</span>.
                        </p>
                        <div className="mt-6 flex flex-col gap-2.5">
                            <Link
                                to="/settings/billing"
                                state={{ plan: "solo" }}
                                data-testid="tool-gate-upgrade-solo"
                                className="bg-gold text-primary-k font-semibold rounded-md py-3 px-5 text-sm hover:brightness-95 inline-flex items-center justify-center gap-2"
                            >
                                Upgrade to Solo — $19/mo <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                            <Link
                                to="/settings/billing"
                                state={{ plan: "family" }}
                                data-testid="tool-gate-upgrade-family"
                                className="bg-primary-k text-white rounded-md py-3 px-5 text-sm hover:bg-[#16294a] inline-flex items-center justify-center gap-2"
                            >
                                Upgrade to Family — $39/mo <ArrowRight className="h-3.5 w-3.5" />
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
                            Start your free 7-day trial to access all 8 AI tools — no card needed.
                        </p>
                        <Link
                            to="/signup?plan=solo"
                            data-testid="tool-gate-trial-cta"
                            className="mt-6 w-full bg-gold text-primary-k font-semibold rounded-md py-3 px-5 text-sm hover:brightness-95 inline-flex items-center justify-center gap-2"
                        >
                            Start free 7-day trial <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                        <p className="mt-4 text-xs text-muted-k">
                            Already have an account?{" "}
                            <Link to="/login" data-testid="tool-gate-signin-link" className="text-primary-k underline">Sign in</Link>
                        </p>
                        <div className="mt-5 flex items-center gap-3 text-[11px] text-muted-k">
                            <span className="flex-1 h-px bg-kindred" />
                            <span>or</span>
                            <span className="flex-1 h-px bg-kindred" />
                        </div>
                        <Link
                            to="/ai-tools/statement-decoder"
                            data-testid="tool-gate-sd-escape"
                            className="mt-4 inline-block text-sm text-primary-k underline"
                        >
                            Try the Statement Decoder free (one use per day, no signup) →
                        </Link>
                    </>
                )}
            </div>

            {/* Auto-playing preview loop — replaces the static blurred screenshot. */}
            <div className="mt-12">
                <div className="text-center text-[11px] uppercase tracking-[0.18em] text-muted-k mb-4" data-testid="tool-gate-preview-label">
                    Here's what happens 90 seconds after you sign up
                </div>
                <div className="max-w-3xl mx-auto" data-testid="tool-gate-live-preview">
                    <BrowserFrame url={`app.kindred.au/${toolName.toLowerCase().replace(/\s+/g, "-")}`} scale={0.9} label={`Live preview loop: ${toolName} result`}>
                        <LivePreviewLoop />
                    </BrowserFrame>
                </div>
            </div>
        </div>
    );
}
