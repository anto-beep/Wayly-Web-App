import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import axios from "axios";

const TOKEN_KEY = "wayly_admin_token";
const BACKEND = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND}/api`;

// Separate axios instance so admin tokens never leak into the user app.
export const adminApi = axios.create({ baseURL: API });
adminApi.interceptors.request.use((cfg) => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (t) cfg.headers.Authorization = `Bearer ${t}`;
    return cfg;
});

const AdminAuthContext = createContext(null);

export function AdminAuthProvider({ children }) {
    const [admin, setAdmin] = useState(null);
    const [loading, setLoading] = useState(true);
    const [token, setTokenState] = useState(() => localStorage.getItem(TOKEN_KEY));

    const setToken = useCallback((t) => {
        if (t) localStorage.setItem(TOKEN_KEY, t);
        else localStorage.removeItem(TOKEN_KEY);
        setTokenState(t);
    }, []);

    const refreshMe = useCallback(async () => {
        const t = localStorage.getItem(TOKEN_KEY);
        if (!t) {
            setAdmin(null);
            setLoading(false);
            return;
        }
        try {
            const r = await adminApi.get("/admin/auth/me");
            setAdmin(r.data.admin);
        } catch {
            localStorage.removeItem(TOKEN_KEY);
            setAdmin(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refreshMe();
    }, [refreshMe]);

    const logout = useCallback(async () => {
        try { await adminApi.post("/admin/auth/logout"); } catch { /* ignore */ }
        setToken(null);
        setAdmin(null);
    }, [setToken]);

    return (
        <AdminAuthContext.Provider value={{ admin, token, loading, setToken, setAdmin, refreshMe, logout }}>
            {children}
        </AdminAuthContext.Provider>
    );
}

export function useAdminAuth() {
    const ctx = useContext(AdminAuthContext);
    if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
    return ctx;
}
