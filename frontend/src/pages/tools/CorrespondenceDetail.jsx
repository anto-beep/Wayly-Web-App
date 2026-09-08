import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import MarketingHeader from "@/components/MarketingHeader";
import Footer from "@/components/Footer";
import { api, extractErrorMessage } from "@/lib/api";
import { useParticipants } from "@/context/ParticipantsContext";
import { participantDisplayName } from "@/hooks/useParticipantPrefill";
import { Loader2, ArrowLeft, Trash2, Save, Info, ShieldAlert, MessageSquare, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { CrossToolSourceIndicator, AutomatedDecisionDisclosure, StandingBanner, isEnabled } from "@/uxf";
import COPY from "@/uxf/copy";
import {
    ArchetypeIntakeForm,
    CrossToolImportPanel,
    GenerateButton,
    CoverNotePanel,
    OutputFormatSwitcher,
    FeedbackChip,
    ToneCheckPanel,
    ShareAndSignOffPanel,
    LF1ADMDisclosure,
    SafeguardingRecordButton,
    ResponseDraftGenerateButton,
} from "@/components/lf1/LetterGeneration";

/**
 * LF-1 v1.2 cross-tool provenance panel.
 *
 * When a draft has been generated, fetch the person's currently
 * available cross-tool signals and surface one CrossToolSourceIndicator
 * per source right above the letter body (spec 3.21). If any signal is
 * older than 90 days, the indicator flips into a soft-warning state
 * suggesting the person re-run the tool.
 */
function CrossToolProvenance({ generated }) {
    const [signals, setSignals] = useState(null);
    useEffect(() => {
        if (!generated) return;
        let cancelled = false;
        (async () => {
            try {
                const s = await api.get("/lf1/cross-tool-signals");
                if (!cancelled) setSignals(s.data || s);
            } catch { /* silent */ }
        })();
        return () => { cancelled = true; };
    }, [generated]);

    if (!generated || !signals) return null;
    const rows = [];
    if (signals.contribution_estimator?.created_at) {
        rows.push({
            key: "ce",
            toolName: "Contribution Estimator",
            date: signals.contribution_estimator.created_at,
            href: "/tools/contribution-estimator",
        });
    }
    if (signals.statement_decoder?.period_label) {
        rows.push({
            key: "decoder",
            toolName: `Statement Decoder (${signals.statement_decoder.period_label})`,
            date: null,
            href: `/statements/${signals.statement_decoder.statement_id}`,
        });
    }
    if (signals.classification_check?.created_at) {
        rows.push({
            key: "classification",
            toolName: "Classification Self-Check",
            date: signals.classification_check.created_at,
            href: "/tools/classification-check",
        });
    }
    if (signals.care_plan?.effective_from) {
        rows.push({
            key: "care_plan",
            toolName: "Care Plan Review",
            date: signals.care_plan.effective_from,
            href: "/app/care-plans",
        });
    }
    if (!rows.length) return null;
    return (
        <div className="space-y-2" data-testid="lf1-cross-tool-provenance">
            <div className="text-xs uppercase tracking-wider text-muted-k">This draft was informed by</div>
            {rows.map((r) => (
                <CrossToolSourceIndicator
                    key={r.key}
                    toolName={r.toolName}
                    date={r.date}
                    href={r.href}
                    testId={`lf1-source-${r.key}`}
                />
            ))}
        </div>
    );
}

/**
 * LF-1 v1.2, Correspondence detail page (Iterations 1 → 4).
 *
 * Renders:
 *   - Sender authority, complaint mode, ATSI toggle (Iter 1).
 *   - Archetype-specific intake form (Iter 2).
 *   - Cross-tool import chips (Iter 3).
 *   - Generate + Cover-note + Output-format switcher + PDF (Iter 2).
 *   - Feedback (thumbs) + Tone check (Iter 3, feature-flag gated).
 *   - Share + Sign-off (Iter 4).
 *   - Safeguarding record generator for guided_pathway (Iter 4).
 *   - Response Draft flow for situation 12 (Iter 4).
 *   - ADM disclosure (shared component).
 */

const AUTOSAVE_DEBOUNCE_MS = 1000;

export default function CorrespondenceDetail() {
    const { entryId } = useParams();
    const nav = useNavigate();
    const { active: activeParticipant } = useParticipants();
    const activeName = participantDisplayName(activeParticipant);

    const [entry, setEntry] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [savingHint, setSavingHint] = useState(null);
    const [senderAuthority, setSenderAuthority] = useState("");
    const [complaintMode, setComplaintMode] = useState("open");
    const [atsi, setAtsi] = useState(false);
    const [intake, setIntake] = useState({});
    const [termsAck, setTermsAck] = useState(false);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [busyDelete, setBusyDelete] = useState(false);

    const [generated, setGenerated] = useState(null);
    const [busyPdf, setBusyPdf] = useState(false);
    const [pdfSaved, setPdfSaved] = useState(false);
    const [dirty, setDirty] = useState(false);

    // ---- Load entry ----
    useEffect(() => {
        let cancelled = false;
        api.get(`/lf1/correspondence/${entryId}`)
            .then((r) => {
                if (cancelled) return;
                const e = r.data || null;
                setEntry(e);
                setSenderAuthority(e?.sender_authority_basis || "");
                setComplaintMode(e?.complaint_mode || "open");
                setAtsi(Boolean(e?.atsi_preference));
                setIntake(e?.intake || {});
                setTermsAck(Boolean(e?.terms_ack));
                // If a draft already exists (LLM previously ran), synthesise a
                // minimal `generated` view so the user sees their prior output.
                if (e?.content_draft) {
                    setGenerated({
                        subject: (e.intake && e.intake.subject) || "",
                        body: e.content_draft,
                        mac_portal_short_form: e.content_draft.slice(0, 1200),
                        cover_note: null,
                        _restored: true,
                    });
                }
            })
            .catch((err) => setError(extractErrorMessage(err, "Could not load this correspondence entry.")))
            .finally(() => setLoading(false));
        return () => { cancelled = true; };
    }, [entryId]);

    // ---- Debounced autosave (WS8 T31) ----
    useEffect(() => {
        if (!entry || !dirty) return;
        const t = setTimeout(() => {
            const body = {
                intake,
                sender_authority_basis: senderAuthority,
                complaint_mode: complaintMode,
                atsi_preference: atsi,
            };
            api.patch(`/lf1/correspondence/${entryId}/autosave`, body)
                .then((r) => setSavingHint({ savedAt: r.data?.saved_at }))
                .catch(() => setSavingHint({ error: true }));
        }, AUTOSAVE_DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [intake, senderAuthority, complaintMode, atsi, dirty, entry, entryId]);

    const canDelete = entry && entry.status !== "sent";

    const doDelete = async () => {
        setBusyDelete(true);
        try {
            await api.delete(`/lf1/correspondence/${entryId}`);
            nav("/tools/letters-and-follow-ups/log");
        } catch (err) {
            setError(extractErrorMessage(err, "Delete failed."));
        } finally {
            setBusyDelete(false);
            setDeleteConfirmOpen(false);
        }
    };

    const acknowledgeTerms = async (checked) => {
        setTermsAck(checked);
        try {
            await api.patch(`/lf1/correspondence/${entryId}`, { terms_ack: checked });
        } catch (_) { /* noop */ }
    };

    const archetypeSupportsComplaintModes = useMemo(() => {
        if (!entry) return false;
        return ["complaint", "escalation", "guided_pathway"].includes(entry.archetype);
    }, [entry]);

    const isReassessmentRequest = entry?.archetype === "request" && [1, 2].includes(entry?.situation_id);
    const isGuidedPathway = entry?.archetype === "guided_pathway";
    const isResponseDraft = entry?.archetype === "response_draft" || entry?.situation_id === 12;

    const onIntakeChange = useCallback((next) => {
        setIntake(next);
        setDirty(true);
    }, []);

    const onImported = useCallback((data) => {
        // Merge fields from the import into intake so the user sees them
        // pre-filled without a page reload.
        const mergedIntake = { ...(intake || {}), ...(data?.intake || {}) };
        setIntake(mergedIntake);
        setSavingHint({ savedAt: new Date().toISOString(), imported: true });
        // If a draft already exists, pull the imported facts straight into the
        // letter by regenerating from the merged intake (spec: "tap a linked
        // statement or price check to pull those facts into the draft").
        if (generated && !isGuidedPathway) {
            setAutoGenerating(true);
            api.post(`/lf1/correspondence/${entryId}/generate`, { intake: mergedIntake, persist: true })
                .then(({ data: g }) => onGenerated(g))
                .catch(() => { /* keep the existing draft on failure */ })
                .finally(() => setAutoGenerating(false));
        }
    }, [intake, generated, isGuidedPathway, entryId]);

    const downloadPdf = async () => {
        setBusyPdf(true);
        try {
            const res = await api.post(`/lf1/correspondence/${entryId}/pdf`, {}, { responseType: "blob" });
            const blob = new Blob([res.data], { type: "application/pdf" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `wayly-letter-${entry?.archetype || "letter"}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            // UXF-1 v3 spec 3.20: surface correspondence-log disclosure.
            setPdfSaved(true);
        } catch (err) {
            setError(extractErrorMessage(err, "Could not download the PDF."));
        } finally {
            setBusyPdf(false);
        }
    };

    const onGenerated = (payload) => {
        setGenerated(payload);
        // Refresh the entry so status / output_formats / feedback surfaces update.
        api.get(`/lf1/correspondence/${entryId}`).then((r) => setEntry(r.data)).catch(() => {});
    };

    // Issues carried over from another tool (Invoice Checker, Support Plan
    // Reviewer, etc.) via `source_import`. Normalise the single-finding and
    // bulk shapes into one list so we can both show them and auto-draft.
    const TOOL_LABELS = {
        "invoice-checker": "Invoice Checker",
        "statement-decoder": "Statement Decoder",
        "care-plan-reviewer": "Support Plan Reviewer",
        "support-plan-reviewer": "Support Plan Reviewer",
        "provider-price-checker": "Provider Price Checker",
    };
    const carriedIssues = useMemo(() => {
        const si = entry?.source_import;
        if (!si) return { tool: null, items: [] };
        const label = TOOL_LABELS[si.tool] || (si.tool ? si.tool.replace(/-/g, " ") : "another tool");
        let items = [];
        if (Array.isArray(si.issues) && si.issues.length) {
            items = si.issues.map((x) => x.narrative || x.suggested_question || x.check_id).filter(Boolean);
        } else if (Array.isArray(si.findings) && si.findings.length) {
            items = si.findings.map((x) => x.narrative || x.title || x.suggested_question).filter(Boolean);
        } else if (si.narrative || si.suggested_question) {
            items = [si.narrative || si.suggested_question].filter(Boolean);
        }
        return { tool: label, items };
    }, [entry]);

    // Auto-draft on arrival when the letter was created from a tool, so the
    // user lands on a letter already populated with their issues instead of a
    // blank intake screen. Runs once; falls back to the manual button on error.
    const autoGenRef = useRef(false);
    const [autoGenerating, setAutoGenerating] = useState(false);
    useEffect(() => {
        if (!entry || autoGenRef.current) return;
        const cameFromTool = carriedIssues.items.length > 0;
        if (!cameFromTool || entry.content_draft || generated || isGuidedPathway) return;
        autoGenRef.current = true;
        setAutoGenerating(true);
        api.post(`/lf1/correspondence/${entryId}/generate`, { intake: entry.intake || null, persist: true })
            .then(({ data }) => onGenerated(data))
            .catch(() => { /* fall back to the manual Generate button below */ })
            .finally(() => setAutoGenerating(false));
    }, [entry, entryId, carriedIssues, generated, isGuidedPathway]);

    // LF-1 v2: when a letter is created directly from a situation (not carried
    // from another tool), seed the intake fields and draft a starting letter on
    // arrival, so the user never lands on a blank form. Runs once; idempotent
    // server-side and never clobbers fields the user has already filled.
    const prefillRef = useRef(false);
    const [prefilling, setPrefilling] = useState(false);
    useEffect(() => {
        if (!entry || prefillRef.current) return;
        const cameFromTool = carriedIssues.items.length > 0;
        if (cameFromTool || entry.content_draft || generated) return;
        if (isGuidedPathway || isResponseDraft) return;
        // Only fire when the intake has no user-written summary yet.
        const it = entry.intake || {};
        const summaryKeys = ["change_summary", "disputed_charge_summary", "complaint_summary", "escalation_summary", "notification_summary"];
        const hasUserSummary = summaryKeys.some((k) => (it[k] || "").trim());
        if (hasUserSummary) return;
        prefillRef.current = true;
        setPrefilling(true);
        api.post(`/lf1/correspondence/${entryId}/prefill`, { participant_name: activeName })
            .then(({ data }) => {
                if (data?.entry) {
                    setEntry(data.entry);
                    setIntake(data.entry.intake || {});
                    setSenderAuthority(data.entry.sender_authority_basis || "");
                }
                if (data?.generated) setGenerated(data.generated);
            })
            .catch(() => { /* fall back to the manual intake + Generate button */ })
            .finally(() => setPrefilling(false));
    }, [entry, entryId, carriedIssues, generated, isGuidedPathway, isResponseDraft, activeName]);

    const onShared = (data) => {
        setEntry((prev) => prev ? { ...prev, shared_with: data?.shared_with || [], sign_off_required: data?.sign_off_required || false } : prev);
    };

    const onSignedOff = (data) => {
        setEntry((prev) => prev ? { ...prev, sign_off_by: data?.sign_off_by, sign_off_at: data?.sign_off_at } : prev);
    };

    return (
        <div className="min-h-screen bg-kindred">
            <MarketingHeader />
            <section className="mx-auto max-w-4xl px-6 pt-10 pb-4">
                <Link
                    to="/tools/letters-and-follow-ups/log"
                    className="text-sm text-muted-k hover:text-primary-k inline-flex items-center gap-1"
                    data-testid="lf1-detail-back"
                >
                    <ArrowLeft className="h-4 w-4" /> Correspondence log
                </Link>
                <h1
                    className="font-heading text-4xl sm:text-5xl text-primary-k mt-3 tracking-tight"
                    data-testid="lf1-detail-title"
                >
                    {loading ? "Loading…" : (entry?.situation_label || "Correspondence")}
                </h1>
                {entry && (
                    <p className="mt-2 text-sm text-muted-k">
                        {(() => {
                            const A = {
                                request: "a request", dispute: "a dispute", complaint: "a complaint",
                                escalation: "an escalation", notification: "a notification",
                                response_draft: "a reply", guided_pathway: "a safeguarding record",
                            }[entry.archetype] || "a letter";
                            const R = {
                                provider_cm: "your provider", provider: "your provider", provider_senior: "your provider's senior team",
                                mac: "My Aged Care", acqsc: "the Aged Care Quality and Safety Commission",
                                ombudsman: "the Commonwealth Ombudsman", services_australia: "Services Australia",
                                services_australia_aged_care: "Services Australia", opan: "OPAN", elder_abuse_helpline: "the elder abuse helpline",
                            }[entry.recipient_type];
                            return R ? `This is ${A} to ${R}.` : `This is ${A}.`;
                        })()}
                        <span className="ml-2">
                            <LF1ADMDisclosure archetype={entry.archetype} situationLabel={entry.situation_label} />
                        </span>
                    </p>
                )}
            </section>

            <section className="mx-auto max-w-4xl px-6 pb-16 space-y-5">
                {loading && (
                    <div className="text-muted-k inline-flex items-center gap-2 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                    </div>
                )}
                {error && <div className="text-sm text-terracotta" data-testid="lf1-detail-error">{error}</div>}

                {entry && !loading && (
                    <>
                        {/* Cross-tool import chips (Iter 3) */}
                        {!isGuidedPathway && (
                            <div className="bg-surface border border-kindred rounded-2xl p-5">
                                <CrossToolImportPanel entryId={entryId} onImport={onImported} />
                            </div>
                        )}

                        {/* Issues carried over from another tool (auto-drafted below) */}
                        {carriedIssues.items.length > 0 && (
                            <div className="panel-solid-clay rounded-2xl p-5" data-testid="lf1-carried-issues">
                                <div className="text-xs uppercase tracking-wider text-white/80">
                                    {carriedIssues.items.length} issue{carriedIssues.items.length === 1 ? "" : "s"} carried over from {carriedIssues.tool}
                                </div>
                                <p className="text-sm text-white/90 mt-1 leading-relaxed">
                                    Wayly has pulled these into your letter and drafted it for you below. Edit anything before you send.
                                </p>
                                <ul className="mt-3 space-y-1.5">
                                    {carriedIssues.items.slice(0, 8).map((txt, i) => (
                                        <li key={i} className="text-sm text-white flex gap-2">
                                            <span aria-hidden>•</span><span>{txt}</span>
                                        </li>
                                    ))}
                                </ul>
                                {autoGenerating && (
                                    <div className="mt-3 inline-flex items-center gap-2 text-sm text-white/90" data-testid="lf1-autodraft-busy">
                                        <Loader2 className="h-4 w-4 animate-spin" /> Drafting your letter from these issues…
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Sender identity + authority (WS4) */}
                        <div className="bg-surface border border-kindred rounded-2xl p-5">
                            <div className="text-xs uppercase tracking-wider text-muted-k">
                                Sender authority
                            </div>
                            <p className="text-sm text-muted-k mt-1 leading-relaxed">
                                {"If you're writing on behalf of someone else, tell us the relationship or authority basis (e.g. 'Adult daughter and recorded representative with MAC ref 12345', or 'Enduring Power of Attorney dated 3 March 2024')."}
                            </p>
                            <textarea
                                value={senderAuthority}
                                onChange={(e) => { setSenderAuthority(e.target.value); setDirty(true); }}
                                rows={2}
                                placeholder="e.g. Adult daughter, POA dated 3 March 2024"
                                className="mt-3 w-full rounded-md border border-kindred px-3 py-2 text-sm"
                                data-testid="lf1-detail-sender-authority"
                            />
                        </div>

                        {/* Complaint mode selector (WS14 for complaint/escalation/guided_pathway) */}
                        {archetypeSupportsComplaintModes && (
                            <div className="bg-surface border border-kindred rounded-2xl p-5" data-testid="lf1-detail-complaint-mode">
                                <div className="text-xs uppercase tracking-wider text-muted-k">
                                    Complaint mode
                                </div>
                                <p className="text-sm text-muted-k mt-1 leading-relaxed">
                                    {"How much of your identity would you like included in the letter?"}
                                </p>
                                <div className="mt-3 grid sm:grid-cols-3 gap-2">
                                    {[
                                        { key: "open", label: "Open", detail: "Full identity in the letter and signature." },
                                        { key: "confidential", label: "Confidential", detail: "Identity retained; asks the recipient to treat as confidential." },
                                        { key: "anonymous", label: "Anonymous", detail: "Complainant identity stripped. ACQSC can investigate but cannot contact you for more information." },
                                    ].map((opt) => (
                                        <button
                                            key={opt.key}
                                            type="button"
                                            onClick={() => { setComplaintMode(opt.key); setDirty(true); }}
                                            data-testid={`lf1-complaint-mode-${opt.key}`}
                                            className={[
                                                "text-left rounded-xl border p-3 transition-colors",
                                                complaintMode === opt.key
                                                    ? "bg-primary-k text-white border-primary-k"
                                                    : "bg-surface border-kindred text-primary-k hover:border-primary-k",
                                            ].join(" ")}
                                        >
                                            <div className="font-medium">{opt.label}</div>
                                            <div
                                                className={[
                                                    "text-xs mt-1 leading-snug",
                                                    complaintMode === opt.key ? "text-white/80" : "text-muted-k",
                                                ].join(" ")}
                                            >
                                                {opt.detail}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ATSI pathway option (WS14 T34, reassessment intake only) */}
                        {isReassessmentRequest && (
                            <div className="bg-surface border border-kindred rounded-2xl p-5" data-testid="lf1-detail-atsi">
                                <label className="flex items-start gap-3 text-sm text-primary-k cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={atsi}
                                        onChange={(e) => { setAtsi(e.target.checked); setDirty(true); }}
                                        className="mt-0.5 h-4 w-4 rounded border-kindred text-primary-k"
                                        data-testid="lf1-detail-atsi-checkbox"
                                    />
                                    <span>
                                        {"Would you like this reassessment to be conducted by an Aboriginal and Torres Strait Islander assessment organisation where available?"}
                                    </span>
                                </label>
                            </div>
                        )}

                        {/* Archetype-specific intake form (Iter 2) */}
                        <div className="bg-surface border border-kindred rounded-2xl p-5" data-testid="lf1-intake-form">
                            {intake?.prefill_source === "situation" && (
                                <div className="mb-4 rounded-xl border border-[#0E4D52]/20 bg-[#0E4D52]/[0.06] p-4" data-testid="lf1-detail-starter-note">
                                    <div className="flex items-start gap-2">
                                        <Sparkles className="h-4 w-4 mt-0.5 text-[#0E4D52] flex-shrink-0" aria-hidden="true" />
                                        <p className="text-sm text-primary-k leading-relaxed">
                                            Wayly has started this letter for you based on the situation you picked. The fields and the draft below are a starting point, edit anything, fill in the details in brackets, then regenerate.
                                        </p>
                                    </div>
                                </div>
                            )}
                            {(intake?.prefill_source === "hardship" || intake?.prefill_source === "voice_check") && (
                                <div className="mb-4 rounded-xl border border-primary-k/15 bg-primary-k/[0.03] p-4" data-testid="lf1-detail-prefill-context">
                                    <p className="text-xs uppercase tracking-wide text-primary-k/60">
                                        {intake.prefill_source === "hardship" ? "Prefilled from hardship walkthrough" : "Prefilled from My Care Goals"}
                                    </p>
                                    {intake.situation_label && (
                                        <p className="text-sm text-primary-k mt-1">{intake.situation_label}</p>
                                    )}
                                    {intake.companion_notes && (
                                        <div className="mt-2 text-sm text-primary-k/80 whitespace-pre-wrap" data-testid="lf1-detail-companion-notes">
                                            <span className="text-xs text-primary-k/50 uppercase tracking-wide block mb-1">Your notes</span>
                                            {intake.companion_notes}
                                        </div>
                                    )}
                                    {(intake.hardship_trigger_id || intake.voice_check_id) && (
                                        <p className="text-[11px] text-primary-k/40 mt-2">
                                            Linked to {intake.hardship_trigger_id ? `hardship trigger ${intake.hardship_trigger_id.slice(0, 8)}` : `voice check ${intake.voice_check_id.slice(0, 8)}`}
                                        </p>
                                    )}
                                </div>
                            )}
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-xs uppercase tracking-wider text-muted-k">Intake</div>
                                {savingHint?.savedAt && (
                                    <span className="text-xs text-muted-k inline-flex items-center gap-1" data-testid="lf1-detail-autosave-hint">
                                        <Save className="h-3 w-3" /> {savingHint?.imported ? "Imported" : "Saved"}
                                    </span>
                                )}
                            </div>
                            {isGuidedPathway && (
                                <div className="mt-3 bg-clay/10 border border-clay/25 rounded-xl p-4" data-testid="lf1-detail-guided-record">
                                    <div className="flex items-start gap-2">
                                        <Info className="h-4 w-4 text-clay mt-0.5" aria-hidden="true" />
                                        <div className="text-sm text-primary-k leading-relaxed">
                                            {"This is a structured safeguarding record, not a persuasion letter. Capture what you saw, when, and any evidence you have."}
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div className="mt-4">
                                <ArchetypeIntakeForm
                                    archetype={entry.archetype}
                                    intake={intake}
                                    onChange={onIntakeChange}
                                />
                            </div>
                        </div>

                        {/* Terms acknowledgement (WS20 T40) */}
                        <div className="bg-surface border border-kindred rounded-2xl p-5" data-testid="lf1-detail-terms">
                            <label className="flex items-start gap-3 text-sm text-primary-k cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={termsAck}
                                    onChange={(e) => acknowledgeTerms(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 rounded border-kindred text-primary-k"
                                    data-testid="lf1-detail-terms-checkbox"
                                />
                                <span className="leading-relaxed">
                                    {"I understand Wayly's Letters & Follow-ups is a drafting assistant, not legal advice. I'm responsible for reviewing this letter before sending it."}
                                </span>
                            </label>
                        </div>

                        {/* Generation trigger, three variants */}
                        <div className="bg-surface-2 border border-kindred rounded-2xl p-5" data-testid="lf1-generation-panel">
                            <div className="flex items-start gap-3">
                                <MessageSquare className="h-5 w-5 text-primary-k mt-0.5" aria-hidden="true" />
                                <div className="flex-1">
                                    <div className="font-medium text-primary-k">
                                        {isGuidedPathway
                                            ? "Ready to build the safeguarding record"
                                            : isResponseDraft
                                                ? "Ready to draft your reply"
                                                : "Ready to draft your letter"}
                                    </div>
                                    <p className="text-sm text-muted-k mt-1 leading-relaxed">
                                        {"Wayly uses the intake above and the Statement of Rights citation library. You can regenerate at any time, nothing is sent."}
                                    </p>
                                    {prefilling && (
                                        <div className="mt-2 inline-flex items-center gap-2 text-sm text-primary-k" data-testid="lf1-prefill-busy">
                                            <Loader2 className="h-4 w-4 animate-spin" /> Drafting a starting point from your situation…
                                        </div>
                                    )}
                                    <div className="mt-3">
                                        {isGuidedPathway ? (
                                            <SafeguardingRecordButton
                                                entryId={entryId}
                                                intakeOverrides={intake}
                                                onGenerated={onGenerated}
                                            />
                                        ) : isResponseDraft ? (
                                            <ResponseDraftGenerateButton
                                                entryId={entryId}
                                                intake={intake}
                                                onGenerated={onGenerated}
                                            />
                                        ) : (
                                            <GenerateButton
                                                entryId={entryId}
                                                intakeOverrides={intake}
                                                onGenerated={onGenerated}
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Generated output, cover note + format switcher */}
                        {generated && (
                            <div className="space-y-5" data-testid="lf1-generated-output">
                                {isEnabled("uxf_v3.provenance") && <CrossToolProvenance generated={generated} />}
                                {generated.cover_note && <CoverNotePanel coverNote={generated.cover_note} />}
                                <OutputFormatSwitcher
                                    generated={generated}
                                    onDownloadPdf={downloadPdf}
                                    busyPdf={busyPdf}
                                />
                                {pdfSaved && isEnabled("uxf_v3.artifacts") && (
                                    <StandingBanner
                                        variant="success"
                                        title="PDF downloaded"
                                        onDismiss={() => setPdfSaved(false)}
                                        testId="lf1-pdf-saved"
                                    >
                                        {COPY.artifact.lf1.correspondenceLogDisclosure}
                                    </StandingBanner>
                                )}
                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                    <FeedbackChip entryId={entryId} existingFeedback={entry?.feedback} />
                                </div>
                                {isEnabled("uxf_v3.disclosure") && (
                                    <AutomatedDecisionDisclosure
                                        body="This letter was drafted automatically from your intake and the linked tool state above. Read it in full before sending. Wayly Letters and Follow-ups is a drafting assistant, not legal advice."
                                        contactUrl="/contact"
                                        testId="lf1-automated-decision"
                                    />
                                )}
                                <ToneCheckPanel entryId={entryId} body={generated.body} archetype={entry.archetype} />
                            </div>
                        )}

                        {/* Family Coordinator share + sign-off (Iter 4) */}
                        {!isGuidedPathway && (
                            <ShareAndSignOffPanel
                                entry={entry}
                                onShared={onShared}
                                onSignedOff={onSignedOff}
                            />
                        )}

                        {/* Delete action */}
                        {canDelete && (
                            <div className="flex items-center justify-between">
                                <button
                                    type="button"
                                    onClick={() => setDeleteConfirmOpen(true)}
                                    className="text-xs text-muted-k hover:text-terracotta inline-flex items-center gap-1"
                                    data-testid="lf1-detail-delete"
                                >
                                    <Trash2 className="h-3.5 w-3.5" /> Delete this draft
                                </button>
                            </div>
                        )}
                    </>
                )}
            </section>

            <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <DialogContent data-testid="lf1-detail-delete-modal">
                    <DialogHeader>
                        <DialogTitle>Delete this draft?</DialogTitle>
                        <DialogDescription>
                            This will remove the draft from your correspondence log. A deletion record is preserved for audit purposes.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2">
                        <button
                            type="button"
                            onClick={() => setDeleteConfirmOpen(false)}
                            className="px-3.5 py-2 rounded-full border border-kindred text-primary-k text-sm"
                        >
                            Keep it
                        </button>
                        <button
                            type="button"
                            onClick={doDelete}
                            disabled={busyDelete}
                            className="px-3.5 py-2 rounded-full bg-terracotta text-white text-sm disabled:opacity-60"
                            data-testid="lf1-detail-delete-confirm"
                        >
                            {busyDelete ? "Deleting…" : "Delete"}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Footer />
        </div>
    );
}
