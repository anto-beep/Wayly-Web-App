/**
 * LOOP-1 v1 · Cases list page for a participant.
 * Route: /app/participants/:id/cases
 */
import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import Skeleton from "@/components/Skeleton";
import { formatDate } from "@/lib/formatDate";
import { AlertCircle, ChevronLeft, Filter, RefreshCw } from "lucide-react";

const SEV_TINT = {
    high: "bg-red-50 text-red-700 border-red-100",
    medium: "bg-amber-50 text-amber-700 border-amber-100",
    low: "bg-primary-k/5 text-primary-k border-primary-k/10",
};

const STATUS_LABELS = {
    open: "Open",
    in_progress: "In progress",
    waiting_on_provider: "Waiting on provider",
    resolved: "Resolved",
    dismissed: "Dismissed",
};

export default function ParticipantCases() {
    const { id } = useParams();
    const [cases, setCases] = useState(null);
    const [statusFilter, setStatusFilter] = useState("open_any");
    const [error, setError] = useState(null);
    const [scanning, setScanning] = useState(false);

    const fetchCases = useMemo(() => async () => {
        setError(null);
        try {
            const r = await api.get(`/loop/cases?participant_id=${id}&status=${statusFilter}&limit=100`);
            setCases(r.data.cases || []);
        } catch (e) {
            console.error("[loop1] cases fetch failed", e);
            setError(e?.response?.data?.detail || e?.message || "Failed to load cases");
        }
    }, [id, statusFilter]);

    useEffect(() => {
        setCases(null);
        fetchCases();
    }, [fetchCases]);

    async function runScan() {
        setScanning(true);
        try {
            await api.post(`/loop/cases/scan?participant_id=${id}`);
            await fetchCases();
        } finally {
            setScanning(false);
        }
    }

    if (error) {
        return (
            <div data-testid="loop1-cases-error" className="max-w-4xl mx-auto p-6">
                <p className="text-sm text-red-600">Failed to load cases: {String(error)}</p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-6 space-y-4" data-testid="loop1-cases-list-page">
            <Link
                to={`/app/participants/${id}`}
                className="inline-flex items-center gap-1 text-sm text-primary-k/60 hover:text-primary-k"
                data-testid="loop1-back-to-profile"
            >
                <ChevronLeft className="w-4 h-4" /> Back to profile
            </Link>
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-heading text-primary-k">Open follow-ups</h1>
                <div className="flex items-center gap-2">
                    <div className="inline-flex items-center gap-1 border border-primary-k/15 rounded-full px-2 py-1">
                        <Filter className="w-3 h-3 text-primary-k/50" aria-hidden />
                        <select
                            data-testid="loop1-status-filter"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="text-sm bg-transparent border-0 focus:outline-none text-primary-k pr-1"
                        >
                            <option value="open_any">All open</option>
                            <option value="open">Open</option>
                            <option value="in_progress">In progress</option>
                            <option value="waiting_on_provider">Waiting on provider</option>
                            <option value="resolved">Resolved</option>
                            <option value="dismissed">Dismissed</option>
                        </select>
                    </div>
                    <button
                        data-testid="loop1-rescan-btn"
                        onClick={runScan}
                        disabled={scanning}
                        className="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-full bg-primary-k text-white disabled:opacity-50"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${scanning ? "animate-spin" : ""}`} />
                        {scanning ? "Scanning…" : "Rescan"}
                    </button>
                </div>
            </div>

            {cases === null ? (
                <Skeleton className="h-40 w-full" />
            ) : cases.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-primary-k/20 bg-white/40 p-8 text-center" data-testid="loop1-cases-empty">
                    <AlertCircle className="w-8 h-8 text-primary-k/30 mx-auto mb-2" />
                    <p className="text-sm text-primary-k/60">No cases match this filter.</p>
                </div>
            ) : (
                <ul className="space-y-2" data-testid="loop1-cases-list">
                    {cases.map((c) => (
                        <li key={c.id}>
                            <Link
                                to={`/app/participants/${id}/cases/${c.id}`}
                                data-testid={`loop1-case-row-${c.id}`}
                                className="flex items-start justify-between gap-3 p-4 rounded-lg border border-primary-k/10 bg-white hover:border-primary-k/30 hover:shadow-sm transition"
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-medium text-primary-k">{c.title}</span>
                                        <span className="text-[10px] uppercase tracking-wide text-primary-k/40 border border-primary-k/10 rounded-full px-2 py-0.5">
                                            {STATUS_LABELS[c.status] || c.status}
                                        </span>
                                    </div>
                                    {c.summary && <p className="text-xs text-primary-k/60 mt-1 line-clamp-2">{c.summary}</p>}
                                    <p className="text-xs text-primary-k/40 mt-1">
                                        {c.case_type_label || c.case_type} · opened {formatDate(c.created_at)}
                                    </p>
                                </div>
                                <span className={`shrink-0 text-[10px] uppercase tracking-wide font-semibold px-2 py-1 rounded-full border ${SEV_TINT[c.severity] || SEV_TINT.medium}`}>
                                    {c.severity}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
