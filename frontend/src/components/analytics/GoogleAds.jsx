import React, { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * GoogleAds — Google Ads conversion tag + cookie consent for wayly.com.au.
 *
 * - Consent-mode DEFAULTS live in public/index.html (ad_* denied) and load
 *   before this component, so Google never reads/writes ad cookies until the
 *   visitor opts in.
 * - The Google tag (gtag.js) is injected ONLY on public pages. It is never
 *   loaded inside the signed-in app / dashboard routes below.
 * - A first-visit cookie banner lets the visitor Accept all, keep Only
 *   necessary, or Choose. The choice is remembered in localStorage.
 * - We never pass user data (statement contents, amounts, names, levels,
 *   service details) to any event — only the base config fires here.
 */

const GA_ADS_ID = "AW-18544177324";
const CONSENT_KEY = "wayly_cookie_consent";

// Signed-in app / dashboard shells — the Google tag must NOT load here.
const APP_PREFIXES = ["/app", "/onboarding", "/journey", "/adviser"];

function isAppRoute(pathname) {
    return APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function readConsent() {
    try {
        const raw = localStorage.getItem(CONSENT_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function updateAdConsent(granted) {
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;
    window.gtag("consent", "update", {
        ad_storage: granted ? "granted" : "denied",
        ad_user_data: granted ? "granted" : "denied",
        ad_personalization: granted ? "granted" : "denied",
    });
}

let tagInjected = false;
function injectGoogleTag() {
    if (tagInjected || typeof document === "undefined") return;
    tagInjected = true;
    if (!document.getElementById("ga-ads-src")) {
        const s = document.createElement("script");
        s.async = true;
        s.id = "ga-ads-src";
        s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ADS_ID}`;
        document.head.appendChild(s);
    }
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== "function") {
        window.gtag = function () { window.dataLayer.push(arguments); };
    }
    window.gtag("js", new Date());
    window.gtag("config", GA_ADS_ID);
}

const META_PIXEL_ID = "1307197805819885";

let metaInjected = false;
function injectMetaPixel() {
    if (metaInjected || typeof window === "undefined" || typeof document === "undefined") return;
    metaInjected = true;
    // Standard Meta Pixel bootstrap (defines window.fbq synchronously, then
    // lazy-loads fbevents.js).
    if (!window.fbq) {
        const n = (window.fbq = function () {
            if (n.callMethod) {
                n.callMethod.apply(n, arguments);
            } else {
                n.queue.push(arguments);
            }
        });
        if (!window._fbq) window._fbq = n;
        n.push = n;
        n.loaded = true;
        n.version = "2.0";
        n.queue = [];
        if (!document.getElementById("meta-pixel-src")) {
            const t = document.createElement("script");
            t.async = true;
            t.id = "meta-pixel-src";
            t.src = "https://connect.facebook.net/en_US/fbevents.js";
            const s = document.getElementsByTagName("script")[0];
            s.parentNode.insertBefore(t, s);
        }
    }
    // Consent OFF until the visitor accepts advertising — revoke BEFORE init.
    window.fbq("consent", "revoke");
    window.fbq("init", META_PIXEL_ID);
}

function grantMetaConsent() {
    if (typeof window !== "undefined" && typeof window.fbq === "function") {
        window.fbq("consent", "grant");
    }
}

export default function GoogleAds() {
    const { pathname } = useLocation();
    const publicRoute = !isAppRoute(pathname);
    const [consent, setConsent] = useState(() => readConsent());
    const [choosing, setChoosing] = useState(false);
    const [adsOn, setAdsOn] = useState(false);

    // On public pages: load the Google tag + Meta Pixel and re-apply stored ad consent.
    useEffect(() => {
        if (!publicRoute) return;
        injectGoogleTag();
        injectMetaPixel();
        if (consent && consent.ads) { updateAdConsent(true); grantMetaConsent(); }
    }, [publicRoute, consent]);

    // Meta Pixel PageView on every public page (held until consent is granted).
    useEffect(() => {
        if (!publicRoute) return;
        if (typeof window !== "undefined" && typeof window.fbq === "function") {
            window.fbq("track", "PageView");
        }
    }, [pathname, publicRoute]);

    const decide = useCallback((ads) => {
        const value = { ads: !!ads, v: 1, ts: Date.now() };
        try { localStorage.setItem(CONSENT_KEY, JSON.stringify(value)); } catch { /* ignore */ }
        if (ads) { updateAdConsent(true); grantMetaConsent(); }
        setChoosing(false);
        setConsent(value);
    }, []);

    // Banner only on public pages, only until a choice is stored.
    if (!publicRoute || consent) return null;

    return (
        <div
            data-testid="cookie-consent-banner"
            role="dialog"
            aria-label="Cookie choices"
            className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 pointer-events-none"
        >
            <div className="pointer-events-auto mx-auto max-w-3xl rounded-2xl border border-kindred bg-surface shadow-xl p-5 sm:p-6">
                <p className="text-sm leading-relaxed text-primary-k">
                    We use cookies to see how people use Wayly and, if you agree, to measure our ads on
                    Google. We never share what you paste or upload into our tools.
                </p>

                {choosing && (
                    <div data-testid="cookie-choose-panel" className="mt-4 rounded-xl bg-kindred/60 p-4">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="text-sm font-medium text-primary-k">Essential &amp; analytics</p>
                                <p className="text-xs text-muted-k">Always on — needed to run Wayly.</p>
                            </div>
                            <span className="text-xs font-medium text-muted-k">Always on</span>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-4 border-t border-kindred pt-3">
                            <div>
                                <p className="text-sm font-medium text-primary-k">Advertising measurement</p>
                                <p className="text-xs text-muted-k">Let us measure our Google ads.</p>
                            </div>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={adsOn}
                                data-testid="cookie-ads-toggle"
                                onClick={() => setAdsOn((v) => !v)}
                                className={`relative h-6 w-11 flex-none rounded-full transition-colors ${adsOn ? "bg-primary-k" : "bg-muted-k/40"}`}
                            >
                                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${adsOn ? "left-[22px]" : "left-0.5"}`} />
                            </button>
                        </div>
                        <button
                            type="button"
                            data-testid="cookie-save-choices"
                            onClick={() => decide(adsOn)}
                            className="mt-4 w-full rounded-full bg-primary-k text-white text-sm font-medium px-5 py-2.5 hover:bg-primary-k/90"
                        >
                            Save my choices
                        </button>
                    </div>
                )}

                {!choosing && (
                    <div className="mt-4 flex flex-col sm:flex-row gap-2.5">
                        <button
                            type="button"
                            data-testid="cookie-accept-all"
                            onClick={() => decide(true)}
                            className="order-1 sm:order-3 flex-1 rounded-full bg-primary-k text-white text-sm font-medium px-5 py-2.5 hover:bg-primary-k/90"
                        >
                            Accept all
                        </button>
                        <button
                            type="button"
                            data-testid="cookie-only-necessary"
                            onClick={() => decide(false)}
                            className="order-2 flex-1 rounded-full border border-kindred text-primary-k text-sm font-medium px-5 py-2.5 hover:bg-kindred/60"
                        >
                            Only necessary
                        </button>
                        <button
                            type="button"
                            data-testid="cookie-choose"
                            onClick={() => { setAdsOn(false); setChoosing(true); }}
                            className="order-3 sm:order-1 flex-1 rounded-full border border-kindred text-primary-k text-sm font-medium px-5 py-2.5 hover:bg-kindred/60"
                        >
                            Choose
                        </button>
                    </div>
                )}

                <p className="mt-3 text-xs text-muted-k">
                    More in our <a href="/legal/cookies" className="underline">Cookie Policy</a> and{" "}
                    <a href="/legal/privacy" className="underline">Privacy Policy</a>.
                </p>
            </div>
        </div>
    );
}
