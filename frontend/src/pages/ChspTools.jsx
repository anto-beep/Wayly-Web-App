/**
 * CHSP-1 v1 · Fee-check submission and transition consideration walkthrough.
 * Route: /app/chsp/tools
 */
import React, { useEffect, useState } from "react";
import useScrollToResult from "@/hooks/useScrollToResult";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
    ChevronLeft, Receipt, ArrowRight, CheckCircle2, AlertTriangle,
    ShieldAlert, ClipboardCheck, Home, Clock, LifeBuoy, Mail, HelpCircle,
} from "lucide-react";
import PageIntro from "@/components/PageIntro";
import { serviceTypeLabel, chspStatusLabel, labelize } from "@/lib/labels";
import { formatDate } from "@/lib/formatDate";

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

const AUD = (v) => `$${Number(v ?? 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const WS1_VERDICT = {
    within: { tone: "bg-emerald-50 text-emerald-800 border-emerald-200", label: "Within tolerance", Icon: CheckCircle2 },
    minor: { tone: "bg-amber-50 text-amber-800 border-amber-200", label: "Minor", Icon: AlertTriangle },
    material: { tone: "bg-red-50 text-red-800 border-red-200", label: "Material", Icon: ShieldAlert },
    no_verdict: { tone: "bg-primary-k/5 text-primary-k/70 border-primary-k/15", label: "No verdict", Icon: HelpCircle },
};

// WS-3 · Access & Hardship. The service-continuity letter is always available;
// the hardship / fee-waiver letter is emphasised when a material overcharge is
// detected (spec E8).
function AccessHardshipCard({ providerName, emphasiseHardship }) {
    const navigate = useNavigate();
    const [busy, setBusy] = useState(null);
    const draft = async (kind) => {
        setBusy(kind);
        try {
            const { data } = await api.post("/chsp1/letter", { kind, provider_name: providerName || null });
            if (data?.editor_path) navigate(data.editor_path);
        } catch { toast.error("Could not draft the letter."); }
        finally { setBusy(null); }
    };
    return (
        <div className="rounded-2xl border border-primary-k/10 bg-white p-5 space-y-3" data-testid="chsp-access-hardship">
            <p className="text-xs uppercase tracking-wide text-primary-k/50">Access and hardship</p>
            <h2 className="font-heading text-xl text-primary-k">Keep services running, and get help with fees</h2>
            <p className="text-sm text-muted-k">The pain most CHSP clients feel is about access, not billing. Draft a letter to keep your services going, or start a hardship / fee-waiver request.</p>
            <div className="grid sm:grid-cols-2 gap-3">
                <button
                    onClick={() => draft("service_continuity")}
                    disabled={busy === "service_continuity"}
                    data-testid="chsp-service-continuity-letter"
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary-k/25 bg-white px-4 py-3 text-sm text-primary-k hover:bg-primary-k hover:text-white transition-colors disabled:opacity-50"
                >
                    <Mail className="w-4 h-4" /> Service continuity letter
                </button>
                <button
                    onClick={() => draft("hardship")}
                    disabled={busy === "hardship"}
                    data-testid="chsp-hardship-letter"
                    className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm transition-colors disabled:opacity-50 ${emphasiseHardship ? "bg-gold text-white hover:brightness-95" : "border border-primary-k/25 bg-white text-primary-k hover:bg-primary-k hover:text-white"}`}
                >
                    <LifeBuoy className="w-4 h-4" /> Apply for hardship / fee waiver
                </button>
            </div>
            {emphasiseHardship && (
                <p className="text-xs text-gold-800 bg-gold/10 border border-gold rounded-lg px-3 py-2" data-testid="chsp-hardship-hint">
                    A material overcharge can add up. If contributions are hard to meet, a hardship or fee-waiver request may help.
                </p>
            )}
        </div>
    );
}

// WS-1 · Per-unit Fee Check. Anchored on the provider's agreed per-unit rate,
// with a graceful degraded state and a staleness prompt.
function WS1FeeCheck({ services }) {
    const [form, setForm] = useState({
        invoice_reference: "", provider_name: "", service_type: "domestic_assistance",
        units_billed: "", units_received: "", agreed_rate: "",
        rate_effective_date: "", billed_period_start: "", billed_period_end: "", billed_amount: "",
    });
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);
    const resultRef = useScrollToResult(Boolean(result));

    const onServiceChange = (id) => {
        const svc = services.find((s) => s.id === id);
        if (svc) {
            setForm((f) => ({
                ...f,
                service_type: svc.service_type || f.service_type,
                provider_name: svc.provider_name || f.provider_name,
                agreed_rate: svc.hourly_rate_or_fee?.amount != null ? String(svc.hourly_rate_or_fee.amount) : f.agreed_rate,
                rate_effective_date: svc.start_date ? (formatDate(svc.start_date) || f.rate_effective_date) : f.rate_effective_date,
            }));
        }
    };

    const submit = async () => {
        for (const k of ["units_billed", "units_received", "billed_amount"]) {
            if (form[k] === "" || form[k] == null) { toast.error(`Missing: ${k.replace(/_/g, " ")}`); return; }
        }
        setBusy(true);
        try {
            const { data } = await api.post("/chsp1/fee-check/preview", {
                invoice_reference: form.invoice_reference || null,
                provider_name: form.provider_name || null,
                service_type: form.service_type,
                units_billed: Number(form.units_billed),
                units_received: Number(form.units_received),
                billed_amount: Number(form.billed_amount),
                agreed_rate: form.agreed_rate === "" ? null : Number(form.agreed_rate),
                rate_effective_date: form.rate_effective_date || null,
                billed_period_start: form.billed_period_start || null,
                billed_period_end: form.billed_period_end || null,
            });
            setResult(data.result);
        } catch (e) {
            toast.error(e?.response?.data?.detail || "Could not check the fee.");
        } finally { setBusy(false); }
    };

    const verdict = result ? (WS1_VERDICT[result.overall_verdict] || WS1_VERDICT.no_verdict) : null;

    return (
        <div className="rounded-2xl border border-primary-k/10 bg-white p-5 space-y-4" data-testid="chsp-ws1-fee-check">
            <p className="text-xs uppercase tracking-wide text-primary-k/50">Fee check</p>
            <h2 className="font-heading text-xl text-primary-k">Was this CHSP invoice correct?</h2>
            <p className="text-sm text-muted-k">We compare what you were billed against your provider&apos;s agreed per-unit rate. Enter the agreed rate so we can give you an authoritative verdict.</p>

            <div className="grid sm:grid-cols-2 gap-3">
                {services.length > 0 && (
                    <label className="text-xs text-muted-k sm:col-span-2">Service entry (pre-fills provider, type, rate)
                        <select onChange={(e) => onServiceChange(e.target.value)} data-testid="chsp-ws1-service-entry" className="mt-1 w-full px-3 py-2 text-sm border rounded">
                            <option value="">Manual entry</option>
                            {services.map((s) => <option key={s.id} value={s.id}>{serviceTypeLabel(s.service_type)} · {s.provider_name}</option>)}
                        </select>
                    </label>
                )}
                <label className="text-xs text-muted-k">Invoice reference
                    <input value={form.invoice_reference} data-testid="chsp-ws1-reference" onChange={(e) => setForm({ ...form, invoice_reference: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm border rounded" />
                </label>
                <label className="text-xs text-muted-k">Provider
                    <input value={form.provider_name} data-testid="chsp-ws1-provider" onChange={(e) => setForm({ ...form, provider_name: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm border rounded" />
                </label>
                <label className="text-xs text-muted-k">Service type
                    <select value={form.service_type} data-testid="chsp-ws1-service-type" onChange={(e) => setForm({ ...form, service_type: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm border rounded">
                        {SERVICE_TYPES.map((t) => <option key={t} value={t}>{serviceTypeLabel(t)}</option>)}
                    </select>
                </label>
                <label className="text-xs text-muted-k">Agreed per-unit rate (AUD)
                    <input type="number" value={form.agreed_rate} data-testid="chsp-ws1-agreed-rate" placeholder="e.g. 6.00" onChange={(e) => setForm({ ...form, agreed_rate: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm border rounded" />
                </label>
                <label className="text-xs text-muted-k">Rate effective date (DD/MM/YYYY)
                    <input type="text" inputMode="numeric" value={form.rate_effective_date} data-testid="chsp-ws1-rate-date" placeholder="DD/MM/YYYY" onChange={(e) => setForm({ ...form, rate_effective_date: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm border rounded" />
                </label>
                <label className="text-xs text-muted-k">Units billed
                    <input type="number" value={form.units_billed} data-testid="chsp-ws1-units-billed" placeholder="e.g. 4" onChange={(e) => setForm({ ...form, units_billed: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm border rounded" />
                </label>
                <label className="text-xs text-muted-k">Units received
                    <input type="number" value={form.units_received} data-testid="chsp-ws1-units-received" placeholder="e.g. 4" onChange={(e) => setForm({ ...form, units_received: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm border rounded" />
                </label>
                <label className="text-xs text-muted-k">Billed period start (DD/MM/YYYY)
                    <input type="text" inputMode="numeric" value={form.billed_period_start} data-testid="chsp-ws1-period-start" placeholder="DD/MM/YYYY" onChange={(e) => setForm({ ...form, billed_period_start: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm border rounded" />
                </label>
                <label className="text-xs text-muted-k">Billed period end (DD/MM/YYYY)
                    <input type="text" inputMode="numeric" value={form.billed_period_end} data-testid="chsp-ws1-period-end" placeholder="DD/MM/YYYY" onChange={(e) => setForm({ ...form, billed_period_end: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm border rounded" />
                </label>
                <label className="text-xs text-muted-k">Billed amount (AUD)
                    <input type="number" value={form.billed_amount} data-testid="chsp-ws1-billed" onChange={(e) => setForm({ ...form, billed_amount: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm border rounded" />
                </label>
            </div>

            <button onClick={submit} disabled={busy} data-testid="chsp-ws1-submit" className="inline-flex items-center gap-2 bg-primary-k text-white rounded-full px-5 py-2 text-sm disabled:opacity-50">
                <Receipt className="w-4 h-4" /> Check fee
            </button>

            {result && (
                <div ref={resultRef} className="mt-2 space-y-3 scroll-mt-20" data-testid="chsp-ws1-result">
                    {result.degraded ? (
                        <div className="rounded-xl border border-primary-k/20 bg-primary-k/[0.03] p-4" data-testid="chsp-ws1-degraded">
                            <div className="flex items-center gap-2 text-primary-k font-medium"><HelpCircle className="w-4 h-4" /> No verdict yet</div>
                            <p className="text-sm text-muted-k mt-1">We can&apos;t give an authoritative verdict without your provider&apos;s agreed per-unit rate. Add the agreed fee schedule for this provider and service, then run the check again.</p>
                        </div>
                    ) : (
                        <>
                            <div className={`rounded-xl border p-4 ${verdict.tone}`}>
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                    <span className="inline-flex items-center gap-1.5 font-semibold" data-testid="chsp-ws1-verdict">
                                        <verdict.Icon className="w-4 h-4" /> {result.verdict_label}
                                    </span>
                                    <span className="text-sm font-heading tabular-nums">Difference {AUD(result.amount_delta)}</span>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                                <div className="rounded-lg border border-kindred p-3"><div className="text-[10px] uppercase tracking-wide text-muted-k">Billed per unit</div><div className="text-primary-k tabular-nums mt-0.5">{AUD(result.billed_per_unit)}</div></div>
                                <div className="rounded-lg border border-kindred p-3"><div className="text-[10px] uppercase tracking-wide text-muted-k">Expected amount</div><div className="text-primary-k tabular-nums mt-0.5">{AUD(result.expected_amount)}</div></div>
                                <div className="rounded-lg border border-kindred p-3"><div className="text-[10px] uppercase tracking-wide text-muted-k">Rate check</div><div className="text-primary-k mt-0.5 capitalize">{result.rate_tier}</div></div>
                                <div className="rounded-lg border border-kindred p-3"><div className="text-[10px] uppercase tracking-wide text-muted-k">Units check</div><div className="text-primary-k mt-0.5 capitalize">{result.units_tier}</div></div>
                            </div>
                            {result.provisional && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="chsp-ws1-staleness">
                                    <div className="flex items-center gap-1.5 font-medium"><Clock className="w-4 h-4" /> Confirm this rate is current</div>
                                    <p className="mt-1">{result.rate_age_days != null ? `This agreed rate is ${result.rate_age_days} days old.` : "This billed period may span a contribution change."} This verdict is provisional until you confirm the rate still applies.</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            <AccessHardshipCard
                providerName={form.provider_name}
                emphasiseHardship={Boolean(result && !result.degraded && result.overall_verdict === "material")}
            />
        </div>
    );
}

// Agreed Rate Schedule management (edit / expire a saved per-unit rate).
function AgreedRateSchedule({ services, onChanged }) {
    const [editing, setEditing] = useState(null);
    const [rate, setRate] = useState("");
    const [eff, setEff] = useState("");
    const [busy, setBusy] = useState(false);
    const active = services.filter((s) => s.is_active !== false);

    const startEdit = (s) => {
        setEditing(s.id);
        setRate(s.hourly_rate_or_fee?.amount != null ? String(s.hourly_rate_or_fee.amount) : "");
        setEff(formatDate(s.start_date) || "");
    };
    const saveEdit = async (id) => {
        setBusy(true);
        try {
            await api.patch(`/chsp1/service-entries/${id}`, {
                hourly_rate_or_fee: rate === "" ? undefined : Number(rate),
                start_date: eff || undefined,
            });
            toast.success("Rate updated");
            setEditing(null);
            onChanged?.();
        } catch { toast.error("Could not update rate."); }
        finally { setBusy(false); }
    };
    const expire = async (id) => {
        setBusy(true);
        try {
            await api.post(`/chsp1/service-entries/${id}/expire`);
            toast.success("Rate expired");
            onChanged?.();
        } catch { toast.error("Could not expire rate."); }
        finally { setBusy(false); }
    };

    return (
        <div className="rounded-2xl border border-primary-k/10 bg-white p-5 space-y-3" data-testid="chsp-agreed-rate-schedule">
            <p className="text-xs uppercase tracking-wide text-primary-k/50">Agreed rate schedule</p>
            <h2 className="font-heading text-xl text-primary-k">Your saved provider rates</h2>
            <p className="text-sm text-muted-k">These pre-fill the Fee Check so you don&apos;t have to type the agreed rate each time. Keep them current, edit when a rate changes, expire one that no longer applies.</p>
            {active.length === 0 ? (
                <p className="text-sm text-muted-k italic" data-testid="chsp-rate-empty">No saved rates yet. Add a service on the mobile app, or enter the agreed rate directly in the Fee Check below.</p>
            ) : (
                <ul className="space-y-2" data-testid="chsp-rate-list">
                    {active.map((s) => (
                        <li key={s.id} className="rounded-xl border border-kindred p-3" data-testid={`chsp-rate-${s.id}`}>
                            {editing === s.id ? (
                                <div className="flex flex-wrap items-end gap-2">
                                    <label className="text-xs text-muted-k">Rate (AUD)
                                        <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} data-testid={`chsp-rate-edit-amount-${s.id}`} className="mt-1 block w-28 px-2 py-1.5 text-sm border rounded" />
                                    </label>
                                    <label className="text-xs text-muted-k">Effective (DD/MM/YYYY)
                                        <input type="text" value={eff} placeholder="DD/MM/YYYY" onChange={(e) => setEff(e.target.value)} data-testid={`chsp-rate-edit-date-${s.id}`} className="mt-1 block w-36 px-2 py-1.5 text-sm border rounded" />
                                    </label>
                                    <button onClick={() => saveEdit(s.id)} disabled={busy} data-testid={`chsp-rate-save-${s.id}`} className="text-xs rounded-full bg-primary-k text-white px-3 py-1.5">Save</button>
                                    <button onClick={() => setEditing(null)} className="text-xs rounded-full border border-primary-k/20 px-3 py-1.5">Cancel</button>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium text-primary-k">{serviceTypeLabel(s.service_type)} · {s.provider_name}</div>
                                        <div className="text-xs text-muted-k">{AUD(s.hourly_rate_or_fee?.amount ?? 0)} per unit{s.start_date ? ` · effective ${formatDate(s.start_date)}` : ""}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => startEdit(s)} data-testid={`chsp-rate-edit-${s.id}`} className="text-xs rounded-full border border-primary-k/25 px-3 py-1.5 text-primary-k hover:bg-primary-k hover:text-white">Edit</button>
                                        <button onClick={() => expire(s.id)} disabled={busy} data-testid={`chsp-rate-expire-${s.id}`} className="text-xs rounded-full border border-terracotta-200 text-terracotta-800 px-3 py-1.5 hover:bg-terracotta-50">Expire</button>
                                    </div>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

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
                <p className="text-sm text-primary-k mt-1">Status: {chspStatusLabel(profile.current_chsp_status)}
                    {profile.chsp_start_date ? ` · started ${formatDate(profile.chsp_start_date)}` : ""}</p>
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
                        <option value="transitioning_to_sah">Transitioning to Support at Home</option>
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
                        {SERVICE_TYPES.map(t => <option key={t} value={t}>{serviceTypeLabel(t)}</option>)}
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
                            <span>{labelize(r)}</span>
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
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="tw-two-sided">
                        <p className="font-medium">Support at Home is not automatically better.</p>
                        <p className="mt-1">Compared with CHSP, Support at Home <strong>can cost more</strong>, is <strong>means tested</strong>, and can involve <strong>waitlists</strong>. For many people, CHSP remains the right program.</p>
                    </div>
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
    const [ws1, setWs1] = useState(false);
    const [needsChange, setNeedsChange] = useState(false);

    const load = async () => {
        try {
            const { data } = await api.get("/chsp1/config");
            setWs1(Boolean(data?.chsp_tools_v1));
        } catch { setWs1(false); }
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
                title="Check your CHSP billing."
                description="See whether your CHSP invoice looks right. CHSP may be exactly the right program for you. If your needs have changed, you can also think through a move to Support at Home, without pressure."
                whatItDoes="Checks any CHSP invoice against your provider's agreed per-unit rate, and drafts letters to keep services running or apply for hardship. If your needs have changed, an optional walkthrough helps you think through Support at Home."
                howToUse={[
                    "Set your CHSP profile (status and start date).",
                    "Enter the agreed per-unit rate, units billed and received, and the billed amount.",
                    "Draft a service-continuity or hardship letter, or dispute a material overcharge.",
                    "Only if your needs have changed, work through the optional transition self-check.",
                ]}
                whatYouGet={[
                    "A per-unit verdict on every fee check (within tolerance, minor, or material).",
                    "Ready-to-send service-continuity and hardship / fee-waiver letters.",
                    "An optional, documented decision on whether to stay on CHSP or move to Support at Home.",
                ]}
            />

            <ChspProfileCard profile={profile} onCreate={load}/>
            {profile && (
                <>
                    {ws1 && <AgreedRateSchedule services={services} onChanged={load} />}
                    {ws1 ? <WS1FeeCheck services={services} /> : <FeeCheckForm services={services} onSubmitted={() => load()}/>}

                    <div className="rounded-2xl border border-primary-k/10 bg-white p-5 space-y-3" data-testid="chsp-fit-self-check">
                        <p className="text-xs uppercase tracking-wide text-primary-k/50">Is CHSP still the right fit?</p>
                        <p className="text-sm text-muted-k">Most people on CHSP are on the right program. You only need the transition walkthrough if your care needs have genuinely changed.</p>
                        <label className="flex items-center gap-2 text-sm text-primary-k">
                            <input type="checkbox" checked={needsChange} onChange={(e) => setNeedsChange(e.target.checked)} data-testid="chsp-needs-change" />
                            <span>My care needs have changed recently (for example after a hospital stay or a health change).</span>
                        </label>
                    </div>

                    {needsChange && <TransitionWalkthrough/>}

                    <div className="rounded-xl border border-primary-k/15 bg-primary-k/[0.03] p-4 text-xs text-muted-k" data-testid="chsp-disclaimer">
                        <p className="font-medium text-primary-k">Not financial or legal advice.</p>
                        <p className="mt-1">Wayly helps you understand and organise your aged-care information. It is not a substitute for professional financial, legal, or clinical advice. Verdicts and letters are generated to assist you and may contain errors, always check the detail against your own records before acting.</p>
                    </div>
                </>
            )}
        </div>
    );
}
