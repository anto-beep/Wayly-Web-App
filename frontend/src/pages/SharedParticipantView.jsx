import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import {
    Phone,
    Loader2,
    ShieldCheck,
    Clock,
    Smile,
    Meh,
    Frown,
    AlertOctagon,
    Check,
} from "lucide-react";
import WaylyLogo from "@/components/WaylyLogo";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const formatAUD = (n) =>
    new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(n || 0);

// Mood options mirror ParticipantView.jsx so the two surfaces feel identical.
const MOODS = [
    { v: "good", label: "I feel good", Icon: Smile, cls: "bg-sage text-white" },
    { v: "okay", label: "I'm OK", Icon: Meh, cls: "bg-terracotta text-white" },
    { v: "not_great", label: "Not great", Icon: Frown, cls: "bg-[#B23B2F] text-white" },
];

/**
 * Public read-only participant view opened by the elderly participant via
 * the permanent share link. The layout mirrors the signed-in ParticipantView
 * (mood check-in, today card, budget snapshot, Call caregiver, Something's
 * Not Right) so the two surfaces are visually identical.
 */
export default function SharedParticipantView() {
    const { token } = useParams();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [mood, setMood] = useState(null);
    const [moodSaving, setMoodSaving] = useState(false);
    const [alertSent, setAlertSent] = useState(false);
    const [alertSaving, setAlertSaving] = useState(false);

    useEffect(() => {
        if (!token) return;
        axios
            .get(`${API}/public/shared-view/${encodeURIComponent(token)}`)
            .then((r) => setData(r.data))
            .catch((e) => {
                const raw = e?.response?.data?.detail;
                const msg =
                    typeof raw === "string"
                        ? raw
                        : raw?.message ||
                          "This link is no longer active. Please ask the caregiver for a new one.";
                setError(msg);
            });
    }, [token]);

    const logMood = async (m) => {
        if (moodSaving) return;
        setMoodSaving(true);
        try {
            await axios.post(
                `${API}/public/shared-view/${encodeURIComponent(token)}/wellbeing`,
                { mood: m },
            );
            setMood(m);
        } catch {
            /* silent, the participant should not see plumbing errors */
        } finally {
            setMoodSaving(false);
        }
    };

    const raiseAlert = async () => {
        if (alertSaving || alertSent) return;
        setAlertSaving(true);
        try {
            await axios.post(
                `${API}/public/shared-view/${encodeURIComponent(token)}/alert`,
                { reason: "" },
            );
            setAlertSent(true);
        } catch {
            /* silent */
        } finally {
            setAlertSaving(false);
        }
    };

    // -------- Error state --------
    if (error) {
        const looksLikeExpired = /no longer active|not available/i.test(error);
        return (
            <div
                className="min-h-screen bg-kindred flex items-center justify-center p-6"
                data-testid="shared-view-error"
            >
                <div className="max-w-lg bg-surface rounded-3xl border border-kindred p-8 shadow-sm text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-terracotta/10 mb-4">
                        <ShieldCheck className="w-8 h-8 text-terracotta" aria-hidden="true" />
                    </div>
                    <h1 className="font-heading text-3xl text-primary-k">Not available</h1>
                    <p className="mt-4 text-lg text-primary-k/85 leading-relaxed">{error}</p>
                    {looksLikeExpired && (
                        <p className="mt-6 text-sm text-muted-k leading-relaxed">
                            If your carer sent this link from a different Wayly environment (for
                            example the preview site), ask them to create a fresh link from{" "}
                            <span className="whitespace-nowrap">wayly.com.au</span>.
                        </p>
                    )}
                </div>
            </div>
        );
    }
    if (!data) {
        return (
            <div
                className="min-h-screen bg-kindred flex items-center justify-center p-6"
                data-testid="shared-view-loading"
            >
                <Loader2 className="w-6 h-6 text-primary-k animate-spin" aria-hidden="true" />
                <span className="ml-3 text-lg text-primary-k">Loading…</span>
            </div>
        );
    }

    const { participant, caregiver, today_label, budget } = data;
    const greetingName = participant.display_name || "there";
    const caregiverFirst = caregiver?.name || "your carer";

    return (
        <div className="min-h-screen bg-kindred" data-testid="shared-view">
            {/* Minimal header, logo only, per the mock (no marketing chrome) */}
            <header className="border-b border-kindred bg-surface">
                <div className="mx-auto max-w-2xl px-6 py-4 flex items-center gap-3">
                    <WaylyLogo size={40} className="rounded-md" />
                    <div>
                        <div className="font-heading text-xl text-primary-k">Wayly</div>
                        <div className="text-sm text-muted-k">Your care overview</div>
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-2xl px-6 py-8 sm:py-10 space-y-8">
                {/* Greeting, matches the mock exactly */}
                <div data-testid="shared-view-greeting">
                    <p className="text-lg sm:text-xl text-primary-k/75">Hello {greetingName},</p>
                    <h1 className="font-heading text-5xl sm:text-6xl text-primary-k tracking-tight mt-2 font-bold">
                        {today_label || new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" })}
                        .
                    </h1>
                </div>

                {/* --- How are you today? ------------------------------------ */}
                <section
                    className="bg-surface border border-kindred rounded-3xl p-6 sm:p-7"
                    data-testid="shared-view-mood"
                >
                    <span
                        className="text-xs uppercase tracking-widest text-primary-k/60 font-semibold"
                        style={{ fontSize: "0.85rem" }}
                    >
                        How are you today?
                    </span>
                    {mood ? (
                        <div
                            className="mt-5 rounded-2xl bg-sage/10 border border-sage/30 p-6 flex items-center gap-3 text-primary-k"
                            data-testid="shared-view-mood-thanks"
                        >
                            <Check className="w-6 h-6 text-sage" aria-hidden="true" />
                            <span className="text-lg">
                                {mood === "not_great"
                                    ? "Thanks. We've let your family know."
                                    : "Thanks, noted for today."}
                            </span>
                        </div>
                    ) : (
                        <div className="mt-5 grid grid-cols-3 gap-3">
                            {MOODS.map(({ v, label, Icon, cls }) => (
                                <button
                                    key={v}
                                    onClick={() => logMood(v)}
                                    disabled={moodSaving}
                                    data-testid={`shared-view-mood-${v}`}
                                    className={`${cls} rounded-2xl px-3 sm:px-4 py-6 sm:py-8 flex flex-col items-center justify-center gap-2 text-sm sm:text-base font-semibold hover:opacity-90 focus:outline-none focus:ring-4 focus:ring-primary-k/25 disabled:opacity-60 transition-opacity`}
                                >
                                    <Icon className="w-7 h-7 sm:w-8 sm:h-8" aria-hidden="true" />
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}
                </section>

                {/* --- Today ------------------------------------------------- */}
                <section
                    className="bg-surface border border-kindred rounded-3xl p-6 sm:p-7"
                    data-testid="shared-view-today"
                >
                    <div className="flex items-center gap-2 text-primary-k">
                        <Clock className="w-5 h-5" aria-hidden="true" />
                        <span className="text-lg">Today</span>
                    </div>
                    <p className="mt-4 text-2xl sm:text-3xl text-primary-k leading-snug">
                        {participant.provider_name
                            ? (
                                <>
                                    Your provider is{" "}
                                    <span className="font-semibold">{participant.provider_name}</span>.
                                </>
                            )
                            : "No appointments scheduled today."}
                    </p>
                    {participant.classification && (
                        <p className="mt-2 text-lg text-primary-k/75">
                            You are on care Level <span className="font-semibold">{participant.classification}</span>.
                        </p>
                    )}
                </section>

                {/* --- Budget ------------------------------------------------ */}
                {budget && (
                    <section
                        className="rounded-3xl bg-surface-2 border border-kindred p-6 sm:p-7"
                        data-testid="shared-view-budget"
                    >
                        <span
                            className="text-xs uppercase tracking-widest text-primary-k/60 font-semibold"
                            style={{ fontSize: "0.85rem" }}
                        >
                            Your budget this quarter
                        </span>
                        <p className="mt-3 font-heading text-5xl sm:text-6xl text-primary-k font-bold tracking-tight tabular-nums">
                            {formatAUD(budget.quarter_remaining)}
                        </p>
                        <p className="mt-3 text-lg sm:text-xl text-primary-k leading-relaxed">
                            {budget.sentence}
                        </p>
                    </section>
                )}

                {/* --- Two-button action row --------------------------------- */}
                <section className="grid grid-cols-2 gap-3">
                    {caregiver?.phone ? (
                        <a
                            href={`tel:${caregiver.phone.replace(/\s+/g, "")}`}
                            data-testid="shared-view-call-caregiver"
                            className="rounded-2xl bg-primary-k text-white px-4 py-6 sm:py-8 flex flex-col items-center justify-center gap-2 text-base sm:text-lg font-semibold hover:bg-[#091D33] focus:outline-none focus:ring-4 focus:ring-primary-k/25 transition-colors"
                        >
                            <Phone className="w-7 h-7 sm:w-8 sm:h-8" aria-hidden="true" />
                            Call {caregiverFirst}
                        </a>
                    ) : (
                        <div className="rounded-2xl bg-primary-k/40 text-white px-4 py-6 sm:py-8 flex flex-col items-center justify-center gap-2 text-base sm:text-lg font-semibold opacity-70 cursor-not-allowed">
                            <Phone className="w-7 h-7 sm:w-8 sm:h-8" aria-hidden="true" />
                            No carer phone
                        </div>
                    )}
                    <button
                        onClick={raiseAlert}
                        disabled={alertSaving || alertSent}
                        data-testid="shared-view-alert"
                        className="rounded-2xl bg-[#B23B2F] text-white px-4 py-6 sm:py-8 flex flex-col items-center justify-center gap-2 text-base sm:text-lg font-semibold hover:opacity-90 focus:outline-none focus:ring-4 focus:ring-primary-k/25 disabled:opacity-60 transition-opacity"
                    >
                        <AlertOctagon className="w-7 h-7 sm:w-8 sm:h-8" aria-hidden="true" />
                        {alertSent ? "We've told them" : "Something's not right"}
                    </button>
                </section>

                {/* --- Safety footer ---------------------------------------- */}
                <section
                    className="rounded-2xl bg-surface border border-kindred p-5 text-primary-k/75 leading-relaxed text-sm"
                    data-testid="shared-view-help"
                >
                    This page is a read-only summary of your Support at Home care. It does not
                    replace your provider or your carer. If you feel unwell, always ring your GP
                    or triple zero (000) in an emergency.
                </section>
            </main>

            <footer className="mx-auto max-w-2xl px-6 py-6 text-center text-sm text-muted-k">
                Read-only view shared with you by your carer via Wayly.
            </footer>
        </div>
    );
}
