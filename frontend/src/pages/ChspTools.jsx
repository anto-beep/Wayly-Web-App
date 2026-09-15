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
    Upload, FileText, Save, Trash2, Sparkles, ListChecks,
} from "lucide-react";
import PageIntro from "@/components/PageIntro";
import { RequiredBadge } from "@/components/RequiredHint";
import ChspInvoiceAnalyzer from "@/components/chsp/ChspInvoiceAnalyzer";
import OverchargeLetterModal from "@/components/chsp/OverchargeLetterModal";
import { serviceTypeLabel, chspStatusLabel, labelize } from "@/lib/labels";
import { formatDate } from "@/lib/formatDate";

// Explicit "Required" badge (shared app-wide style) so every field is clearly labelled.
const Req = () => <RequiredBadge className="ml-1 align-middle" />;

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

// Tile colours for the Rate Check / Units Check result tiles.
const WS1_TIER_TONE = {
    within: "bg-emerald-50 border-emerald-200 text-emerald-900",
    minor: "bg-amber-50 border-amber-200 text-amber-900",
    material: "bg-red-50 border-red-200 text-red-900",
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
                    className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm transition-colors disabled:opacity-50 ${emphasiseHardship ? "bg-gold text-white" : "border border-primary-k/25 bg-white text-primary-k hover:bg-primary-k hover:text-white"}`}
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
    const [parsing, setParsing] = useState(false);
    const [parseInfo, setParseInfo] = useState(null); // { plain_summary, next_steps }
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState([]);
    const [showPast, setShowPast] = useState(false);
    const [letterOpen, setLetterOpen] = useState(false);
    const fileRef = React.useRef(null);
    const resultRef = useScrollToResult(Boolean(result));

    // Normalise DD/MM/YYYY or ISO to YYYY-MM-DD for native date inputs.
    const toISODate = (v) => {
        if (!v) return "";
        const s = String(v);
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
        return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
    };

    const loadSaved = async () => {
        try { const { data } = await api.get("/chsp1/fee-check/saved"); setSaved(data.saved_checks || []); } catch { /* ignore */ }
    };
    useEffect(() => { loadSaved(); }, []);

    const onServiceChange = (id) => {
        const svc = services.find((s) => s.id === id);
        if (svc) {
            setForm((f) => ({
                ...f,
                service_type: svc.service_type || f.service_type,
                provider_name: svc.provider_name || f.provider_name,
                agreed_rate: svc.hourly_rate_or_fee?.amount != null ? String(svc.hourly_rate_or_fee.amount) : f.agreed_rate,
                rate_effective_date: svc.start_date ? (toISODate(svc.start_date) || f.rate_effective_date) : f.rate_effective_date,
            }));
        }
    };

    const onPickInvoice = async (e) => {
        const file = e.target.files?.[0];
        if (fileRef.current) fileRef.current.value = "";
        if (!file) return;
        setParsing(true);
        setParseInfo(null);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const { data } = await api.post("/chsp1/fee-check/parse-invoice", fd, { headers: { "Content-Type": "multipart/form-data" } });
            const fx = data.fields || {};
            setForm((f) => ({
                ...f,
                invoice_reference: fx.invoice_reference ?? f.invoice_reference,
                provider_name: fx.provider_name ?? f.provider_name,
                service_type: SERVICE_TYPES.includes(fx.service_type) ? fx.service_type : f.service_type,
                agreed_rate: fx.agreed_rate != null ? String(fx.agreed_rate) : f.agreed_rate,
                units_billed: fx.units_billed != null ? String(fx.units_billed) : f.units_billed,
                units_received: fx.units_received != null ? String(fx.units_received) : f.units_received,
                billed_amount: fx.billed_amount != null ? String(fx.billed_amount) : f.billed_amount,
                billed_period_start: toISODate(fx.billed_period_start) || f.billed_period_start,
                billed_period_end: toISODate(fx.billed_period_end) || f.billed_period_end,
            }));
            setParseInfo({ plain_summary: data.plain_summary, next_steps: data.next_steps || [] });
            toast.success("We read your invoice and filled in what we could.");
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Could not read that invoice.");
        } finally { setParsing(false); }
    };

    const submit = async () => {
        for (const k of ["agreed_rate", "units_billed", "units_received", "billed_amount"]) {
            if (form[k] === "" || form[k] == null) { toast.error(`Please enter ${k.replace(/_/g, " ")}`); return; }
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

    const saveCheck = async () => {
        if (!result) return;
        setSaving(true);
        try {
            await api.post("/chsp1/fee-check/save", {
                invoice_reference: form.invoice_reference || null,
                provider_name: form.provider_name || null,
                service_type: form.service_type,
                agreed_rate: form.agreed_rate === "" ? null : Number(form.agreed_rate),
                units_billed: form.units_billed === "" ? null : Number(form.units_billed),
                units_received: form.units_received === "" ? null : Number(form.units_received),
                billed_amount: form.billed_amount === "" ? null : Number(form.billed_amount),
                rate_effective_date: form.rate_effective_date || null,
                billed_period_start: form.billed_period_start || null,
                billed_period_end: form.billed_period_end || null,
                result,
            });
            toast.success("Saved to your past checks.");
            loadSaved();
        } catch { toast.error("Could not save this check."); }
        finally { setSaving(false); }
    };

    const deleteSaved = async (id) => {
        try { await api.delete(`/chsp1/fee-check/saved/${id}`); setSaved((l) => l.filter((s) => s.id !== id)); }
        catch { toast.error("Could not delete."); }
    };

    const verdict = result ? (WS1_VERDICT[result.overall_verdict] || WS1_VERDICT.no_verdict) : null;

    return (
        <div className="rounded-2xl bg-[#FBF1E7] border border-[#A5512B]/15 p-5 space-y-4" data-testid="chsp-ws1-fee-check">
            <div>
                <p className="text-xs uppercase tracking-wide text-[#A5512B] font-semibold">Step 2 · Check A Charge</p>
                <h2 className="font-heading text-xl text-primary-k">Was This CHSP Invoice Correct?</h2>
                <p className="text-sm text-muted-k">We compare what you were billed against your provider&apos;s agreed per-unit rate. Fields showing a Required label must be completed.</p>
            </div>

            {/* Upload + auto-read an invoice */}
            <div className="rounded-xl bg-white/70 border border-primary-k/10 p-4 space-y-2" data-testid="chsp-ws1-upload-card">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-start gap-2">
                        <div className="p-2 rounded-lg bg-primary-k/10"><FileText className="w-4 h-4 text-primary-k"/></div>
                        <div>
                            <p className="text-sm font-medium text-primary-k">Have the invoice handy?</p>
                            <p className="text-[11px] text-muted-k">Upload a PDF or photo and we&apos;ll read it and fill in the fields below for you.</p>
                        </div>
                    </div>
                    <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={onPickInvoice} className="hidden" data-testid="chsp-ws1-upload-input"/>
                    <button onClick={() => fileRef.current?.click()} disabled={parsing} data-testid="chsp-ws1-upload"
                            className="text-xs inline-flex items-center gap-1 px-3 py-2 rounded-full bg-primary-k text-white disabled:opacity-50">
                        <Upload className="w-3 h-3"/> {parsing ? "Reading…" : "Upload invoice"}
                    </button>
                </div>
                {parseInfo && (
                    <div className="rounded-lg bg-[#EEF3EE] p-3 space-y-2" data-testid="chsp-ws1-parse-summary">
                        <div className="flex items-center gap-1.5 text-sm text-primary-k font-medium"><Sparkles className="w-4 h-4"/> What we read</div>
                        <p className="text-sm text-muted-k">{parseInfo.plain_summary}</p>
                        {parseInfo.next_steps?.length > 0 && (
                            <ul className="space-y-1" data-testid="chsp-ws1-next-steps">
                                {parseInfo.next_steps.map((s, i) => (
                                    <li key={i} className="text-xs text-primary-k flex items-start gap-1.5"><ArrowRight className="w-3 h-3 mt-0.5 shrink-0"/> {s}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>

            <div className="grid sm:grid-cols-2 gap-3 rounded-xl bg-white/70 border border-primary-k/10 p-4">
                {services.length > 0 && (
                    <label className="text-xs text-muted-k sm:col-span-2">Service Entry (Pre-fills Provider, Type, Rate)
                        <select onChange={(e) => onServiceChange(e.target.value)} data-testid="chsp-ws1-service-entry" className="mt-1 w-full px-3 py-2 text-sm border rounded bg-white">
                            <option value="">Manual entry</option>
                            {services.map((s) => <option key={s.id} value={s.id}>{serviceTypeLabel(s.service_type)} · {s.provider_name}</option>)}
                        </select>
                    </label>
                )}
                <label className="text-xs text-muted-k">Invoice Reference
                    <input value={form.invoice_reference} data-testid="chsp-ws1-reference" onChange={(e) => setForm({ ...form, invoice_reference: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm border rounded" />
                </label>
                <label className="text-xs text-muted-k">Provider
                    <input value={form.provider_name} data-testid="chsp-ws1-provider" onChange={(e) => setForm({ ...form, provider_name: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm border rounded" />
                </label>
                <label className="text-xs text-muted-k">Service Type <Req/>
                    <select value={form.service_type} data-testid="chsp-ws1-service-type" onChange={(e) => setForm({ ...form, service_type: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm border rounded bg-white">
                        {SERVICE_TYPES.map((t) => <option key={t} value={t}>{serviceTypeLabel(t)}</option>)}
                    </select>
                </label>
                <label className="text-xs text-muted-k">Agreed Per-Unit Rate <Req/>
                    <div className="mt-1 relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-k">$</span>
                        <input type="number" required aria-required="true" value={form.agreed_rate} data-testid="chsp-ws1-agreed-rate" placeholder="6.00" onChange={(e) => setForm({ ...form, agreed_rate: e.target.value })} className="w-full pl-7 pr-3 py-2 text-sm border rounded" />
                    </div>
                </label>
                <label className="text-xs text-muted-k">Rate Effective Date
                    <input type="date" value={form.rate_effective_date} data-testid="chsp-ws1-rate-date" onChange={(e) => setForm({ ...form, rate_effective_date: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm border rounded" />
                </label>
                <label className="text-xs text-muted-k">Units Billed <Req/>
                    <input type="number" value={form.units_billed} data-testid="chsp-ws1-units-billed" placeholder="e.g. 4" onChange={(e) => setForm({ ...form, units_billed: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm border rounded" />
                </label>
                <label className="text-xs text-muted-k">Units Received <Req/>
                    <input type="number" value={form.units_received} data-testid="chsp-ws1-units-received" placeholder="e.g. 4" onChange={(e) => setForm({ ...form, units_received: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm border rounded" />
                </label>
                <label className="text-xs text-muted-k">Billed Period Start
                    <input type="date" value={form.billed_period_start} data-testid="chsp-ws1-period-start" onChange={(e) => setForm({ ...form, billed_period_start: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm border rounded" />
                </label>
                <label className="text-xs text-muted-k">Billed Period End
                    <input type="date" value={form.billed_period_end} data-testid="chsp-ws1-period-end" onChange={(e) => setForm({ ...form, billed_period_end: e.target.value })} className="mt-1 w-full px-3 py-2 text-sm border rounded" />
                </label>
                <label className="text-xs text-muted-k">Billed Amount <Req/>
                    <div className="mt-1 relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-k">$</span>
                        <input type="number" value={form.billed_amount} data-testid="chsp-ws1-billed" onChange={(e) => setForm({ ...form, billed_amount: e.target.value })} className="w-full pl-7 pr-3 py-2 text-sm border rounded" />
                    </div>
                </label>
            </div>

            <button onClick={submit} disabled={busy} data-testid="chsp-ws1-submit" className="inline-flex items-center gap-2 bg-primary-k text-white rounded-lg px-5 py-2 text-sm disabled:opacity-50">
                <Receipt className="w-4 h-4" /> Check Fee
            </button>

            {result && (
                <div ref={resultRef} className="mt-2 space-y-3 scroll-mt-20" data-testid="chsp-ws1-result">
                    {result.degraded ? (
                        <div className="rounded-xl border border-primary-k/20 bg-white p-4" data-testid="chsp-ws1-degraded">
                            <div className="flex items-center gap-2 text-primary-k font-medium"><HelpCircle className="w-4 h-4" /> No Verdict Yet</div>
                            <p className="text-sm text-muted-k mt-1">We can&apos;t give a clear verdict without your provider&apos;s agreed per-unit rate. Add it above (or in Your Saved Provider Rates), then run the check again.</p>
                        </div>
                    ) : (
                        <>
                            {/* Plain-English verdict */}
                            <div className={`rounded-xl border p-4 ${verdict.tone}`} data-testid="chsp-ws1-verdict-card">
                                <div className="flex items-start gap-2.5">
                                    <verdict.Icon className="w-5 h-5 mt-0.5 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                            <span className="font-semibold" data-testid="chsp-ws1-verdict">{result.verdict_headline || result.verdict_label}</span>
                                            {Number(result.amount_delta) !== 0
                                                ? <span className="text-sm font-heading tabular-nums">{Number(result.amount_delta) > 0 ? "Overbilled by " : "Billed under by "}{AUD(Math.abs(Number(result.amount_delta)))}</span>
                                                : <span className="text-sm font-medium">No difference</span>}
                                        </div>
                                        <p className="text-sm mt-1 opacity-90">{result.verdict_explanation}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Billed vs expected graphic */}
                            <div className="rounded-xl bg-white border border-kindred p-4 space-y-2.5" data-testid="chsp-ws1-graphic">
                                <p className="text-[11px] uppercase tracking-wide text-muted-k">What You Were Billed vs What We Expected</p>
                                {(() => {
                                    const billedAmt = Number(form.billed_amount || 0);
                                    const expectedAmt = Number(result.expected_amount || 0);
                                    const barMax = Math.max(billedAmt, expectedAmt, 1);
                                    const rows = [
                                        { k: "billed", label: "Billed", amt: billedAmt, color: Number(result.amount_delta) > 0 ? "#C0392B" : "#0E4D52" },
                                        { k: "expected", label: "Expected", amt: expectedAmt, color: "#3E6A4C" },
                                    ];
                                    return rows.map((r) => (
                                        <div key={r.k} data-testid={`chsp-ws1-bar-${r.k}`}>
                                            <div className="flex items-center justify-between text-xs text-primary-k"><span>{r.label}</span><span className="tabular-nums">{AUD(r.amt)}</span></div>
                                            <div className="mt-1 h-3 w-full rounded-full bg-primary-k/5 overflow-hidden">
                                                <div className="h-full rounded-full" style={{ width: `${Math.max(4, Math.round((r.amt / barMax) * 100))}%`, backgroundColor: r.color }} />
                                            </div>
                                        </div>
                                    ));
                                })()}
                            </div>

                            {/* Four explained tiles */}
                            <div className="grid sm:grid-cols-2 gap-3 text-sm">
                                <div className="rounded-lg bg-[#EAF3F3] border border-primary-k/10 p-3" data-testid="chsp-ws1-tile-billed">
                                    <div className="text-[10px] uppercase tracking-wide text-primary-k/60">Billed Per Unit</div>
                                    <div className="font-heading text-lg text-primary-k tabular-nums mt-0.5">{AUD(result.billed_per_unit)}</div>
                                    <div className="text-xs text-muted-k mt-0.5">What you were charged for each hour, visit or unit.</div>
                                </div>
                                <div className="rounded-lg bg-[#EAF3F3] border border-primary-k/10 p-3" data-testid="chsp-ws1-tile-expected">
                                    <div className="text-[10px] uppercase tracking-wide text-primary-k/60">Expected Amount</div>
                                    <div className="font-heading text-lg text-primary-k tabular-nums mt-0.5">{AUD(result.expected_amount)}</div>
                                    <div className="text-xs text-muted-k mt-0.5">Your agreed rate multiplied by the units you received.</div>
                                </div>
                                <div className={`rounded-lg border p-3 ${WS1_TIER_TONE[result.rate_tier] || WS1_TIER_TONE.within}`} data-testid="chsp-ws1-tile-rate">
                                    <div className="text-[10px] uppercase tracking-wide opacity-70">Rate Check</div>
                                    <div className="font-semibold mt-0.5">{result.rate_tier_label}</div>
                                    <div className="text-xs mt-0.5 opacity-90">{result.rate_explanation}</div>
                                </div>
                                <div className={`rounded-lg border p-3 ${WS1_TIER_TONE[result.units_tier] || WS1_TIER_TONE.within}`} data-testid="chsp-ws1-tile-units">
                                    <div className="text-[10px] uppercase tracking-wide opacity-70">Units Check</div>
                                    <div className="font-semibold mt-0.5">{result.units_tier_label}</div>
                                    <div className="text-xs mt-0.5 opacity-90">{result.units_explanation}</div>
                                </div>
                            </div>

                            {result.provisional && (
                                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="chsp-ws1-staleness">
                                    <div className="flex items-center gap-1.5 font-medium"><Clock className="w-4 h-4" /> Confirm This Rate Is Current</div>
                                    <p className="mt-1">{result.rate_age_days != null ? `This agreed rate is ${result.rate_age_days} days old.` : "This billed period may span a contribution change."} This verdict is provisional until you confirm the rate still applies.</p>
                                </div>
                            )}

                            <div className="flex flex-wrap gap-2">
                                {result.action_label && (
                                    <button onClick={() => setLetterOpen(true)} data-testid="chsp-ws1-draft-letter"
                                            className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-full bg-[#A5512B] text-white hover:bg-[#8f4523]">
                                        <Mail className="w-4 h-4"/> {result.action_label}
                                    </button>
                                )}
                                <button onClick={saveCheck} disabled={saving} data-testid="chsp-ws1-save"
                                        className="inline-flex items-center gap-1.5 text-sm px-4 py-2 rounded-full bg-primary-k text-white hover:bg-primary-k/90 disabled:opacity-50">
                                    <Save className="w-4 h-4"/> {saving ? "Saving…" : "Save This Check"}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Past checks */}
            {saved.length > 0 && (
                <div className="rounded-xl bg-white/70 border border-primary-k/10 overflow-hidden" data-testid="chsp-ws1-past">
                    <button onClick={() => setShowPast((s) => !s)} data-testid="chsp-ws1-past-toggle"
                            className="w-full flex items-center justify-between px-4 py-3 text-sm text-primary-k">
                        <span className="inline-flex items-center gap-2 font-medium"><ListChecks className="w-4 h-4"/> Past checks ({saved.length})</span>
                        <span className="text-xs text-muted-k">{showPast ? "Hide" : "Show"}</span>
                    </button>
                    {showPast && (
                        <ul className="divide-y divide-kindred">
                            {saved.map((s) => (
                                <li key={s.id} className="px-4 py-2.5 flex items-center justify-between gap-2" data-testid={`chsp-ws1-past-${s.id}`}>
                                    <div className="min-w-0">
                                        <p className="text-sm text-primary-k truncate">{s.provider_name || "Provider"} · {serviceTypeLabel(s.service_type)}</p>
                                        <p className="text-[11px] text-muted-k">{s.result?.verdict_label || "Checked"} · {formatDate(s.created_at) || ""}</p>
                                    </div>
                                    <button onClick={() => deleteSaved(s.id)} data-testid={`chsp-ws1-past-delete-${s.id}`} className="text-red-600 shrink-0"><Trash2 className="w-4 h-4"/></button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}

            <AccessHardshipCard
                providerName={form.provider_name}
                emphasiseHardship={Boolean(result && !result.degraded && result.overall_verdict === "material")}
            />

            <OverchargeLetterModal
                open={letterOpen}
                onClose={() => setLetterOpen(false)}
                facts={{
                    provider_name: form.provider_name || null,
                    invoice_reference: form.invoice_reference || null,
                    service_description: serviceTypeLabel(form.service_type),
                    period: form.billed_period_start ? `${formatDate(form.billed_period_start)}${form.billed_period_end ? ` – ${formatDate(form.billed_period_end)}` : ""}` : null,
                    units: form.units_billed ? Number(form.units_billed) : null,
                    unit_label: "units",
                    billed_unit_rate: result ? Number(result.billed_per_unit) : null,
                    agreed_rate: form.agreed_rate ? Number(form.agreed_rate) : null,
                    billed_amount: form.billed_amount ? Number(form.billed_amount) : null,
                    expected_amount: result ? Number(result.expected_amount) : null,
                }}
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
        <div className="rounded-2xl border border-[#3E6A4C]/20 bg-[#EEF3EE] p-5 space-y-3" data-testid="chsp-agreed-rate-schedule">
            <p className="text-xs uppercase tracking-wide text-[#3E6A4C] font-semibold">Setup · Agreed Rate Schedule</p>
            <h2 className="font-heading text-xl text-primary-k">Your Saved Provider Rates</h2>
            <p className="text-sm text-muted-k">These pre-fill the Fee Check so you don&apos;t have to type the agreed rate each time. Keep them current, edit when a rate changes, expire one that no longer applies.</p>
            {active.length === 0 ? (
                <p className="text-sm text-muted-k italic" data-testid="chsp-rate-empty">No saved rates yet. Add a service on the mobile app, or enter the agreed rate directly in the Fee Check below.</p>
            ) : (
                <ul className="space-y-2" data-testid="chsp-rate-list">
                    {active.map((s) => (
                        <li key={s.id} className="rounded-xl border border-kindred p-3" data-testid={`chsp-rate-${s.id}`}>
                            {editing === s.id ? (
                                <div className="flex flex-wrap items-end gap-2">
                                    <label className="text-xs text-muted-k">Rate
                                        <div className="mt-1 relative w-28">
                                            <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-k">$</span>
                                            <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} data-testid={`chsp-rate-edit-amount-${s.id}`} className="block w-full pl-6 pr-2 py-1.5 text-sm border rounded" />
                                        </div>
                                    </label>
                                    <label className="text-xs text-muted-k">Effective (DD/MM/YYYY)
                                        <input type="text" value={eff} placeholder="DD/MM/YYYY" onChange={(e) => setEff(e.target.value)} data-testid={`chsp-rate-edit-date-${s.id}`} className="mt-1 block w-36 px-2 py-1.5 text-sm border rounded" />
                                    </label>
                                    <button onClick={() => saveEdit(s.id)} disabled={busy} data-testid={`chsp-rate-save-${s.id}`} className="text-xs rounded-lg bg-primary-k text-white px-3 py-1.5">Save</button>
                                    <button onClick={() => setEditing(null)} className="text-xs rounded-lg border border-primary-k/20 px-3 py-1.5">Cancel</button>
                                </div>
                            ) : (
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium text-primary-k">{serviceTypeLabel(s.service_type)} · {s.provider_name}</div>
                                        <div className="text-xs text-muted-k">{AUD(s.hourly_rate_or_fee?.amount ?? 0)} per unit{s.start_date ? ` · effective ${formatDate(s.start_date)}` : ""}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => startEdit(s)} data-testid={`chsp-rate-edit-${s.id}`} className="text-xs rounded-lg border border-primary-k/25 px-3 py-1.5 text-primary-k hover:bg-primary-k hover:text-white">Edit</button>
                                        <button onClick={() => expire(s.id)} disabled={busy} data-testid={`chsp-rate-expire-${s.id}`} className="text-xs rounded-lg border border-terracotta-200 text-terracotta-800 px-3 py-1.5 hover:bg-terracotta-50">Expire</button>
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
                <label className="text-xs text-muted-k">Status <Req/>
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

function TWTile({ checked, onClick, label, testid, tone = "teal" }) {
    const ring = checked
        ? { teal: "border-[#0E4D52] bg-[#0E4D52]/[0.06]", clay: "border-clay bg-clay/[0.08]" }[tone]
        : "border-kindred bg-white hover:border-primary-k/40";
    return (
        <button type="button" onClick={onClick} data-testid={testid}
                className={`w-full flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${ring}`}>
            <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${checked ? (tone === "clay" ? "bg-clay border-clay" : "bg-[#0E4D52] border-[#0E4D52]") : "border-primary-k/30"}`}>
                {checked && <CheckCircle2 className="h-4 w-4 text-white" />}
            </span>
            <span className="text-sm text-primary-k">{label}</span>
        </button>
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

    const toggleReason = (r) => setReasons(l => l.includes(r) ? l.filter(x => x !== r) : [...l, r]);
    const toggleConsideration = (k) => setConsiderations(c => ({ ...c, [k]: !c[k] }));

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

    const STEP_META = [
        { title: "Why You're Considering A Change", icon: HelpCircle, tone: "clay", bg: "#FBEFE7", border: "border-clay/30" },
        { title: "Understand The Differences", icon: AlertTriangle, tone: "teal", bg: "#E7F1F1", border: "border-[#0E4D52]/20" },
        { title: "Make A Decision", icon: ClipboardCheck, tone: "teal", bg: "#EEF3EE", border: "border-sage/40" },
    ];

    const content = [
        (
            <div className="space-y-2" key="s0">
                <p className="text-sm text-primary-k font-medium">What&apos;s prompting the thought? Pick any that apply.</p>
                {REASONS.map(r => (
                    <TWTile key={r} tone="clay" checked={reasons.includes(r)} onClick={() => toggleReason(r)} testid={`tw-reason-${r}`} label={labelize(r)} />
                ))}
                <textarea rows={2} value={reasonsNotes} onChange={e => setReasonsNotes(e.target.value)}
                          data-testid="tw-reasons-notes" placeholder="Anything else? (optional)"
                          className="w-full mt-1 px-3 py-2 text-sm border border-kindred rounded-lg bg-white"/>
            </div>
        ),
        (
            <div className="space-y-3" key="s1">
                <div className="rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm text-primary-k flex items-start gap-3" data-testid="tw-two-sided">
                    <AlertTriangle className="w-5 h-5 text-gold shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold">Support at Home is not automatically better.</p>
                        <p className="mt-1">Compared with CHSP, Support at Home <strong>can cost more</strong>, is <strong>means tested</strong>, and can involve <strong>waitlists</strong>. For many people, CHSP remains the right program.</p>
                    </div>
                </div>
                <p className="text-xs text-muted-k">Tick each idea you feel comfortable with. Nothing is submitted yet — this is just for your own confidence.</p>
                {CONSIDERATIONS.map(c => (
                    <TWTile key={c.key} tone="teal" checked={!!considerations[c.key]} onClick={() => toggleConsideration(c.key)} testid={`tw-consideration-${c.key}`} label={c.label} />
                ))}
            </div>
        ),
        (
            <div className="space-y-2" key="s2">
                <label className="text-xs font-medium text-primary-k block">Your decision
                    <select value={decision} onChange={e => setDecision(e.target.value)} data-testid="tw-decision"
                            className="mt-1 w-full px-3 py-2.5 text-sm border border-kindred rounded-lg bg-white">
                        <option value="">Not decided yet</option>
                        <option value="stay_on_chsp_no_change">Stay on CHSP, no change</option>
                        <option value="stay_on_chsp_review_services">Stay on CHSP, review services</option>
                        <option value="proceed_with_transition_seek_ras_reassessment">Proceed, request RAS reassessment</option>
                        <option value="proceed_with_transition_seek_iat_directly">Proceed, request IAT directly</option>
                        <option value="need_more_information">Need more information</option>
                    </select>
                </label>
                <textarea rows={2} value={decisionNotes} onChange={e => setDecisionNotes(e.target.value)}
                          data-testid="tw-decision-notes" placeholder="Notes about this decision (optional)"
                          className="w-full px-3 py-2 text-sm border border-kindred rounded-lg bg-white"/>
            </div>
        ),
    ];

    const meta = STEP_META[step];
    return (
        <div className="rounded-2xl overflow-hidden shadow-sm" data-testid="chsp-transition-walkthrough">
            {/* Coloured header */}
            <div className="bg-[#0E4D52] px-6 py-5 text-white">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-white/15"><Home className="w-5 h-5" /></div>
                    <div>
                        <p className="text-xs uppercase tracking-wide text-white/70">Considering A Move To Support At Home?</p>
                        <h2 className="font-heading text-2xl">Transition Walkthrough</h2>
                    </div>
                </div>
                <p className="text-sm text-white/80 mt-2">A calm, three-step self-check. There&apos;s no pressure — many people stay on CHSP.</p>
            </div>

            {/* Visual stepper */}
            <div className="bg-white px-6 pt-5">
                <div className="flex items-center">
                    {STEP_META.map((s, i) => {
                        const done = i < step;
                        const active = i === step;
                        const Icon = s.icon;
                        return (
                            <React.Fragment key={i}>
                                <button onClick={() => setStep(i)} data-testid={`tw-step-${i}`} className="flex flex-col items-center gap-1 shrink-0">
                                    <span className={`flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors ${active ? "bg-[#0E4D52] border-[#0E4D52] text-white" : done ? "bg-sage border-sage text-white" : "bg-white border-kindred text-muted-k"}`}>
                                        {done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-4 w-4" />}
                                    </span>
                                    <span className={`text-[10px] max-w-[90px] text-center leading-tight ${active ? "text-primary-k font-medium" : "text-muted-k"}`}>{s.title}</span>
                                </button>
                                {i < STEP_META.length - 1 && <div className={`h-0.5 flex-1 mx-1 mb-4 rounded ${i < step ? "bg-sage" : "bg-kindred"}`} />}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>

            {/* Coloured content panel */}
            <div className="bg-white px-6 pb-6 pt-4">
                <div className={`rounded-xl border ${meta.border} p-4`} style={{ backgroundColor: meta.bg }}>
                    {content[step]}
                </div>
                <div className="flex items-center justify-between mt-4">
                    <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}
                            className="text-sm text-muted-k disabled:opacity-40" data-testid="tw-back">← Back</button>
                    {step < STEP_META.length - 1 ? (
                        <button onClick={() => setStep(step + 1)} data-testid="tw-next"
                                className="inline-flex items-center gap-1 bg-primary-k text-white rounded-full px-5 py-2 text-sm">
                            Next <ArrowRight className="w-4 h-4"/>
                        </button>
                    ) : (
                        <button onClick={submit} disabled={busy} data-testid="tw-submit"
                                className="inline-flex items-center gap-1 bg-primary-k text-white rounded-full px-5 py-2 text-sm">
                            <ClipboardCheck className="w-4 h-4"/> Save Decision
                        </button>
                    )}
                </div>
                {submitted && (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" data-testid="tw-saved">
                        Decision recorded. Reasons: {reasons.length || 0}. Concepts reviewed: {Object.values(considerations).filter(Boolean).length} / {CONSIDERATIONS.length}.
                    </div>
                )}
            </div>
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
                    {/* Is CHSP still the right fit? — surfaced up top, not buried at the bottom. */}
                    <div className="rounded-2xl border border-[#0E4D52]/20 bg-[#E7F1F1] p-5 space-y-3" data-testid="chsp-fit-self-check">
                        <div className="flex items-start gap-3">
                            <div className="p-2 rounded-full bg-[#0E4D52]/10"><Home className="w-5 h-5 text-[#0E4D52]" /></div>
                            <div>
                                <p className="text-xs uppercase tracking-wide text-[#0E4D52]/70">Is CHSP still the right fit?</p>
                                <p className="text-sm text-primary-k mt-1">Most people on CHSP are on the right program. You only need the transition walkthrough if your care needs have genuinely changed.</p>
                            </div>
                        </div>
                        <label className="flex items-center gap-2 text-sm text-primary-k bg-white/70 rounded-xl px-3 py-2.5 cursor-pointer">
                            <input type="checkbox" checked={needsChange} onChange={(e) => setNeedsChange(e.target.checked)} data-testid="chsp-needs-change" />
                            <span>My care needs have changed recently (for example after a hospital stay or a health change).</span>
                        </label>
                    </div>

                    {needsChange && <TransitionWalkthrough/>}

                    <ChspInvoiceAnalyzer />

                    {ws1 && <AgreedRateSchedule services={services} onChanged={load} />}
                    {ws1 ? <WS1FeeCheck services={services} /> : <FeeCheckForm services={services} onSubmitted={() => load()}/>}

                    <div className="rounded-xl border border-primary-k/15 bg-primary-k/[0.03] p-4 text-xs text-muted-k" data-testid="chsp-disclaimer">
                        <p className="font-medium text-primary-k">Not financial or legal advice.</p>
                        <p className="mt-1">Wayly helps you understand and organise your aged-care information. It is not a substitute for professional financial, legal, or clinical advice. Verdicts and letters are generated to assist you and may contain errors, always check the detail against your own records before acting.</p>
                    </div>
                </>
            )}
        </div>
    );
}
