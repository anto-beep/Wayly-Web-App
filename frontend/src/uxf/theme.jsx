/**
 * UXF-1 v3 theme provider.
 *
 * Renders a `data-theme` attribute on `<html>` from either:
 *   1. an explicit user preference stored in localStorage("uxf_theme")
 *   2. the system-level `prefers-color-scheme` media query, if the user
 *      has not chosen manually
 *
 * The provider stays passive (never overrides the user's manual choice
 * once made) and syncs on system-preference change events.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "wayly:app:appearance";
const ATTR = "data-theme";
const DARK_CLASS = "theme-dark";
const ThemeCtx = createContext(null);

function readSystemPreference() {
    if (typeof window === "undefined" || !window.matchMedia) return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredPreference() {
    if (typeof window === "undefined") return null;
    try {
        const v = window.localStorage.getItem(STORAGE_KEY);
        return v === "dark" || v === "light" ? v : null;
    } catch { return null; }
}

function isAuthRoute() {
    if (typeof window === "undefined") return false;
    return /^\/(login|signup|forgot|reset|verify-email)/i.test(window.location.pathname || "");
}

function applyTheme(theme) {
    if (typeof document === "undefined") return;
    // Auth pages (login / signup / password reset / email verify) always
    // render in light mode regardless of the saved preference, so they look
    // identical to light mode. This is the lowest-level writer of the theme
    // class/attribute, so guarding here keeps refreshes on those routes light.
    const effectiveTheme = isAuthRoute() ? "light" : theme;
    document.documentElement.setAttribute(ATTR, effectiveTheme);
    // Mirror the legacy class-name convention (`AppearanceScope` writes
    // this same class) so any CSS that keyed on `.theme-dark` still
    // works during the UXF-1 v3 rollout.
    document.documentElement.classList.toggle(DARK_CLASS, effectiveTheme === "dark");
}

export function ThemeProvider({ children }) {
    const [override, setOverride] = useState(() => readStoredPreference());
    const [systemPref, setSystemPref] = useState(() => readSystemPreference());

    // Watch for system-preference changes when the user has no manual
    // override yet. Once they toggle manually, stop honouring changes.
    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return undefined;
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const handler = (e) => setSystemPref(e.matches ? "dark" : "light");
        if (mq.addEventListener) mq.addEventListener("change", handler);
        else if (mq.addListener) mq.addListener(handler);
        return () => {
            if (mq.removeEventListener) mq.removeEventListener("change", handler);
            else if (mq.removeListener) mq.removeListener(handler);
        };
    }, []);

    // Default to LIGHT for any new session (ignore OS dark preference).
    // Dark mode only applies when the user has explicitly chosen it via the
    // accessibility widget / Settings; that choice is cleared on logout.
    const effective = override || "light";

    // Reflect on <html>
    useEffect(() => { applyTheme(effective); }, [effective]);

    const setTheme = useCallback((next) => {
        setOverride(next);
        try {
            if (next === null) window.localStorage.removeItem(STORAGE_KEY);
            else window.localStorage.setItem(STORAGE_KEY, next);
        } catch { /* ignore */ }
    }, []);

    const value = useMemo(() => ({
        theme: effective,
        isDark: effective === "dark",
        override,
        systemPref,
        setTheme,
        useSystemPreference: () => setTheme(null),
    }), [effective, override, systemPref, setTheme]);

    return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
    const ctx = useContext(ThemeCtx);
    if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
    return ctx;
}
