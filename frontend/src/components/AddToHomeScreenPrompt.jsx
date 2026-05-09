import React, { useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { Download, X, Smartphone } from "lucide-react";

/**
 * AddToHomeScreenPrompt
 * Shows a non-intrusive bottom-bar prompt encouraging mobile visitors to install
 * Wayly as a PWA. Two paths:
 *   - Android/Chromium: hooks the `beforeinstallprompt` event and triggers the
 *     native install dialog.
 *   - iOS Safari: shows a hint with the Share → Add to Home Screen instruction
 *     (Apple doesn't expose a programmatic install API).
 *
 * Suppressed on auth pages, when already running standalone (PWA installed),
 * after the user dismisses, and after a full install.
 */

const DISMISS_KEY = "wayly_a2hs_dismissed_v1";
const SEEN_KEY = "wayly_a2hs_seen_at";

const HIDE_ON = ["/login", "/signup", "/forgot", "/reset", "/auth/callback", "/auth-callback", "/billing/success", "/invite", "/onboarding"];

function isStandalone() {
    return (
        window.matchMedia?.("(display-mode: standalone)").matches ||
        window.navigator.standalone === true
    );
}

function isMobile() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
}

function isIOS() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
}

export default function AddToHomeScreenPrompt() {
    const { pathname } = useLocation();
    const [installEvent, setInstallEvent] = useState(null);
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (isStandalone()) return;
        if (!isMobile()) return;

        let dismissed = false;
        try { dismissed = !!localStorage.getItem(DISMISS_KEY); } catch {}
        if (dismissed) return;

        const onBIP = (e) => {
            e.preventDefault();
            setInstallEvent(e);
            scheduleShow();
        };
        const onInstalled = () => {
            try { localStorage.setItem(DISMISS_KEY, "installed"); } catch {}
            setShow(false);
            setInstallEvent(null);
        };
        window.addEventListener("beforeinstallprompt", onBIP);
        window.addEventListener("appinstalled", onInstalled);

        function scheduleShow() {
            // Defer 5s so it doesn't fire during page-load animation
            const t = setTimeout(() => setShow(true), 5000);
            return () => clearTimeout(t);
        }

        // iOS doesn't fire beforeinstallprompt — schedule directly
        if (isIOS()) {
            const cancel = scheduleShow();
            return () => {
                window.removeEventListener("beforeinstallprompt", onBIP);
                window.removeEventListener("appinstalled", onInstalled);
                cancel?.();
            };
        }
        return () => {
            window.removeEventListener("beforeinstallprompt", onBIP);
            window.removeEventListener("appinstalled", onInstalled);
        };
    }, []);

    const dismiss = useCallback(() => {
        try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
        setShow(false);
    }, []);

    const install = useCallback(async () => {
        if (!installEvent) return;
        try {
            installEvent.prompt();
            const choice = await installEvent.userChoice;
            if (choice?.outcome === "accepted") {
                try { localStorage.setItem(DISMISS_KEY, "installed"); } catch {}
            } else {
                try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
            }
            setShow(false);
            setInstallEvent(null);
        } catch {
            setShow(false);
        }
    }, [installEvent]);

    const hidden = HIDE_ON.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (!show || hidden) return null;

    const ios = isIOS();

    return (
        <div
            data-testid="a2hs-prompt"
            className="fixed bottom-20 md:bottom-5 left-3 right-3 md:left-auto md:right-5 md:w-[380px] z-[55] rounded-xl border border-kindred bg-surface shadow-2xl p-4 animate-help-chat-in"
            role="dialog"
            aria-label="Install Wayly"
        >
            <div className="flex items-start gap-3">
                <div className="flex-none h-10 w-10 rounded-lg bg-primary-k flex items-center justify-center">
                    <Smartphone className="h-5 w-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="font-heading text-base text-primary-k">Install Wayly</div>
                    {ios ? (
                        <p className="text-xs text-muted-k mt-1 leading-relaxed">
                            For an app-like experience, tap <strong>Share</strong>{" "}
                            <span aria-hidden="true">⎙</span> then <strong>Add to Home Screen</strong>.
                        </p>
                    ) : (
                        <p className="text-xs text-muted-k mt-1 leading-relaxed">
                            Get the app on your home screen — works offline, opens fullscreen, no app-store install needed.
                        </p>
                    )}
                    {!ios && (
                        <button
                            type="button"
                            onClick={install}
                            data-testid="a2hs-install"
                            className="mt-3 inline-flex items-center gap-1.5 bg-primary-k text-white text-sm rounded-md px-3 py-1.5 hover:bg-[#16294a]"
                        >
                            <Download className="h-3.5 w-3.5" /> Install now
                        </button>
                    )}
                </div>
                <button
                    type="button"
                    onClick={dismiss}
                    aria-label="Dismiss"
                    data-testid="a2hs-dismiss"
                    className="rounded-md p-1 text-muted-k hover:text-primary-k hover:bg-surface-2"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
