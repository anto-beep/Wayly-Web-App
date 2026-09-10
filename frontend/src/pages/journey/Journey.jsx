/**
 * OJ-1 v1.1 Onboarding Journey, guided sequenced walkthrough.
 *
 * Sequence: Persona → CSC → CE-2 → Budget → CPR → Complete.
 * Each substantive step lets the user "Open the tool" (deep link that
 * brings them back here on return) or "I already know this" (skip with
 * user_declared source). Progress persists across sessions via the
 * /api/journeys endpoints; the JourneyState is authoritative.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import WaylyLogo from "@/components/WaylyLogo";
import SeoHead from "@/seo/SeoHead";
import { Orb, DotField } from "@/components/BrandVisuals";
import {
    ArrowRight, CheckCircle2, ExternalLink, Loader2,
    User, Heart, ListChecks, Receipt, Wallet, ClipboardCheck, Sparkles,
} from "lucide-react";

// Per-step brand colour + icon so the walk-through feels alive and colourful.
const STEP_STYLE = {
    csc:    { color: "#0E4D52", soft: "#DCE9EA", Icon: ListChecks },
    ce2:    { color: "#A5512B", soft: "#F3E7DE", Icon: Receipt },
    budget: { color: "#4E6E54", soft: "#E7EFE8", Icon: Wallet },
    cpr:    { color: "#1A696E", soft: "#D8ECED", Icon: ClipboardCheck },
};

const STEP_LABELS = {
    persona: "Who is this for",
    csc:     "Classification Self-Check",
    ce2:     "Contribution Estimator",
    budget:  "Budget Calculator",
    cpr:     "Support Plan Reviewer",
};

const STEP_DESCRIPTIONS_PARTICIPANT = {
    csc:    "A short self-check so you know roughly where you sit on the classification levels. Ten minutes.",
    ce2:    "Estimate what you would be asked to contribute each fortnight. Uses today's published rates.",
    budget: "See how your quarterly budget breaks across care, independence, everyday living, home modifications and assistive tech.",
    cpr:    "Read your care plan the way an assessor reads it. Spot the gaps before your next review.",
};

const STEP_DESCRIPTIONS_CAREGIVER = {
    csc:    "A short self-check so you know roughly where the person you support sits on the classification levels. Ten minutes.",
    ce2:    "Estimate what they would be asked to contribute each fortnight. Uses today's published rates.",
    budget: "See how their quarterly budget breaks across care, independence, everyday living, home modifications and assistive tech.",
    cpr:    "Read their care plan the way an assessor reads it. Spot the gaps before their next review.",
};

const STEP_TOOL_LINKS = {
    csc:    "/ai-tools/classification-self-check",
    ce2:    "/ai-tools/contribution-estimator",
    budget: "/ai-tools/budget-calculator",
    cpr:    "/ai-tools/care-plan-reviewer",
};

const SUBSTANTIVE_STEPS = ["csc", "ce2", "budget", "cpr"];

export default function Journey() {
    const nav = useNavigate();
    const { user, loading: authLoading } = useAuth();
    const [params] = useSearchParams();
    const returnFromTool = params.get("returned"); // ?returned=csc after the tool round-trip

    const [journey, setJourney] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [showSkipConfirm, setShowSkipConfirm] = useState(false);

    // Get-or-create the journey on mount.
    const bootstrap = useCallback(async () => {
        try {
            setLoading(true);
            const { data } = await api.post("/journeys");
            setJourney(data);
        } catch (e) {
            setError(e?.response?.data?.detail || "Could not start the journey. Please refresh.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { if (!authLoading) bootstrap(); }, [authLoading, bootstrap]);

    // If the user was sent to a tool and returned, auto-mark that step complete
    // (source: computed). The tool page appended ?returned=<step> when the
    // deep-link handler saw the journey context.
    useEffect(() => {
        if (!returnFromTool || !journey) return;
        const st = journey.steps?.[returnFromTool];
        if (!st || st.status !== "pending") return;
        (async () => {
            try {
                setSaving(true);
                const { data } = await api.put(
                    `/journeys/${journey.id}/steps/${returnFromTool}`,
                    { status: "complete", source: "computed" },
                );
                setJourney(data);
            } catch { /* silent, user can still skip or open again */ }
            finally { setSaving(false); }
        })();
    }, [returnFromTool, journey]);

    if (authLoading || loading) {
        return (
            <div className="min-h-screen bg-kindred flex items-center justify-center" data-testid="journey-loading">
                <Loader2 className="h-6 w-6 text-primary-k animate-spin" />
            </div>
        );
    }
    if (error) {
        return (
            <div className="min-h-screen bg-kindred flex items-center justify-center p-6">
                <div className="rounded-2xl border border-terracotta/40 bg-terracotta/5 p-6 text-center max-w-md">
                    <div className="text-terracotta font-semibold mb-2">Something went wrong</div>
                    <div className="text-sm text-primary-k/80">{error}</div>
                </div>
            </div>
        );
    }
    if (!journey) return null;

    const personaLocked = Boolean(journey.persona_locked_at);
    const isComplete = journey.status === "completed";

    // ---------- PERSONA STEP ----------
    async function chooseLocked(persona) {
        setSaving(true);
        try {
            const { data } = await api.put(`/journeys/${journey.id}/persona`, { persona });
            setJourney(data);
        } catch (e) {
            setError(e?.response?.data?.detail || "Could not save persona.");
        } finally { setSaving(false); }
    }

    async function updateStep(step, payload) {
        setSaving(true);
        try {
            const { data } = await api.put(`/journeys/${journey.id}/steps/${step}`, payload);
            setJourney(data);
        } catch (e) {
            setError(e?.response?.data?.detail || `Could not save ${step}.`);
        } finally { setSaving(false); }
    }

    async function skipAll() {
        setSaving(true);
        try {
            await api.post(`/journeys/${journey.id}/skip`);
            nav("/app", { replace: true });
        } catch (e) {
            setError(e?.response?.data?.detail || "Could not skip.");
            setSaving(false);
        }
    }

    async function finishJourney() {
        setSaving(true);
        try {
            const { data } = await api.post(`/journeys/${journey.id}/complete`);
            setJourney(data);
        } catch (e) {
            setError(e?.response?.data?.detail || "Could not complete.");
        } finally { setSaving(false); }
    }

    async function downloadPdf() {
        try {
            const res = await api.get(`/journeys/${journey.id}/pdf`, { responseType: "blob" });
            const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
            window.open(url, "_blank", "noopener");
            setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
        } catch { /* noop */ }
    }

    return (
        <div className="relative min-h-screen bg-kindred overflow-hidden" data-testid="journey-root">
            <div aria-hidden className="pointer-events-none absolute rounded-full blur-3xl opacity-40 wayly-float" style={{ width: 340, height: 340, top: -120, right: -80, backgroundImage: "radial-gradient(circle at 30% 30%, #DCEAE9, #C4D4C8)" }} />
            <div aria-hidden className="pointer-events-none absolute rounded-full blur-3xl opacity-40 wayly-float-slow" style={{ width: 280, height: 280, bottom: -100, left: -90, backgroundImage: "radial-gradient(circle at 30% 30%, #F3E7DE, #E9D4C6)" }} />
            <SeoHead title="Get started with Wayly | Onboarding Journey" description="A short guided walkthrough that sequences the Wayly tools so you know where to start." />
            <header className="border-b border-kindred bg-white/80 backdrop-blur-xl sticky top-0 z-30 safe-top">
                <div className="mx-auto max-w-4xl px-6 py-4 flex items-center justify-between gap-3">
                    <Link to="/app" className="flex items-center gap-3" data-testid="journey-home-link">
                        <WaylyLogo size={32} className="rounded-md" />
                        <div>
                            <div className="font-heading text-lg text-primary-k">Wayly</div>
                            <div className="text-xs text-muted-k">Getting started</div>
                        </div>
                    </Link>
                    <ProgressPips journey={journey} />
                </div>
            </header>

            <main className="relative z-10 mx-auto max-w-4xl px-6 py-10 space-y-10">
                {!personaLocked && !isComplete && (
                    <PersonaStep
                        onChoose={chooseLocked}
                        onSkipAll={() => setShowSkipConfirm(true)}
                        saving={saving}
                    />
                )}

                {personaLocked && !isComplete && (
                    <StepList
                        journey={journey}
                        onOpen={(step) => nav(`${STEP_TOOL_LINKS[step]}?journey=${journey.id}`)}
                        onSkip={(step, note) => updateStep(step, { status: "skipped", source: "user_declared", data: { note } })}
                        onFinish={finishJourney}
                        saving={saving}
                    />
                )}

                {isComplete && (
                    <CompleteScreen
                        journey={journey}
                        onDownload={downloadPdf}
                        onDashboard={() => nav("/app")}
                    />
                )}
            </main>

            {showSkipConfirm && (
                <SkipAllModal
                    onCancel={() => setShowSkipConfirm(false)}
                    onConfirm={skipAll}
                    saving={saving}
                />
            )}
        </div>
    );
}

// ------------------------------- PIECES -------------------------------

function ProgressPips({ journey }) {
    const items = [
        { key: "persona", done: Boolean(journey.persona_locked_at) }, ...SUBSTANTIVE_STEPS.map((k) => ({
            key: k,
            done: journey.steps?.[k]?.status === "complete" || journey.steps?.[k]?.status === "skipped",
        })),
    ];
    return (
        <div className="flex items-center gap-1.5" data-testid="journey-progress">
            {items.map((it) => (
                <span
                    key={it.key}
                    aria-hidden
                    className={`h-2 w-6 rounded-full ${it.done ? "bg-sage" : "bg-surface-2"}`}
                    data-testid={`journey-pip-${it.key}`}
                    data-done={it.done ? "true" : "false"}
                />
            ))}
        </div>
    );
}

function PersonaStep({ onChoose, onSkipAll, saving }) {
    return (
        <section className="space-y-8" data-testid="journey-persona">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0E4D52] to-[#10363A] p-8 sm:p-10 shadow-lg">
                <DotField />
                <Orb className="wayly-float" style={{ width: 200, height: 200, top: -70, right: -30 }} from="#F0B267" to="#A5512B" />
                <div className="relative max-w-2xl">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-white/70">Step 1 of 5</span>
                    <h1 className="mt-3 font-heading text-4xl sm:text-5xl text-white tracking-tight leading-tight">
                        Who are we setting Wayly up for?
                    </h1>
                    <p className="mt-4 text-base text-white/85 leading-relaxed">
                        This changes the wording, not the maths. You can only choose once, so pick the answer that
                        matches how you&apos;ll use Wayly most of the time.
                    </p>
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <PersonaCard
                    icon={User}
                    title="For me"
                    body="I am the person on a Support at Home package, or the person about to start one."
                    testId="journey-persona-participant"
                    tone="#0E4D52"
                    disabled={saving}
                    onClick={() => onChoose("participant")}
                />
                <PersonaCard
                    icon={Heart}
                    title="For someone I look after"
                    body="I'm setting this up for a parent, partner or someone I care for. Wayly will use their name where it makes sense."
                    testId="journey-persona-caregiver"
                    tone="#A5512B"
                    disabled={saving}
                    onClick={() => onChoose("caregiver")}
                />
            </div>

            <div className="grid gap-3 sm:grid-cols-3" data-testid="journey-benefits">
                {[
                    { color: "#0E4D52", Icon: ListChecks, label: "Know what you're paying" },
                    { color: "#A5512B", Icon: Receipt, label: "Spot overcharges early" },
                    { color: "#425F47", Icon: Wallet, label: "Keep the budget on track" },
                ].map((b) => (
                    <div key={b.label} className="flex items-center gap-3 rounded-2xl border border-kindred bg-white p-4 shadow-sm">
                        <span className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-xl text-white shadow-sm" style={{ backgroundColor: b.color }}><b.Icon className="h-5 w-5" aria-hidden /></span>
                        <span className="text-sm font-medium text-primary-k">{b.label}</span>
                    </div>
                ))}
            </div>
            <div className="pt-2">
                <button
                    type="button"
                    onClick={onSkipAll}
                    className="text-sm text-muted-k hover:text-primary-k underline"
                    data-testid="journey-skip-all"
                    disabled={saving}
                >
                    Skip onboarding, I know what I&apos;m doing
                </button>
            </div>
        </section>
    );
}

function PersonaCard({ icon: Icon, title, body, testId, tone = "#0E4D52", disabled, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            data-testid={testId}
            className="group relative overflow-hidden text-left rounded-2xl border border-kindred bg-white p-6 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-k disabled:opacity-60"
        >
            <span className="absolute left-0 top-0 h-1.5 w-full" style={{ backgroundColor: tone }} />
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-sm transition-transform group-" style={{ backgroundColor: tone }}>
                <Icon className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="mt-5 font-heading text-xl text-primary-k tracking-tight leading-snug">{title}</h3>
            <p className="mt-3 text-sm text-primary-k/85 leading-relaxed">{body}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold" style={{ color: tone }}>
                Choose this <ArrowRight className="h-3.5 w-3.5" />
            </span>
        </button>
    );
}

function StepList({ journey, onOpen, onSkip, onFinish, saving }) {
    const isCaregiver = journey.persona === "caregiver";
    const dict = isCaregiver ? STEP_DESCRIPTIONS_CAREGIVER : STEP_DESCRIPTIONS_PARTICIPANT;
    const stepsDone = SUBSTANTIVE_STEPS.every((s) => {
        const st = journey.steps?.[s]?.status;
        return st === "complete" || st === "skipped";
    });
    const doneCount = SUBSTANTIVE_STEPS.filter((s) => {
        const st = journey.steps?.[s]?.status;
        return st === "complete" || st === "skipped";
    }).length;
    const pct = Math.round((doneCount / SUBSTANTIVE_STEPS.length) * 100);

    return (
        <section className="space-y-6" data-testid="journey-step-list">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0E4D52] to-[#10363A] p-8 sm:p-10 shadow-lg">
                <DotField />
                <Orb className="wayly-float-slow" style={{ width: 200, height: 200, bottom: -70, right: -30 }} from="#6B8F71" to="#425F47" />
                <div className="relative max-w-2xl">
                    <span className="text-[11px] uppercase tracking-[0.18em] text-white/70">Your walk-through</span>
                    <h1 className="mt-3 font-heading text-4xl sm:text-5xl text-white tracking-tight leading-tight">
                        Four short stops.
                    </h1>
                    <p className="mt-4 text-base text-white/85 leading-relaxed">
                        Open each tool, spend a few minutes with it, then come back here. If you already know the
                        answer, tell us and we&apos;ll skip you along. Nothing gets locked in without you.
                    </p>
                    <div className="mt-6">
                        <div className="flex items-center justify-between text-xs text-white/80 mb-1.5">
                            <span>Your progress</span>
                            <span className="tabular-nums">{doneCount} of {SUBSTANTIVE_STEPS.length} done</span>
                        </div>
                        <div className="h-2 rounded-full bg-white/15 overflow-hidden">
                            <div className="h-full rounded-full bg-[#F0B267] wayly-grow-bar" style={{ width: `${pct}%` }} />
                        </div>
                    </div>
                    {journey.variant === "october_2026" && (
                        <div className="mt-5 rounded-xl bg-white/10 border border-white/20 p-4 text-sm text-white/90" data-testid="journey-october-banner">
                            <strong className="text-white">A note for October 2026:</strong>{" "}
                            Personal-care funding is changing. The Contribution Estimator step below uses the current
                            published rates.
                        </div>
                    )}
                </div>
            </div>

            <ol className="space-y-4">
                {SUBSTANTIVE_STEPS.map((step, idx) => (
                    <StepRow
                        key={step}
                        n={idx + 1}
                        step={step}
                        state={journey.steps?.[step]}
                        title={STEP_LABELS[step]}
                        description={dict[step]}
                        available={SUBSTANTIVE_STEPS.slice(0, idx).every((s) => {
                            const st = journey.steps?.[s]?.status;
                            return st === "complete" || st === "skipped";
                        })}
                        onOpen={() => onOpen(step)}
                        onSkip={(note) => onSkip(step, note)}
                        saving={saving}
                    />
                ))}
            </ol>

            <div className="pt-2">
                <button
                    type="button"
                    onClick={onFinish}
                    disabled={!stepsDone || saving}
                    data-testid="journey-finish"
                    className="inline-flex items-center gap-2 rounded-full bg-primary-k text-white px-6 py-3 text-sm font-medium hover:bg-primary-k/90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    Wrap this up <ArrowRight className="h-4 w-4" />
                </button>
                {!stepsDone && (
                    <p className="mt-2 text-xs text-muted-k">
                        Finish or skip the remaining stops to wrap up.
                    </p>
                )}
            </div>
        </section>
    );
}

function StepRow({ n, step, state, title, description, available, onOpen, onSkip, saving }) {
    const status = state?.status || "pending";
    const done = status === "complete" || status === "skipped";
    const [skipOpen, setSkipOpen] = useState(false);
    const [skipNote, setSkipNote] = useState("");
    const sst = STEP_STYLE[step] || { color: "#0E4D52", soft: "#DCE9EA", Icon: CheckCircle2 };

    return (
        <li
            className={`group relative overflow-hidden rounded-2xl border p-5 sm:p-6 transition-colors ${done ? "border-sage/50 bg-sage/5" : available ? "border-kindred bg-white" : "border-kindred bg-surface-2/60"}`}
            data-testid={`journey-step-${step}`}
            data-status={status}
        >
            <span className="absolute left-0 top-0 h-full w-1.5" style={{ backgroundColor: done ? "#6B8F71" : available ? sst.color : "#C4D4C8" }} />
            <div className="flex items-start gap-4">
                <div className="shrink-0 mt-0.5 inline-flex h-11 w-11 items-center justify-center rounded-xl text-white shadow-sm" style={{ backgroundColor: done ? "#6B8F71" : available ? sst.color : "#9FB4A4" }}>
                    {done ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <sst.Icon className="h-5 w-5" aria-hidden />}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                        <h3 className="font-heading text-lg sm:text-xl text-primary-k tracking-tight">{title}</h3>
                        {done && (
                            <span className="text-xs uppercase tracking-[0.14em] text-muted-k">
                                {status === "skipped" ? "You said you know this" : "Done"}
                            </span>
                        )}
                    </div>
                    <p className="mt-2 text-sm text-primary-k/85 leading-relaxed">{description}</p>

                    {!done && available && (
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                            <button
                                type="button"
                                onClick={onOpen}
                                disabled={saving}
                                data-testid={`journey-open-${step}`}
                                className="inline-flex items-center gap-2 rounded-full bg-primary-k text-white px-4 py-2 text-sm hover:bg-primary-k/90 disabled:opacity-60"
                            >
                                Open the tool <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                            {!skipOpen ? (
                                <button
                                    type="button"
                                    onClick={() => setSkipOpen(true)}
                                    className="text-sm text-muted-k hover:text-primary-k underline"
                                    data-testid={`journey-skip-toggle-${step}`}
                                >
                                    I already know this
                                </button>
                            ) : (
                                <div className="flex flex-wrap items-center gap-2 basis-full sm:basis-auto">
                                    <input
                                        type="text"
                                        value={skipNote}
                                        onChange={(e) => setSkipNote(e.target.value)}
                                        placeholder="Optional: what you already know"
                                        className="rounded-lg border border-kindred bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-k"
                                        data-testid={`journey-skip-note-${step}`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => onSkip(skipNote)}
                                        disabled={saving}
                                        className="inline-flex items-center gap-1 rounded-full border border-primary-k text-primary-k px-3 py-1.5 text-sm hover:bg-primary-k/5"
                                        data-testid={`journey-skip-confirm-${step}`}
                                    >
                                        Skip this stop
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setSkipOpen(false); setSkipNote(""); }}
                                        className="text-xs text-muted-k hover:text-primary-k"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {!available && !done && (
                        <p className="mt-3 text-xs text-muted-k">Finish the previous stop first.</p>
                    )}
                </div>
            </div>
        </li>
    );
}

function CompleteScreen({ journey, onDownload, onDashboard }) {
    return (
        <section className="space-y-8 text-center max-w-2xl mx-auto" data-testid="journey-complete">
            <div className="relative inline-flex items-center justify-center">
                <span aria-hidden className="absolute inset-0 rounded-full bg-sage/20 wayly-pulse-ring" style={{ transform: "scale(1.6)" }} />
                <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#6B8F71] text-white shadow-lg">
                    <Sparkles className="h-7 w-7" aria-hidden />
                </div>
            </div>
            <div>
                <h1 className="font-heading text-4xl sm:text-5xl text-primary-k tracking-tight leading-tight">
                    You&apos;re set up.
                </h1>
                <p className="mt-4 text-base text-primary-k/85 leading-relaxed">
                    Your dashboard now shows a quiet preview of the quarterly pacing view. The full pacing tool
                    is on its way. Nothing you did today is lost.
                </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <button
                    type="button"
                    onClick={onDashboard}
                    data-testid="journey-go-dashboard"
                    className="inline-flex items-center gap-2 rounded-full bg-primary-k text-white px-6 py-3 text-sm font-medium hover:bg-primary-k/90"
                >
                    Go to my dashboard <ArrowRight className="h-4 w-4" />
                </button>
                <button
                    type="button"
                    onClick={onDownload}
                    data-testid="journey-download-pdf"
                    className="inline-flex items-center gap-2 rounded-full border border-primary-k text-primary-k px-6 py-3 text-sm font-medium hover:bg-primary-k/5"
                >
                    Download a copy (PDF)
                </button>
            </div>
        </section>
    );
}

function SkipAllModal({ onCancel, onConfirm, saving }) {
    return (
        <div
            className="fixed inset-0 z-50 bg-primary-k/40 backdrop-blur-sm flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="journey-skip-all-title"
        >
            <div className="bg-white rounded-2xl border border-kindred p-6 max-w-md w-full" data-testid="journey-skip-all-modal">
                <h2 id="journey-skip-all-title" className="font-heading text-2xl text-primary-k">Skip the walk-through?</h2>
                <p className="mt-3 text-sm text-primary-k/85 leading-relaxed">
                    That&apos;s fine. You can find every tool on the main menu. If you want to come back here later,
                    ask us to reset your journey from Settings.
                </p>
                <div className="mt-6 flex flex-wrap justify-end gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="rounded-full border border-kindred text-primary-k px-4 py-2 text-sm hover:bg-surface-2"
                        data-testid="journey-skip-all-cancel"
                    >
                        Keep the walk-through
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={saving}
                        className="rounded-full bg-primary-k text-white px-4 py-2 text-sm hover:bg-primary-k/90 disabled:opacity-60"
                        data-testid="journey-skip-all-confirm"
                    >
                        Yes, skip it
                    </button>
                </div>
            </div>
        </div>
    );
}
