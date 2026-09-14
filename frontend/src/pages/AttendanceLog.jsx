/**
 * SDL-1 v1 · Service Delivery Attendance Log.
 * Route: /app/participants/:id/attendance
 *
 * Expected vs observed care visits. Confirm as expected (one tap), flag a
 * variance, or dispute a billed-but-not-delivered visit (opens a case).
 * Reconcile against decoded statements and surface concern patterns.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { api } from "@/lib/api";
import PageIntro from "@/components/PageIntro";
import { Button } from "@/components/ui/button";
import {
    CheckCircle2, AlertTriangle, Paperclip, CalendarPlus, RefreshCw, ShieldAlert,
    Clock, X, Loader2,
} from "lucide-react";

const STATUS_META = {
    unconfirmed: { label: "Unconfirmed", cls: "bg-primary-k/5 text-primary-k/60 border-primary-k/10" },
    confirmed_as_expected: { label: "Confirmed", cls: "bg-emerald-50 text-emerald-700 border-emerald-100" },
    confirmed_with_variance: { label: "Variance", cls: "bg-amber-50 text-amber-700 border-amber-100" },
    provider_no_show: { label: "No show", cls: "bg-orange-50 text-orange-700 border-orange-100" },
    participant_absent: { label: "Was absent", cls: "bg-amber-50 text-amber-700 border-amber-100" },
    disputed: { label: "Disputed", cls: "bg-red-50 text-red-700 border-red-100" },
    unknown_declined_to_answer: { label: "Unknown", cls: "bg-primary-k/5 text-primary-k/60 border-primary-k/10" },
};
const RECON_META = {
    billed_and_matched: { label: "Matched", cls: "text-emerald-700" },
    billed_but_disputed_by_user: { label: "Billed · disputed", cls: "text-red-600" },
    attendance_but_never_billed: { label: "Not billed", cls: "text-amber-700" },
    not_yet_billed: { label: "Pending", cls: "text-muted-k" },
    partial_match: { label: "Partial", cls: "text-amber-700" },
};
const DISPUTE_REASONS = [
    ["service_did_not_occur_at_all", "The service did not occur at all"],
    ["worker_did_not_arrive", "The worker did not arrive"],
    ["participant_was_in_hospital", "They were in hospital"],
    ["participant_was_absent_but_billed", "They were absent but it was billed"],
    ["different_service_than_billed", "A different service than billed"],
    ["duration_significantly_shorter_than_billed", "Much shorter than billed"],
    ["wrong_worker_but_service_occurred", "Wrong worker, but service happened"],
    ["other", "Something else"],
];
const FILTERS = [
    ["all", "All"],
    ["unconfirmed", "Unconfirmed"],
    ["disputed", "Disputes"],
];
const PATTERN_LABEL = {
    multiple_disputes_same_provider: "Multiple disputes with the same provider",
    confirmed_missed_visits_despite_billing: "Repeated missed visits",
    repeated_worker_substitution: "The worker keeps changing",
    concentrated_no_shows: "A cluster of no-shows",
};

function fmtDate(iso) {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleString("en-AU", {
            weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
        });
    } catch { return String(iso).slice(0, 16); }
}

function DisputeModal({ record, onClose, onDone }) {
    const [reason, setReason] = useState("service_did_not_occur_at_all");
    const [details, setDetails] = useState("");
    const [saving, setSaving] = useState(false);
    const submit = async () => {
        setSaving(true);
        try {
            await api.post(`/sdl1/attendance-records/${record.id}/dispute`, {
                dispute_reason: reason, dispute_details: details,
            });
            toast.success("Issue reported. We've opened a case to track it.");
            onDone();
        } catch { toast.error("Could not report the issue."); }
        finally { setSaving(false); }
    };
    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" data-testid="sdl1-dispute-modal" onClick={onClose}>
            <div className="bg-white rounded-2xl max-w-lg w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between">
                    <h3 className="font-heading text-lg text-primary-k">Report an issue</h3>
                    <button onClick={onClose} aria-label="Close"><X className="w-5 h-5 text-muted-k" /></button>
                </div>
                <p className="text-sm text-muted-k">{record.expected?.service_type} · {fmtDate(record.expected?.expected_start_datetime)}</p>
                <label className="block space-y-1.5">
                    <span className="text-sm text-primary-k">What happened?</span>
                    <select value={reason} onChange={(e) => setReason(e.target.value)} data-testid="sdl1-dispute-reason"
                        className="w-full rounded-lg border border-primary-k/15 px-3 py-2 text-sm bg-white">
                        {DISPUTE_REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                </label>
                <textarea value={details} onChange={(e) => setDetails(e.target.value)} data-testid="sdl1-dispute-details"
                    className="w-full rounded-lg border border-primary-k/15 px-3 py-2 text-sm min-h-[90px]"
                    placeholder="Add any detail that helps (optional)" />
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={submit} disabled={saving} data-testid="sdl1-dispute-submit">
                        {saving ? "Reporting..." : "Report issue"}
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default function AttendanceLog() {
    const { id: pid } = useParams();
    const [records, setRecords] = useState([]);
    const [patterns, setPatterns] = useState([]);
    const [recon, setRecon] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [busy, setBusy] = useState(false);
    const [disputeFor, setDisputeFor] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [r, p] = await Promise.all([
                api.get(`/sdl1/participants/${pid}/attendance-records`),
                api.get(`/sdl1/participants/${pid}/pattern-detections`),
            ]);
            setRecords(r.data.records || []);
            setPatterns(p.data.patterns || []);
        } catch { /* ignore */ } finally { setLoading(false); }
    }, [pid]);

    useEffect(() => { load(); }, [load]);

    const shown = useMemo(() => {
        if (filter === "all") return records;
        if (filter === "unconfirmed") return records.filter((r) => r.confirmation_status === "unconfirmed");
        if (filter === "disputed") return records.filter((r) => r.confirmation_status === "disputed");
        return records;
    }, [records, filter]);

    const quickConfirm = async (r) => {
        try {
            await api.post(`/sdl1/attendance-records/${r.id}/confirm`, { confirmation_status: "confirmed_as_expected" });
            setRecords((rs) => rs.map((x) => x.id === r.id ? { ...x, confirmation_status: "confirmed_as_expected" } : x));
            toast.success("Confirmed");
        } catch { toast.error("Could not confirm."); }
    };

    const seed = async () => {
        setBusy(true);
        try {
            const start = new Date(); start.setDate(start.getDate() - 30);
            const end = new Date(); end.setDate(end.getDate() + 7);
            const { data } = await api.post(`/sdl1/participants/${pid}/attendance-records/seed-from-calendar`, {
                start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10),
            });
            if (data.count > 0) toast.success(`Added ${data.count} service(s) from the calendar.`);
            else toast.info(data.note || "No calendar entries found for the last 30 days.");
            load();
        } catch { toast.error("Could not seed from the calendar."); }
        finally { setBusy(false); }
    };

    const bulkConfirm = async () => {
        setBusy(true);
        try {
            const { data } = await api.post(`/sdl1/participants/${pid}/attendance-records/bulk-confirm`, {});
            toast.success(`Confirmed ${data.confirmed} service(s) from the past week.`);
            load();
        } catch { toast.error("Bulk confirm failed."); }
        finally { setBusy(false); }
    };

    const runReconcile = async () => {
        setBusy(true);
        try {
            const { data } = await api.post(`/sdl1/participants/${pid}/reconcile`, {});
            setRecon(data.reconciliation);
            load();
        } catch { toast.error("Reconcile failed."); }
        finally { setBusy(false); }
    };

    const dismissPattern = async (p) => {
        try {
            await api.post(`/sdl1/pattern-detections/${p.id}/user-response`, { response: "dismissed" });
            setPatterns((ps) => ps.filter((x) => x.id !== p.id));
        } catch { /* ignore */ }
    };

    return (
        <div className="max-w-4xl space-y-6" data-testid="attendance-log-page">
            <PageIntro
                eyebrow="Their care"
                title="Attendance Log"
                description="Keep track of the services that were meant to happen and confirm each one, or flag a visit that was billed but did not occur."
                whatItDoes="Lists expected visits so you can confirm them, note variances, or dispute a visit. Reconciles against decoded statements to catch billing that has no matching visit."
                howToUse={["Add this week's services or pull them from the calendar", "Confirm each visit as it happens, or report an issue", "Reconcile against your statements to catch mismatches"]}
                whatYouGet={["A confirmed record of every visit", "Early warning when billing and attendance don't line up"]}
            />

            {/* Pattern alerts */}
            {patterns.length > 0 && (
                <div className="space-y-2" data-testid="sdl1-patterns">
                    {patterns.map((p) => (
                        <div key={p.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-start gap-3" data-testid={`sdl1-pattern-${p.id}`}>
                            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-amber-800">{PATTERN_LABEL[p.pattern_type] || "A pattern worth reviewing"}</p>
                                <p className="text-xs text-amber-700">{p.involved_provider_name} · {p.incident_count} occurrence(s). You can talk to your provider or open a complaint if it continues.</p>
                            </div>
                            <button onClick={() => dismissPattern(p)} className="text-amber-700 hover:text-amber-900 text-xs shrink-0" data-testid={`sdl1-pattern-dismiss-${p.id}`}>Dismiss</button>
                        </div>
                    ))}
                </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2" data-testid="sdl1-actions">
                <Button variant="outline" size="sm" onClick={seed} disabled={busy} data-testid="sdl1-seed-btn">
                    <CalendarPlus className="w-4 h-4 mr-1.5" /> Pull from calendar
                </Button>
                <Button variant="outline" size="sm" onClick={bulkConfirm} disabled={busy} data-testid="sdl1-bulk-confirm-btn">
                    <CheckCircle2 className="w-4 h-4 mr-1.5" /> Confirm past week
                </Button>
                <Button variant="outline" size="sm" onClick={runReconcile} disabled={busy} data-testid="sdl1-reconcile-btn">
                    {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />} Reconcile statements
                </Button>
            </div>

            {recon && (
                <div className="rounded-xl border border-primary-k/10 bg-white p-4 text-sm" data-testid="sdl1-recon-summary">
                    <span className="text-emerald-700 font-medium">{recon.matches_found} matched</span>
                    {" · "}
                    <span className="text-amber-700">{recon.mismatches_billed_but_no_attendance} billed with no confirmed visit</span>
                    {" · "}
                    <span className="text-amber-700">{recon.mismatches_attendance_but_not_billed} confirmed but not billed</span>
                    {recon.mismatches_billed_but_disputed > 0 && <> · <span className="text-red-600">{recon.mismatches_billed_but_disputed} billed but disputed</span></>}
                </div>
            )}

            {/* Filters */}
            <div className="flex gap-2" data-testid="sdl1-filters">
                {FILTERS.map(([v, l]) => (
                    <button key={v} onClick={() => setFilter(v)} data-testid={`sdl1-filter-${v}`}
                        className={`text-sm px-3 py-1.5 rounded-full border ${filter === v ? "bg-primary-k text-white border-primary-k" : "border-primary-k/15 text-muted-k hover:bg-surface-2"}`}>
                        {l}
                    </button>
                ))}
            </div>

            {/* List */}
            {loading ? (
                <div className="rounded-2xl border border-primary-k/10 bg-white p-6 animate-pulse h-40" />
            ) : shown.length === 0 ? (
                <div className="rounded-2xl border border-primary-k/10 bg-white p-6 text-sm text-muted-k" data-testid="sdl1-empty">
                    No services logged yet. Services will appear here as they are scheduled through the care plan or added manually. Pull them from the calendar above, or confirm each one as it happens.
                </div>
            ) : (
                <div className="space-y-2" data-testid="sdl1-list">
                    {shown.map((r) => {
                        const sm = STATUS_META[r.confirmation_status] || STATUS_META.unconfirmed;
                        const rm = RECON_META[r.reconciliation_status];
                        return (
                            <div key={r.id} className="rounded-xl border border-primary-k/10 bg-white p-4 flex flex-wrap items-center gap-3" data-testid={`sdl1-row-${r.id}`}>
                                <div className="flex-1 min-w-[200px]">
                                    <div className="flex items-center gap-2">
                                        <Clock className="w-3.5 h-3.5 text-muted-k" />
                                        <span className="text-sm text-primary-k font-medium">{fmtDate(r.expected?.expected_start_datetime)}</span>
                                    </div>
                                    <p className="text-sm text-primary-k mt-0.5">{r.expected?.service_type} · {r.expected?.provider_name}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`text-[10px] uppercase tracking-wider rounded-full border px-1.5 py-0.5 ${sm.cls}`} data-testid={`sdl1-status-${r.id}`}>{sm.label}</span>
                                        {rm && <span className={`text-[10px] ${rm.cls}`}>{rm.label}</span>}
                                        {r.evidence_count > 0 && <span className="text-[10px] text-muted-k inline-flex items-center gap-0.5"><Paperclip className="w-3 h-3" />{r.evidence_count}</span>}
                                    </div>
                                </div>
                                {r.confirmation_status === "unconfirmed" && (
                                    <div className="flex gap-2">
                                        <Button size="sm" onClick={() => quickConfirm(r)} data-testid={`sdl1-confirm-${r.id}`}>
                                            <CheckCircle2 className="w-4 h-4 mr-1" /> Confirm
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => setDisputeFor(r)} data-testid={`sdl1-report-${r.id}`}>
                                            <AlertTriangle className="w-4 h-4 mr-1" /> Report
                                        </Button>
                                    </div>
                                )}
                                {r.case_id && (
                                    <Link to={`/app/participants/${pid}/cases/${r.case_id}`} className="text-xs text-primary-k underline" data-testid={`sdl1-case-${r.id}`}>
                                        View case
                                    </Link>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {disputeFor && (
                <DisputeModal record={disputeFor} onClose={() => setDisputeFor(null)}
                    onDone={() => { setDisputeFor(null); load(); }} />
            )}
        </div>
    );
}
