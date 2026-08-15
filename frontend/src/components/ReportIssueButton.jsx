import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { StandingBanner } from "@/uxf";
import { AlertCircle, Loader2, X, CheckCircle2 } from "lucide-react";

/**
 * Wayly Support, "Report an Issue With This Result" entry point.
 * Drops in below the tool result. Opens a slide-up panel (mobile) or
 * side panel (desktop) with the structured intake form. SUP-1 flow.
 *
 * Props:
 *   toolName, toolVersion (string)
 *   toolInput, toolOutput (objects)
 *   statementId (string, optional), when present, the user can consent to
 *       attach the original statement they uploaded.
 */
export default function ReportIssueButton({
    toolName,
    toolVersion = "v1",
    toolInput = {},
    toolOutput = {},
    statementId = null,
    variant = "primary",  // "primary" = standalone CTA, "inline" = slim trigger inside the result block
}) {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);

    if (!user) return null;

    const isInline = variant === "inline";

    return (
        <div
            className={
                isInline
                    ? "mt-5 flex items-center justify-end gap-2 border-t border-[#E5DCC9]/70 pt-3"
                    : "mt-4"
            }
        >
            {isInline && (
                <span className="text-[11px] uppercase tracking-wider text-[#0E4D52]/55">
                    Something not right?
                </span>
            )}
            <button
                type="button"
                onClick={() => setOpen(true)}
                className={
                    isInline
                        ? "inline-flex items-center gap-1.5 rounded-full border border-[#C2683D]/40 bg-white/60 px-3 py-1 text-xs font-medium text-[#C2683D] transition hover:border-[#C2683D] hover:bg-[#C2683D] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2683D] focus-visible:ring-offset-2"
                        : "inline-flex items-center gap-2 rounded-full border-2 border-[#C2683D] bg-white px-4 py-2 text-sm font-medium text-[#C2683D] transition hover:bg-[#C2683D] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C2683D] focus-visible:ring-offset-2"
                }
                data-testid="report-issue-btn"
                aria-label="Report an issue with this result"
            >
                <AlertCircle className={isInline ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true" />
                Report an Issue With This Result
            </button>

            {open && (
                <ReportIssuePanel
                    onClose={() => setOpen(false)}
                    toolName={toolName}
                    toolVersion={toolVersion}
                    toolInput={toolInput}
                    toolOutput={toolOutput}
                    statementId={statementId}
                />
            )}
        </div>
    );
}

const CATEGORY_OPTIONS = [
    { value: "figure_incorrect", label: "A figure looks wrong" },
    { value: "rule_misapplied", label: "A rule was applied that does not fit my situation" },
    { value: "situation_not_captured", label: "My situation was not captured" },
    { value: "tool_misunderstood_input", label: "The tool misread what I entered" },
    { value: "other", label: "Something else" },
];

const SOURCE_OPTIONS = [
    { value: "assessor", label: "My assessor" },
    { value: "official_letter", label: "A letter or statement I received" },
    { value: "my_aged_care", label: "My Aged Care" },
    { value: "aged_care_rules", label: "My reading of the Aged Care Rules" },
    { value: "own_reading", label: "My own understanding" },
    { value: "other", label: "Something else" },
];

function ReportIssuePanel({ onClose, toolName, toolVersion, toolInput, toolOutput, statementId, mode = "tool-result", onSubmitted }) {
    const isGeneral = mode === "general";
    const [category, setCategory] = useState("");
    const [claimedAnswer, setClaimedAnswer] = useState("");
    const [claimedSource, setClaimedSource] = useState("");
    const [claimedSourceDetail, setClaimedSourceDetail] = useState("");
    const [userNote, setUserNote] = useState("");
    const [consent, setConsent] = useState(false);
    const [generalArea, setGeneralArea] = useState("General Support");
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(null);
    const [submitError, setSubmitError] = useState(null);

    const scrollRef = useRef(null);

    // Reset scroll to top + lock body scroll when the panel mounts
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = prev; };
    }, []);

    const canSubmit = category && (!isGeneral || generalArea) && !submitting;

    const submit = async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        setSubmitting(true);
        setSubmitError(null);
        try {
            const res = await api.post("/support/tickets", {
                tool_name: isGeneral ? generalArea : toolName,
                tool_version: isGeneral ? "n/a" : (toolVersion || "v1"),
                tool_input: isGeneral ? {} : (toolInput || {}),
                tool_output: isGeneral ? {} : (toolOutput || {}),
                channel: isGeneral ? "manual" : "in_tool",
                category,
                user_note: userNote || null,
                user_claimed_answer: claimedAnswer || null,
                user_claimed_source: claimedSource || null,
                user_claimed_source_detail: claimedSourceDetail || null,
                consent_to_share_statement: !isGeneral && !!consent,
                consent_text_version: !isGeneral && consent ? "support-consent-v1" : null,
                statement_id: isGeneral ? null : statementId,
            });
            const created = res.data?.ticket || {};
            setSubmitted(created);
            if (onSubmitted) onSubmitted(created);
        } catch (err) {
            // UXF-1 v3 spec 3.1: keep the failure message on screen with
            // the person's typing intact so retry is one click.
            setSubmitError(err?.response?.data?.detail || "We could not submit your ticket. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Report an issue with this result"
            className="fixed inset-0 z-[100] flex justify-end bg-black/55 backdrop-blur-sm"
            onClick={onClose}
            data-testid="report-issue-panel"
        >
            <div
                className="flex h-full w-full max-w-md flex-col bg-[#FBF8F3] shadow-2xl border-l border-[#E5DCC9] animate-slide-in-right sm:max-w-lg lg:max-w-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between border-b border-[#E5DCC9] px-6 py-4 shrink-0">
                    <h2 className="text-lg font-semibold text-[#0E4D52]" style={{ fontFamily: "Fraunces, serif" }}>
                        {submitted
                            ? "Your Ticket Has Been Received"
                            : (isGeneral ? "Raise a New Ticket" : "Report an Issue With This Result")}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full p-2 text-[#0E4D52] hover:bg-[#E5DCC9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E4D52]"
                        aria-label="Close"
                        data-testid="report-issue-close"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {submitted ? (
                    <ConfirmationView reference={submitted.reference} onClose={onClose} />
                ) : (
                    <form onSubmit={submit} className="flex flex-1 flex-col overflow-hidden">
                        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5">
                        {/* Read-only context for tool-result mode, area selector for general mode */}
                        {isGeneral ? (
                            <label className="mb-5 block">
                                <span className="mb-2 block text-sm font-semibold text-[#0E4D52]">
                                    What Is This About <span className="text-[#C2683D]" aria-hidden="true">*</span>
                                </span>
                                <select
                                    value={generalArea}
                                    onChange={(e) => setGeneralArea(e.target.value)}
                                    required
                                    className="w-full rounded-lg border border-[#E5DCC9] bg-white p-2.5 text-sm text-[#0E4D52] focus:border-[#0E4D52] focus:outline-none focus:ring-1 focus:ring-[#0E4D52]"
                                    data-testid="report-issue-area"
                                >
                                    <option value="General Support">General Support</option>
                                    <option value="Statement Decoder">Statement Decoder</option>
                                    <option value="Budget Calculator">Budget Calculator</option>
                                    <option value="Provider Price Checker">Provider Price Checker</option>
                                    <option value="Classification Self-Check">Classification Self-Check</option>
                                    <option value="Letters & Follow-ups">Letters & Follow-ups</option>
                                    <option value="Reassessment Letter">Reassessment Letter (legacy)</option>
                                    <option value="Contribution Estimator">Contribution Estimator</option>
                                    <option value="Support Plan Reviewer">Support Plan Reviewer</option>
                                    <option value="Aged Care Q&A">Aged Care Q&amp;A</option>
                                    <option value="Account or Billing">Account or Billing</option>
                                    <option value="Something Else">Something Else</option>
                                </select>
                            </label>
                        ) : (
                            <div className="mb-5 rounded-lg border border-[#E5DCC9] bg-white p-4 text-sm text-[#0E4D52]">
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <div className="text-[11px] uppercase tracking-wide text-[#6B8F71]">Tool</div>
                                        <div className="font-medium">{toolName}</div>
                                    </div>
                                    <div>
                                        <div className="text-[11px] uppercase tracking-wide text-[#6B8F71]">Version</div>
                                        <div className="font-medium">{toolVersion}</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Category */}
                        <fieldset className="mb-5">
                            <legend className="mb-2 block text-sm font-semibold text-[#0E4D52]">
                                What Went Wrong <span className="text-[#C2683D]" aria-hidden="true">*</span>
                            </legend>
                            <div className="space-y-2">
                                {CATEGORY_OPTIONS.map((opt) => (
                                    <label
                                        key={opt.value}
                                        className="flex cursor-pointer items-center gap-3 rounded-lg border border-[#E5DCC9] bg-white px-3 py-2 text-sm text-[#0E4D52] hover:border-[#6B8F71]"
                                    >
                                        <input
                                            type="radio"
                                            name="category"
                                            value={opt.value}
                                            checked={category === opt.value}
                                            onChange={(e) => setCategory(e.target.value)}
                                            className="h-4 w-4 accent-[#0E4D52]"
                                            data-testid={`report-issue-cat-${opt.value}`}
                                            required
                                        />
                                        <span>{opt.label}</span>
                                    </label>
                                ))}
                            </div>
                        </fieldset>

                        {/* Claimed answer */}
                        <label className="mb-5 block">
                            <span className="mb-2 block text-sm font-semibold text-[#0E4D52]">What Do You Think the Correct Answer Is?</span>
                            <textarea
                                value={claimedAnswer}
                                onChange={(e) => setClaimedAnswer(e.target.value)}
                                rows={2}
                                maxLength={2000}
                                className="w-full rounded-lg border border-[#E5DCC9] bg-white p-3 text-sm text-[#0E4D52] focus:border-[#0E4D52] focus:outline-none focus:ring-1 focus:ring-[#0E4D52]"
                                placeholder="Optional"
                                data-testid="report-issue-answer"
                            />
                        </label>

                        {/* Claimed source */}
                        <label className="mb-2 block">
                            <span className="mb-2 block text-sm font-semibold text-[#0E4D52]">Where Are You Getting That From?</span>
                            <select
                                value={claimedSource}
                                onChange={(e) => setClaimedSource(e.target.value)}
                                className="w-full rounded-lg border border-[#E5DCC9] bg-white p-2.5 text-sm text-[#0E4D52] focus:border-[#0E4D52] focus:outline-none focus:ring-1 focus:ring-[#0E4D52]"
                                data-testid="report-issue-source"
                            >
                                <option value="">Optional, choose one</option>
                                {SOURCE_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>{o.label}</option>
                                ))}
                            </select>
                        </label>
                        {claimedSource === "other" && (
                            <input
                                type="text"
                                value={claimedSourceDetail}
                                onChange={(e) => setClaimedSourceDetail(e.target.value)}
                                placeholder="Tell us a bit more"
                                maxLength={400}
                                className="mb-5 w-full rounded-lg border border-[#E5DCC9] bg-white p-2.5 text-sm text-[#0E4D52] focus:border-[#0E4D52] focus:outline-none focus:ring-1 focus:ring-[#0E4D52]"
                                data-testid="report-issue-source-detail"
                            />
                        )}
                        {claimedSource !== "other" && <div className="mb-3" />}

                        {/* Note */}
                        <label className="mb-5 block">
                            <span className="mb-2 block text-sm font-semibold text-[#0E4D52]">Anything Else You Want Us to Know?</span>
                            <textarea
                                value={userNote}
                                onChange={(e) => setUserNote(e.target.value)}
                                rows={3}
                                maxLength={4000}
                                className="w-full rounded-lg border border-[#E5DCC9] bg-white p-3 text-sm text-[#0E4D52] focus:border-[#0E4D52] focus:outline-none focus:ring-1 focus:ring-[#0E4D52]"
                                placeholder="Optional"
                                data-testid="report-issue-note"
                            />
                        </label>

                        {/* Consent block, only shown in tool-result mode where a statement may exist */}
                        {!isGeneral && (
                        <div className="mb-5 rounded-lg border border-[#6B8F71]/40 bg-white p-4">
                            <div className="mb-2 text-sm font-semibold text-[#0E4D52]">Sharing Your Statement</div>
                            <p className="mb-3 text-sm leading-relaxed text-[#0E4D52]">
                                To look into this properly, it helps us to see the original statement you uploaded. You can choose whether to send it.
                            </p>
                            <label className="flex cursor-pointer items-start gap-3 text-sm text-[#0E4D52]">
                                <input
                                    type="checkbox"
                                    checked={consent}
                                    onChange={(e) => setConsent(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 accent-[#0E4D52]"
                                    data-testid="report-issue-consent"
                                />
                                <span>
                                    Yes, I&apos;m happy for the Wayly team to see the original statement I uploaded so they can look into this. I understand the file is removed 90 days after my ticket is resolved.
                                </span>
                            </label>
                            {!consent && (
                                <p className="mt-3 rounded bg-[#F4F1EA] p-3 text-xs leading-relaxed text-[#0E4D52]">
                                    If you leave this unticked, we will not receive your original statement. We will still receive the result the tool showed you so we can look into what went wrong, and that result can include your figures.
                                </p>
                            )}
                        </div>
                        )}
                        </div>

                        <div className="flex shrink-0 flex-col gap-3 border-t border-[#E5DCC9] bg-[#FBF8F3] px-6 py-3">
                            {submitError && (
                                <StandingBanner
                                    variant="error"
                                    title="Could not submit ticket"
                                    onDismiss={() => setSubmitError(null)}
                                    testId="report-issue-error"
                                >
                                    {submitError}
                                </StandingBanner>
                            )}
                            <div className="flex items-center justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="rounded-full px-4 py-2 text-sm font-medium text-[#0E4D52] hover:bg-[#E5DCC9]"
                                    data-testid="report-issue-cancel"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={!canSubmit}
                                    className="inline-flex items-center gap-2 rounded-full bg-[#0E4D52] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a3d41] disabled:cursor-not-allowed disabled:opacity-50"
                                    data-testid="report-issue-submit"
                                >
                                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                                    Send Ticket
                                </button>
                            </div>
                        </div>
                    </form>
                )}
            </div>
        </div>,
        document.body
    );
}

function ConfirmationView({ reference, onClose }) {
    return (
        <div className="px-6 py-8 text-center" data-testid="report-issue-confirm">
            <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#6B8F71]/15 text-[#6B8F71]">
                <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="mb-2 text-base text-[#0E4D52]">
                Thanks for letting us know. Your reference is <strong>{reference}</strong>.
            </p>
                            <p className="mb-6 text-sm text-[#0E4D52]/85">
                We aim to come back to you within 14 days. You can check progress any time under Support.
            </p>
            <div className="flex flex-col items-center justify-center gap-2 sm:flex-row">
                <Link
                    to="/support"
                    onClick={onClose}
                    className="inline-flex items-center gap-2 rounded-full bg-[#0E4D52] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0a3d41]"
                    data-testid="report-issue-go-support"
                >
                    Go to My Support
                </Link>
                <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full px-4 py-2 text-sm font-medium text-[#0E4D52] hover:bg-[#E5DCC9]"
                >
                    Close
                </button>
            </div>
        </div>
    );
}

export { ReportIssuePanel };
