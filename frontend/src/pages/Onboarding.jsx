import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api, formatAUD, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import {
    HeartHandshake, Check, ArrowRight, ArrowLeft, Mail, Copy, Users, Upload,
    Loader2, Sparkles, X,
} from "lucide-react";

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

const STEPS = [
    { id: 1, label: "Your household" },
    { id: 2, label: "Email forwarding" },
    { id: 3, label: "Family members" },
    { id: 4, label: "First statement" },
];

export default function Onboarding() {
    const nav = useNavigate();
    const { refreshHousehold, household, user } = useAuth();
    const [step, setStep] = useState(household ? 2 : 1);
    const [householdForm, setHouseholdForm] = useState({
        participant_name: household?.participant_name || "",
        classification: household?.classification || 4,
        provider_name: household?.provider_name || "",
        is_grandfathered: household?.is_grandfathered || false,
    });
    const [savingHousehold, setSavingHousehold] = useState(false);

    const goNext = () => setStep((s) => Math.min(s + 1, STEPS.length));
    const goBack = () => setStep((s) => Math.max(s - 1, 1));
    const finish = () => nav(user?.role === "participant" ? "/participant" : "/app");

    const submitHousehold = async (e) => {
        e?.preventDefault();
        setSavingHousehold(true);
        try {
            await api.post("/household", householdForm);
            await refreshHousehold();
            toast.success("Household saved");
            goNext();
        } catch (err) {
            toast.error(extractErrorMessage(err, "Could not save household"));
        } finally {
            setSavingHousehold(false);
        }
    };

    const isFamilyPlan = (user?.plan || "").toLowerCase() === "family";

    return (
        <div className="min-h-screen bg-kindred">
            {/* Header strip */}
            <header className="border-b border-kindred bg-white/80 backdrop-blur-xl sticky top-0 z-30 safe-top">
                <div className="mx-auto max-w-3xl px-4 md:px-6 py-3 md:py-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary-k flex items-center justify-center">
                            <HeartHandshake className="h-4 w-4 text-white" />
                        </div>
                        <span className="font-heading text-base md:text-lg text-primary-k">Wayly</span>
                    </div>
                    <button
                        type="button"
                        onClick={finish}
                        data-testid="onboarding-skip-all"
                        className="text-xs md:text-sm text-muted-k hover:text-primary-k inline-flex items-center gap-1"
                    >
                        Skip setup <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                </div>
            </header>

            <div className="mx-auto max-w-3xl px-4 md:px-6 py-6 md:py-10">
                {/* Progress indicator */}
                <div className="flex items-center gap-1.5 md:gap-3 mb-6 md:mb-8" data-testid="onboarding-stepper">
                    {STEPS.map((s, i) => {
                        const done = step > s.id;
                        const active = step === s.id;
                        return (
                            <React.Fragment key={s.id}>
                                <div className="flex items-center gap-2">
                                    <div
                                        className={`flex items-center justify-center h-7 w-7 md:h-8 md:w-8 rounded-full text-xs font-medium border transition-colors ${
                                            done
                                                ? "bg-sage text-white border-sage"
                                                : active
                                                    ? "bg-primary-k text-white border-primary-k"
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

                {/* Mobile-only step label */}
                <div className="md:hidden mb-3 flex items-center gap-2">
                    <span className="overline">Step {step} of {STEPS.length}</span>
                    <span className="text-xs text-primary-k font-medium">· {STEPS[step - 1].label}</span>
                </div>

                <div className="bg-surface border border-kindred rounded-2xl p-5 md:p-8">
                    {step === 1 && (
                        <StepHousehold
                            form={householdForm}
                            setForm={setHouseholdForm}
                            saving={savingHousehold}
                            onSubmit={submitHousehold}
                        />
                    )}
                    {step === 2 && <StepEmailForwarding onNext={goNext} onBack={goBack} />}
                    {step === 3 && <StepFamilyInvite onNext={goNext} onBack={goBack} isFamilyPlan={isFamilyPlan} />}
                    {step === 4 && <StepFirstStatement onFinish={finish} onBack={goBack} />}
                </div>

                <p className="text-center text-xs text-muted-k mt-4">
                    All steps after Step 1 are optional — you can come back any time from Settings.
                </p>
            </div>
        </div>
    );
}

/* ---------- Step 1: Household ---------- */
function StepHousehold({ form, setForm, saving, onSubmit }) {
    const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    return (
        <form onSubmit={onSubmit} data-testid="step-household">
            <h1 className="font-heading text-2xl md:text-3xl text-primary-k tracking-tight">Tell us about your household</h1>
            <p className="text-muted-k mt-2 text-sm leading-relaxed">
                We use this to read statements correctly and calculate the right budget. You can change everything later.
            </p>
            <div className="mt-6 space-y-5">
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
                                className={`rounded-lg border p-3 text-left transition-colors tap-target ${
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
                <label className="flex items-start gap-3 rounded-lg border border-kindred p-3">
                    <input
                        type="checkbox"
                        checked={form.is_grandfathered}
                        onChange={(e) => setForm((f) => ({ ...f, is_grandfathered: e.target.checked }))}
                        data-testid="onboarding-grandfathered-toggle"
                        className="h-4 w-4 mt-0.5 accent-[var(--kindred-primary)]"
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
                    disabled={saving}
                    data-testid="onboarding-submit-button"
                    className="w-full bg-primary-k text-white rounded-md py-3 text-base hover:bg-[#16294a] transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
                >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                    {saving ? "Saving…" : "Continue"}
                </button>
            </div>
        </form>
    );
}

/* ---------- Step 2: Email Forwarding ---------- */
function StepEmailForwarding({ onNext, onBack }) {
    const [info, setInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let cancelled = false;
        api.get("/inbound/my-address")
            .then(({ data }) => { if (!cancelled) setInfo(data); })
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const copy = async () => {
        if (!info?.address) return;
        try {
            await navigator.clipboard.writeText(info.address);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {}
    };

    return (
        <div data-testid="step-email-forwarding">
            <div className="flex items-start gap-3">
                <div className="flex-none h-10 w-10 rounded-lg bg-gold/15 border border-gold/40 flex items-center justify-center">
                    <Mail className="h-5 w-5 text-primary-k" />
                </div>
                <div>
                    <h1 className="font-heading text-2xl md:text-3xl text-primary-k tracking-tight">Set up auto-forwarding</h1>
                    <p className="text-muted-k mt-2 text-sm leading-relaxed">
                        Forward your provider's monthly statement email to your private Wayly address. We'll decode it the moment it arrives.
                    </p>
                </div>
            </div>

            {loading ? (
                <div className="mt-6 py-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-k" /></div>
            ) : info?.address ? (
                <>
                    <div className="mt-6 rounded-xl border border-kindred bg-surface-2 p-4">
                        <div className="flex items-center gap-2 text-sm text-muted-k mb-2">
                            <Mail className="h-4 w-4" /> Your private forwarding address
                        </div>
                        <div className="flex items-stretch gap-2">
                            <code className="flex-1 bg-surface border border-kindred/60 rounded-md px-3 py-2 text-xs md:text-sm text-primary-k font-mono break-all">
                                {info.address}
                            </code>
                            <button
                                type="button"
                                onClick={copy}
                                data-testid="onboarding-copy-email"
                                className="inline-flex items-center gap-1.5 px-3 text-sm rounded-md bg-primary-k text-white hover:bg-[#16294a]"
                            >
                                {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}
                            </button>
                        </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-kindred p-4 text-sm text-primary-k">
                        <p className="font-medium mb-2">Quick set-up (Gmail):</p>
                        <ol className="list-decimal pl-5 space-y-1 text-muted-k">
                            <li>Open the most recent statement email from your provider.</li>
                            <li>Settings → <em>Forwarding and POP/IMAP → Add a forwarding address</em>, paste your Wayly address.</li>
                            <li>Confirm via the email we send, then create a filter that matches the provider's "From" address.</li>
                        </ol>
                        <p className="mt-3 text-xs text-muted-k">Outlook? Settings → Mail → Rules → Add new rule. Apple Mail? Mail → Settings → Rules.</p>
                    </div>
                </>
            ) : (
                <div className="mt-6 rounded-lg border border-terracotta/40 bg-terracotta/10 p-4 text-sm text-terracotta">
                    Couldn't load your forwarding address. You can set this up later from <em>Settings → Email forwarding</em>.
                </div>
            )}

            <div className="mt-6 flex items-center justify-between gap-2">
                <button
                    type="button"
                    onClick={onBack}
                    data-testid="onboarding-back"
                    className="inline-flex items-center gap-1 text-sm text-muted-k hover:text-primary-k px-3 py-2"
                >
                    <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={onNext}
                        data-testid="onboarding-skip-step"
                        className="text-sm text-muted-k hover:text-primary-k px-3 py-2"
                    >
                        Skip
                    </button>
                    <button
                        type="button"
                        onClick={onNext}
                        data-testid="onboarding-next"
                        className="bg-primary-k text-white rounded-md px-5 py-2.5 text-sm hover:bg-[#16294a] inline-flex items-center gap-2"
                    >
                        Continue <ArrowRight className="h-4 w-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ---------- Step 3: Family Invites ---------- */
function StepFamilyInvite({ onNext, onBack, isFamilyPlan }) {
    const [invites, setInvites] = useState([{ email: "", relationship: "sibling" }]);
    const [sending, setSending] = useState(false);

    const update = (i, k, v) => setInvites((arr) => arr.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));
    const addRow = () => setInvites((arr) => arr.length < 5 ? [...arr, { email: "", relationship: "sibling" }] : arr);
    const removeRow = (i) => setInvites((arr) => arr.filter((_, idx) => idx !== i));

    const submit = async () => {
        const valid = invites.filter((x) => x.email.trim() && x.email.includes("@"));
        if (!valid.length) {
            onNext();
            return;
        }
        setSending(true);
        let sent = 0;
        for (const inv of valid) {
            try {
                await api.post("/household/invite", { email: inv.email.trim(), role: "caregiver", relationship: inv.relationship });
                sent++;
            } catch (e) {
                toast.error(extractErrorMessage(e, `Couldn't invite ${inv.email}`));
            }
        }
        if (sent) toast.success(`${sent} invite${sent === 1 ? "" : "s"} sent`);
        setSending(false);
        onNext();
    };

    return (
        <div data-testid="step-family">
            <div className="flex items-start gap-3">
                <div className="flex-none h-10 w-10 rounded-lg bg-sage/15 border border-sage/40 flex items-center justify-center">
                    <Users className="h-5 w-5 text-primary-k" />
                </div>
                <div>
                    <h1 className="font-heading text-2xl md:text-3xl text-primary-k tracking-tight">Invite family members</h1>
                    <p className="text-muted-k mt-2 text-sm leading-relaxed">
                        {isFamilyPlan
                            ? "Up to 5 family members on the Family plan. They'll see the dashboard, statements, and family thread."
                            : "Solo plan supports just you. Upgrade to Family ($39/mo) for up to 5 seats — you can do this from Settings any time."}
                    </p>
                </div>
            </div>

            {isFamilyPlan ? (
                <div className="mt-6 space-y-3">
                    {invites.map((inv, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <input
                                type="email"
                                value={inv.email}
                                onChange={(e) => update(i, "email", e.target.value)}
                                placeholder="sibling@example.com"
                                data-testid={`invite-email-${i}`}
                                className="flex-1 min-w-0 rounded-md border border-kindred px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ring-primary-k"
                            />
                            <select
                                value={inv.relationship}
                                onChange={(e) => update(i, "relationship", e.target.value)}
                                data-testid={`invite-rel-${i}`}
                                className="rounded-md border border-kindred px-2 py-2.5 text-sm bg-surface focus:outline-none focus:ring-2 ring-primary-k"
                            >
                                <option value="sibling">Sibling</option>
                                <option value="spouse">Spouse</option>
                                <option value="child">Child</option>
                                <option value="other">Other</option>
                            </select>
                            {invites.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => removeRow(i)}
                                    aria-label="Remove"
                                    className="h-9 w-9 inline-flex items-center justify-center text-muted-k hover:text-terracotta"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    ))}
                    {invites.length < 5 && (
                        <button
                            type="button"
                            onClick={addRow}
                            data-testid="invite-add-row"
                            className="text-sm text-primary-k underline"
                        >
                            + Add another
                        </button>
                    )}
                </div>
            ) : (
                <div className="mt-6 rounded-lg border border-gold/40 bg-gold/10 p-4 text-sm text-primary-k">
                    Family invites are part of the Family plan. <a href="/settings/billing" className="underline">Upgrade in Settings</a>.
                </div>
            )}

            <div className="mt-6 flex items-center justify-between gap-2">
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
                        onClick={onNext}
                        data-testid="onboarding-skip-step"
                        className="text-sm text-muted-k hover:text-primary-k px-3 py-2"
                    >
                        Skip
                    </button>
                    <button
                        type="button"
                        onClick={submit}
                        disabled={sending}
                        data-testid="onboarding-next"
                        className="bg-primary-k text-white rounded-md px-5 py-2.5 text-sm hover:bg-[#16294a] inline-flex items-center gap-2 disabled:opacity-60"
                    >
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                        {isFamilyPlan && invites.some((i) => i.email.trim()) ? "Send invites & continue" : "Continue"}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ---------- Step 4: First Statement ---------- */
function StepFirstStatement({ onFinish, onBack }) {
    return (
        <div data-testid="step-first-statement">
            <div className="flex items-start gap-3">
                <div className="flex-none h-10 w-10 rounded-lg bg-primary-k/10 border border-primary-k/30 flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-primary-k" />
                </div>
                <div>
                    <h1 className="font-heading text-2xl md:text-3xl text-primary-k tracking-tight">Decode your first statement</h1>
                    <p className="text-muted-k mt-2 text-sm leading-relaxed">
                        Upload a recent monthly statement and we'll show you exactly what the figures mean — plus any anomalies worth flagging.
                    </p>
                </div>
            </div>

            <div className="mt-6 grid sm:grid-cols-2 gap-3">
                <a
                    href="/app/statements/upload"
                    data-testid="onboarding-upload-now"
                    className="group rounded-xl border border-kindred bg-surface-2 p-5 hover:bg-surface hover:border-primary-k transition-colors"
                >
                    <Upload className="h-6 w-6 text-primary-k" />
                    <div className="mt-3 font-heading text-lg text-primary-k">Upload a file or photo</div>
                    <p className="text-xs text-muted-k mt-1">PDF, Word, JPG, PNG, HEIC, WEBP. Decoded in ~30 sec.</p>
                    <div className="mt-3 inline-flex items-center gap-1 text-sm text-primary-k group-hover:gap-2 transition-all">
                        Upload now <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                </a>
                <a
                    href="/ai-tools/statement-decoder"
                    data-testid="onboarding-paste-text"
                    className="group rounded-xl border border-kindred bg-surface-2 p-5 hover:bg-surface hover:border-primary-k transition-colors"
                >
                    <Mail className="h-6 w-6 text-primary-k" />
                    <div className="mt-3 font-heading text-lg text-primary-k">Paste statement text</div>
                    <p className="text-xs text-muted-k mt-1">Copy-paste from an email or PDF. Best for trying the decoder fast.</p>
                    <div className="mt-3 inline-flex items-center gap-1 text-sm text-primary-k group-hover:gap-2 transition-all">
                        Paste & decode <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                </a>
            </div>

            <div className="mt-6 flex items-center justify-between gap-2">
                <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center gap-1 text-sm text-muted-k hover:text-primary-k px-3 py-2"
                >
                    <ArrowLeft className="h-4 w-4" /> Back
                </button>
                <button
                    type="button"
                    onClick={onFinish}
                    data-testid="onboarding-finish"
                    className="bg-primary-k text-white rounded-md px-5 py-2.5 text-sm hover:bg-[#16294a] inline-flex items-center gap-2"
                >
                    <Check className="h-4 w-4" /> Take me to my dashboard
                </button>
            </div>
        </div>
    );
}
