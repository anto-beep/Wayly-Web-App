import React, { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/** Registers the SW + renders an "offline" banner when navigator.onLine is false. */
export default function OfflineIndicator() {
    const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);

    useEffect(() => {
        // Best-effort: register the service worker once (production only).
        if (typeof window !== "undefined" && "serviceWorker" in navigator && process.env.NODE_ENV === "production") {
            window.addEventListener("load", () => {
                navigator.serviceWorker.register("/sw.js").catch(() => { /* ignore */ });
            });
        }
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener("online", on);
        window.addEventListener("offline", off);
        return () => {
            window.removeEventListener("online", on);
            window.removeEventListener("offline", off);
        };
    }, []);

    if (online) return null;
    return (
        <div
            data-testid="offline-indicator"
            className="fixed top-3 left-1/2 -translate-x-1/2 z-50 bg-terra text-white text-xs rounded-full px-4 py-2 shadow-lg flex items-center gap-2"
        >
            <WifiOff className="h-3.5 w-3.5" />
            You're offline · cached views still work; new uploads will retry when you're back.
        </div>
    );
}
