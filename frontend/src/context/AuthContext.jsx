import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setAuthToken, setRefreshToken, setReadOnlyMode } from "@/lib/api";
import { track } from "@/lib/analytics";
import { setSentryUser, clearSentryUser } from "@/lib/sentry";

const AuthContext = createContext(null);

// Helper used by both bootstrap + refresh paths to keep the axios read-only
// interceptor in sync with the latest user state.
function _syncReadOnly(u) {
    if (!u) { setReadOnlyMode(false); return; }
    const plan = (u.plan || "").toLowerCase();
    const isPaid = plan === "solo" || plan === "family" || plan === "adviser";
    setReadOnlyMode(!isPaid && u.subscription_status === "expired");
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [household, setHousehold] = useState(null);
    const [loading, setLoading] = useState(true);

    const refreshHousehold = useCallback(async () => {
        try {
            const { data } = await api.get("/household");
            setHousehold(data || null);
        } catch {
            setHousehold(null);
        }
    }, []);

    const refreshUser = useCallback(async () => {
        try {
            const { data } = await api.get("/auth/me");
            setUser(data);
            _syncReadOnly(data);
            return data;
        } catch {
            return null;
        }
    }, []);

    const bootstrap = useCallback(async () => {
        // CRITICAL: If returning from Emergent OAuth, skip the /me check ,
        // AuthCallback will exchange the session_id first.
        if (typeof window !== "undefined" && window.location.hash?.includes("session_id=")) {
            setLoading(false);
            return;
        }
        const token = localStorage.getItem("kindred_token");
        if (!token) {
            setLoading(false);
            return;
        }
        try {
            const { data } = await api.get("/auth/me");
            setUser(data);
            _syncReadOnly(data);
            if (data?.id) setSentryUser(data.id);
            await refreshHousehold();
        } catch {
            setAuthToken(null);
            setRefreshToken(null);
            setUser(null);
            _syncReadOnly(null);
            clearSentryUser();
        } finally {
            setLoading(false);
        }
    }, [refreshHousehold]);

    useEffect(() => {
        bootstrap();
    }, [bootstrap]);

    /**
     * login: returns either:
     *   - `{ user }` (immediately authenticated, no 2FA)
     *   - `{ requires_mfa: true, temp_token }` (caller must drive the 2FA UI
     *     and then call `verifyMfa(temp_token, code)` to finish)
     */
    const login = async (email, password) => {
        const { data } = await api.post("/auth/login", { email, password });
        if (data?.requires_mfa && data?.temp_token) {
            return { requires_mfa: true, temp_token: data.temp_token };
        }
        setAuthToken(data.token);
        setRefreshToken(data.refresh_token || null);
        setUser(data.user);
        _syncReadOnly(data.user);
        if (data?.user?.id) setSentryUser(data.user.id);
        try { track.login({ method: "email" }); track.identify(data.user); } catch (_) { /* analytics best-effort */ }
        await refreshHousehold();
        return data.user;
    };

    const verifyMfa = async (tempToken, code) => {
        const { data } = await api.post("/auth/mfa/verify", { temp_token: tempToken, code });
        setAuthToken(data.token);
        setRefreshToken(data.refresh_token || null);
        setUser(data.user);
        _syncReadOnly(data.user);
        if (data?.user?.id) setSentryUser(data.user.id);
        try { track.login({ method: "email-2fa" }); track.identify(data.user); } catch (_) { /* analytics best-effort */ }
        await refreshHousehold();
        return data.user;
    };

    const signup = async (payload) => {
        const { data } = await api.post("/auth/signup", payload);
        setAuthToken(data.token);
        setRefreshToken(data.refresh_token || null);
        setUser(data.user);
        if (data?.user?.id) setSentryUser(data.user.id);
        return data.user;
    };

    const completeGoogleAuth = async (sessionId) => {
        const { data } = await api.post("/auth/google-session", { session_id: sessionId });
        setAuthToken(data.token);
        setRefreshToken(data.refresh_token || null);
        setUser(data.user);
        if (data?.user?.id) setSentryUser(data.user.id);
        try { track.login({ method: "google" }); track.identify(data.user); } catch (_) { /* analytics best-effort */ }
        await refreshHousehold();
        setLoading(false);
        return data.user;
    };

    const logout = async () => {
        try { await api.post("/auth/logout"); } catch { /* ignore */ }
        try { track.logout(); track.reset(); } catch (_) { /* analytics best-effort */ }
        // PERSONA-1, clear cached persona bundle + preview override so a
        // role switch inside the same tab can't briefly show cached tokens.
        try {
            const { clearPersonaCache, setPersonaPreview } = await import("@/lib/persona");
            clearPersonaCache();
            setPersonaPreview(null);
        } catch (_) { /* best-effort */ }
        setAuthToken(null);
        setRefreshToken(null);
        setUser(null);
        setHousehold(null);
        _syncReadOnly(null);
        clearSentryUser();
    };

    return (
        <AuthContext.Provider
            value={{ user, household, loading, login, verifyMfa, signup, logout, refreshHousehold, refreshUser, setUser, completeGoogleAuth }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
