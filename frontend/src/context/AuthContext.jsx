import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setAuthToken, setRefreshToken } from "@/lib/api";
import { track } from "@/lib/analytics";

const AuthContext = createContext(null);

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
            return data;
        } catch {
            return null;
        }
    }, []);

    const bootstrap = useCallback(async () => {
        // CRITICAL: If returning from Emergent OAuth, skip the /me check —
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
            await refreshHousehold();
        } catch {
            setAuthToken(null);
            setRefreshToken(null);
            setUser(null);
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
        try { track.login({ method: "email" }); track.identify(data.user); } catch (_) { /* analytics best-effort */ }
        await refreshHousehold();
        return data.user;
    };

    const verifyMfa = async (tempToken, code) => {
        const { data } = await api.post("/auth/mfa/verify", { temp_token: tempToken, code });
        setAuthToken(data.token);
        setRefreshToken(data.refresh_token || null);
        setUser(data.user);
        try { track.login({ method: "email-2fa" }); track.identify(data.user); } catch (_) { /* analytics best-effort */ }
        await refreshHousehold();
        return data.user;
    };

    const signup = async (payload) => {
        const { data } = await api.post("/auth/signup", payload);
        setAuthToken(data.token);
        setRefreshToken(data.refresh_token || null);
        setUser(data.user);
        return data.user;
    };

    const completeGoogleAuth = async (sessionId) => {
        const { data } = await api.post("/auth/google-session", { session_id: sessionId });
        setAuthToken(data.token);
        setRefreshToken(data.refresh_token || null);
        setUser(data.user);
        try { track.login({ method: "google" }); track.identify(data.user); } catch (_) { /* analytics best-effort */ }
        await refreshHousehold();
        setLoading(false);
        return data.user;
    };

    const logout = async () => {
        try { await api.post("/auth/logout"); } catch { /* ignore */ }
        try { track.logout(); track.reset(); } catch (_) { /* analytics best-effort */ }
        setAuthToken(null);
        setRefreshToken(null);
        setUser(null);
        setHousehold(null);
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
