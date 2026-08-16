/**
 * Onboarding Step 3, Recommended details.
 *
 * Extracted verbatim from Onboarding.jsx (Feb 2026 split).
 */
import React from "react";
import { ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import { STATES, CAREGIVER_RELATIONSHIPS } from "../constants";

export default function StepRecommended({ form, setForm, onContinue, onSkip, onBack, saving }) {
    const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

    return (
        <div data-testid="step-recommended">
            <h1 className="font-heading text-2xl md:text-3xl text-primary-k tracking-tight">Recommended details</h1>
            <p className="text-muted-k mt-2 text-sm leading-relaxed">
                Optional but helpful, these sharpen Wayly&apos;s tool results and letter generation. You can skip and add them later.
            </p>

            <div className="mt-6 grid sm:grid-cols-2 gap-4">
                <label className="block">
                    <span className="text-sm text-muted-k">Preferred name (optional)</span>
                    <input
                        value={form.preferred_name}
                        onChange={update("preferred_name")}
                        placeholder="e.g. Mum, Dad, Nan"
                        data-testid="onboarding-preferred-name"
                        className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                    />
                </label>
                <label className="block">
                    <span className="text-sm text-muted-k">My Aged Care reference / Client ID</span>
                    <input
                        value={form.mac_reference_number}
                        onChange={update("mac_reference_number")}
                        placeholder="AC12345678"
                        data-testid="onboarding-mac"
                        className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                    />
                </label>
            </div>

            <div className="mt-4 grid sm:grid-cols-2 gap-4">
                <label className="block">
                    <span className="text-sm text-muted-k">Suburb</span>
                    <input
                        value={form.suburb}
                        onChange={update("suburb")}
                        data-testid="onboarding-suburb"
                        className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                    />
                </label>
                <label className="block">
                    <span className="text-sm text-muted-k">State</span>
                    <select
                        value={form.state}
                        onChange={update("state")}
                        data-testid="onboarding-state"
                        className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 bg-surface focus:outline-none focus:ring-2 ring-primary-k"
                    >
                        <option value="">Select…</option>
                        {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                </label>
            </div>

            <fieldset className="mt-5">
                <legend className="text-sm text-muted-k mb-2">Did the participant transition from a Home Care Package?</legend>
                <div className="flex flex-wrap gap-2">
                    {["yes", "no", "unsure"].map((v) => (
                        <button
                            key={v}
                            type="button"
                            data-testid={`onboarding-hcp-${v}`}
                            onClick={() => setForm((f) => ({ ...f, is_grandfathered_hcp: v, hcp_level: v === "yes" ? f.hcp_level : null }))}
                            className={`rounded-full px-4 py-2 text-sm border transition-colors capitalize ${
                                form.is_grandfathered_hcp === v ? "bg-primary-k text-white border-primary-k" : "border-kindred hover:bg-surface-2 text-primary-k"
                            }`}
                        >
                            {v}
                        </button>
                    ))}
                </div>
                {form.is_grandfathered_hcp === "yes" && (
                    <label className="block mt-3">
                        <span className="text-sm text-muted-k">HCP level (1, 4)</span>
                        <select
                            value={form.hcp_level || ""}
                            onChange={(e) => setForm((f) => ({ ...f, hcp_level: e.target.value ? parseInt(e.target.value, 10) : null }))}
                            data-testid="onboarding-hcp-level"
                            className="mt-1 w-full sm:w-48 rounded-md border border-kindred px-3 py-2.5 bg-surface focus:outline-none focus:ring-2 ring-primary-k"
                        >
                            <option value="">Select…</option>
                            {[1, 2, 3, 4].map((n) => <option key={n} value={n}>Level {n}</option>)}
                        </select>
                    </label>
                )}
            </fieldset>

            <div className="mt-5 grid sm:grid-cols-2 gap-4">
                <label className="block">
                    <span className="text-sm text-muted-k">Your relationship to the participant</span>
                    <select
                        value={form.caregiver_relationship}
                        onChange={update("caregiver_relationship")}
                        data-testid="onboarding-relationship"
                        className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 bg-surface focus:outline-none focus:ring-2 ring-primary-k"
                    >
                        <option value="">Select…</option>
                        {CAREGIVER_RELATIONSHIPS.map((r) => <option key={r.v} value={r.v}>{r.label}</option>)}
                    </select>
                </label>
                <label className="block">
                    <span className="text-sm text-muted-k">Your phone</span>
                    <input
                        type="tel"
                        value={form.caregiver_phone}
                        onChange={update("caregiver_phone")}
                        placeholder="04xx xxx xxx"
                        data-testid="onboarding-caregiver-phone"
                        className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                    />
                </label>
            </div>

            <div className="mt-7 flex items-center justify-between gap-2">
                <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center gap-1 text-sm text-muted-k hover:text-primary-k px-3 py-2"
                >
                    <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={onSkip}
                        data-testid="onboarding-step3-skip"
                        className="text-sm text-muted-k hover:text-primary-k px-3 py-2"
                    >
                        Skip for now
                    </button>
                    <button
                        type="button"
                        onClick={onContinue}
                        disabled={saving}
                        data-testid="onboarding-step3-continue"
                        className="bg-primary-k text-white rounded-md px-5 py-2.5 text-sm hover:bg-[#091D33] inline-flex items-center gap-2 disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                        {saving ? "Saving…" : "Continue"}
                    </button>
                </div>
            </div>
        </div>
    );
}
