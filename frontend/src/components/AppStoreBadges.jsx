import React, { useEffect, useState } from "react";

/**
 * App store badges with smart device detection.
 * - iOS device → App Store badge only
 * - Android   → Google Play badge only
 * - Other     → both badges side-by-side
 * Defaults to "both" before the user-agent sniff completes (SSR-safe).
 *
 * The links route to /app/ios and /app/android — server-side these can
 * redirect to the live store listings once the apps ship. For now both
 * point at the universal landing page /app-redirect.
 */
const APP_STORE_URL = "https://apps.apple.com/app/kindred-aged-care/id000000000";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=au.kindred.app";

function detectDevice() {
    if (typeof navigator === "undefined") return "both";
    const ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
    if (/Android/i.test(ua)) return "android";
    return "both";
}

function AppleBadge({ className = "" }) {
    return (
        <a
            href={APP_STORE_URL}
            data-testid="app-store-badge"
            aria-label="Download Kindred on the App Store"
            className={`inline-flex items-center gap-2.5 bg-black text-white rounded-lg px-4 py-2.5 hover:bg-[#1a1a1a] transition-colors ${className}`}
        >
            <svg viewBox="0 0 24 24" className="h-7 w-7 flex-shrink-0" fill="currentColor" aria-hidden="true">
                <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
            </svg>
            <span className="flex flex-col items-start leading-tight">
                <span className="text-[9px] uppercase tracking-wider opacity-90">Download on the</span>
                <span className="font-semibold text-base">App Store</span>
            </span>
        </a>
    );
}

function GooglePlayBadge({ className = "" }) {
    return (
        <a
            href={PLAY_STORE_URL}
            data-testid="play-store-badge"
            aria-label="Get Kindred on Google Play"
            className={`inline-flex items-center gap-2.5 bg-black text-white rounded-lg px-4 py-2.5 hover:bg-[#1a1a1a] transition-colors ${className}`}
        >
            <svg viewBox="0 0 24 24" className="h-7 w-7 flex-shrink-0" aria-hidden="true">
                <defs>
                    <linearGradient id="gp-a" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#00C7FA" /><stop offset="1" stopColor="#0081D7" />
                    </linearGradient>
                    <linearGradient id="gp-b" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0" stopColor="#FFE000" /><stop offset="1" stopColor="#FFA000" />
                    </linearGradient>
                    <linearGradient id="gp-c" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#FF3A44" /><stop offset="1" stopColor="#C31162" />
                    </linearGradient>
                    <linearGradient id="gp-d" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0" stopColor="#00F076" /><stop offset="1" stopColor="#00A152" />
                    </linearGradient>
                </defs>
                <path fill="url(#gp-a)" d="M3.6 1.6c-.4.3-.6.8-.6 1.4v18c0 .6.2 1.1.6 1.4l9.4-10.4z" />
                <path fill="url(#gp-b)" d="M16.6 8.5l-3.6 3.5 3.6 3.5 4.6-2.6c1.2-.7 1.2-2.1 0-2.8z" />
                <path fill="url(#gp-c)" d="M3.6 22.4c.5.4 1.2.4 1.9 0l11.1-6.4-3.6-3.5z" />
                <path fill="url(#gp-d)" d="M3.6 1.6L13 12l3.6-3.5L5.5 2.1c-.3-.2-.7-.3-1-.3-.3 0-.6.1-.9.2z" />
            </svg>
            <span className="flex flex-col items-start leading-tight">
                <span className="text-[9px] uppercase tracking-wider opacity-90">Get it on</span>
                <span className="font-semibold text-base">Google Play</span>
            </span>
        </a>
    );
}

export default function AppStoreBadges({ className = "", align = "start" }) {
    const [device, setDevice] = useState("both");
    useEffect(() => { setDevice(detectDevice()); }, []);
    const justifyCls = align === "center" ? "justify-center" : align === "end" ? "justify-end" : "justify-start";
    return (
        <div className={`flex flex-wrap items-center gap-3 ${justifyCls} ${className}`} data-testid="app-store-badges">
            {(device === "ios" || device === "both") && <AppleBadge />}
            {(device === "android" || device === "both") && <GooglePlayBadge />}
        </div>
    );
}
