import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatAUD, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
    Check, ArrowRight, ArrowLeft, Loader2, ShieldCheck, Sparkles,
    HelpCircle, ChevronDown, ChevronUp, Mail, FileText, Calculator,
    Pill, AlertCircle,
} from "lucide-react";
import WaylyLogo from "@/components/WaylyLogo";
import { loadProgramReference, getProgramReferenceSync } from "@/lib/programReference";

const STEPS = [
    { id: 1, label: "Essentials" },
    { id: 2, label: "Authorisation" },
    { id: 3, label: "Recommended" },
    { id: 4, label: "All done" },
];

const PENSION_OPTIONS = [
    { v: "full_pension", label: "Full Age Pension", hint: "Receives 100% of the Age Pension" },
    { v: "part_pension", label: "Part Age Pension", hint: "Receives a reduced Age Pension under means testing" },
    { v: "cshc", label: "Commonwealth Seniors Health Card (CSHC)", hint: "Above pension threshold but holds CSHC" },
    { v: "self_funded", label: "Self-funded retiree", hint: "Not eligible for the Age Pension or CSHC" },
    { v: "unsure", label: "I'm not sure", hint: "Wayly will use a range — you can update later" },
];

const STATEMENT_DELIVERY_OPTIONS = [
    { v: "email", label: "Email" },
    { v: "post", label: "Post" },
    { v: "portal", label: "Provider portal" },
    { v: "other", label: "Other" },
];

const STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

const CAREGIVER_RELATIONSHIPS = [
    { v: "daughter", label: "Daughter" },
    { v: "son", label: "Son" },
    { v: "spouse_partner", label: "Spouse / partner" },
    { v: "sibling", label: "Sibling" },
    { v: "grandchild", label: "Grandchild" },
    { v: "friend", label: "Friend" },
    { v: "paid_carer", label: "Paid carer" },
    { v: "power_of_attorney", label: "Power of attorney" },
    { v: "other", label: "Other" },
];

function classificationsFromSnapshot(snap) {
    const out = [];
    for (let v = 1; v <= 8; v++) {
        const row = snap.classifications?.[String(v)];
        if (row) out.push({ v, annual: row.annual });
    }
    return out;
}

export default function Onboarding() {
    const nav = useNavigate();
    const { user, refreshHousehold } = useAuth();
    const [step, setStep] = useState(1);
    const [participantId, setParticipantId] = useState(null);
    const [participantDoc, setParticipantDoc] = useState(null);
    const [saving, setSaving] = useState(false);
    const [, _setSnapshotVersion] = useState(0);

    const [tier1, setTier1] = useState({
        first_name: "",
        last_name: "",
        dob: "",
        pension_status: "",
        classification_level: 0,
        provider_name: "",
        statement_delivery: "",
    });
    const [auth, setAuth] = useState({ confirmed: false });
    const [tier2, setTier2] = useState({
        preferred_name: "",
        mac_reference_number: "",
        suburb: "",
        state: "",
        is_grandfathered_hcp: "",
        hcp_level: null,
        caregiver_relationship: "",
        caregiver_phone: "",
    });

    useEffect(() => { loadProgramReference().then(() => _setSnapshotVersion((v) => v + 1)); }, []);
    const CLASSIFICATIONS = useMemo(() => classificationsFromSnapshot(getProgramReferenceSync()), []);

    const finish = () => nav(user?.role === "participant" ? "/participant" : "/app");

    const submitStep1 = async () => {
        const required = ["first_name", "last_name", "dob", "pension_status", "classification_level", "provider_name", "statement_delivery"];
        const missing = required.filter((k) => !tier1[k]);
        if (missing.length) {
            toast.error(`Please fill: ${missing.join(", ")}`);
            return;
        }
        setStep(2);
    };

    const submitStep2 = async () => {
        if (!auth.confirmed) {
            toast.error("Please confirm authorisation to continue.");
            return;
        }
        setSaving(true);
        try {
            const payload = { ...tier1, authorisation_confirmed: true };
            const { data } = await api.post("/participants", payload);
            setParticipantId(data.id);
            setParticipantDoc(data);
            try { await refreshHousehold(); } catch { /* no-op */ }
            toast.success("Participant saved");
            setStep(3);
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not save participant"));
        } finally {
            setSaving(false);
        }
    };

    const submitStep3 = async (skip = false) => {
        if (!participantId) {
            setStep(4);
            return;
        }
        if (skip) {
            setStep(4);
            return;
        }
        setSaving(true);
        try {
            const patch = {};
            Object.entries(tier2).forEach(([k, v]) => {
                if (v !== "" && v !== null && v !== undefined) patch[k] = v;
            });
            if (Object.keys(patch).length) {
                const { data } = await api.patch(`/participants/${participantId}`, patch);
                setParticipantDoc(data);
            }
            setStep(4);
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not save details"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-kindred">
            <header className="border-b border-kindred bg-white/80 backdrop-blur-xl sticky top-0 z-30 safe-top">
                <div className="mx-auto max-w-3xl px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <WaylyLogo size={32} className="rounded-md" />
                        <span className="font-heading text-base md:text-lg text-primary-k">Wayly</span>
                    </div>
                    {step === 4 && (
                        <button
                            type="button"
                            onClick={finish}
                            data-testid="onboarding-skip-all"
                            className="text-xs md:text-sm text-muted-k hover:text-primary-k inline-flex items-center gap-1"
                        >
                            Go to dashboard <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
            </header>

            <div className="mx-auto max-w-3xl px-4 md:px-6 py-6 md:py-10">
                {/* Stepper */}
                <div className="flex items-center gap-1.5 md:gap-3 mb-6 md:mb-8" data-testid="onboarding-stepper">
                    {STEPS.map((s, i) => {
                        const done = step > s.id;
                        const active = step === s.id;
                        return (
                            <React.Fragment key={s.id}>
                                <div className="flex items-center gap-2">
                                    <div
                                        className={`flex items-center justify-center h-7 w-7 md:h-8 md:w-8 rounded-full text-xs font-medium border transition-colors ${
                                            done ? "bg-sage text-white border-sage"
                                                 : active ? "bg-primary-k text-white border-primary-k"
                                                          : "bg-surface text-muted-k border-kindred"
                                        }`}
                                    >
                                        {done ? <Check className="h-3.5 w-3.5" /> : s.id}
                                    </div>
                                    <span className={`hidden md:inline text-xs ${active ? "text-primary-k font-medium" : "text-muted-k"}`}>
                                        {s.label}
                                    </span>
                                </div>
                                {i < STEPS.length - 1 && (
                                    <div className={`flex-1 h-px ${step > s.id ? "bg-sage" : "bg-kindred"}`} />
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>

                <div className="md:hidden mb-3 flex items-center gap-2">
                    <span className="overline">Step {step} of {STEPS.length}</span>
                    <span className="text-xs text-primary-k font-medium">· {STEPS[step - 1].label}</span>
                </div>

                <div className="bg-surface border border-kindred rounded-2xl p-5 md:p-8">
                    {step === 1 && (
                        <StepEssentials
                            form={tier1}
                            setForm={setTier1}
                            classifications={CLASSIFICATIONS}
                            onSubmit={submitStep1}
                        />
                    )}
                    {step === 2 && (
                        <StepAuthorisation
                            firstName={tier1.first_name}
                            confirmed={auth.confirmed}
                            setConfirmed={(v) => setAuth({ confirmed: v })}
                            onSubmit={submitStep2}
                            onBack={() => setStep(1)}
                            saving={saving}
                        />
                    )}
                    {step === 3 && (
                        <StepRecommended
                            form={tier2}
                            setForm={setTier2}
                            onContinue={() => submitStep3(false)}
                            onSkip={() => submitStep3(true)}
                            onBack={() => setStep(2)}
                            saving={saving}
                        />
                    )}
                    {step === 4 && (
                        <StepAllDone
                            doc={participantDoc}
                            participantId={participantId}
                            onFinish={finish}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

/* ---------- Step 1 ---------- */
function StepEssentials({ form, setForm, classifications, onSubmit }) {
    const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

    return (
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} data-testid="step-essentials">
            <h1 className="font-heading text-2xl md:text-3xl text-primary-k tracking-tight">The essentials</h1>
            <p className="text-muted-k mt-2 text-sm leading-relaxed">
                Wayly needs a few core details about the participant so its calculators and AI tools return accurate figures.
            </p>

            <div className="mt-6 grid sm:grid-cols-2 gap-4">
                <label className="block">
                    <span className="text-sm text-muted-k">First name</span>
                    <input
                        value={form.first_name}
                        onChange={update("first_name")}
                        required
                        data-testid="onboarding-first-name"
                        className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                    />
                </label>
                <label className="block">
                    <span className="text-sm text-muted-k">Last name</span>
                    <input
                        value={form.last_name}
                        onChange={update("last_name")}
                        required
                        data-testid="onboarding-last-name"
                        className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                    />
                </label>
            </div>

            <label className="block mt-4">
                <span className="text-sm text-muted-k">Date of birth</span>
                <input
                    type="date"
                    value={form.dob}
                    onChange={update("dob")}
                    required
                    data-testid="onboarding-dob"
                    className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                />
                <WhyHint>Used to match statements to the right participant and to detect age-linked supplements like enteral feeding.</WhyHint>
            </label>

            <fieldset className="mt-5">
                <legend className="text-sm text-muted-k mb-2">Pension status</legend>
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
                <span className="text-sm text-muted-k">Support at Home classification (1–8)</span>
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
                <span className="text-sm text-muted-k">Registered provider</span>
                <input
                    value={form.provider_name}
                    onChange={update("provider_name")}
                    required
                    placeholder="e.g. BlueBerry Care"
                    data-testid="onboarding-provider"
                    className="mt-1 w-full rounded-md border border-kindred px-3 py-2.5 focus:outline-none focus:ring-2 ring-primary-k"
                />
            </label>

            <fieldset className="mt-5">
                <legend className="text-sm text-muted-k mb-2">How do you receive their monthly statement?</legend>
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

/* ---------- Step 2 ---------- */
function StepAuthorisation({ firstName, confirmed, setConfirmed, onSubmit, onBack, saving }) {
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

/* ---------- Step 3 ---------- */
function StepRecommended({ form, setForm, onContinue, onSkip, onBack, saving }) {
    const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

    return (
        <div data-testid="step-recommended">
            <h1 className="font-heading text-2xl md:text-3xl text-primary-k tracking-tight">Recommended details</h1>
            <p className="text-muted-k mt-2 text-sm leading-relaxed">
                Optional but helpful — these sharpen Wayly&apos;s tool results and letter generation. You can skip and add them later.
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
                        <span className="text-sm text-muted-k">HCP level (1–4)</span>
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

/* ---------- Step 4 ---------- */
function StepAllDone({ doc, participantId, onFinish }) {
    const pct = Math.round(doc?.profile_completeness_pct || 0);
    const tier3Cards = [
        {
            field: "applicable_supplements",
            icon: Pill,
            title: "Add supplements",
            reason: "Add your parent's supplements so Wayly's budget calculator includes them.",
            href: "/ai-tools/budget-calculator",
        },
        {
            field: "part_pension_actual_independence_pct",
            icon: Calculator,
            title: "Add exact contribution rates",
            reason: "Paste the Independence + Everyday Living percentages from the Services Australia letter for precise contribution figures.",
            href: "/ai-tools/contribution-estimator",
        },
        {
            field: "full_address",
            icon: Mail,
            title: "Add full residential address",
            reason: "Wayly auto-fills the address on My Aged Care letters and reassessment requests.",
            href: "/ai-tools/reassessment-letter",
        },
        {
            field: "care_manager_name",
            icon: FileText,
            title: "Add care manager details",
            reason: "Wayly pre-fills the care manager's name + email on letters so you don't have to retype it every time.",
            href: "/ai-tools/reassessment-letter",
        },
    ];

    return (
        <div data-testid="step-all-done">
            <div className="flex items-start gap-3">
                <div className="flex-none h-10 w-10 rounded-lg bg-primary-k/10 border border-primary-k/30 flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-primary-k" />
                </div>
                <div>
                    <h1 className="font-heading text-2xl md:text-3xl text-primary-k tracking-tight">All done</h1>
                    <p className="text-muted-k mt-2 text-sm leading-relaxed">
                        {pct >= 90
                            ? "Your participant profile is ready — Wayly can give you its sharpest figures."
                            : pct >= 60
                                ? "Your participant profile has the essentials. You can sharpen Wayly's accuracy any time by filling the optional fields below."
                                : "Your participant profile is saved. Add the optional fields below whenever convenient."}
                    </p>
                </div>
            </div>

            <CompletenessRing pct={pct} />

            <div className="mt-6">
                <h2 className="font-heading text-lg text-primary-k">Sharpen Wayly&apos;s accuracy</h2>
                <p className="text-xs text-muted-k mt-1">Optional. Each card opens the relevant tool so you can fill the field in context.</p>
                <div className="mt-3 grid sm:grid-cols-2 gap-3">
                    {tier3Cards.map((c) => {
                        const Icon = c.icon;
                        return (
                            <a
                                key={c.field}
                                href={c.href}
                                data-testid={`tier3-card-${c.field}`}
                                className="group rounded-xl border border-kindred bg-surface-2 p-4 hover:bg-surface hover:border-primary-k transition-colors"
                            >
                                <Icon className="h-5 w-5 text-primary-k" />
                                <div className="mt-2 font-heading text-base text-primary-k">{c.title}</div>
                                <p className="text-xs text-muted-k mt-1 leading-relaxed">{c.reason}</p>
                                <div className="mt-2 inline-flex items-center gap-1 text-xs text-primary-k group-hover:gap-2 transition-all">
                                    Open tool <ArrowRight className="h-3 w-3" />
                                </div>
                            </a>
                        );
                    })}
                </div>
            </div>

            <button
                type="button"
                onClick={onFinish}
                data-testid="onboarding-finish"
                className="mt-7 w-full bg-primary-k text-white rounded-md py-3 text-base hover:bg-[#091D33] transition-colors inline-flex items-center justify-center gap-2"
            >
                <Check className="h-4 w-4" /> Go to dashboard
            </button>
        </div>
    );
}

/* ---------- helpers ---------- */
function CompletenessRing({ pct }) {
    const R = 36;
    const C = 2 * Math.PI * R;
    const dash = (pct / 100) * C;
    const colour = pct >= 90 ? "stroke-sage" : pct >= 60 ? "stroke-primary-k" : "stroke-terracotta";
    const label = pct >= 90 ? "Comprehensive" : pct >= 60 ? "Good enough" : "Getting started";
    return (
        <div className="mt-6 flex items-center gap-4" data-testid="completeness-ring">
            <svg width="92" height="92" viewBox="0 0 92 92" className="-rotate-90">
                <circle cx="46" cy="46" r={R} className="fill-none stroke-kindred" strokeWidth="6" />
                <circle
                    cx="46" cy="46" r={R}
                    className={`fill-none ${colour}`}
                    strokeWidth="6"
                    strokeDasharray={`${dash} ${C}`}
                    strokeLinecap="round"
                />
            </svg>
            <div>
                <div className="font-heading text-2xl text-primary-k" data-testid="completeness-pct">{pct}%</div>
                <div className="text-xs text-muted-k">Profile completeness — {label}</div>
            </div>
        </div>
    );
}

function WhyHint({ children }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="mt-1">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="inline-flex items-center gap-1 text-xs text-muted-k hover:text-primary-k"
            >
                <HelpCircle className="h-3.5 w-3.5" />
                Why we ask
                {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
            {open && (
                <p className="mt-1 text-xs text-muted-k leading-relaxed border-l-2 border-kindred pl-2">{children}</p>
            )}
        </div>
    );
}

/* ---------- Dashboard banner ---------- */
export function ProfileCompletionBanner() {
    const [items, setItems] = useState([]);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { data } = await api.get("/participants");
                if (cancelled) return;
                const incomplete = (data?.items || []).filter((p) => p.requires_completion);
                setItems(incomplete);
            } catch {
                /* unauthenticated or new user — show nothing */
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (dismissed || items.length === 0) return null;

    const first = items[0];
    const displayName = first.preferred_name || first.first_name || "your participant";

    return (
        <div
            data-testid="profile-completion-banner"
            className="rounded-xl border border-terracotta/40 bg-terracotta/10 px-4 py-3 flex items-center gap-3"
        >
            <AlertCircle className="h-5 w-5 text-terracotta flex-none" />
            <div className="flex-1 min-w-0">
                <div className="text-sm text-primary-k">
                    To keep using Wayly&apos;s accuracy guarantees, we need a few extra details about <strong>{displayName}</strong>.
                    This takes about a minute.
                </div>
                {items.length > 1 && (
                    <div className="text-xs text-muted-k mt-0.5">{items.length - 1} other participant(s) also need details.</div>
                )}
            </div>
            <a
                href="/onboarding"
                data-testid="profile-completion-cta"
                className="flex-none bg-terracotta text-white rounded-md px-3 py-1.5 text-xs hover:bg-terracotta/90 inline-flex items-center gap-1"
            >
                Complete now <ArrowRight className="h-3.5 w-3.5" />
            </a>
            <button
                type="button"
                onClick={() => setDismissed(true)}
                aria-label="Dismiss"
                className="flex-none text-muted-k hover:text-primary-k text-xs px-2"
            >
                Dismiss
            </button>
        </div>
    );
}
