/**
 * Onboarding Step 1, The Essentials.
 *
 * Extracted verbatim from Onboarding.jsx (Feb 2026 split).
 */
import React from "react";
import { ArrowRight } from "lucide-react";
import { FieldLabelText } from "@/components/RequiredHint";
import { formatAUD } from "@/lib/api";
import { PENSION_OPTIONS, STATEMENT_DELIVERY_OPTIONS } from "../constants";
import { WhyHint } from "../helpers";

export default function StepEssentials({ form, setForm, classifications, onSubmit }) {
    const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

    return (
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} data-testid="step-essentials">
            <h1 className="font-heading text-2xl md:text-3xl text-primary-k tracking-tight">The essentials</h1>
            <p className="text-muted-k mt-2 text-sm leading-relaxed">
                Wayly needs a few core details about the participant so its calculators and AI tools return accurate figures.
            </p>

            <div className="mt-6 grid sm:grid-cols-2 gap-4">
                <label className="block">
                    <FieldLabelText required>First name</FieldLabelText>
                    <input
                        value={form.first_name}
                        onChange={update("first_name")}
                        required
                        aria-required="true"
                        data-testid="onboarding-first-name"
                        className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                    />
                </label>
                <label className="block">
                    <FieldLabelText required>Last name</FieldLabelText>
                    <input
                        value={form.last_name}
                        onChange={update("last_name")}
                        required
                        aria-required="true"
                        data-testid="onboarding-last-name"
                        className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                    />
                </label>
            </div>

            <label className="block mt-4">
                <FieldLabelText required>Date of birth</FieldLabelText>
                <input
                    type="date"
                    value={form.dob}
                    onChange={update("dob")}
                    required
                    aria-required="true"
                    data-testid="onboarding-dob"
                    className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                />
                <WhyHint>Used to match statements to the right participant and to detect age-linked supplements like enteral feeding.</WhyHint>
            </label>

            <fieldset className="mt-5">
                <legend className="mb-2 w-full">
                    <FieldLabelText required>Pension status</FieldLabelText>
                </legend>
                <div className="space-y-2">
                    {PENSION_OPTIONS.map((o) => (
                        <label
                            key={o.v}
                            data-testid={`onboarding-pension-${o.v}`}
                            className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                                form.pension_status === o.v ? "border-primary-k bg-surface-2" : "border-kindred hover:bg-surface-2"
                            }`}
                        >
                            <input
                                type="radio"
                                name="pension_status"
                                value={o.v}
                                checked={form.pension_status === o.v}
                                onChange={() => setForm((f) => ({ ...f, pension_status: o.v }))}
                                className="mt-1 h-4 w-4 accent-[var(--kindred-primary)]"
                            />
                            <span>
                                <span className="text-sm text-primary-k font-medium">{o.label}</span>
                                <span className="block text-xs text-muted-k mt-0.5">{o.hint}</span>
                            </span>
                        </label>
                    ))}
                </div>
                <WhyHint>Wayly uses this to calculate what your parent pays for services. Full pension recipients pay 5% for Independence services; self-funded retirees pay up to 50%. Part-pension and CSHC holders pay a means-tested amount.</WhyHint>
            </fieldset>

            <div className="mt-5">
                <FieldLabelText required>Support at Home classification (1, 8)</FieldLabelText>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {classifications.map((c) => (
                        <button
                            key={c.v}
                            type="button"
                            data-testid={`onboarding-class-${c.v}`}
                            onClick={() => setForm((f) => ({ ...f, classification_level: c.v }))}
                            className={`rounded-lg border p-3 text-left transition-colors tap-target ${
                                form.classification_level === c.v ? "border-primary-k bg-surface-2" : "border-kindred hover:bg-surface-2"
                            }`}
                        >
                            <div className="font-medium text-primary-k">Class {c.v}</div>
                            <div className="text-xs text-muted-k mt-0.5">{formatAUD(c.annual)}/yr</div>
                        </button>
                    ))}
                </div>
                <WhyHint>The classification is set by My Aged Care after the participant&apos;s assessment. It controls the annual budget.</WhyHint>
            </div>

            <label className="block mt-5">
                <FieldLabelText required>Registered provider</FieldLabelText>
                <input
                    value={form.provider_name}
                    onChange={update("provider_name")}
                    required
                    aria-required="true"
                    placeholder="e.g. BlueBerry Care"
                    data-testid="onboarding-provider"
                    className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                />
            </label>

            <fieldset className="mt-5">
                <legend className="mb-2 w-full">
                    <FieldLabelText required>How do you receive their monthly statement?</FieldLabelText>
                </legend>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {STATEMENT_DELIVERY_OPTIONS.map((o) => (
                        <label
                            key={o.v}
                            data-testid={`onboarding-delivery-${o.v}`}
                            className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${
                                form.statement_delivery === o.v ? "border-primary-k bg-surface-2" : "border-kindred hover:bg-surface-2"
                            }`}
                        >
                            <input
                                type="radio"
                                name="statement_delivery"
                                value={o.v}
                                checked={form.statement_delivery === o.v}
                                onChange={() => setForm((f) => ({ ...f, statement_delivery: o.v }))}
                                className="h-4 w-4 accent-[var(--kindred-primary)]"
                            />
                            <span className="text-sm text-primary-k">{o.label}</span>
                        </label>
                    ))}
                </div>
            </fieldset>

            <button
                type="submit"
                data-testid="onboarding-step1-continue"
                className="mt-7 w-full bg-primary-k text-white rounded-md py-3 text-base hover:bg-[#091D33] transition-colors inline-flex items-center justify-center gap-2"
            >
                Continue <ArrowRight className="h-4 w-4" />
            </button>
        </form>
    );
}
