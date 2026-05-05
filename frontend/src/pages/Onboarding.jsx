import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatAUD, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { HeartHandshake } from "lucide-react";

const CLASSIFICATIONS = [
    { v: 1, annual: 10731 },
    { v: 2, annual: 15910 },
    { v: 3, annual: 22515 },
    { v: 4, annual: 29696 },
    { v: 5, annual: 39805 },
    { v: 6, annual: 49906 },
    { v: 7, annual: 60005 },
    { v: 8, annual: 78106 },
];

export default function Onboarding() {
    const nav = useNavigate();
    const { refreshHousehold, user } = useAuth();
    const [form, setForm] = useState({
        participant_name: "",
        classification: 4,
        provider_name: "",
        is_grandfathered: false,
        relationship: "parent",
    });
    const [submitting, setSubmitting] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await api.post("/household", form);
            await refreshHousehold();
            toast.success("Household set up");
            nav(user?.role === "participant" ? "/participant" : "/app");
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not set up household"));
        } finally {
            setSubmitting(false);
        }
    };

    const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    return (
        <div className="min-h-screen bg-kindred flex items-center justify-center px-6 py-10">
            <div className="w-full max-w-2xl">
                <div className="flex items-center gap-2 mb-8">
                    <div className="h-8 w-8 rounded-full bg-primary-k flex items-center justify-center">
                        <HeartHandshake className="h-4 w-4 text-white" />
                    </div>
                    <span className="font-heading text-lg text-primary-k">Kindred</span>
                </div>
                <div className="bg-surface border border-kindred rounded-2xl p-8">
                    <span className="overline">Step 1 of 1</span>
                    <h1 className="font-heading text-3xl text-primary-k mt-2 tracking-tight">Tell us about your household</h1>
                    <p className="text-muted-k mt-2 text-sm">
                        We use this to read statements correctly and calculate the right budget. You can change everything later.
                    </p>
                    <form onSubmit={submit} className="mt-6 space-y-5">
                        <label className="block">
                            <span className="text-sm text-muted-k">Participant's name</span>
                            <input
                                value={form.participant_name}
                                onChange={update("participant_name")}
                                required
                                placeholder="e.g. Dorothy"
                                data-testid="onboarding-participant-name"
                                className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                            />
                        </label>
                        <div>
                            <span className="text-sm text-muted-k">Support at Home classification</span>
                            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {CLASSIFICATIONS.map((c) => (
                                    <button
                                        key={c.v}
                                        type="button"
                                        data-testid={`classification-${c.v}`}
                                        onClick={() => setForm((f) => ({ ...f, classification: c.v }))}
                                        className={`rounded-lg border p-3 text-left transition-colors ${
                                            form.classification === c.v
                                                ? "border-primary-k bg-surface-2"
                                                : "border-kindred hover:bg-surface-2"
                                        }`}
                                    >
                                        <div className="font-medium text-primary-k">Class {c.v}</div>
                                        <div className="text-xs text-muted-k mt-0.5">{formatAUD(c.annual)}/yr</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <label className="block">
                            <span className="text-sm text-muted-k">Registered provider</span>
                            <input
                                value={form.provider_name}
                                onChange={update("provider_name")}
                                required
                                placeholder="e.g. BlueBerry Care"
                                data-testid="onboarding-provider-name"
                                className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                            />
                        </label>
                        <label className="flex items-center gap-3 rounded-lg border border-kindred p-3">
                            <input
                                type="checkbox"
                                checked={form.is_grandfathered}
                                onChange={(e) => setForm((f) => ({ ...f, is_grandfathered: e.target.checked }))}
                                data-testid="onboarding-grandfathered-toggle"
                                className="h-4 w-4 accent-[var(--kindred-primary)]"
                            />
                            <span className="text-sm text-primary-k">
                                Grandfathered (was on HCP before 1 Nov 2025)
                                <span className="block text-xs text-muted-k mt-0.5">
                                    Lifetime cap is {form.is_grandfathered ? "$84,571.66" : "$135,318.69"}
                                </span>
                            </span>
                        </label>
                        <button
                            type="submit"
                            disabled={submitting}
                            data-testid="onboarding-submit-button"
                            className="w-full bg-primary-k text-white rounded-md py-3 text-base hover:bg-primary-k/90 transition-colors disabled:opacity-60"
                        >
                            {submitting ? "Setting up…" : "Continue"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
