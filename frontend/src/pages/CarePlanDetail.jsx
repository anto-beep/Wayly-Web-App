/**
 * CarePlanDetail, /app/care-plans/:id
 *
 * Three tabs (per CPR-1 spec §C.3):
 *   1. Review, findings + meeting artefact
 *   2. Plan  , original preview (services, dates, budget)
 *   3. History, prior review runs
 *
 * Also exposes:
 *   * Re-run review button (POST /api/care-plans/:id/analyse)
 *   * Editable notes
 *   * Print meeting-artefact PDF (client-side; window.print for now)
 */
import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertOctagon, ArrowLeft, ChevronDown, ChevronUp, FileDown, Loader2, Mail, Printer, RefreshCw, Save, Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/formatDate";

const SEV_META = {
    compliance: { label: "Compliance", cls: "bg-terracotta text-white", Icon: AlertOctagon, ring: "ring-terracotta/40" },
    choice: { label: "Choice", cls: "bg-clay text-white", Icon: ShieldAlert, ring: "ring-clay/40" },
    efficiency: { label: "Efficiency", cls: "bg-gold text-white", Icon: Shield, ring: "ring-gold/40" },
    info: { label: "Info", cls: "bg-sage text-white", Icon: ShieldCheck, ring: "ring-sage/40" },
};

const CATEGORY_LABELS = {
    rights: "Statement of Rights",
    clinical: "Clinical adequacy",
    service_mix: "Service mix",
    budget: "Budget",
    cohort: "Cultural safety and cohort",
    timebound: "Time-bound triggers",
    choice: "Participant voice",
};

function FindingCard({ f, testid }) {
    const meta = SEV_META[f.severity] || SEV_META.info;
    return (
        <li
            className={`rounded-xl border border-kindred bg-surface p-5 ring-1 ${meta.ring}`}
            data-testid={testid}
        >
            <div className="flex items-start gap-3">
                <div
                    className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 ${meta.cls}`}
                >
                    <meta.Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span
                            className={`text-[9px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 ${meta.cls}`}
                        >
                            {meta.label}
                        </span>
                        <span className="text-[10px] text-muted-k uppercase tracking-wider">
                            {CATEGORY_LABELS[f.category] || f.category}
                        </span>
                        <span className="text-[10px] text-muted-k uppercase tracking-wider">
                            confidence: {f.confidence}
                        </span>
                    </div>
                    <div className="mt-1.5 text-sm font-medium text-primary-k">{f.title}</div>
                    <div className="mt-1 text-sm text-primary-k/85">{f.detail}</div>
                    {f.citation_source && (
                        <div className="mt-2 text-xs text-muted-k">
                            {f.citation_url ? (
                                <a
                                    href={f.citation_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="underline underline-offset-2 hover:text-primary-k"
                                >
                                    Source: {f.citation_source}
                                </a>
                            ) : (
                                <>Source: {f.citation_source}</>
                            )}
                        </div>
                    )}
                    {f.suggested_question && (
                        <div className="mt-3 rounded-lg bg-surface-2 p-3 text-sm">
                            <div className="text-[10px] uppercase tracking-wider text-muted-k mb-1">
                                Ask the provider
                            </div>
                            <div className="text-primary-k italic">
                                {f.suggested_question}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </li>
    );
}

function MeetingArtefact({ data, extraction, planId, onDownloadPdf, onDraftEmail }) {
    if (!data) return null;
    const compliance = data.findings.filter((f) => f.severity === "compliance");
    const choice = data.findings.filter((f) => f.severity === "choice");
    const efficiency = data.findings.filter((f) => f.severity === "efficiency");
    const info = data.findings.filter((f) => f.severity === "info");

    const grouped = [
        { label: "Compliance", items: compliance, cls: "text-terracotta" },
        { label: "Choice", items: choice, cls: "text-clay" },
        { label: "Efficiency", items: efficiency, cls: "text-gold" },
        { label: "Info", items: info, cls: "text-sage" },
    ];

    return (
        <div className="rounded-2xl border border-kindred bg-cream p-6 mb-8" data-testid="meeting-artefact">
            <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-k">
                        Meeting artefact
                    </div>
                    <h2 className="mt-1 text-xl font-serif tracking-tight text-primary-k">
                        For your provider meeting
                    </h2>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-2 text-xs text-primary-k hover:underline"
                    data-testid="btn-print-artefact"
                >
                    <Printer className="h-3.5 w-3.5" />
                    Print
                </button>
                <button
                    type="button"
                    onClick={onDownloadPdf}
                    className="inline-flex items-center gap-2 text-xs text-primary-k hover:underline"
                    data-testid="btn-download-pdf"
                >
                    <FileDown className="h-3.5 w-3.5" />
                    PDF
                </button>
                <button
                    type="button"
                    onClick={onDraftEmail}
                    className="inline-flex items-center gap-2 text-xs text-primary-k hover:underline"
                    data-testid="btn-draft-email"
                >
                    <Mail className="h-3.5 w-3.5" />
                    Follow-up email
                </button>
                </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 mb-5">
                <div className="rounded-lg bg-surface p-4">
                    <div className="text-[10px] uppercase tracking-wider text-muted-k mb-1">
                        Plan overview
                    </div>
                    <div className="text-sm text-primary-k">
                        <div>
                            <strong>Provider:</strong> {extraction?.provider_name || "Unspecified"}
                        </div>
                        <div>
                            <strong>Effective:</strong>{" "}
                            {extraction?.effective_from ? formatDate(extraction.effective_from) : ","}
                            {extraction?.effective_to && ` → ${formatDate(extraction.effective_to)}`}
                        </div>
                        {extraction?.classification && (
                            <div>
                                <strong>Classification:</strong> {extraction.classification}
                            </div>
                        )}
                        {extraction?.quarterly_budget && (
                            <div>
                                <strong>Quarterly budget:</strong> ${extraction.quarterly_budget.toLocaleString()}
                            </div>
                        )}
                    </div>
                </div>
                <div className="rounded-lg bg-surface p-4">
                    <div className="text-[10px] uppercase tracking-wider text-muted-k mb-1">
                        Findings summary
                    </div>
                    <div className="text-sm text-primary-k grid grid-cols-2 gap-1">
                        <div className="text-terracotta">
                            {compliance.length} compliance
                        </div>
                        <div className="text-clay">
                            {choice.length} choice
                        </div>
                        <div className="text-gold">
                            {efficiency.length} efficiency
                        </div>
                        <div className="text-sage">
                            {info.length} info
                        </div>
                    </div>
                </div>
            </div>

            <div className="rounded-lg bg-surface p-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-k mb-2">
                    Verbatim question script
                </div>
                <ol className="list-decimal pl-5 space-y-2 text-sm text-primary-k" data-testid="question-script">
                    {data.findings
                        .filter((f) => f.suggested_question)
                        .map((f, i) => (
                            <li key={i}>
                                <span className="italic">{f.suggested_question}</span>
                                {f.citation_source && (
                                    <span className="text-xs text-muted-k ml-1">
                                        ({f.citation_source})
                                    </span>
                                )}
                            </li>
                        ))}
                </ol>
            </div>

            <div className="mt-5 grid gap-3">
                {grouped.map(
                    (g) =>
                        g.items.length > 0 && (
                            <div key={g.label}>
                                <div
                                    className={`text-[10px] uppercase tracking-wider mb-1.5 ${g.cls}`}
                                >
                                    {g.label} findings ({g.items.length})
                                </div>
                                <ul className="pl-5 list-disc text-sm text-primary-k space-y-1">
                                    {g.items.map((f, i) => (
                                        <li key={i}>{f.title}</li>
                                    ))}
                                </ul>
                            </div>
                        )
                )}
            </div>

            <div className="mt-6 rounded-lg border border-dashed border-kindred p-4 text-xs text-muted-k">
                <div className="uppercase tracking-wider mb-1">Note-taking template</div>
                <div className="italic">
                    Space for you to jot the provider&apos;s answers alongside each question above.
                </div>
            </div>
        </div>
    );
}

export default function CarePlanDetail() {
    const { id } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [analyzing, setAnalyzing] = useState(false);
    const [error, setError] = useState("");
    const [tab, setTab] = useState("review");     // review | plan | history
    const [notesDraft, setNotesDraft] = useState("");
    const [notesSaving, setNotesSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const { data } = await api.get(`/care-plans/${id}`);
            setData(data);
            setNotesDraft(data?.plan?.notes || "");
        } catch (e) {
            setError(e?.response?.data?.detail || e?.message || "Failed to load care plan.");
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        load();
    }, [load]);

    const runAnalysis = async () => {
        setAnalyzing(true);
        try {
            await api.post(`/care-plans/${id}/analyse`);
            await load();
        } catch (e) {
            alert(e?.response?.data?.detail || e?.message || "Review failed.");
        } finally {
            setAnalyzing(false);
        }
    };

    const saveNotes = async () => {
        setNotesSaving(true);
        try {
            await api.patch(`/care-plans/${id}/notes`, { notes: notesDraft });
            await load();
        } catch (e) {
            alert(e?.response?.data?.detail || e?.message || "Save failed.");
        } finally {
            setNotesSaving(false);
        }
    };

    const [emailDraft, setEmailDraft] = useState(null);

    const downloadPdf = async () => {
        try {
            const response = await api.get(`/care-plans/${id}/artefact.pdf`, { responseType: "blob" });
            const blob = new Blob([response.data], { type: "application/pdf" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `care-plan-meeting-artefact-${id.slice(0, 8)}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) {
            alert(e?.response?.data?.detail || e?.message || "PDF export failed.");
        }
    };

    const draftEmail = async () => {
        try {
            const { data } = await api.get(`/care-plans/${id}/follow-up-email`);
            setEmailDraft(data);
        } catch (e) {
            alert(e?.response?.data?.detail || e?.message || "Email draft failed.");
        }
    };

    const closeEmailDraft = () => setEmailDraft(null);
    const copyEmailBody = async () => {
        if (!emailDraft) return;
        const full = `Subject: ${emailDraft.subject}\n\n${emailDraft.body}`;
        try {
            await navigator.clipboard.writeText(full);
            alert("Copied to clipboard");
        } catch (e) {
            alert("Copy failed, please select and copy manually.");
        }
    };

    if (loading) {
        return <div className="max-w-4xl mx-auto px-4 py-8 text-sm text-muted-k" data-testid="loading">Loading…</div>;
    }
    if (error) {
        return <div className="max-w-4xl mx-auto px-4 py-8 text-sm text-terracotta" data-testid="error">{error}</div>;
    }
    if (!data) return null;

    const { plan, extraction, findings, latest_run, history } = data;
    const canAnalyze = !!extraction;

    return (
        <div className="max-w-4xl mx-auto px-4 py-8 print:max-w-full print:px-0" data-testid="care-plan-detail">
            <Link
                to="/app/care-plans"
                className="inline-flex items-center gap-1.5 text-xs text-muted-k hover:text-primary-k print:hidden"
                data-testid="btn-back"
            >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Care Plans
            </Link>

            <div className="mt-4 flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                    <h1 className="text-3xl font-serif tracking-tight text-primary-k">
                        {plan.provider_name || "Care plan"}
                    </h1>
                    <div className="text-xs text-muted-k mt-1">
                        {plan.effective_from
                            ? `Effective ${formatDate(plan.effective_from)}${
                                  plan.effective_to ? ` → ${formatDate(plan.effective_to)}` : ""
                              }`
                            : `Uploaded ${formatDate(plan.uploaded_at)}`}
                        {plan.classification_at_review && (
                            <> · Classification {plan.classification_at_review}</>
                        )}
                    </div>
                </div>
                <button
                    type="button"
                    onClick={runAnalysis}
                    disabled={!canAnalyze || analyzing}
                    className="inline-flex items-center gap-2 rounded-full bg-primary-k text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 print:hidden transition-opacity"
                    data-testid="btn-run-analysis"
                >
                    {analyzing ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Analysing…
                        </>
                    ) : (
                        <>
                            <RefreshCw className="h-4 w-4" />
                            {latest_run ? "Re-run review" : "Run review"}
                        </>
                    )}
                </button>
            </div>

            {/* Tabs */}
            <div className="mt-6 border-b border-kindred flex gap-2 print:hidden">
                {[
                    { k: "review", label: `Review${findings ? ` (${findings.length})` : ""}` },
                    { k: "plan", label: "Plan" },
                    { k: "history", label: `History (${(history || []).length})` },
                ].map((t) => (
                    <button
                        key={t.k}
                        type="button"
                        onClick={() => setTab(t.k)}
                        className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                            tab === t.k
                                ? "border-primary-k text-primary-k"
                                : "border-transparent text-muted-k hover:text-primary-k"
                        }`}
                        data-testid={`tab-${t.k}`}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === "review" && (
                <div className="mt-6" data-testid="tab-content-review">
                    {!latest_run && (
                        <div className="rounded-xl border border-kindred bg-surface p-6 text-sm text-muted-k">
                            No review has been run for this plan yet. Click <strong>Run review</strong>{" "}
                            above to check the plan against the Statement of Rights, National Quality
                            Standards, and Aged Care Rules 2025.
                        </div>
                    )}
                    {latest_run && (
                        <>
                            <MeetingArtefact
                                data={{ findings }}
                                extraction={extraction}
                                planId={id}
                                onDownloadPdf={downloadPdf}
                                onDraftEmail={draftEmail}
                            />

                            <div>
                                <h2 className="text-lg font-serif tracking-tight text-primary-k mb-3">
                                    All findings
                                </h2>
                                {findings.length === 0 ? (
                                    <div className="text-sm text-muted-k">
                                        The last review produced no findings.
                                    </div>
                                ) : (
                                    <ul className="space-y-3">
                                        {findings.map((f, i) => (
                                            <FindingCard
                                                key={f.id || i}
                                                f={f}
                                                testid={`finding-card-${i}`}
                                            />
                                        ))}
                                    </ul>
                                )}
                            </div>

                            <div className="mt-8 rounded-xl border border-kindred bg-surface p-4">
                                <div className="flex items-center justify-between">
                                    <div className="text-sm font-medium text-primary-k">
                                        Your notes
                                    </div>
                                    <button
                                        type="button"
                                        onClick={saveNotes}
                                        disabled={notesSaving}
                                        className="inline-flex items-center gap-1.5 text-xs text-primary-k hover:underline disabled:opacity-50"
                                        data-testid="btn-save-notes"
                                    >
                                        <Save className="h-3.5 w-3.5" />
                                        {notesSaving ? "Saving…" : "Save"}
                                    </button>
                                </div>
                                <textarea
                                    value={notesDraft}
                                    onChange={(e) => setNotesDraft(e.target.value)}
                                    className="mt-2 w-full rounded-md border border-kindred bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-primary-k min-h-[90px]"
                                    placeholder="Notes, questions, follow-ups…"
                                    data-testid="notes-textarea"
                                />
                            </div>
                        </>
                    )}
                </div>
            )}

            {tab === "plan" && (
                <div className="mt-6 space-y-4" data-testid="tab-content-plan">
                    {extraction ? (
                        <>
                            <div className="rounded-xl border border-kindred bg-surface p-5">
                                <div className="text-[10px] uppercase tracking-wider text-muted-k mb-2">
                                    Plan header
                                </div>
                                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm text-primary-k">
                                    <div>
                                        <strong>Provider:</strong> {extraction.provider_name || ","}
                                    </div>
                                    <div>
                                        <strong>Classification:</strong> {extraction.classification || ","}
                                    </div>
                                    <div>
                                        <strong>Effective from:</strong>{" "}
                                        {extraction.effective_from
                                            ? formatDate(extraction.effective_from)
                                            : ","}
                                    </div>
                                    <div>
                                        <strong>Effective to:</strong>{" "}
                                        {extraction.effective_to
                                            ? formatDate(extraction.effective_to)
                                            : ","}
                                    </div>
                                    <div>
                                        <strong>Quarterly budget:</strong>{" "}
                                        {extraction.quarterly_budget
                                            ? `$${extraction.quarterly_budget.toLocaleString()}`
                                            : ","}
                                    </div>
                                </div>
                            </div>
                            <div className="rounded-xl border border-kindred bg-surface p-5">
                                <div className="text-[10px] uppercase tracking-wider text-muted-k mb-2">
                                    Services ({extraction.services?.length || 0})
                                </div>
                                {extraction.services?.length ? (
                                    <table className="w-full text-sm" data-testid="services-table">
                                        <thead>
                                            <tr className="text-left text-muted-k text-xs">
                                                <th className="pb-2 pr-4">Service</th>
                                                <th className="pb-2 pr-4">Stream</th>
                                                <th className="pb-2">Frequency</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {extraction.services.map((s, i) => (
                                                <tr key={i} className="border-t border-kindred/50">
                                                    <td className="py-2 pr-4">{s.description}</td>
                                                    <td className="py-2 pr-4">{s.stream}</td>
                                                    <td className="py-2 text-muted-k">
                                                        {s.frequency_text || ","}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                ) : (
                                    <div className="text-sm text-muted-k">
                                        No services detected in the plan text.
                                    </div>
                                )}
                            </div>
                            {extraction.narrative_text && (
                                <div className="rounded-xl border border-kindred bg-surface p-5">
                                    <div className="text-[10px] uppercase tracking-wider text-muted-k mb-2">
                                        Narrative
                                    </div>
                                    <p className="text-sm text-primary-k whitespace-pre-wrap">
                                        {extraction.narrative_text}
                                    </p>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="text-sm text-muted-k">
                            No structured extraction available.
                        </div>
                    )}
                </div>
            )}

            {tab === "history" && (
                <div className="mt-6 space-y-3" data-testid="tab-content-history">
                    {(history || []).length === 0 && (
                        <div className="text-sm text-muted-k">No prior review runs.</div>
                    )}
                    {(history || []).map((run, i) => (
                        <div
                            key={run.id || i}
                            className="rounded-xl border border-kindred bg-surface p-4 text-sm"
                            data-testid={`history-run-${i}`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="text-primary-k">
                                    {formatDate(run.triggered_at)} · {run.model_used}
                                </div>
                                <span
                                    className={`text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 ${
                                        run.status === "complete"
                                            ? "bg-sage text-white"
                                            : run.status === "failed"
                                            ? "bg-terracotta text-white"
                                            : "bg-gold text-white"
                                    }`}
                                >
                                    {run.status}
                                </span>
                            </div>
                            {run.failure_reason && (
                                <div className="mt-1 text-xs text-terracotta">
                                    {run.failure_reason}
                                </div>
                            )}
                            <div className="text-xs text-muted-k mt-1">
                                Prompt: {run.prompt_version} · Snapshot: {run.reference_snapshot_id}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Follow-up email draft modal */}
            {emailDraft && (
                <div
                    className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 print:hidden"
                    onClick={closeEmailDraft}
                    data-testid="email-draft-modal"
                >
                    <div
                        className="bg-surface border border-kindred rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-3 mb-4">
                            <div>
                                <div className="text-[10px] uppercase tracking-wider text-muted-k">
                                    Follow-up email draft
                                </div>
                                <h3 className="mt-1 text-lg font-serif tracking-tight text-primary-k">
                                    For after the meeting
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={closeEmailDraft}
                                className="text-muted-k hover:text-primary-k"
                                data-testid="btn-close-email-draft"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="rounded-lg border border-kindred bg-surface-2 p-3 mb-3">
                            <div className="text-[10px] uppercase tracking-wider text-muted-k mb-1">
                                Subject
                            </div>
                            <input
                                readOnly
                                value={emailDraft.subject}
                                className="w-full bg-transparent text-sm text-primary-k focus:outline-none"
                                data-testid="email-subject"
                            />
                        </div>
                        <div className="rounded-lg border border-kindred bg-surface-2 p-3 mb-4">
                            <div className="text-[10px] uppercase tracking-wider text-muted-k mb-1">
                                Body
                            </div>
                            <textarea
                                readOnly
                                value={emailDraft.body}
                                rows={16}
                                className="w-full bg-transparent text-sm text-primary-k focus:outline-none resize-none"
                                data-testid="email-body"
                            />
                        </div>
                        <div className="flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={closeEmailDraft}
                                className="text-xs text-muted-k hover:text-primary-k"
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={copyEmailBody}
                                className="inline-flex items-center gap-2 rounded-full bg-primary-k text-primary-foreground px-4 py-2 text-xs font-medium hover:opacity-90"
                                data-testid="btn-copy-email"
                            >
                                Copy to clipboard
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
