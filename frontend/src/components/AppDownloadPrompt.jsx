import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useLocation } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { APP_STORE_URL, PLAY_STORE_URL, detectDevice } from "@/components/AppStoreBadges";

/**
 * AppDownloadPrompt
 *
 * Slim, dismissible, in-flow top banner that nudges web visitors to install
 * the native app. Device-aware:
 *   - Android  → direct Google Play link (live)
 *   - iOS      → App Store link once APP_STORE_URL is set; until then a
 *                calm "coming soon" message (no dead-end link)
 *   - Desktop  → "get it on your phone" with the Google Play link
 *
 * Rendered once at the app root (above the routed page) so it pushes content
 * down instead of overlapping the sticky header or the corner floating
 * widgets. Hidden on auth and admin routes, and once dismissed.
 */
const DISMISS_KEY = "wayly:app-download-dismissed";

export default function AppDownloadPrompt() {
    const { pathname } = useLocation();
    const [device, setDevice] = useState("both");
    const [ready, setReady] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        setDevice(detectDevice());
        try { setDismissed(localStorage.getItem(DISMISS_KEY) === "1"); } catch { /* ignore */ }
        setReady(true);
    }, []);

    const onAuthRoute = /^\/(login|signup|forgot|reset|verify-email)/i.test(pathname || "");
    if (!ready || dismissed || onAuthRoute || (pathname || "").startsWith("/admin")) return null;

    const dismiss = () => {
        setDismissed(true);
        try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
    };

    const iosLive = Boolean(APP_STORE_URL);
    let message = "Get the Wayly app on your phone.";
    let href = PLAY_STORE_URL;
    let ctaLabel = "Get it on Google Play";
    let showCta = Boolean(PLAY_STORE_URL);

    if (device === "ios") {
        if (iosLive) {
            message = "Get the Wayly app for iPhone.";
            href = APP_STORE_URL;
            ctaLabel = "Download on the App Store";
            showCta = true;
        } else {
            message = "Wayly for iPhone is coming soon to the App Store.";
            showCta = false;
        }
    } else if (device === "android") {
        message = "Get the Wayly app for Android.";
    }

    return (
        <div data-testid="app-download-prompt" className="relative z-[40] bg-[#0E4D52] text-white">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 py-2.5 flex items-center justify-center gap-3 flex-wrap pr-10 sm:pr-12">
                <span className="text-sm font-medium text-center">{message}</span>
                {showCta && (
                    <a
                        href={href}
                        rel="noopener noreferrer"
                        data-testid="app-download-cta"
                        onClick={dismiss}
                        className="inline-flex items-center gap-1.5 rounded-full bg-white text-[#0E4D52] text-xs font-semibold px-3.5 py-1.5 hover:bg-white/90 transition-colors"
                    >
                        {ctaLabel}
                    </a>
                )}
                {device === "both" && PLAY_STORE_URL && (
                    <span className="hidden md:inline-flex items-center gap-2 pl-1" data-testid="app-download-qr">
                        <span className="rounded-md bg-white p-1 leading-none">
                            <QRCodeSVG value={PLAY_STORE_URL} size={48} level="M" fgColor="#0E2A47" bgColor="#ffffff" />
                        </span>
                        <span className="text-xs text-white/80">Scan to install</span>
                    </span>
                )}
            </div>
            <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss app download prompt"
                data-testid="app-download-dismiss"
                className="absolute top-1/2 -translate-y-1/2 right-2 sm:right-4 rounded-md p-1 hover:bg-white/10"
            >
                <X className="h-4 w-4 text-white/90" />
            </button>
        </div>
    );
}
