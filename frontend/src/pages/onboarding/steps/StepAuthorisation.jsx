/**
 * Onboarding Step 2, Confirm authorisation.
 *
 * Extracted verbatim from Onboarding.jsx (Feb 2026 split).
 */
import React from "react";
import { ArrowRight, ArrowLeft, Loader2, ShieldCheck } from "lucide-react";

export default function StepAuthorisation({ firstName, confirmed, setConfirmed, onSubmit, onBack, saving }) {
    return (
        <div data-testid="step-authorisation">
            <div className="flex items-start gap-3">
                <div className="flex-none h-10 w-10 rounded-lg bg-sage/15 border border-sage/40 flex items-center justify-center">
                    <ShieldCheck className="h-5 w-5 text-sage" />
                </div>
                <div>
                    <h1 className="font-heading text-2xl md:text-3xl text-primary-k tracking-tight">Confirm authorisation</h1>
                    <p className="text-muted-k mt-2 text-sm leading-relaxed">
                        You&apos;re about to enter and store personal and financial information about {firstName ? <strong className="text-primary-k">{firstName}</strong> : "your parent"}. Wayly needs you to confirm that you&apos;re authorised to manage their aged care information.
                    </p>
                </div>
            </div>

            <label
                data-testid="onboarding-auth-checkbox"
                className={`mt-6 flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${
                    confirmed ? "border-sage bg-sage/5" : "border-kindred hover:bg-surface-2"
                }`}
            >
                <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-[var(--kindred-primary)]"
                />
                <span className="text-sm text-primary-k">
                    I confirm I am authorised to manage {firstName || "the participant"}&apos;s aged care information.
                    This includes having power of attorney, being a nominated representative with My Aged Care, or having explicit consent from the participant.
                </span>
            </label>

            <div className="mt-6 flex items-center justify-between gap-2">
                <button
                    type="button"
                    onClick={onBack}
                    data-testid="onboarding-step2-back"
                    className="inline-flex items-center gap-1 text-sm text-muted-k hover:text-primary-k px-3 py-2"
                >
                    <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <button
                    type="button"
                    onClick={onSubmit}
                    disabled={!confirmed || saving}
                    data-testid="onboarding-step2-continue"
                    className="bg-primary-k text-white rounded-md px-5 py-2.5 text-sm hover:bg-[#091D33] inline-flex items-center gap-2 disabled:opacity-50"
                >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    {saving ? "Saving…" : "Save & continue"}
                </button>
            </div>
        </div>
    );
}
