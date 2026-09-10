import React, { useEffect, useRef, useState, useCallback } from "react";
import { formatDateTime, humanizeMonths, formatDate } from "@/lib/formatDate";
import { Link } from "react-router-dom";
import { Bell, CheckCheck, X, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

const SEEN_IDS_KEY = "kindred_notif_seen_ids";

function loadSeenIds() {
    try {
        const raw = localStorage.getItem(SEEN_IDS_KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
}

function saveSeenIds(ids) {
    try {
        localStorage.setItem(SEEN_IDS_KEY, JSON.stringify(Array.from(ids).slice(-200)));
    } catch { /* quota, ignore */ }
}

/**
 * Notifications bell — a single bell in the header that consolidates BOTH
 * personal notifications AND aged-care legislative updates (formerly a second
 * bell). One combined unread count; the dropdown shows two clearly separated
 * sections so the header stays calm and uncluttered.
 */
export default function NotificationsBell({ tone = "dark" }) {
    const [items, setItems] = useState([]);
    const [unread, setUnread] = useState(0);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    // Aged-care updates (legislative change alerts)
    const [updates, setUpdates] = useState([]);
    const [updatesUnread, setUpdatesUnread] = useState(0);
    const [updatesLoading, setUpdatesLoading] = useState(false);
    const ref = useRef(null);
    const seenIdsRef = useRef(loadSeenIds());
    const firstLoadRef = useRef(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/notifications");
            const fresh = (data.items || []).map((n) => ({ ...n, title: humanizeMonths(n.title), body: humanizeMonths(n.body) }));
            // On the very first load, treat everything as already seen so the
            // user isn't toast-spammed with their entire backlog.
            if (firstLoadRef.current) {
                fresh.forEach((n) => seenIdsRef.current.add(n.id));
                saveSeenIds(seenIdsRef.current);
                firstLoadRef.current = false;
            } else {
                // Surface the most recent unread notification we haven't toasted yet
                const newOnes = fresh.filter((n) => !n.read && !seenIdsRef.current.has(n.id));
                if (newOnes.length > 0) {
                    const top = newOnes[0];
                    toast.info(top.title || "New notification", {
                        description: top.body,
                        duration: 8000,
                        action: top.link ? { label: "View", onClick: () => { window.location.assign(top.link); } } : undefined,
                    });
                    newOnes.forEach((n) => seenIdsRef.current.add(n.id));
                    saveSeenIds(seenIdsRef.current);
                }
            }
            setItems(fresh);
            setUnread(data.unread || 0);
        } catch {/* ignore */}
        finally { setLoading(false); }
    }, []);

    const loadUpdatesUnread = useCallback(async () => {
        try {
            const { data } = await api.get("/lca1/alerts/unread-count");
            setUpdatesUnread(data.unread_count || 0);
        } catch { /* noop */ }
    }, []);

    const loadUpdates = useCallback(async () => {
        setUpdatesLoading(true);
        try {
            const { data } = await api.get("/lca1/alerts?status=all&limit=20");
            setUpdates(data.alerts || []);
        } catch { /* noop */ }
        setUpdatesLoading(false);
    }, []);

    useEffect(() => {
        load();
        loadUpdatesUnread();
        // Poll every 60s as a fallback, pause when tab is hidden
        const id = setInterval(() => { if (!document.hidden) { load(); loadUpdatesUnread(); } }, 60_000);
        return () => clearInterval(id);
    }, [load, loadUpdatesUnread]);

    // Load the full aged-care updates list only when the dropdown is opened.
    useEffect(() => {
        if (open) loadUpdates();
    }, [open, loadUpdates]);

    // Server-Sent Events, instant push for new notifications. Falls back
    // gracefully to the 60s poll above if the browser/proxy doesn't support SSE.
    useEffect(() => {
        const token = localStorage.getItem("kindred_token") || localStorage.getItem("wayly_token") || localStorage.getItem("token");
        if (!token) return undefined;
        const base = process.env.REACT_APP_BACKEND_URL || "";
        let es;
        try {
            es = new EventSource(`${base}/api/notifications/stream?token=${encodeURIComponent(token)}`);
        } catch { return undefined; }
        es.addEventListener("snapshot", (e) => {
            try { const d = JSON.parse(e.data); if (typeof d.unread === "number") setUnread(d.unread); } catch { /* ignore */ }
        });
        es.addEventListener("notification", (e) => {
            try {
                const raw = JSON.parse(e.data);
                const n = { ...raw, title: humanizeMonths(raw.title), body: humanizeMonths(raw.body) };
                setItems((prev) => [n, ...prev.filter((p) => p.id !== n.id)].slice(0, 30));
                if (!n.read) setUnread((u) => u + 1);
                if (!seenIdsRef.current.has(n.id)) {
                    seenIdsRef.current.add(n.id);
                    saveSeenIds(seenIdsRef.current);
                    toast.info(n.title || "New notification", {
                        description: n.body,
                        duration: 8000,
                        action: n.link ? { label: "View", onClick: () => { window.location.assign(n.link); } } : undefined,
                    });
                }
            } catch { /* ignore */ }
        });
        es.onerror = () => { /* poll fallback handles errors */ };
        return () => { try { es.close(); } catch { /* ignore */ } };
    }, []);

    useEffect(() => {
        const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, []);

    const markAllRead = async () => {
        try {
            await api.post("/notifications/read", { ids: [] });
            setItems((prev) => prev.map((n) => ({ ...n, read: true })));
            setUnread(0);
        } catch {/* ignore */}
    };

    const markOneRead = async (n) => {
        if (n.read) return;
        // Optimistic: update locally first so the badge decrements instantly
        setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
        setUnread((u) => Math.max(0, u - 1));
        try {
            await api.post("/notifications/read", { ids: [n.id] });
        } catch {
            // Roll back if the server call failed
            setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: false } : x)));
            setUnread((u) => u + 1);
        }
    };

    const markUpdateRead = async (alertId) => {
        try {
            await api.patch(`/lca1/alerts/${alertId}/read`);
            setUpdates((prev) => prev.map((x) => x.id === alertId ? { ...x, alert_status: "read" } : x));
            loadUpdatesUnread();
        } catch { /* noop */ }
    };

    const dismissUpdate = async (alertId) => {
        try {
            await api.patch(`/lca1/alerts/${alertId}/dismiss`);
            setUpdates((prev) => prev.filter((x) => x.id !== alertId));
            loadUpdatesUnread();
        } catch { /* noop */ }
    };

    const totalUnread = unread + updatesUnread;

    const btnTextCls = tone === "dark"
        ? "text-white/80 hover:text-white"
        : "text-[#0E2A47]/70 hover:text-[#0E2A47]";

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className={`relative transition-colors p-2 ${btnTextCls}`}
                aria-label={`Notifications${totalUnread ? ` (${totalUnread} unread)` : ""}`}
                data-testid="nav-bell"
            >
                <Bell className="h-5 w-5" />
                {totalUnread > 0 && (
                    <span className="absolute top-0.5 right-0.5 h-4 min-w-[16px] px-1 rounded-full bg-[#2BC4D6] text-white text-[10px] font-bold leading-4 text-center" data-testid="nav-bell-count">
                        {totalUnread > 9 ? "9+" : totalUnread}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-[22rem] max-w-[95vw] bg-white rounded-xl shadow-[0_24px_64px_rgba(0,0,0,0.18)] border border-[#CFE0F0] overflow-hidden z-50" data-testid="notifications-dropdown">
                    {/* ---- Personal notifications ---- */}
                    <div className="px-4 py-3 border-b border-[#CFE0F0] flex items-center justify-between">
                        <span className="text-sm font-semibold text-[#0E2A47]">Notifications</span>
                        {unread > 0 && (
                            <button type="button" onClick={markAllRead} data-testid="notifications-mark-all-read" className="text-xs text-[#0E2A47] hover:underline">
                                Mark all read
                            </button>
                        )}
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                        {loading ? (
                            <div className="p-6 text-center text-sm text-[#6B7280]">Loading…</div>
                        ) : items.length === 0 ? (
                            <div className="p-6 text-center text-sm text-[#6B7280]" data-testid="notifications-empty">
                                You are all caught up.
                            </div>
                        ) : (
                            <ul>
                                {items.slice(0, 10).map((n) => (
                                    <li key={n.id} className={`px-4 py-3 border-b border-[#CFE0F0] last:border-0 ${!n.read ? "bg-[#EAF4FB]" : ""}`} data-testid={`notification-item-${n.id}`}>
                                        {n.link ? (
                                            <Link to={n.link} onClick={() => { markOneRead(n); setOpen(false); }} className="block">
                                                <div className="text-sm font-medium text-[#0E2A47]">{n.title}</div>
                                                {n.body && <div className="text-xs text-[#6B7280] mt-0.5">{n.body}</div>}
                                                <div className="text-[10px] text-[#6B7280] mt-1 uppercase tracking-wider">{formatDateTime(n.created_at)}</div>
                                            </Link>
                                        ) : (
                                            <button type="button" onClick={() => markOneRead(n)} className="text-left w-full" data-testid={`notification-item-${n.id}-mark`}>
                                                <div className="text-sm font-medium text-[#0E2A47]">{n.title}</div>
                                                {n.body && <div className="text-xs text-[#6B7280] mt-0.5">{n.body}</div>}
                                                <div className="text-[10px] text-[#6B7280] mt-1 uppercase tracking-wider">{formatDateTime(n.created_at)}</div>
                                            </button>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* ---- Aged-care updates (legislative change alerts) ---- */}
                    <div className="px-4 py-2.5 border-t border-b border-[#CFE0F0] bg-[#F6F1EA] flex items-center justify-between" data-testid="notif-updates-header">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#0E2A47]">Aged care updates</span>
                        {updatesUnread > 0 && <span className="text-[11px] text-clay font-semibold">{updatesUnread} new</span>}
                    </div>
                    <div className="max-h-72 overflow-y-auto" data-testid="notif-updates-section">
                        {updatesLoading ? (
                            <div className="p-4 text-sm text-[#6B7280]">Loading…</div>
                        ) : updates.length === 0 ? (
                            <div className="p-4 text-sm text-[#6B7280]" data-testid="lca1-alerts-empty">No updates yet. We&apos;ll ping you when new legislative changes affect your household.</div>
                        ) : (
                            <ul>
                                {updates.map((a) => (
                                    <li
                                        key={a.id}
                                        data-testid={`lca1-alert-item-${a.id}`}
                                        className={`px-4 py-3 border-b border-[#CFE0F0] last:border-0 ${a.alert_status === "shown" ? "bg-[#0E2A47]/[0.03]" : ""}`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1">
                                                <div className="text-sm font-semibold text-[#0E2A47] line-clamp-1">{a.title}</div>
                                                {a.short_summary && <div className="text-xs text-[#6B7280] mt-0.5 line-clamp-2">{a.short_summary}</div>}
                                                <div className="text-[10px] uppercase tracking-wide text-[#6B7280] mt-1">
                                                    {a.category?.replace(/_/g, " ")} · effective {formatDate(a.effective_date)}
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-1 shrink-0">
                                                {a.alert_status === "shown" && (
                                                    <button
                                                        data-testid={`lca1-alert-read-${a.id}`}
                                                        onClick={() => markUpdateRead(a.id)}
                                                        className="p-1 rounded hover:bg-[#0E2A47]/10 text-[#6B7280]"
                                                        aria-label="Mark read"
                                                    >
                                                        <CheckCheck className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                                <button
                                                    data-testid={`lca1-alert-dismiss-${a.id}`}
                                                    onClick={() => dismissUpdate(a.id)}
                                                    className="p-1 rounded hover:bg-[#0E2A47]/10 text-[#6B7280]"
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
                                                        className="inline-flex items-center gap-1 text-[11px] text-[#0E2A47] hover:underline"
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

                    <div className="px-4 py-2 border-t border-[#CFE0F0] bg-[#EAF4FB]">
                        <Link to="/settings/notifications" onClick={() => setOpen(false)} className="text-xs text-[#0E2A47] hover:underline">
                            Manage preferences
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
