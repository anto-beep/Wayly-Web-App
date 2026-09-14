/**
 * Wayly admin theme hook, single source of truth so the top-bar toggle
 * and the /admin/preferences radiogroup stay in sync while both are
 * mounted. Persists to localStorage["wayly.admin.theme"] and dispatches
 * a custom "wayly:admin-theme" event so every mounted subscriber gets
 * the update immediately, without needing to remount or navigate.
 *
 * Default theme is "light" (matches the consumer app), overridable by
 * the localStorage entry.
 */
import { useCallback, useEffect, useState } from "react";

const KEY = "wayly.admin.theme";
const EVT = "wayly:admin-theme";
const DEFAULT = "light";

function _read() {
    try { return window.localStorage.getItem(KEY) || DEFAULT; }
    catch { return DEFAULT; }
}

function _apply(t) {
    const root = document.querySelector(".admin-root");
    if (root) root.setAttribute("data-theme", t);
}

export function useAdminTheme() {
    const [theme, setTheme] = useState(_read);

    // Push local changes to localStorage + broadcast + apply to root.
    const set = useCallback((t) => {
        try { window.localStorage.setItem(KEY, t); } catch { /* ignore */ }
        _apply(t);
        setTheme(t);
        try { window.dispatchEvent(new CustomEvent(EVT, { detail: { theme: t } })); }
        catch { /* ignore */ }
    }, []);

    // Subscribe to same-origin updates (top-bar OR Preferences).
    useEffect(() => {
        const on = (e) => {
            const next = e?.detail?.theme || _read();
            if (next !== theme) setTheme(next);
        };
        const onStorage = (e) => {
            if (e.key === KEY && e.newValue && e.newValue !== theme) {
                setTheme(e.newValue);
                _apply(e.newValue);
            }
        };
        window.addEventListener(EVT, on);
        window.addEventListener("storage", onStorage);
        _apply(theme);
        return () => {
            window.removeEventListener(EVT, on);
            window.removeEventListener("storage", onStorage);
        };
    }, [theme]);

    return [theme, set];
}
