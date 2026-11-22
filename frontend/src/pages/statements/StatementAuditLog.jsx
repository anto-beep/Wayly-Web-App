import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, extractErrorMessage } from "@/lib/api";
import { ArrowLeft, History, FileWarning, Archive, Trash2, RotateCcw, Upload, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Per-statement audit log view, Phase 3 of the lifecycle rebuild.
 *
 * Renders every state-change event for the statement, oldest first,
 * with human-readable labels and a small icon per event type.
 */

const EVENT_META = {
    uploaded:           { icon: Upload,        label: "Uploaded",            color: "text-primary-k" },
    accepted_as_active: { icon: CheckCircle2,  label: "Accepted as active",  color: "text-primary-k" },
    superseded:         { icon: Archive,       label: "Superseded by new version", color: "text-muted-k" },
    archived:           { icon: Archive,       label: "Archived",            color: "text-muted-k" },
    deleted_soft:       { icon: Archive,       label: "Soft-deleted (archived)", color: "text-muted-k" },
    restored:           { icon: RotateCcw,     label: "Restored to active",  color: "text-primary-k" },
    deleted_hard:       { icon: Trash2,        label: "Permanently deleted", color: "text-terracotta" },
    duplicate_rejected: { icon: FileWarning,   label: "Duplicate upload rejected", color: "text-muted-k" },
    manual_review_passed: { icon: CheckCircle2, label: "Manual review passed", color: "text-primary-k" },
    manual_review_failed: { icon: FileWarning, label: "Manual review failed", color: "text-terracotta" },
};

export default function StatementAuditLog() {
    const { id } = useParams();
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get(`/statements/${id}/audit-log`);
                setEvents(data?.events || []);
            } catch (err) {
                toast.error(extractErrorMessage(err, "Couldn't load audit log"));
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    return (
        <div className="space-y-6" data-testid="statement-audit-log-page">
            <Link to={`/app/statements/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-k hover:text-primary-k">
                <ArrowLeft className="h-4 w-4" /> Back to statement
            </Link>
            <div className="flex items-center gap-3">
                <History className="h-6 w-6 text-primary-k" />
                <div>
                    <span className="overline">Audit Log</span>
                    <h1 className="font-heading text-2xl sm:text-3xl text-primary-k tracking-tight mt-1">
                        Every change we've recorded
                    </h1>
                </div>
            </div>

            {loading ? (
                <div className="text-muted-k">Loading…</div>
            ) : events.length === 0 ? (
                <div className="bg-surface border border-kindred rounded-xl p-10 text-center text-muted-k" data-testid="audit-log-empty">
                    No events recorded for this statement.
                </div>
            ) : (
                <ol className="relative border-l-2 border-kindred ml-3 space-y-6 pt-2" data-testid="audit-log-timeline">
                    {events.map((e, i) => {
                        const meta = EVENT_META[e.event_type] || { icon: History, label: e.event_type, color: "text-muted-k" };
                        const Icon = meta.icon;
                        const reason = e?.metadata?.reason;
                        const filename = e?.metadata?.filename || e?.metadata?.attempted_filename;
                        return (
                            <li key={e.id || i} data-testid={`audit-event-${e.event_type}`} className="ml-5 relative">
                                <span className="absolute -left-[33px] top-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-surface">
                                    <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                                </span>
                                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                                    <div className={`font-medium ${meta.color}`}>{meta.label}</div>
                                    <time className="text-xs text-muted-k tabular-nums" title={e.event_at}>
                                        {new Date(e.event_at).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                    </time>
                                </div>
                                <div className="mt-0.5 text-xs text-muted-k">
                                    {e.actor_kind === "user" ? "By you" : e.actor_kind === "retention_job" ? "By the retention sweep" : "By the system"}
                                    {e.prior_state && e.new_state ? ` · ${e.prior_state} → ${e.new_state}` : ""}
                                </div>
                                {(reason || filename) && (
                                    <div className="mt-1.5 text-xs text-muted-k bg-surface-2 rounded px-2.5 py-1.5 inline-block">
                                        {reason && <span>Reason: {reason}</span>}
                                        {reason && filename && <span> · </span>}
                                        {filename && <span>File: {filename}</span>}
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ol>
            )}
        </div>
    );
}
