import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { api, formatAUD2, extractErrorMessage } from "@/lib/api";
import { Archive, ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PermanentDeleteModal } from "@/components/statements/StatementLifecycleModals";

/**
 * Archived statements page, Phase 3 of the statement-lifecycle rebuild.
 *
 * Lists every archived row in the household, ordered by archived_at desc,
 * with the "X days left to restore" countdown already computed by the API.
 *
 * Actions per row:
 *   • Restore, POST /api/statements/:id/restore
 *   • Permanently delete, only enabled when `days_left_to_restore === 0`
 *     (the 30-day window has elapsed)
 */
export default function ArchivedStatements() {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleteBusy, setDeleteBusy] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/statements/archived");
            setItems(Array.isArray(data) ? data : []);
        } catch (err) {
            toast.error(extractErrorMessage(err, "Couldn't load archived statements"));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const restore = async (id) => {
        setBusyId(id);
        try {
            await api.post(`/statements/${id}/restore`);
            toast.success("Statement restored");
            setItems((prev) => prev.filter((s) => s.id !== id));
        } catch (err) {
            const detail = err?.response?.data?.detail;
            if (detail?.error === "ACTIVE_VERSION_EXISTS") {
                toast.error("Another version of this statement is currently active. Archive that one first.");
            } else {
                toast.error(extractErrorMessage(err, "Couldn't restore the statement"));
            }
        } finally {
            setBusyId(null);
        }
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setDeleteBusy(true);
        try {
            await api.delete(`/statements/${deleteTarget.id}/permanent`);
            toast.success("Statement permanently deleted");
            setItems((prev) => prev.filter((s) => s.id !== deleteTarget.id));
            setDeleteTarget(null);
        } catch (err) {
            toast.error(extractErrorMessage(err, "Couldn't delete the statement"));
        } finally {
            setDeleteBusy(false);
        }
    };

    return (
        <div className="space-y-6" data-testid="archived-statements-page">
            <Link to="/app/statements" className="inline-flex items-center gap-1.5 text-sm text-muted-k hover:text-primary-k">
                <ArrowLeft className="h-4 w-4" /> Back to Statements
            </Link>
            <div>
                <span className="overline">Archived</span>
                <h1 className="font-heading text-3xl sm:text-4xl text-primary-k tracking-tight mt-2">Archived statements</h1>
                <p className="text-muted-k mt-2 max-w-2xl text-sm">
                    Statements you've archived. Restore within 30 days to bring them back into your dashboard and reports, after that, they're permanently deleted by our retention sweep.
                </p>
            </div>

            {loading ? (
                <div className="text-muted-k">Loading…</div>
            ) : items.length === 0 ? (
                <div className="bg-surface border border-kindred rounded-xl p-10 text-center" data-testid="archived-empty-state">
                    <Archive className="h-8 w-8 text-muted-k mx-auto" />
                    <p className="mt-3 text-muted-k">No archived statements.</p>
                </div>
            ) : (
                <ul className="bg-surface border border-kindred rounded-xl divide-y divide-[var(--kindred-border)]">
                    {items.map((s) => {
                        const expiring = (s.days_left_to_restore ?? 30) <= 3;
                        const expired = (s.days_left_to_restore ?? 30) <= 0;
                        return (
                            <li key={s.id} data-testid={`archived-row-${s.id}`} className="p-5 flex items-center justify-between gap-3 flex-wrap">
                                <div className="min-w-0">
                                    <div className="font-medium text-primary-k truncate">
                                        {s.period_label || s.filename || "Statement"}
                                    </div>
                                    <div className="text-sm text-muted-k mt-0.5 tabular-nums">
                                        {s.anomaly_dollar_impact_total > 0 ? `${formatAUD2(s.anomaly_dollar_impact_total)} in alerts · ` : ""}
                                        Archived {new Date(s.archived_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                                        {" · "}
                                        <span className={expired ? "text-terracotta" : expiring ? "text-terracotta" : ""}>
                                            {expired ? "Restore window expired" : `${s.days_left_to_restore} day${s.days_left_to_restore === 1 ? "" : "s"} left to restore`}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <button
                                        type="button"
                                        onClick={() => restore(s.id)}
                                        disabled={busyId === s.id || expired}
                                        data-testid={`archived-restore-${s.id}`}
                                        className="inline-flex items-center gap-1.5 text-sm border border-kindred rounded-md px-3 py-1.5 text-primary-k hover:bg-surface-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <RotateCcw className="h-3.5 w-3.5" />
                                        {busyId === s.id ? "Restoring…" : "Restore"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setDeleteTarget(s)}
                                        disabled={!expired}
                                        title={expired ? "Permanently delete this statement" : "Available after the 30-day restore window"}
                                        data-testid={`archived-delete-${s.id}`}
                                        className="inline-flex items-center gap-1.5 text-sm border border-terracotta/40 text-terracotta rounded-md px-3 py-1.5 hover:bg-terracotta/5 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" /> Delete permanently
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            <PermanentDeleteModal
                open={!!deleteTarget}
                onClose={() => !deleteBusy && setDeleteTarget(null)}
                statement={deleteTarget}
                busy={deleteBusy}
                onConfirm={confirmDelete}
            />
        </div>
    );
}
