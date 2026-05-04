import React, { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { api } from "@/lib/api";

export default function NotificationsBell() {
    const [items, setItems] = useState([]);
    const [unread, setUnread] = useState(0);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const ref = useRef(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get("/notifications");
            setItems(data.items || []);
            setUnread(data.unread || 0);
        } catch {/* ignore */}
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        load();
        const id = setInterval(load, 60_000); // poll every 60s (cheap SSE stand-in)
        return () => clearInterval(id);
    }, [load]);

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

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                className="relative text-white/80 hover:text-white transition-colors p-2"
                aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
                data-testid="nav-bell"
            >
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                    <span className="absolute top-0.5 right-0.5 h-4 min-w-[16px] px-1 rounded-full bg-[#D4A24E] text-[#1F3A5F] text-[10px] font-bold leading-4 text-center" data-testid="nav-bell-count">
                        {unread > 9 ? "9+" : unread}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-[0_24px_64px_rgba(0,0,0,0.18)] border border-[#E8E2D9] overflow-hidden z-50" data-testid="notifications-dropdown">
                    <div className="px-4 py-3 border-b border-[#E8E2D9] flex items-center justify-between">
                        <span className="text-sm font-semibold text-[#1F3A5F]">Notifications</span>
                        {unread > 0 && (
                            <button type="button" onClick={markAllRead} data-testid="notifications-mark-all-read" className="text-xs text-[#1F3A5F] hover:underline">
                                Mark all read
                            </button>
                        )}
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                        {loading ? (
                            <div className="p-6 text-center text-sm text-[#6B7280]">Loading…</div>
                        ) : items.length === 0 ? (
                            <div className="p-6 text-center text-sm text-[#6B7280]" data-testid="notifications-empty">
                                You're all caught up.
                            </div>
                        ) : (
                            <ul>
                                {items.slice(0, 10).map((n) => (
                                    <li key={n.id} className={`px-4 py-3 border-b border-[#E8E2D9] last:border-0 ${!n.read ? "bg-[#FAF7F2]" : ""}`} data-testid={`notification-item-${n.id}`}>
                                        {n.link ? (
                                            <Link to={n.link} onClick={() => setOpen(false)} className="block">
                                                <div className="text-sm font-medium text-[#1F3A5F]">{n.title}</div>
                                                {n.body && <div className="text-xs text-[#6B7280] mt-0.5">{n.body}</div>}
                                                <div className="text-[10px] text-[#6B7280] mt-1 uppercase tracking-wider">{new Date(n.created_at).toLocaleString()}</div>
                                            </Link>
                                        ) : (
                                            <>
                                                <div className="text-sm font-medium text-[#1F3A5F]">{n.title}</div>
                                                {n.body && <div className="text-xs text-[#6B7280] mt-0.5">{n.body}</div>}
                                                <div className="text-[10px] text-[#6B7280] mt-1 uppercase tracking-wider">{new Date(n.created_at).toLocaleString()}</div>
                                            </>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <div className="px-4 py-2 border-t border-[#E8E2D9] bg-[#FAF7F2]">
                        <Link to="/settings/notifications" onClick={() => setOpen(false)} className="text-xs text-[#1F3A5F] hover:underline">
                            Manage preferences
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}
