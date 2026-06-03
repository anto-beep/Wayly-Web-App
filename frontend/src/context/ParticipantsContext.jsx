/**
 * useActiveParticipant — hook + provider that keeps a persisted "active"
 * participant in localStorage and exposes the list of participants for the
 * current user's household.
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const LS_KEY = "wayly_active_participant_id";

const ParticipantsContext = createContext(null);

export function ParticipantsProvider({ children }) {
    const { user, household } = useAuth();
    const [items, setItems] = useState([]);
    const [activeId, setActiveIdState] = useState(() => {
        try { return window.localStorage.getItem(LS_KEY) || null; } catch { return null; }
    });
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        if (!user || !household) { setItems([]); return; }
        setLoading(true);
        try {
            const { data } = await api.get("/participants");
            setItems(data.items || []);
        } catch {
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [user, household]);

    useEffect(() => { refresh(); }, [refresh]);

    useEffect(() => {
        if (!items.length) return;
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
    }, []);

    const active = useMemo(
        () => items.find((p) => p.id === activeId) || items.find((p) => p.is_primary) || items[0] || null,
        [items, activeId]
    );

    return (
        <ParticipantsContext.Provider value={{ items, active, activeId: active?.id || null, setActiveId, refresh, loading }}>
            {children}
        </ParticipantsContext.Provider>
    );
}

export function useParticipants() {
    return useContext(ParticipantsContext) || { items: [], active: null, activeId: null, setActiveId: () => {}, refresh: async () => {}, loading: false };
}
