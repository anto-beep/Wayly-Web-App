import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AboutBackLink from "@/components/AboutBackLink";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import ToolExplainer from "@/components/ToolExplainer";
import ToolHero from "@/components/ToolHero";
import ToolGate from "@/components/ToolGate";
import { ScreenshotStatement } from "@/components/Screenshots";
import ToolRelatedLinks from "@/components/ToolRelatedLinks";
import useToolAccess from "@/hooks/useToolAccess";
import { useParticipants } from "@/context/ParticipantsContext";
import { participantDisplayName } from "@/hooks/useParticipantPrefill";
import { api, extractErrorMessage } from "@/lib/api";
import {
    Loader2, Phone, AlertTriangle, ArrowRight, Mail, MessageSquare,
    FileText, ShieldAlert, Clock, ChevronRight, Info,
} from "lucide-react";
import SeoHead, { softwareApplicationLd, breadcrumbLd } from "@/seo/SeoHead";

/**
 * LF-1 v1.2, Letters & Follow-ups front door.
 *
 * Iteration 1 responsibilities:
 *   - Present the 12-situation triage.
 *   - Handle situation 11 (elder abuse) as a phone-first guided pathway.
 *   - Show the persistent Terms & disclaimer footer copy.
 *   - Support ?situation=<id> deep links from cross-tool CTAs.
 *   - Post a fresh correspondence log entry when the user picks a
 *     situation, and hand off to the intake screen (Iteration 2).
 */

const CARD_ICON = {
    request: FileText,
    dispute: FileText,
    complaint: MessageSquare,
    escalation: AlertTriangle,
    notification: FileText,
    response_draft: Mail,
    guided_pathway: ShieldAlert,
};

// Fallback used when no participant is selected in the switcher.
const DEFAULT_PARTICIPANT_LABEL = "your loved one";

/**
 * Swap the `{name}` placeholder in a situation label with the first name of
 * the currently active participant. Keeps labels warm and gender-neutral
 * regardless of the participant's gender. Non-templated labels pass
 * through unchanged.
 */
function personaliseSituationLabel(label, participantName) {
    if (!label || !label.includes("{name}")) return label;
    const trimmed = (participantName || "").trim();
    const firstName = trimmed ? trimmed.split(/\s+/)[0] : DEFAULT_PARTICIPANT_LABEL;
    return label.replaceAll("{name}", firstName);
}

export default function LettersFollowUps() {
    const access = useToolAccess();
    const nav = useNavigate();
    const [params] = useSearchParams();
    const { active: activeParticipant } = useParticipants();
    const activeName = participantDisplayName(activeParticipant);

    const [situations, setSituations] = useState([]);
    const [safety, setSafety] = useState(null);
    const [terms, setTerms] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [safetyGate, setSafetyGate] = useState(false);   // for situation 11
    const [confirmingSafetyLetter, setConfirmingSafetyLetter] = useState(false);
    const [busySituationId, setBusySituationId] = useState(null);

    useEffect(() => {
        if (access !== "allowed") return;
        setLoading(true);
        Promise.all([
            api.get("/lf1/situations"),
            api.get("/lf1/safety"),
        ]).then(([sRes, safeRes]) => {
            setSituations(sRes.data?.situations || []);
            setSafety(safeRes.data?.elder_abuse || null);
            setTerms(safeRes.data?.terms_footer || "");
        }).catch((err) => {
            setError(extractErrorMessage(err, "Could not load Letters & Follow-ups."));
        }).finally(() => setLoading(false));
    }, [access]);

    // Existing deep link handling: /ai-tools/letters-and-follow-ups?situation=3
    useEffect(() => {
        const sid = params.get("situation");
        // Skip if the newer `prefill` param is present, the effect below owns
        // that flow. Only fire if `situation` is a bare numeric id.
        if (!sid || params.get("prefill") || !situations.length) return;
        if (!/^\d+$/.test(sid)) return;
        const target = situations.find((s) => String(s.id) === String(sid));
        if (target) {
            void beginSituation(target);
        }
    }, [situations, params]);

    // LF-1 v2 prefill consumer: read query params from CE-3 hardship walkthrough
    // and CPR-2 voice check hand-offs. Pass them through as the correspondence
    // `intake` so the letter body can prefill context. Prefers stable
    // situation_id when provided (avoids fuzzy archetype matching).
    useEffect(() => {
        const prefill = params.get("prefill");
        if (!prefill || !situations.length) return;
        const archetype = params.get("archetype");
        const situation = params.get("situation");
        const situationId = params.get("situation_id");
        // 1) Preferred: exact situation_id match
        let target = null;
        if (situationId) {
            target = situations.find((s) => String(s.id) === String(situationId));
        }
        // 2) Fallback: archetype + label substring match
        if (!target) {
            target = situations.find((s) =>
                s.archetype === archetype &&
                (!situation || s.label?.toLowerCase().includes(situation.toLowerCase().slice(0, 20)))
            );
        }
        // 3) Weakest fallback: any situation with the archetype
        if (!target && archetype) {
            target = situations.find((s) => s.archetype === archetype);
        }
        if (!target) {
            setError(`Couldn't find a matching letter template for ${prefill} (archetype ${archetype || "?"}). Pick one below and we'll still carry your notes across.`);
            return;
        }

        const intake = { prefill_source: prefill };
        const hardshipTrigger = params.get("hardship_trigger_id");
        const voiceCheckId = params.get("voice_check_id");
        const companionNotes = params.get("companion_notes");
        if (hardshipTrigger) intake.hardship_trigger_id = hardshipTrigger;
        if (voiceCheckId) intake.voice_check_id = voiceCheckId;
        if (companionNotes) intake.companion_notes = companionNotes;
        if (situation) intake.situation_label = situation;

        void beginSituation(target, { prefill_intake: intake });
    }, [situations, params]);

    const beginSituation = async (situation, opts = {}) => {
        if (busySituationId) return;
        // Safeguarding gate for situation 11.
        if (situation.id === 11 && !opts.override_safety_gate) {
            setSafetyGate(true);
            return;
        }
        setBusySituationId(situation.id);
        setError(null);
        try {
            const payload = { situation_id: situation.id };
            if (opts.prefill_intake) payload.intake = opts.prefill_intake;
            const { data } = await api.post("/lf1/correspondence", payload);
            const id = data?.entry?.id;
            if (id) {
                nav(`/tools/letters-and-follow-ups/${id}`);
            }
        } catch (err) {
            setError(extractErrorMessage(err, "Could not start the letter."));
        } finally {
            setBusySituationId(null);
        }
    };

    const personalisedSituations = useMemo(
        () => situations.map((s) => ({
            ...s,
            label: personaliseSituationLabel(s.label, activeName),
        })),
        [situations, activeName],
    );

    if (access === "loading") return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />
            <div className="mx-auto max-w-4xl px-6 py-20 flex items-center justify-center text-muted-k">
                <Loader2 className="h-5 w-5 animate-spin" />
            </div>
            <ToolRelatedLinks slug="letters-and-follow-ups" />
            <Footer />
        </div>
    );

    if (access === "blocked") return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />
            <ToolHero toolKey="letters-and-follow-ups" />
            <ToolGate toolName="Letters & Follow-ups"><ScreenshotStatement /></ToolGate>
            <section className="max-w-5xl mx-auto px-4 sm:px-8">
                <ToolExplainer toolKey="letters-and-follow-ups" />
            </section>
            <ToolRelatedLinks slug="letters-and-follow-ups" />
            <Footer />
        </div>
    );

    return (
        <div className="min-h-screen bg-kindred">
            <SeoHead
                title="Letters & Follow-ups | Wayly"
                description="Draft polished, evidence-led letters to My Aged Care, providers, ACQSC, and the Ombudsman. Track responses, escalate on time, and keep a case file."
                canonical="/ai-tools/letters-and-follow-ups"
                jsonLd={[
                    softwareApplicationLd({
                        name: "Letters & Follow-ups",
                        description: "Draft letters and track follow-ups across My Aged Care, providers, ACQSC, and the Ombudsman.",
                        url: "https://wayly.com.au/ai-tools/letters-and-follow-ups",
                    }),
                    breadcrumbLd([
                        { name: "Home", url: "/" },
                        { name: "AI Tools", url: "/ai-tools" },
                        { name: "Letters & Follow-ups", url: "/ai-tools/letters-and-follow-ups" },
                    ]),
                ]}
            />
            <MarketingHeader />

            <section className="mx-auto max-w-4xl px-6 pt-10 pb-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-4 flex-wrap">
                        <Link to="/ai-tools" className="text-sm text-muted-k hover:text-primary-k" data-testid="lf1-back-link">
                            ← All AI Tools
                        </Link>
                        <AboutBackLink />
                    </div>
                    <Link
                        to="/tools/letters-and-follow-ups/log"
                        className="text-sm text-primary-k hover:underline inline-flex items-center gap-1"
                        data-testid="lf1-log-link"
                    >
                        Your correspondence log <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                </div>
                <h1
                    className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight"
                    data-testid="lf1-title"
                >
                    Letters & Follow-ups
                </h1>
                <p className="mt-4 text-lg text-muted-k max-w-2xl leading-relaxed">
                    {"Draft a letter, track the reply, and know when to escalate. Pick the situation that fits and Wayly builds the draft from there."}
                </p>
            </section>

            <section className="mx-auto max-w-4xl px-6 pb-16">
                {loading && (
                    <div className="text-muted-k inline-flex items-center gap-2 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                    </div>
                )}

                {error && <div className="text-sm text-terracotta mb-4" data-testid="lf1-error">{error}</div>}

                {!loading && (
                    <>
                        <div className="text-xs uppercase tracking-wider text-muted-k mb-3">
                            Pick the situation that best matches yours
                        </div>
                        <ul className="grid sm:grid-cols-2 gap-3" data-testid="lf1-situation-grid">
                            {personalisedSituations.map((s) => (
                                <SituationCard
                                    key={s.id}
                                    situation={s}
                                    busy={busySituationId === s.id}
                                    onClick={() => beginSituation(s)}
                                />
                            ))}
                        </ul>

                        {/* Persistent Terms & disclaimer footer (locked decision #20) */}
                        <div
                            className="mt-8 bg-surface border border-kindred rounded-2xl p-5 text-sm text-primary-k leading-relaxed"
                            data-testid="lf1-terms-footer"
                        >
                            <div className="flex items-start gap-2">
                                <Info className="h-4 w-4 mt-0.5 text-muted-k flex-shrink-0" aria-hidden="true" />
                                <p>{terms}</p>
                            </div>
                        </div>
                    </>
                )}

                <section className="max-w-5xl mx-auto px-4 sm:px-8 mt-8">
                    <ToolExplainer toolKey="letters-and-follow-ups" />
                </section>
            </section>

            {/* Elder abuse safeguarding gate (situation 11) */}
            <SafeguardingGate
                open={safetyGate}
                safety={safety}
                confirming={confirmingSafetyLetter}
                onClose={() => { setSafetyGate(false); setConfirmingSafetyLetter(false); }}
                onConfirmLetter={() => setConfirmingSafetyLetter(true)}
                onProceed={async () => {
                    setSafetyGate(false);
                    setConfirmingSafetyLetter(false);
                    const s = situations.find((x) => x.id === 11);
                    if (s) await beginSituation(s, { override_safety_gate: true });
                }}
            />

            <ToolRelatedLinks slug="letters-and-follow-ups" />
            <Footer />
        </div>
    );
}


function SituationCard({ situation, busy, onClick }) {
    const Icon = CARD_ICON[situation.archetype] || FileText;
    const testId = `lf1-situation-${situation.id}`;
    const isElderAbuse = situation.id === 11;
    return (
        <li>
            <button
                type="button"
                onClick={onClick}
                disabled={busy}
                data-testid={testId}
                className={[
                    "w-full text-left rounded-2xl border p-5 transition-all",
                    isElderAbuse
                        ? "bg-clay/10 border-clay/30 hover:border-clay"
                        : "bg-surface border-kindred hover:border-primary-k hover:shadow-sm",
                    busy ? "opacity-60 cursor-wait" : "",
                ].join(" ")}
            >
                <div className="flex items-start gap-3">
                    <Icon
                        className={[
                            "h-5 w-5 mt-0.5 flex-shrink-0",
                            isElderAbuse ? "text-clay" : "text-primary-k",
                        ].join(" ")}
                        aria-hidden="true"
                    />
                    <div className="flex-1 min-w-0">
                        <div className="text-primary-k leading-snug">{situation.label}</div>
                        <div className="mt-1 text-xs text-muted-k inline-flex items-center gap-1.5">
                            {isElderAbuse ? (
                                <>
                                    <Phone className="h-3 w-3" /> Phone first, no auto-generated letter
                                </>
                            ) : situation.archetype === "response_draft" ? (
                                <>
                                    <MessageSquare className="h-3 w-3" /> Reply to something you received
                                </>
                            ) : (
                                <>
                                    <Clock className="h-3 w-3" />
                                    {situation.response_window_days
                                        ? `${situation.response_window_days}-day response window`
                                        : "Response window varies"}
                                </>
                            )}
                        </div>
                    </div>
                    {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-k" />
                    ) : (
                        <ChevronRight className="h-4 w-4 text-muted-k" />
                    )}
                </div>
            </button>
        </li>
    );
}


function SafeguardingGate({ open, safety, confirming, onClose, onConfirmLetter, onProceed }) {
    if (!open || !safety) return null;
    return (
        <div
            className="fixed inset-0 z-50 bg-primary-k/40 backdrop-blur-sm flex items-center justify-center px-4"
            data-testid="lf1-safeguarding-gate"
        >
            <div className="bg-kindred border border-clay/40 rounded-2xl max-w-lg w-full p-6 shadow-2xl">
                <div className="flex items-start gap-3">
                    <ShieldAlert className="h-6 w-6 text-clay mt-0.5 flex-shrink-0" aria-hidden="true" />
                    <div className="flex-1">
                        <div className="font-heading text-2xl text-primary-k">{safety.headline}</div>
                        <p className="mt-2 text-primary-k leading-relaxed">{safety.body}</p>

                        <div className="mt-4 space-y-2" data-testid="lf1-safeguarding-contacts">
                            {(safety.contacts || []).map((c) => (
                                <a
                                    key={c.phone}
                                    href={`tel:${c.phone.replace(/\s+/g, "")}`}
                                    className="block bg-surface border border-kindred rounded-xl p-3.5 hover:border-primary-k transition-colors"
                                    data-testid={`lf1-safeguarding-call-${c.phone.replace(/\s+/g, "")}`}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="font-medium text-primary-k">{c.label}</div>
                                            <div className="text-xs text-muted-k mt-0.5">{c.note}</div>
                                        </div>
                                        <div className="text-primary-k font-medium tabular-nums flex items-center gap-1.5">
                                            <Phone className="h-4 w-4" /> {c.phone}
                                        </div>
                                    </div>
                                </a>
                            ))}
                        </div>

                        {!confirming ? (
                            <>
                                <div className="mt-5 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="px-4 py-2.5 rounded-full bg-primary-k text-white text-sm hover:bg-[#091D33]"
                                        data-testid="lf1-safeguarding-close"
                                    >
                                        Done, thanks
                                    </button>
                                    <button
                                        type="button"
                                        onClick={onConfirmLetter}
                                        className="px-4 py-2.5 rounded-full border border-primary-k text-primary-k text-sm hover:bg-primary-k hover:text-white"
                                        data-testid="lf1-safeguarding-letter"
                                    >
                                        I still want to build a written record
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="mt-5 bg-surface-2 border border-clay/30 rounded-xl p-4">
                                <p className="text-sm text-primary-k leading-relaxed">
                                    {safety.letter_gate_disclosure}
                                </p>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="px-4 py-2.5 rounded-full border border-kindred text-primary-k text-sm"
                                        data-testid="lf1-safeguarding-cancel"
                                    >
                                        Actually, take me back
                                    </button>
                                    <button
                                        type="button"
                                        onClick={onProceed}
                                        className="px-4 py-2.5 rounded-full bg-clay text-white text-sm hover:bg-clay/90"
                                        data-testid="lf1-safeguarding-proceed"
                                    >
                                        Build a safeguarding note
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
