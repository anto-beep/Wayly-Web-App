/**
 * CarePlanStore, /app/care-plans
 *
 * Register of care plans a user has uploaded, showing:
 *   * status (active / uploaded / superseded / deleted),
 *   * effective dates,
 *   * classification,
 *   * finding counts by severity,
 *   * quick-open + delete actions.
 *
 * Feeds off GET /api/care-plans and GET /api/care-plans/archived/list.
 * Detail view lives at /app/care-plans/:id.
 */
import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertOctagon, ArchiveRestore, Bell, ChevronRight, FileText, GitCompare, Plus, Shield, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/formatDate";
import PageIntro from "@/components/PageIntro";

const SEV_META = {
    compliance: { label: "Compliance", cls: "bg-terracotta text-white", Icon: AlertOctagon },
    choice: { label: "Choice", cls: "bg-clay text-white", Icon: ShieldAlert },
    efficiency: { label: "Efficiency", cls: "bg-gold text-white", Icon: Shield },
    info: { label: "Info", cls: "bg-sage text-white", Icon: ShieldCheck },
};

function FindingCountsRow({ counts }) {
    if (!counts) return null;
    if ((counts.total || 0) === 0) {
        return (
            <div className="text-xs text-muted-k" data-testid="findings-none">
                No review run yet
            </div>
        );
    }
    return (
        <div className="flex flex-wrap items-center gap-1.5" data-testid="findings-counts">
            {Object.entries(counts)
                .filter(([k, v]) => k !== "total" && v > 0)
                .map(([sev, count]) => {
                    const m = SEV_META[sev] || SEV_META.info;
                    return (
                        <span
                            key={sev}
                            className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider rounded-full px-2 py-0.5 ${m.cls}`}
                            data-testid={`finding-count-${sev}`}
                        >
                            <m.Icon className="h-3 w-3" />
                            {count} {m.label}
                        </span>
                    );
                })}
        </div>
    );
}

function RowContent({ plan }) {
    return (
        <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-primary-k">
                {plan.provider_name || "Unspecified provider"}
            </div>
            <div className="text-xs text-muted-k mt-0.5">
                {plan.effective_from ? (
                    <>
                        Effective {formatDate(plan.effective_from)}
                        {plan.effective_to && ` → ${formatDate(plan.effective_to)}`}
                    </>
                ) : (
                    <>Uploaded {formatDate(plan.uploaded_at)}</>
                )}
                {plan.classification_at_review && (
                    <span className="ml-2">
                        · Class {plan.classification_at_review}
                    </span>
                )}
            </div>
            <div className="mt-2">
                <FindingCountsRow counts={plan.latest_findings_by_severity} />
            </div>
        </div>
    );
}

export default function CarePlanStore() {
    const navigate = useNavigate();
    const [plans, setPlans] = useState([]);
    const [archived, setArchived] = useState([]);
    const [prompts, setPrompts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showArchived, setShowArchived] = useState(false);
    // Compare mode
    const [compareMode, setCompareMode] = useState(false);
    const [selected, setSelected] = useState([]);   // [id, id]

    const load = async () => {
        setLoading(true);
        setError("");
        try {
            const [active, arch, promptResp] = await Promise.all([
                api.get("/care-plans"),
                api.get("/care-plans/archived/list"),
                api.get("/care-plans/prompts/re-review").catch(() => ({ data: { prompts: [] } })),
            ]);
            setPlans(active?.data?.care_plans || []);
            setArchived(arch?.data?.care_plans || []);
            setPrompts(promptResp?.data?.prompts || []);
        } catch (e) {
            setError(e?.response?.data?.detail || e?.message || "Failed to load care plans.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const softDelete = async (id) => {
        // Optimistic UX: show confirm, hit endpoint, reload
        if (!window.confirm("Move this care plan to trash? You can restore it within 30 days.")) return;
        try {
            await api.delete(`/care-plans/${id}`);
            await load();
        } catch (e) {
            alert(e?.response?.data?.detail || e?.message || "Delete failed.");
        }
    };

    const restore = async (id) => {
        try {
            await api.post(`/care-plans/${id}/restore`);
            await load();
        } catch (e) {
            alert(e?.response?.data?.detail || e?.message || "Restore failed.");
        }
    };

    const toggleSelectForCompare = (id) => {
        setSelected((prev) => {
            if (prev.includes(id)) return prev.filter((p) => p !== id);
            if (prev.length >= 2) return [prev[1], id];    // FIFO
            return [...prev, id];
        });
    };
    const runCompare = () => {
        if (selected.length === 2) {
            navigate(`/app/care-plans/compare/${selected[0]}/${selected[1]}`);
        }
    };

    const list = showArchived ? archived : plans;

    return (
        <div className="max-w-5xl mx-auto px-4 py-8" data-testid="care-plan-store">
            <div className="flex items-start justify-between gap-4 mb-6">
                <PageIntro
                    eyebrow="Care Plans"
                    title="Every Care Plan, Reviewed"
                    description="Every support plan you have uploaded through the Support Plan Reviewer, with the latest findings and rights checks. Upload a new plan to run a fresh review before your next meeting."
                    whatItDoes="Stores each plan version, runs Statement-of-Rights checks against it, and surfaces the findings by severity so you know what to raise with the provider."
                    howToUse={[
                        "Upload a new plan using the button.",
                        "Wayly runs a rights and quality-standard review.",
                        "Open a plan to see the findings and take action.",
                        "Compare two plans side-by-side to see what changed.",
                    ]}
                    whatYouGet={[
                        "A rights-informed review of every plan you've received.",
                        "Change tracking between plan versions.",
                        "A quiet nudge if a plan is due for review.",
                    ]}
                    className="flex-1 min-w-0"
                />
                <Link
                    to="/ai-tools/care-plan-reviewer"
                    className="inline-flex items-center gap-2 rounded-full bg-primary-k text-primary-foreground px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
                    data-testid="btn-upload-care-plan"
                >
                    <Plus className="h-4 w-4" />
                    Upload Plan
                </Link>
            </div>

            {/* Re-review reminders (Section I) */}
            {prompts.length > 0 && (
                <div className="mb-5 rounded-xl border border-clay bg-clay/5 p-4" data-testid="re-review-prompts">
                    <div className="flex items-start gap-2">
                        <Bell className="h-4 w-4 mt-0.5 text-clay flex-shrink-0" />
                        <div className="flex-1">
                            <div className="text-sm font-medium text-primary-k">
                                {prompts.length} plan{prompts.length === 1 ? "" : "s"} may need a re-review
                            </div>
                            <ul className="mt-2 space-y-1.5">
                                {prompts.slice(0, 4).map((p, i) => (
                                    <li key={i} className="text-xs text-primary-k/85 flex items-center gap-2 flex-wrap" data-testid={`re-review-prompt-${i}`}>
                                        <span className="text-[10px] uppercase tracking-wider bg-clay text-white rounded-full px-2 py-0.5">
                                            {p.trigger.replace(/_/g, " ")}
                                        </span>
                                        <span>{p.message}</span>
                                        <Link to={`/app/care-plans/${p.care_plan_id}`} className="text-clay hover:underline">
                                            Open plan →
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            <div className="mb-4 flex items-center gap-2 flex-wrap">
                <button
                    type="button"
                    onClick={() => setShowArchived(false)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        !showArchived
                            ? "bg-surface-2 text-primary-k"
                            : "text-muted-k hover:bg-surface-2"
                    }`}
                    data-testid="tab-active"
                >
                    Active ({plans.length})
                </button>
                <button
                    type="button"
                    onClick={() => setShowArchived(true)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        showArchived
                            ? "bg-surface-2 text-primary-k"
                            : "text-muted-k hover:bg-surface-2"
                    }`}
                    data-testid="tab-archived"
                >
                    Trash / archived ({archived.length})
                </button>
                <div className="flex-1" />
                <button
                    type="button"
                    onClick={() => { setCompareMode((v) => !v); setSelected([]); }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        compareMode ? "bg-primary-k text-white" : "text-muted-k hover:bg-surface-2"
                    }`}
                    data-testid="btn-compare-mode"
                >
                    <GitCompare className="h-3.5 w-3.5" />
                    {compareMode ? "Cancel compare" : "Compare plans"}
                </button>
                {compareMode && selected.length === 2 && (
                    <button
                        type="button"
                        onClick={runCompare}
                        className="inline-flex items-center gap-1.5 bg-clay text-white rounded-full px-3 py-1.5 text-xs font-medium hover:opacity-90"
                        data-testid="btn-run-compare"
                    >
                        Compare selected
                        <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                )}
            </div>
            {compareMode && (
                <div className="mb-3 text-xs text-muted-k" data-testid="compare-help">
                    Pick 2 plans to compare side-by-side. Selected: {selected.length} of 2.
                </div>
            )}

            {loading && (
                <div className="text-sm text-muted-k" data-testid="loading">
                    Loading…
                </div>
            )}
            {error && (
                <div
                    className="rounded-lg border border-terracotta/40 bg-terracotta/5 p-4 text-sm text-terracotta"
                    data-testid="error"
                >
                    {error}
                </div>
            )}
            {!loading && !error && list.length === 0 && (
                <div
                    className="rounded-xl border border-kindred bg-surface p-8 text-center"
                    data-testid="empty-state"
                >
                    <FileText className="h-8 w-8 mx-auto text-muted-k mb-3" />
                    <div className="text-sm text-muted-k">
                        {showArchived
                            ? "No archived or deleted plans."
                            : "You have not uploaded a care plan yet."}
                    </div>
                    {!showArchived && (
                        <Link
                            to="/ai-tools/care-plan-reviewer"
                            className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary-k underline underline-offset-4"
                        >
                            Upload your first plan
                        </Link>
                    )}
                </div>
            )}

            {!loading && !error && list.length > 0 && (
                <ul className="space-y-3" data-testid="care-plan-list">
                    {list.map((plan) => (
                        <li
                            key={plan.id}
                            className={`rounded-xl border bg-surface p-4 transition-colors ${
                                compareMode && selected.includes(plan.id) ? "border-clay ring-1 ring-clay" : "border-kindred hover:border-primary-k"
                            }`}
                            data-testid={`care-plan-row-${plan.id}`}
                        >
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                {compareMode ? (
                                    <button
                                        type="button"
                                        onClick={() => toggleSelectForCompare(plan.id)}
                                        className="min-w-0 flex-1 flex items-start gap-3 text-left"
                                        data-testid={`btn-select-compare-${plan.id}`}
                                    >
                                        <div className="mt-1 flex-shrink-0">
                                            <div className={`h-4 w-4 rounded border-2 flex items-center justify-center ${
                                                selected.includes(plan.id) ? "bg-clay border-clay" : "border-kindred"
                                            }`}>
                                                {selected.includes(plan.id) && <span className="text-white text-xs">✓</span>}
                                            </div>
                                        </div>
                                        <RowContent plan={plan} />
                                    </button>
                                ) : (
                                    <Link
                                        to={`/app/care-plans/${plan.id}`}
                                        className="min-w-0 flex-1 flex items-start gap-3 group"
                                    >
                                        <FileText className="h-5 w-5 text-primary-k mt-0.5 flex-shrink-0" />
                                        <RowContent plan={plan} />
                                    </Link>
                                )}
                                {!compareMode && (
                                <div className="flex items-center gap-1.5">
                                    {plan.status === "deleted" ? (
                                        <button
                                            type="button"
                                            onClick={() => restore(plan.id)}
                                            className="inline-flex items-center gap-1.5 text-xs text-primary-k hover:underline"
                                            data-testid={`btn-restore-${plan.id}`}
                                        >
                                            <ArchiveRestore className="h-3.5 w-3.5" />
                                            Restore
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => softDelete(plan.id)}
                                            className="inline-flex items-center gap-1.5 text-xs text-muted-k hover:text-terracotta transition-colors"
                                            data-testid={`btn-delete-${plan.id}`}
                                            title="Move to trash"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                    <Link
                                        to={`/app/care-plans/${plan.id}`}
                                        className="p-1.5 hover:bg-surface-2 rounded-full transition-colors"
                                        aria-label="Open plan"
                                    >
                                        <ChevronRight className="h-4 w-4 text-muted-k" />
                                    </Link>
                                </div>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
