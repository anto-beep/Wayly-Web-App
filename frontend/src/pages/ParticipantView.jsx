import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatAUD } from "@/lib/api";
import { Phone, AlertOctagon, Clock, ArrowLeft, Smile, Meh, Frown } from "lucide-react";
import { toast } from "sonner";

const MOODS = [
    { v: "good", label: "I feel good", Icon: Smile, cls: "bg-sage text-white", note: "Pleasant day" },
    { v: "okay", label: "I'm OK", Icon: Meh, cls: "bg-gold text-primary-k", note: "Just checking in" },
    { v: "not_great", label: "Not great", Icon: Frown, cls: "bg-terracotta text-white", note: "Will notify caregiver" },
];

export default function ParticipantView() {
    const [data, setData] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [checkedIn, setCheckedIn] = useState(null); // mood value after submit
    const [loggingMood, setLoggingMood] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/participant/today");
                setData(data);
            } catch {}
            try {
                const { data: well } = await api.get("/participant/wellbeing");
                if (well?.length > 0) {
                    const todayISO = new Date().toISOString().slice(0, 10);
                    const latest = well[0];
                    if ((latest.created_at || "").slice(0, 10) === todayISO) setCheckedIn(latest.mood);
                }
            } catch {}
        })();
    }, []);

    const logMood = async (mood) => {
        if (loggingMood) return;
        setLoggingMood(true);
        try {
            await api.post("/participant/wellbeing", { mood, notify_caregiver: mood === "not_great" });
            setCheckedIn(mood);
            toast.success(mood === "not_great" ? "We've let your family know." : "Thanks — noted for today.");
        } catch (err) {
            toast.error(err?.response?.data?.detail || "Could not save");
        } finally {
            setLoggingMood(false);
        }
    };

    const flagConcern = async () => {
        if (submitting) return;
        const note = window.prompt("In a few words, what's not right?");
        if (!note) return;
        setSubmitting(true);
        try {
            await api.post("/participant/concern", { note });
            toast.success("We've let your family know.");
        } finally {
            setSubmitting(false);
        }
    };

    if (!data) {
        return (
            <div className="min-h-screen bg-kindred flex items-center justify-center text-2xl text-primary-k">
                One moment…
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-kindred" data-testid="participant-view">
            <div className="max-w-3xl mx-auto px-6 py-6">
                <Link
                    to="/app"
                    data-testid="back-to-caregiver-link"
                    className="inline-flex items-center gap-2 text-sm text-muted-k hover:text-primary-k"
                >
                    <ArrowLeft className="h-4 w-4" /> Back to caregiver view
                </Link>
            </div>

            <div className="max-w-3xl mx-auto px-6 py-8 space-y-10">
                <div>
                    <p className="text-2xl text-muted-k">Hello {data.participant_name},</p>
                    <h1 className="font-heading text-5xl sm:text-6xl text-primary-k tracking-tight mt-2 font-bold">
                        {data.today_label}.
                    </h1>
                </div>

                {/* Wellbeing check-in — giant buttons, one-per-day */}
                <div className="bg-surface border border-kindred rounded-3xl p-10" data-testid="wellbeing-card">
                    <span className="overline" style={{ fontSize: "0.85rem" }}>How are you today?</span>
                    {checkedIn ? (
                        <p className="mt-4 text-3xl text-primary-k leading-snug" data-testid="wellbeing-already">
                            ✓ You've checked in today ({MOODS.find((m) => m.v === checkedIn)?.label.toLowerCase()}). Come back tomorrow.
                        </p>
                    ) : (
                        <div className="mt-5 grid sm:grid-cols-3 gap-4" data-testid="wellbeing-buttons">
                            {MOODS.map((m) => (
                                <button
                                    key={m.v}
                                    onClick={() => logMood(m.v)}
                                    disabled={loggingMood}
                                    data-testid={`wellbeing-${m.v}`}
                                    className={`${m.cls} rounded-2xl p-6 flex flex-col items-center gap-3 disabled:opacity-60 hover:brightness-95 transition-all min-h-[140px]`}
                                >
                                    <m.Icon className="h-10 w-10" />
                                    <span className="text-xl font-semibold">{m.label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="bg-surface border border-kindred rounded-3xl p-10" data-testid="appointment-card">
                    <div className="flex items-center gap-3 text-muted-k">
                        <Clock className="h-6 w-6" />
                        <span className="text-2xl">Today</span>
                    </div>
                    <p className="mt-4 text-3xl sm:text-4xl text-primary-k leading-snug">
                        At <span className="font-semibold">{data.appointment.time}</span>,{" "}
                        <span className="font-semibold">{data.appointment.name}</span> is coming for{" "}
                        <span className="font-semibold">{data.appointment.service.toLowerCase()}</span>.
                    </p>
                    <p className="mt-2 text-2xl text-muted-k">It will take about {data.appointment.duration}.</p>
                </div>

                <div className="bg-surface-2 border border-kindred rounded-3xl p-10" data-testid="budget-card">
                    <span className="overline" style={{ fontSize: "0.85rem" }}>Your budget this quarter</span>
                    <p className="mt-3 font-heading text-6xl sm:text-7xl text-primary-k font-bold tracking-tight">
                        {formatAUD(data.quarter_remaining)}
                    </p>
                    <p className="mt-3 text-2xl text-primary-k leading-relaxed">{data.quarter_remaining_sentence}</p>
                </div>

                <div className="grid sm:grid-cols-2 gap-5">
                    <a
                        href="tel:"
                        data-testid="call-caregiver-button"
                        className="bg-primary-k text-white rounded-3xl p-10 flex flex-col items-center justify-center text-center gap-3 hover:bg-primary-k/90 transition-colors min-h-[200px]"
                    >
                        <Phone className="h-12 w-12" />
                        <span className="text-3xl font-semibold">Call {data.caregiver_name}</span>
                    </a>
                    <button
                        onClick={flagConcern}
                        disabled={submitting}
                        data-testid="flag-concern-button"
                        className="bg-terracotta text-white rounded-3xl p-10 flex flex-col items-center justify-center text-center gap-3 hover:bg-[#8d4a3c] transition-colors min-h-[200px]"
                    >
                        <AlertOctagon className="h-12 w-12" />
                        <span className="text-3xl font-semibold">{submitting ? "Sending…" : "Something's not right"}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
