/**
 * useActiveParticipant, Batch3 v2.
 *
 * Persists the active participant in localStorage AND mirrors it into the URL
 * (`?p=<shortcode>`). On switch, all global query caches that depend on
 * participant data are invalidated.
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const LS_KEY = "wayly_active_participant_id";

const ParticipantsContext = createContext(null);

function shortcodeFor(p) {
    if (!p) return null;
    const fn = (p.first_name || p.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    return fn || (p.id || "").slice(0, 6);
}

export function ParticipantsProvider({ children }) {
    const { user } = useAuth();
    const [items, setItems] = useState([]);
    const [account, setAccount] = useState(null);
    const [activeId, setActiveIdState] = useState(() => {
        try { return window.localStorage.getItem(LS_KEY) || null; } catch { return null; }
    });
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        if (!user) { setItems([]); setAccount(null); return; }
        setLoading(true);
        try {
            const { data } = await api.get("/account");
            setAccount(data.summary || null);
            setItems((data.participants || []).map((p) => ({
                ...p,
                // Adapt v2 → existing shape for back-compat
                name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.first_name,
            })));
        } catch {
            setItems([]); setAccount(null);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => { refresh(); }, [refresh]);

    // Sync ?p= from URL on load
    useEffect(() => {
        if (!items.length) return;
        const params = new URLSearchParams(window.location.search);
        const fromUrl = params.get("p");
        if (fromUrl) {
            const match = items.find((p) => shortcodeFor(p) === fromUrl || p.id === fromUrl);
            if (match && match.id !== activeId) {
                setActiveIdState(match.id);
                try { window.localStorage.setItem(LS_KEY, match.id); } catch { /* ignore */ }
                return;
            }
        }
        const stillExists = activeId && items.some((p) => p.id === activeId);
        if (!stillExists) {
            const primary = items.find((p) => p.is_primary) || items[0];
            setActiveIdState(primary?.id || null);
            try { primary?.id && window.localStorage.setItem(LS_KEY, primary.id); } catch { /* ignore */ }
        }
    }, [items, activeId]);

    const setActiveId = useCallback((id) => {
        setActiveIdState(id);
        try { id ? window.localStorage.setItem(LS_KEY, id) : window.localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
        // Mirror to URL
        const target = items.find((p) => p.id === id);
        if (target) {
            try {
                const url = new URL(window.location.href);
                url.searchParams.set("p", shortcodeFor(target));
                window.history.replaceState({}, "", url.toString());
            } catch { /* ignore */ }
        }
        // Broadcast a custom event so pages can drop their participant-scoped caches
        try { window.dispatchEvent(new CustomEvent("wayly:participant-changed", { detail: { id } })); } catch { /* ignore */ }
    }, [items]);

    const active = useMemo(
        () => items.find((p) => p.id === activeId) || items.find((p) => p.is_primary) || items[0] || null,
        [items, activeId]
    );

    return (
        <ParticipantsContext.Provider value={{ items, active, activeId: active?.id || null, account, setActiveId, refresh, loading }}>
            {children}
        </ParticipantsContext.Provider>
    );
}

export function useParticipants() {
    return useContext(ParticipantsContext) || { items: [], active: null, activeId: null, account: null, setActiveId: () => {}, refresh: async () => {}, loading: false };
}
