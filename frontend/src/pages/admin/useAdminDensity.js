/**
 * Wayly admin density hook - mirrors useAdminTheme but for row density.
 * Stored in localStorage["wayly.admin.density"], broadcast via a
 * "wayly:admin-density" CustomEvent so the top-bar shell + Preferences
 * page stay in sync while both are mounted.
 *
 * Values: "comfortable" (default) | "compact".
 * Applied by writing data-density to .admin-root; admin.css has
 * density rules under .admin-root[data-density="compact"] ...
 */
import { useCallback, useEffect, useState } from "react";

const KEY = "wayly.admin.density";
const EVT = "wayly:admin-density";
const DEFAULT = "comfortable";

function _read() {
    try { return window.localStorage.getItem(KEY) || DEFAULT; }
    catch { return DEFAULT; }
}
function _apply(d) {
    const root = document.querySelector(".admin-root");
    if (root) root.setAttribute("data-density", d);
}

export function useAdminDensity() {
    const [density, setDensity] = useState(_read);
    const set = useCallback((d) => {
        try { window.localStorage.setItem(KEY, d); } catch { /* ignore */ }
        _apply(d);
        setDensity(d);
        try { window.dispatchEvent(new CustomEvent(EVT, { detail: { density: d } })); }
        catch { /* ignore */ }
    }, []);
    useEffect(() => {
        const on = (e) => {
            const next = e?.detail?.density || _read();
            if (next !== density) setDensity(next);
        };
        const onStorage = (e) => {
            if (e.key === KEY && e.newValue && e.newValue !== density) {
                setDensity(e.newValue);
                _apply(e.newValue);
            }
        };
        window.addEventListener(EVT, on);
        window.addEventListener("storage", onStorage);
        _apply(density);
        return () => {
            window.removeEventListener(EVT, on);
            window.removeEventListener("storage", onStorage);
        };
    }, [density]);
    return [density, set];
}
