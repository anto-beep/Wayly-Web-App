/**
 * LCA-1 v1 · Alerts bell.
 *
 * Legislative change alert centre. Sits in the top nav next to the existing
 * NotificationsBell. Polls /api/lca1/alerts/unread-count every 60s; opens a
 * dropdown listing up to 20 recent alerts with per-alert Read/Dismiss.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertOctagon, X, CheckCheck, ExternalLink, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/formatDate";

export default function LCA1AlertsBell({ tone = "dark" }) {
    const [items, setItems] = useState([]);
    const [unread, setUnread] = useState(0);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const ref = useRef(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/lca1/alerts?status=all&limit=20");
            setItems(data.alerts || []);
        } catch { /* noop */ }
        setLoading(false);
    }, []);

    const loadUnread = useCallback(async () => {
        try {
            const { data } = await api.get("/lca1/alerts/unread-count");
            setUnread(data.unread_count || 0);
        } catch { /* noop */ }
    }, []);

    useEffect(() => {
        loadUnread();
        const iv = setInterval(loadUnread, 60000);
        return () => clearInterval(iv);
    }, [loadUnread]);

    useEffect(() => {
        if (open) load();
    }, [open, load]);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, [open]);

    async function markRead(alertId) {
        try {
            await api.patch(`/lca1/alerts/${alertId}/read`);
            setItems((prev) => prev.map((x) => x.id === alertId ? { ...x, alert_status: "read" } : x));
            loadUnread();
        } catch { /* noop */ }
    }

    async function dismiss(alertId) {
        try {
            await api.patch(`/lca1/alerts/${alertId}/dismiss`);
            setItems((prev) => prev.filter((x) => x.id !== alertId));
            loadUnread();
        } catch { /* noop */ }
    }

    const buttonTone = tone === "light" ? "text-white/90 hover:text-white" : "text-primary-k/70 hover:text-primary-k";

    return (
        <div ref={ref} className="relative" data-testid="lca1-alerts-bell-root">
            <button
                data-testid="lca1-alerts-bell-btn"
                onClick={() => setOpen((v) => !v)}
                aria-label={`Legislative alerts (${unread} unread)`}
                className={`relative p-2 rounded-full ${buttonTone} focus:outline-none focus:ring-2 focus:ring-primary-k/30`}
            >
                <AlertOctagon className="w-5 h-5" aria-hidden />
                {unread > 0 && (
                    <span
                        data-testid="lca1-alerts-unread-badge"
                        className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-clay text-white text-[10px] font-bold flex items-center justify-center px-1"
                    >
                        {unread > 99 ? "99+" : unread}
                    </span>
                )}
            </button>
            {open && (
                <div
                    data-testid="lca1-alerts-dropdown"
                    className="absolute right-0 mt-2 w-96 max-w-[95vw] max-h-[70vh] overflow-y-auto rounded-xl border border-primary-k/10 bg-white shadow-xl z-50"
                >
                    <div className="p-3 border-b border-primary-k/10 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-primary-k">Aged care updates</h3>
                        <div className="flex items-center gap-2">
                            <Link
                                to="/settings/notifications"
                                data-testid="lca1-alerts-settings-link"
                                onClick={() => setOpen(false)}
                                className="text-primary-k/60 hover:text-primary-k p-1 rounded"
                                aria-label="Notification settings"
                            >
                                <Settings className="w-3.5 h-3.5" />
                            </Link>
                            <span className="text-xs text-primary-k/50">{unread} unread</span>
                        </div>
                    </div>
                    {loading ? (
                        <div className="p-4 text-sm text-primary-k/50">Loading...</div>
                    ) : items.length === 0 ? (
                        <div className="p-4 text-sm text-primary-k/50" data-testid="lca1-alerts-empty">No updates yet. We&apos;ll ping you when new legislative changes affect your household.</div>
                    ) : (
                        <ul>
                            {items.map((a) => (
                                <li
                                    key={a.id}
                                    data-testid={`lca1-alert-item-${a.id}`}
                                    className={`p-3 border-b border-primary-k/5 last:border-0 ${a.alert_status === "shown" ? "bg-primary-k/[0.03]" : ""}`}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0 flex-1">
                                            <div className="text-sm font-semibold text-primary-k line-clamp-1">{a.title}</div>
                                            {a.short_summary && <div className="text-xs text-primary-k/70 mt-0.5 line-clamp-2">{a.short_summary}</div>}
                                            <div className="text-[10px] uppercase tracking-wide text-primary-k/40 mt-1">
                                                {a.category?.replace(/_/g, " ")} · effective {formatDate(a.effective_date)} · {a.match_reason?.replace(/_/g, " ")}
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-1 shrink-0">
                                            {a.alert_status === "shown" && (
                                                <button
                                                    data-testid={`lca1-alert-read-${a.id}`}
                                                    onClick={() => markRead(a.id)}
                                                    className="p-1 rounded hover:bg-primary-k/10 text-primary-k/60"
                                                    aria-label="Mark read"
                                                >
                                                    <CheckCheck className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                            <button
                                                data-testid={`lca1-alert-dismiss-${a.id}`}
                                                onClick={() => dismiss(a.id)}
                                                className="p-1 rounded hover:bg-primary-k/10 text-primary-k/60"
                                                aria-label="Dismiss"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                    {a.recommended_actions?.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            {a.recommended_actions.slice(0, 2).map((ra, i) => (
                                                <a
                                                    key={i}
                                                    href={ra.url || "#"}
                                                    className="inline-flex items-center gap-1 text-[11px] text-primary-k hover:underline"
                                                >
                                                    {ra.label || ra.title || "Take action"} <ExternalLink className="w-3 h-3" />
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
