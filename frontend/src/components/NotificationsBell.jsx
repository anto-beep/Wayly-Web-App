import React, { useEffect, useRef, useState, useCallback } from "react";
import { formatDateTime, humanizeMonths } from "@/lib/formatDate";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
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

export default function NotificationsBell({ tone = "dark" }) {
    const [items, setItems] = useState([]);
    const [unread, setUnread] = useState(0);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
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

    useEffect(() => {
        load();
        // Poll every 60s as a fallback, pause when tab is hidden
        const id = setInterval(() => { if (!document.hidden) load(); }, 60_000);
        return () => clearInterval(id);
    }, [load]);

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

    const btnTextCls = tone === "dark"
        ? "text-white/80 hover:text-white"
        : "text-[#0E2A47]/70 hover:text-[#0E2A47]";

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className={`relative transition-colors p-2 ${btnTextCls}`}
                aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
                data-testid="nav-bell"
            >
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                    <span className="absolute top-0.5 right-0.5 h-4 min-w-[16px] px-1 rounded-full bg-[#2BC4D6] text-white text-[10px] font-bold leading-4 text-center" data-testid="nav-bell-count">
                        {unread > 9 ? "9+" : unread}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-[0_24px_64px_rgba(0,0,0,0.18)] border border-[#CFE0F0] overflow-hidden z-50" data-testid="notifications-dropdown">
                    <div className="px-4 py-3 border-b border-[#CFE0F0] flex items-center justify-between">
                        <span className="text-sm font-semibold text-[#0E2A47]">Notifications</span>
                        {unread > 0 && (
                            <button type="button" onClick={markAllRead} data-testid="notifications-mark-all-read" className="text-xs text-[#0E2A47] hover:underline">
                                Mark all read
                            </button>
                        )}
                    </div>
                    <div className="max-h-96 overflow-y-auto">
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
