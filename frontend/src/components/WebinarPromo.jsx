import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { X, Sparkles, Calendar, Clock, ArrowUpRight, CheckCircle2 } from "lucide-react";

/**
 * WebinarPromo — advertises the "Support at Home Explained" webinar across the
 * public website. Two coordinated surfaces:
 *   1. A premium centered pop-up that appears the moment a visitor lands on any
 *      public page — shown ONCE EVER per person (persisted), new or returning.
 *   2. A persistent top banner that stays on every public page until the event
 *      day passes (dismissible per session).
 * Everything auto-hides for everyone once the webinar date is behind us.
 */

const REGISTER_URL =
    "https://riverside.com/webinar/registration/eyJldmVudElkIjoiNmFmNTRkMjFkNTc1Mzg4ZjJiMTU5Mzg4Iiwic2x1ZyI6ImFudG9ueS1jaGl3YXJlcy1zdHVkaW8ifQ==";

// End of the webinar day in AEDT (GMT+11). After this, nothing shows.
const EVENT_END = new Date("2026-11-16T23:59:59+11:00");

const EVENT_TITLE = "Support at Home Explained";
const EVENT_SUBTITLE = "Understanding Your Statements, Fees & Funding";
const EVENT_WHEN = "Mon 16 Nov 2026 \u00b7 7:00\u20137:45 PM AEDT";
const EVENT_WHEN_SHORT = "Mon 16 Nov, 7:00 PM AEDT";

const POPUP_SEEN = "wayly_webinar_popup_seen_v1";          // localStorage — once ever
const BANNER_DISMISSED = "wayly_webinar_banner_dismissed_v1"; // sessionStorage — this visit

const APP_PREFIXES = ["/app", "/onboarding", "/journey", "/admin", "/settings", "/billing"];
const AUTH_RE = /^\/(login|signup|forgot|reset|verify-email|auth)(\/|$)/i;

function isBlockedRoute(p) {
    if (AUTH_RE.test(p)) return true;
    return APP_PREFIXES.some((x) => p === x || p.startsWith(x + "/"));
}

export function isWebinarCampaignActive() {
    return Date.now() <= EVENT_END.getTime();
}

export default function WebinarPromo() {
    const { pathname } = useLocation();
    const blocked = isBlockedRoute(pathname || "");
    const live = isWebinarCampaignActive();

    const [bannerOpen, setBannerOpen] = useState(false);
    const [showPopup, setShowPopup] = useState(false);
    const [popupVisible, setPopupVisible] = useState(false);
    const registerRef = useRef(null);

    // Banner: visible on public pages until the event passes, unless dismissed this visit.
    useEffect(() => {
        if (!live) { setBannerOpen(false); return; }
        let dismissed = false;
        try { dismissed = sessionStorage.getItem(BANNER_DISMISSED) === "1"; } catch { /* ignore */ }
        setBannerOpen(!dismissed);
    }, [live]);

    // Pop-up: once ever, shortly after landing on a public page.
    useEffect(() => {
        if (!live || blocked) return;
        let seen = false;
        try { seen = localStorage.getItem(POPUP_SEEN) === "1"; } catch { /* ignore */ }
        if (seen) return;
        const t = setTimeout(() => {
            try { localStorage.setItem(POPUP_SEEN, "1"); } catch { /* ignore */ }
            window.__waylyWebinarPopupOpen = true;
            setShowPopup(true);
        }, 1200);
        return () => clearTimeout(t);
    }, [live, blocked]);

    // Enter transition + scroll lock + focus while the pop-up is open.
    useEffect(() => {
        if (!showPopup) return;
        const raf = requestAnimationFrame(() => setPopupVisible(true));
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const f = setTimeout(() => { try { registerRef.current?.focus(); } catch { /* ignore */ } }, 60);
        return () => {
            cancelAnimationFrame(raf);
            clearTimeout(f);
            document.body.style.overflow = prevOverflow;
        };
    }, [showPopup]);

    const closePopup = useCallback(() => {
        setPopupVisible(false);
        window.__waylyWebinarPopupOpen = false;
        setTimeout(() => setShowPopup(false), 250);
    }, []);

    const register = useCallback(() => {
        try { window.open(REGISTER_URL, "_blank", "noopener,noreferrer"); } catch { /* ignore */ }
        closePopup();
    }, [closePopup]);

    useEffect(() => {
        if (!showPopup) return;
        const onKey = (e) => { if (e.key === "Escape") closePopup(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [showPopup, closePopup]);

    const dismissBanner = () => {
        setBannerOpen(false);
        try { sessionStorage.setItem(BANNER_DISMISSED, "1"); } catch { /* ignore */ }
    };

    if (!live) return null;

    return (
        <>
            {/* Persistent top banner (public pages, in document flow) */}
            {bannerOpen && !blocked && (
                <div data-testid="webinar-banner" className="relative z-[41] bg-gradient-to-r from-[#0A3B40] via-[#0E4D52] to-[#17757f] text-white">
                    <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2.5 pr-10 text-center sm:px-6 sm:pr-12">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#F3D9A5] to-[#E3B261] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#5a3410]">
                            <Sparkles className="h-3 w-3" /> Free Webinar
                        </span>
                        <span className="text-sm font-medium">
                            {EVENT_TITLE} <span className="hidden sm:inline text-white/80">&mdash; {EVENT_WHEN_SHORT}</span>
                        </span>
                        <a
                            href={REGISTER_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            data-testid="webinar-banner-register"
                            className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-[#0E4D52] transition-colors hover:bg-white/90"
                        >
                            Register Free <ArrowUpRight className="h-3.5 w-3.5" />
                        </a>
                    </div>
                    <button
                        type="button"
                        onClick={dismissBanner}
                        aria-label="Dismiss webinar banner"
                        data-testid="webinar-banner-dismiss"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 hover:bg-white/10 sm:right-4"
                    >
                        <X className="h-4 w-4 text-white/90" />
                    </button>
                </div>
            )}

            {/* One-time centered pop-up */}
            {showPopup && (
                <div
                    data-testid="webinar-popup"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="webinar-popup-title"
                    className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6"
                >
                    <div
                        aria-hidden="true"
                        onClick={closePopup}
                        className={`absolute inset-0 bg-[#06201f]/70 backdrop-blur-sm transition-opacity duration-300 ${popupVisible ? "opacity-100" : "opacity-0"}`}
                    />
                    <div
                        className={`relative w-full max-w-[30rem] sm:max-w-2xl lg:max-w-3xl overflow-hidden rounded-[36px] bg-[#F4F7F6] shadow-[0_40px_100px_-20px_rgba(6,32,31,0.6)] ring-1 ring-black/5 transition-all duration-300 ease-out motion-reduce:transition-none ${popupVisible ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-5 scale-95"} max-h-[94vh] overflow-y-auto`}
                    >
                        {/* Teal header */}
                        <div className="relative overflow-hidden bg-gradient-to-br from-[#0A3B40] via-[#0E4D52] to-[#17757f] px-8 pt-12 pb-11 text-center sm:px-14">
                            <div aria-hidden="true" className="pointer-events-none absolute -top-20 -right-12 h-60 w-60 rounded-full bg-[#D99E47]/25 blur-3xl" />
                            <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-12 h-60 w-60 rounded-full bg-[#6B8F71]/30 blur-3xl" />
                            <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(120% 90% at 50% -10%, rgba(255,255,255,0.2), transparent 60%)" }} />

                            <button
                                type="button"
                                onClick={closePopup}
                                aria-label="Close"
                                data-testid="webinar-popup-close"
                                className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white ring-1 ring-white/40 backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:bg-white hover:text-[#0E4D52] focus:outline-none focus-visible:ring-2 focus-visible:ring-white motion-reduce:hover:scale-100"
                            >
                                <X className="h-5 w-5" strokeWidth={2.5} />
                            </button>

                            <span className="relative inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-[#F3D9A5] to-[#E3B261] px-4 py-2 text-[12px] font-bold uppercase tracking-[0.12em] text-[#5a3410] shadow-sm">
                                <Sparkles className="h-4 w-4" /> Free Live Webinar
                            </span>
                            <div className="relative mt-5 flex items-center justify-center gap-2 text-white/90">
                                <Calendar className="h-5 w-5" />
                                <span className="text-base font-semibold sm:text-lg">{EVENT_WHEN}</span>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="px-8 pb-11 pt-8 text-center sm:px-14 sm:pt-10">
                            <h2
                                id="webinar-popup-title"
                                className="leading-[1.08] tracking-tight [text-wrap:balance]"
                                style={{ fontFamily: "'Fraunces', Georgia, 'Times New Roman', serif", fontWeight: 600, fontSize: "clamp(2rem, 6vw, 2.9rem)", color: "#0A2022" }}
                            >
                                {EVENT_TITLE}
                            </h2>
                            <p className="mt-2 text-lg font-semibold sm:text-xl" style={{ color: "rgba(10,32,34,0.78)" }}>
                                {EVENT_SUBTITLE}
                            </p>
                            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed sm:text-[17px]" style={{ color: "rgba(10,32,34,0.66)" }}>
                                A free, easy-to-follow session on reading your Support at Home statements, fees and
                                contributions &mdash; with time for your questions. Hosted by Antony Chiware.
                            </p>

                            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0E4D52]/[0.07] px-3.5 py-2 text-[13px] font-medium text-[#0A2022]/70">
                                    <CheckCircle2 className="h-4 w-4 text-[#2D6A4F]" /> Free to join
                                </span>
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0E4D52]/[0.07] px-3.5 py-2 text-[13px] font-medium text-[#0A2022]/70">
                                    <Clock className="h-4 w-4 text-[#0E4D52]" /> 45 minutes
                                </span>
                            </div>

                            <a
                                ref={registerRef}
                                href={REGISTER_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={register}
                                data-testid="webinar-popup-register"
                                className="group relative mt-7 flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-[#B4551F] to-[#8F4323] px-7 py-5 text-[17px] font-bold text-white no-underline shadow-[0_16px_34px_-8px_rgba(165,81,43,0.65)] ring-1 ring-[#8F4323]/40 transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_20px_42px_-8px_rgba(165,81,43,0.78)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B4551F] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F4F7F6] motion-reduce:hover:translate-y-0 motion-reduce:transition-none"
                            >
                                <span aria-hidden="true" className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-full motion-reduce:hidden" />
                                <span className="relative">Register Free</span>
                                <ArrowUpRight className="relative h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
                            </a>

                            <button
                                type="button"
                                onClick={closePopup}
                                data-testid="webinar-popup-later"
                                className="mx-auto mt-4 block text-sm font-medium underline-offset-2 transition-colors hover:underline"
                                style={{ color: "rgba(10,32,34,0.45)" }}
                            >
                                Maybe Later
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
