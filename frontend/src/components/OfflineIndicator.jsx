import React, { useEffect, useRef, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Registers the SW + renders an "offline" banner ONLY when we can confirm
 * the network is actually down. We don't trust `navigator.onLine` alone
 * because it is famously unreliable (false offlines after sleep/wake,
 * VPN switches, captive portals, some Chromium connection-state edge
 * cases). Instead we treat `navigator.onLine === false` as a *signal* and
 * confirm with a real HEAD request to `/api/health` before showing the
 * banner. Same on the way back up, we keep the banner only while the
 * probe keeps failing.
 */
const PROBE_PATH = "/api/health";
const PROBE_TIMEOUT_MS = 4000;
const PROBE_INTERVAL_MS = 15000;

async function probeOnline() {
    const apiBase = process.env.REACT_APP_BACKEND_URL || "";
    const url = `${apiBase}${PROBE_PATH}?_t=${Date.now()}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    try {
        const res = await fetch(url, { method: "GET", cache: "no-store", signal: ctrl.signal });
        return res.ok || res.status === 401 || res.status === 403; // any HTTP response means the network is up
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
}

export default function OfflineIndicator() {
    const [offline, setOffline] = useState(false);
    const probeTimerRef = useRef(null);

    useEffect(() => {
        // Best-effort: register the service worker once (production only).
        if (typeof window !== "undefined" && "serviceWorker" in navigator && process.env.NODE_ENV === "production") {
            window.addEventListener("load", () => {
                navigator.serviceWorker.register("/sw.js").catch(() => { /* ignore */ });
            });
        }

        let cancelled = false;

        const confirmAndSet = async () => {
            const isUp = await probeOnline();
            if (cancelled) return;
            setOffline(!isUp);
            if (!isUp) {
                // Keep re-probing while offline so we hide the banner the moment we recover.
                probeTimerRef.current = setTimeout(confirmAndSet, PROBE_INTERVAL_MS);
            }
        };

        const onOffline = () => { confirmAndSet(); };
        const onOnline = () => {
            // Browser thinks we're back. Confirm with a probe before hiding the banner.
            if (probeTimerRef.current) clearTimeout(probeTimerRef.current);
            confirmAndSet();
        };

        // Initial check: if the browser claims we're offline at mount, probe before showing the banner.
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
            confirmAndSet();
        }

        window.addEventListener("online", onOnline);
        window.addEventListener("offline", onOffline);
        return () => {
            cancelled = true;
            if (probeTimerRef.current) clearTimeout(probeTimerRef.current);
            window.removeEventListener("online", onOnline);
            window.removeEventListener("offline", onOffline);
        };
    }, []);

    if (!offline) return null;
    return (
        <div
            data-testid="offline-indicator"
            className="fixed top-3 left-1/2 -translate-x-1/2 z-50 bg-terra text-white text-xs rounded-full px-4 py-2 shadow-lg flex items-center gap-2"
        >
            <WifiOff className="h-3.5 w-3.5" />
            You are offline · cached views still work; new uploads will retry when you are back.
        </div>
    );
}
