import React, { useEffect, useState } from "react";
import { X, Smartphone } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { APP_STORE_URL, PLAY_STORE_URL, detectDevice } from "@/components/AppStoreBadges";

/**
 * InAppNudge
 *
 * One-time "open in the app" tip for SIGNED-IN users who browse the web app
 * often on their PHONE. Shows once they've visited a few times (and only
 * after the general top download banner has been dismissed, to avoid a double
 * prompt). Android gets a live Google Play link; iOS shows a coming-soon note
 * until APP_STORE_URL is set. Dismissal is permanent (per browser).
 */
const VISIT_KEY = "wayly:app-visits";
const SHOWN_KEY = "wayly:app-nudge-shown";
const BANNER_DISMISS_KEY = "wayly:app-download-dismissed";
const VISIT_THRESHOLD = 3;

export default function InAppNudge() {
    const { user } = useAuth();
    const [show, setShow] = useState(false);
    const [device, setDevice] = useState("both");

    useEffect(() => {
        if (!user) return;
        const d = detectDevice();
        setDevice(d);
        if (d !== "android" && d !== "ios") return; // phones only
        let shown = false, bannerDismissed = false, visits = 0;
        try {
            shown = localStorage.getItem(SHOWN_KEY) === "1";
            bannerDismissed = localStorage.getItem(BANNER_DISMISS_KEY) === "1";
            visits = parseInt(localStorage.getItem(VISIT_KEY) || "0", 10) + 1;
            localStorage.setItem(VISIT_KEY, String(visits));
        } catch { /* ignore */ }
        if (!shown && bannerDismissed && visits >= VISIT_THRESHOLD) setShow(true);
    }, [user]);

    if (!show) return null;

    const iosLive = Boolean(APP_STORE_URL);
    const canOpen = device === "android" ? Boolean(PLAY_STORE_URL) : iosLive;
    const href = device === "ios" ? APP_STORE_URL : PLAY_STORE_URL;

    const close = () => {
        setShow(false);
        try { localStorage.setItem(SHOWN_KEY, "1"); } catch { /* ignore */ }
    };

    return (
        <div
            data-testid="in-app-nudge"
            className="fixed left-1/2 -translate-x-1/2 bottom-24 z-[56] w-[min(420px,calc(100vw-1.5rem))]"
        >
            <div className="relative rounded-2xl border border-[#0E4D52]/15 bg-white shadow-[0_18px_48px_rgba(14,77,82,0.28)] p-4 pr-10">
                <div className="flex items-center gap-3">
                    <div className="h-11 w-11 flex-none rounded-xl bg-[#0E4D52] flex items-center justify-center">
                        <Smartphone className="h-5 w-5 text-white" />
                    </div>
                    <div className="min-w-0">
                        <div className="text-sm font-semibold text-[#0E2A47]">You&apos;re on Wayly a lot — try the app</div>
                        <div className="text-xs text-[#5B6B7A] mt-0.5">It&apos;s faster for statements, invoices and your budget on the go.</div>
                    </div>
                </div>
                {canOpen ? (
                    <a
                        href={href}
                        rel="noopener noreferrer"
                        onClick={close}
                        data-testid="in-app-nudge-cta"
                        className="mt-3 block w-full text-center rounded-lg bg-[#A5512B] text-white text-sm font-semibold px-4 py-2.5 hover:bg-[#8E4523] transition-colors"
                    >
                        Open in the app
                    </a>
                ) : (
                    <div className="mt-3 text-center text-xs text-[#5B6B7A]">Coming soon to the App Store.</div>
                )}
                <button
                    type="button"
                    onClick={close}
                    aria-label="Dismiss"
                    data-testid="in-app-nudge-dismiss"
                    className="absolute top-2 right-2 rounded-md p-1 text-[#5B6B7A] hover:bg-[#0E4D52]/[0.08]"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}
