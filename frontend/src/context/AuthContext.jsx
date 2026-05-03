import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setAuthToken } from "@/lib/api";

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
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, [refreshHousehold]);

    useEffect(() => {
        bootstrap();
    }, [bootstrap]);

    const login = async (email, password) => {
        const { data } = await api.post("/auth/login", { email, password });
        setAuthToken(data.token);
        setUser(data.user);
        await refreshHousehold();
        return data.user;
    };

    const signup = async (payload) => {
        const { data } = await api.post("/auth/signup", payload);
        setAuthToken(data.token);
        setUser(data.user);
        return data.user;
    };

    const completeGoogleAuth = async (sessionId) => {
        const { data } = await api.post("/auth/google-session", { session_id: sessionId });
        setAuthToken(data.token);
        setUser(data.user);
        await refreshHousehold();
        setLoading(false);
        return data.user;
    };

    const logout = async () => {
        try { await api.post("/auth/logout"); } catch { /* ignore */ }
        setAuthToken(null);
        setUser(null);
        setHousehold(null);
    };

    return (
        <AuthContext.Provider
            value={{ user, household, loading, login, signup, logout, refreshHousehold, refreshUser, setUser, completeGoogleAuth }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
