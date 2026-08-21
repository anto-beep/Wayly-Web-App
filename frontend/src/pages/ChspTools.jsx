/**
 * CHSP-1 v1 · Fee-check submission and transition consideration walkthrough.
 * Route: /app/chsp/tools
 */
import React, { useEffect, useState } from "react";
import useScrollToResult from "@/hooks/useScrollToResult";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
    ChevronLeft, Receipt, ArrowRight, CheckCircle2, AlertTriangle,
    ShieldAlert, ClipboardCheck, Home,
} from "lucide-react";
import PageIntro from "@/components/PageIntro";

const SERVICE_TYPES = [
    "domestic_assistance", "personal_care", "meals", "transport",
    "social_support_individual", "social_support_group", "allied_health",
    "nursing", "home_maintenance", "home_modifications_minor",
    "goods_equipment_assistive_technology", "respite", "specialised_support_services", "other",
];

const REASONS = [
    "current_supports_insufficient", "needs_increased_after_hospital_or_health_change",
    "need_specific_services_chsp_can't_provide", "want_greater_service_choice",
    "cost_of_current_services_burdensome", "recommended_by_health_professional", "family_recommendation", "other",
];

const CONSIDERATIONS = [
    { key: "understand_iat_process", label: "Understand the IAT (Initial Assessment Tool) process" },
    { key: "understand_classification_meaning", label: "Understand what SAH classifications 1-8 mean" },
    { key: "understand_contribution_will_change", label: "Understand my contribution will change on SAH" },
    { key: "understand_quarterly_budget_model", label: "Understand SAH's quarterly budget model" },
    { key: "understand_lifetime_cap", label: "Understand the lifetime contribution cap" },
    { key: "understand_ras_reassessment_vs_iat_direct", label: "Understand RAS reassessment vs going directly to IAT" },
];

function VarianceBadge({ status }) {
    const map = {
        within_tolerance: { tone: "bg-emerald-50 text-emerald-800 border-emerald-200", label: "Within tolerance", Icon: CheckCircle2 },
        minor_variance: { tone: "bg-amber-50 text-amber-800 border-amber-200", label: "Minor variance", Icon: AlertTriangle },
        material_variance: { tone: "bg-red-50 text-red-800 border-red-200", label: "Material variance", Icon: ShieldAlert },
    };
    const cfg = map[status] || map.within_tolerance;
    return (
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${cfg.tone}`} data-testid={`variance-badge-${status}`}>
            <cfg.Icon className="w-3 h-3"/> {cfg.label}
        </span>
    );
}

function ChspProfileCard({ profile, onCreate }) {
    const [status, setStatus] = useState("on_chsp");
    const [start, setStart] = useState("");
    const [busy, setBusy] = useState(false);
    if (profile) {
        return (
            <div className="rounded-2xl border border-primary-k/10 bg-white p-5" data-testid="chsp-profile-summary">
                <p className="text-xs uppercase tracking-wide text-primary-k/50">CHSP profile</p>
                <p className="text-sm text-primary-k mt-1">Status: {profile.current_chsp_status?.replace(/_/g, " ")}
                    {profile.chsp_start_date ? ` · started ${profile.chsp_start_date}` : ""}</p>
            </div>
        );
    }
    const submit = async () => {
        setBusy(true);
        try {
            await api.post("/chsp1/profile", { current_chsp_status: status, chsp_start_date: start || null });
            onCreate?.();
        } catch { toast.error("Could not save profile"); }
        finally { setBusy(false); }
    };
    return (
        <div className="rounded-2xl border border-primary-k/10 bg-white p-5 space-y-3" data-testid="chsp-profile-form">
            <p className="text-xs uppercase tracking-wide text-primary-k/50">Start a CHSP profile</p>
            <p className="text-sm text-muted-k">Set your current CHSP status so we can check fees and walk through transition to Support at Home.</p>
            <div className="grid sm:grid-cols-2 gap-3">
                <label className="text-xs text-muted-k">Status
                    <select value={status} onChange={e => setStatus(e.target.value)}
                            data-testid="chsp-status"
                            className="mt-1 w-full px-3 py-2 text-sm border rounded">
                        <option value="on_chsp">On CHSP</option>
                        <option value="considering_transition">Considering transition</option>
                        <option value="transitioning_to_sah">Transitioning to SAH</option>
                    </select>
                </label>
                <label className="text-xs text-muted-k">CHSP start date (optional)
                    <input type="date" value={start} onChange={e => setStart(e.target.value)}
                           data-testid="chsp-start-date"
                           className="mt-1 w-full px-3 py-2 text-sm border rounded"/>
                </label>
            </div>
            <button onClick={submit} disabled={busy} data-testid="chsp-profile-save"
                    className="inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-4 py-2 text-sm">
                <Home className="w-4 h-4"/> Save profile
            </button>
        </div>
    );
}

function FeeCheckForm({ services, onSubmitted }) {
    const [form, setForm] = useState({
        chsp_service_entry_id: "",
        invoice_or_statement_reference: "",
        service_type: "domestic_assistance",
        provider_name: "",
        billed_period_start: "",
        billed_period_end: "",
        billed_amount: "",
        units_billed: "",
        expected_amount: "",
    });
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const resultRef = useScrollToResult(Boolean(result));

    // When user picks an existing service entry, pre-fill fields.
    const onServiceChange = (id) => {
        const svc = services.find(s => s.id === id);
        if (svc) {
            setForm(f => ({
                ...f,
                chsp_service_entry_id: id,
                service_type: svc.service_type || f.service_type,
                provider_name: svc.provider_name || f.provider_name,
            }));
        } else {
            setForm(f => ({ ...f, chsp_service_entry_id: "" }));
        }
    };

    const submit = async () => {
        const required = ["invoice_or_statement_reference", "provider_name", "billed_period_start", "billed_period_end", "billed_amount", "expected_amount", "units_billed"];
        for (const k of required) {
            if (!form[k]) { toast.error(`Missing: ${k.replace(/_/g, " ")}`); return; }
        }
        setBusy(true);
        try {
            const { data } = await api.post("/chsp1/fee-checks", {
                ...form,
                billed_amount: Number(form.billed_amount),
                expected_amount: Number(form.expected_amount),
                chsp_service_entry_id: form.chsp_service_entry_id || null,
            });
            setResult(data);
            onSubmitted?.(data);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not check fee");
        } finally { setBusy(false); }
    };

    const openDispute = async () => {
        if (!result?.fee_check?.id) return;
        try {
            const { data } = await api.post(`/chsp1/fee-checks/${result.fee_check.id}/dispute`);
            if (data.case_id) toast.success("Dispute case opened in LOOP-1");
            else toast.info("Recorded, case creation not wired for this environment.");
        } catch { toast.error("Could not open dispute"); }
    };

    return (
        <div className="rounded-2xl border border-primary-k/10 bg-white p-5 space-y-4" data-testid="chsp-fee-check-form">
            <p className="text-xs uppercase tracking-wide text-primary-k/50">Fee check</p>
            <h2 className="font-heading text-xl text-primary-k">Was this CHSP invoice correct?</h2>
            <p className="text-sm text-muted-k">Enter what you were billed and what you expected. We&apos;ll flag anything outside a 2%/$5 tolerance.</p>

            <div className="grid sm:grid-cols-2 gap-3">
                {services.length > 0 && (
                    <label className="text-xs text-muted-k sm:col-span-2">Service entry (pre-fills provider / type)
                        <select value={form.chsp_service_entry_id} onChange={e => onServiceChange(e.target.value)}
                                data-testid="chsp-fc-service-entry"
                                className="mt-1 w-full px-3 py-2 text-sm border rounded">
                            <option value="">Manual entry</option>
                            {services.map(s => <option key={s.id} value={s.id}>{s.service_type} · {s.provider_name}</option>)}
                        </select>
                    </label>
                )}
                <label className="text-xs text-muted-k">Invoice / statement reference
                    <input value={form.invoice_or_statement_reference}
                           data-testid="chsp-fc-reference"
                           onChange={e => setForm({ ...form, invoice_or_statement_reference: e.target.value })}
                           className="mt-1 w-full px-3 py-2 text-sm border rounded"/>
                </label>
                <label className="text-xs text-muted-k">Provider
                    <input value={form.provider_name}
                           data-testid="chsp-fc-provider"
                           onChange={e => setForm({ ...form, provider_name: e.target.value })}
                           className="mt-1 w-full px-3 py-2 text-sm border rounded"/>
                </label>
                <label className="text-xs text-muted-k">Service type
                    <select value={form.service_type}
                            data-testid="chsp-fc-service-type"
                            onChange={e => setForm({ ...form, service_type: e.target.value })}
                            className="mt-1 w-full px-3 py-2 text-sm border rounded">
                        {SERVICE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                    </select>
                </label>
                <label className="text-xs text-muted-k">Units billed
                    <input value={form.units_billed}
                           data-testid="chsp-fc-units"
                           placeholder="e.g. 4 hours"
                           onChange={e => setForm({ ...form, units_billed: e.target.value })}
                           className="mt-1 w-full px-3 py-2 text-sm border rounded"/>
                </label>
                <label className="text-xs text-muted-k">Billed period start
                    <input type="date" value={form.billed_period_start}
                           data-testid="chsp-fc-period-start"
                           onChange={e => setForm({ ...form, billed_period_start: e.target.value })}
                           className="mt-1 w-full px-3 py-2 text-sm border rounded"/>
                </label>
                <label className="text-xs text-muted-k">Billed period end
                    <input type="date" value={form.billed_period_end}
                           data-testid="chsp-fc-period-end"
                           onChange={e => setForm({ ...form, billed_period_end: e.target.value })}
                           className="mt-1 w-full px-3 py-2 text-sm border rounded"/>
                </label>
                <label className="text-xs text-muted-k">Billed amount (AUD)
                    <input type="number" value={form.billed_amount}
                           data-testid="chsp-fc-billed"
                           onChange={e => setForm({ ...form, billed_amount: e.target.value })}
                           className="mt-1 w-full px-3 py-2 text-sm border rounded"/>
                </label>
                <label className="text-xs text-muted-k">Expected amount (AUD)
                    <input type="number" value={form.expected_amount}
                           data-testid="chsp-fc-expected"
                           onChange={e => setForm({ ...form, expected_amount: e.target.value })}
                           className="mt-1 w-full px-3 py-2 text-sm border rounded"/>
                </label>
            </div>

            <button onClick={submit} disabled={busy} data-testid="chsp-fc-submit"
                    className="inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-5 py-2 text-sm">
                <Receipt className="w-4 h-4"/> Check fee
            </button>

            {result && (
                <div ref={resultRef} className="mt-2 rounded-lg border border-kindred p-4 space-y-2 scroll-mt-20" data-testid="chsp-fc-result">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <p className="text-sm text-primary-k">
                            Variance ${result.fee_check.variance_amount.amount} ({result.fee_check.variance_percentage}%)
                        </p>
                        <VarianceBadge status={result.fee_check.variance_status}/>
                    </div>
                    {result.requires_explanation && (
                        <button onClick={openDispute} data-testid="chsp-fc-open-dispute"
                                className="inline-flex items-center gap-1 rounded-full bg-red-600 text-white px-4 py-1.5 text-xs">
                            <ShieldAlert className="w-3 h-3"/> Open dispute case
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

function TransitionWalkthrough() {
    const [step, setStep] = useState(0);
    const [reasons, setReasons] = useState([]);
    const [reasonsNotes, setReasonsNotes] = useState("");
    const [considerations, setConsiderations] = useState({});
    const [decision, setDecision] = useState("");
    const [decisionNotes, setDecisionNotes] = useState("");
    const [busy, setBusy] = useState(false);
    const [submitted, setSubmitted] = useState(null);

    const toggleReason = (r) => {
        setReasons(l => l.includes(r) ? l.filter(x => x !== r) : [...l, r]);
    };
    const toggleConsideration = (k) => {
        setConsiderations(c => ({ ...c, [k]: !c[k] }));
    };

    const submit = async () => {
        setBusy(true);
        try {
            const { data } = await api.post("/chsp1/transition-considerations", {
                reasons_for_considering_transition: reasons,
                reasons_notes: reasonsNotes || null,
                considerations_reviewed: considerations,
                decision: decision || null,
                decision_notes: decisionNotes || null,
            });
            setSubmitted(data.transition_consideration);
            toast.success("Saved");
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not save");
        } finally { setBusy(false); }
    };

    const steps = [
        {
            title: "Why are you thinking about a change?",
            content: (
                <div className="space-y-2">
                    {REASONS.map(r => (
                        <label key={r} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={reasons.includes(r)}
                                   data-testid={`tw-reason-${r}`}
                                   onChange={() => toggleReason(r)}/>
                            <span>{r.replace(/_/g, " ")}</span>
                        </label>
                    ))}
                    <textarea rows={2} value={reasonsNotes} onChange={e => setReasonsNotes(e.target.value)}
                              data-testid="tw-reasons-notes"
                              placeholder="Anything else?"
                              className="w-full px-3 py-2 text-sm border rounded"/>
                </div>
            ),
        },
        {
            title: "Understand the differences",
            content: (
                <div className="space-y-2">
                    <p className="text-xs text-muted-k">Tick each concept you feel comfortable with. Nothing gets submitted yet, this is just for your own confidence.</p>
                    {CONSIDERATIONS.map(c => (
                        <label key={c.key} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={!!considerations[c.key]}
                                   data-testid={`tw-consideration-${c.key}`}
                                   onChange={() => toggleConsideration(c.key)}/>
                            <span>{c.label}</span>
                        </label>
                    ))}
                </div>
            ),
        },
        {
            title: "Make a decision",
            content: (
                <div className="space-y-2">
                    <label className="text-xs text-muted-k">Decision (choose one)
                        <select value={decision} onChange={e => setDecision(e.target.value)}
                                data-testid="tw-decision"
                                className="mt-1 w-full px-3 py-2 text-sm border rounded">
                            <option value="">Not decided yet</option>
                            <option value="stay_on_chsp_no_change">Stay on CHSP, no change</option>
                            <option value="stay_on_chsp_review_services">Stay on CHSP, review services</option>
                            <option value="proceed_with_transition_seek_ras_reassessment">Proceed, request RAS reassessment</option>
                            <option value="proceed_with_transition_seek_iat_directly">Proceed, request IAT directly</option>
                            <option value="need_more_information">Need more information</option>
                        </select>
                    </label>
                    <textarea rows={2} value={decisionNotes} onChange={e => setDecisionNotes(e.target.value)}
                              data-testid="tw-decision-notes"
                              placeholder="Notes about this decision"
                              className="w-full px-3 py-2 text-sm border rounded"/>
                </div>
            ),
        },
    ];

    return (
        <div className="rounded-2xl border border-primary-k/10 bg-white p-5 space-y-4" data-testid="chsp-transition-walkthrough">
            <div>
                <p className="text-xs uppercase tracking-wide text-primary-k/50">Considering a move to Support at Home?</p>
                <h2 className="font-heading text-xl text-primary-k mt-1">Transition walkthrough</h2>
            </div>
            <div className="flex gap-2 flex-wrap">
                {steps.map((s, i) => (
                    <button key={i} onClick={() => setStep(i)}
                            data-testid={`tw-step-${i}`}
                            className={`text-[11px] px-3 py-1 rounded-full border ${step === i ? "bg-primary-k text-white border-primary-k" : "border-kindred text-muted-k hover:text-primary-k"}`}>
                        {i + 1}. {s.title}
                    </button>
                ))}
            </div>
            <div>{steps[step].content}</div>
            <div className="flex items-center gap-2">
                {step > 0 && <button onClick={() => setStep(step - 1)} className="text-xs text-muted-k">Back</button>}
                {step < steps.length - 1 && (
                    <button onClick={() => setStep(step + 1)} data-testid="tw-next"
                            className="inline-flex items-center gap-1 bg-primary-k text-white rounded-full px-4 py-1.5 text-sm">
                        Next <ArrowRight className="w-4 h-4"/>
                    </button>
                )}
                {step === steps.length - 1 && (
                    <button onClick={submit} disabled={busy} data-testid="tw-submit"
                            className="inline-flex items-center gap-1 bg-primary-k text-white rounded-full px-4 py-1.5 text-sm">
                        <ClipboardCheck className="w-4 h-4"/> Save decision
                    </button>
                )}
            </div>
            {submitted && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" data-testid="tw-saved">
                    Decision recorded. Reasons: {reasons.length || 0}. Considerations reviewed: {Object.values(considerations).filter(Boolean).length} / {CONSIDERATIONS.length}.
                </div>
            )}
        </div>
    );
}

export default function ChspTools() {
    const [profile, setProfile] = useState(null);
    const [services, setServices] = useState([]);

    const load = async () => {
        try {
            const { data } = await api.get("/chsp1/profile");
            setProfile(data.profile);
        } catch { setProfile(null); }
        try {
            const { data } = await api.get("/chsp1/service-entries");
            setServices(data.service_entries || []);
        } catch { setServices([]); }
    };
    useEffect(() => { load(); }, []);

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-6" data-testid="chsp-tools-root">
            <Link to="/app" className="inline-flex items-center gap-1 text-sm text-primary-k/60 hover:text-primary-k">
                <ChevronLeft className="w-4 h-4"/> Back
            </Link>
            <PageIntro
                eyebrow="Commonwealth Home Support Programme"
                title="Verify CHSP Billing. Consider a Move to Support at Home."
                description="Two decisions matter on CHSP: was I actually billed correctly, and should I transition to Support at Home? This tool walks you through both without pressure."
                whatItDoes="Runs a variance check on any CHSP invoice against what you expected to pay, and gives you a 3-step walkthrough for thinking through whether transitioning to SAH is right for you."
                howToUse={[
                    "Set your CHSP profile (status + start date).",
                    "Enter what your provider billed vs what you expected, we flag anything outside a 2% or $5 tolerance.",
                    "Open a dispute case straight from the result if the variance is material.",
                    "When ready, work through the 3-step transition walkthrough to record a considered decision.",
                ]}
                whatYouGet={[
                    "A variance verdict on every fee check (within tolerance / minor / material).",
                    "A ready-to-send dispute case if the invoice looks wrong.",
                    "A documented decision on whether to stay on CHSP or move to SAH.",
                ]}
            />

            <ChspProfileCard profile={profile} onCreate={load}/>
            {profile && (
                <>
                    <FeeCheckForm services={services} onSubmitted={() => load()}/>
                    <TransitionWalkthrough/>
                </>
            )}
        </div>
    );
}
