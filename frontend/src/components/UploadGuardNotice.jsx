import React from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, FileWarning, ArrowRight, ShieldAlert } from "lucide-react";

/**
 * UPLOAD-GUARD-1 (v1) — renders the server's block / wrong-tool / confirm
 * verdict identically to mobile.
 *
 * Two modes:
 *  - default: inline notice. `onContinue` powers the confirm tier (re-submit
 *    with override); used by the Invoice Checker.
 *  - strict:  a prominent, full-width block used by the Statement Decoder and
 *    Care Plan Reviewer. There is NO "continue anyway" — the document must be
 *    clearly the right type before any numbers are shown.
 */
export default function UploadGuardNotice({ verdict, onContinue, onChooseAnother, busy, strict = false }) {
    const navigate = useNavigate();
    if (!verdict) return null;
    const isConfirm = verdict.decision === "confirm";
    const wrong = verdict.reason === "wrong_tool" && verdict.wrong_tool;

    if (strict) {
        // Full-screen, hard-block presentation. No "continue anyway" unless the
        // caller explicitly allows it for the ambiguous (confirm) tier.
        const allowContinue = isConfirm && !!onContinue;
        const heading = wrong
            ? "This looks like a different document"
            : allowContinue
                ? "Just checking this is the right document"
                : "We can't review this document";
        const message = (wrong || verdict.reason === "unreadable" || allowContinue)
            ? verdict.message
            : "To keep you from acting on the wrong numbers, we only continue when the file is clearly the right type. Please upload the correct document, or paste the text instead. Nothing has been read from this file.";
        return (
            <div
                data-testid="upload-guard-notice"
                className="rounded-2xl border-2 border-terracotta bg-[linear-gradient(135deg,rgba(192,57,43,0.10),rgba(240,178,103,0.08))] p-6 sm:p-8 text-center shadow-sm"
            >
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-terracotta text-white shadow-sm">
                    <ShieldAlert className="h-7 w-7" />
                </div>
                <h3 className="mt-4 font-serif text-xl sm:text-2xl text-primary-k">{heading}</h3>
                <p className="mx-auto mt-2 max-w-xl text-sm sm:text-base text-primary-k/85 leading-relaxed" data-testid="upload-guard-message">
                    {message}
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
                    {wrong ? (
                        <button
                            type="button"
                            data-testid="upload-guard-open-right-tool"
                            onClick={() => navigate(verdict.wrong_tool.route_web)}
                            className="inline-flex items-center gap-1.5 rounded-full bg-primary-k px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-k/90"
                        >
                            Open the {verdict.wrong_tool.name}
                            <ArrowRight className="h-4 w-4" />
                        </button>
                    ) : null}
                    {isConfirm && onContinue ? (
                        <button
                            type="button"
                            data-testid="upload-guard-continue"
                            onClick={onContinue}
                            disabled={busy}
                            className="inline-flex items-center rounded-full bg-primary-k px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-k/90 disabled:opacity-60"
                        >
                            {busy ? "Working…" : "Continue anyway"}
                        </button>
                    ) : null}
                    <button
                        type="button"
                        data-testid="upload-guard-choose-another"
                        onClick={onChooseAnother}
                        className="inline-flex items-center rounded-full border border-primary-k/30 bg-surface px-5 py-2.5 text-sm font-semibold text-primary-k transition-colors hover:bg-primary-k/[0.06]"
                    >
                        Choose a different file
                    </button>
                </div>
            </div>
        );
    }

    const accent = isConfirm ? "border-amber-400 bg-amber-50" : "border-terracotta bg-red-50";
    const iconColor = isConfirm ? "text-amber-500" : "text-terracotta";
    const Icon = wrong ? FileWarning : AlertTriangle;

    return (
        <div data-testid="upload-guard-notice" className={`rounded-2xl border p-5 ${accent}`}>
            <div className="flex gap-3">
                <Icon className={`h-6 w-6 shrink-0 ${iconColor}`} />
                <div className="flex-1">
                    <h3 className="font-serif text-lg text-ink-k">
                        {wrong ? "Wrong document?" : isConfirm ? "Just checking" : "We couldn't use this file"}
                    </h3>
                    <p className="mt-1 text-sm text-ink-k" data-testid="upload-guard-message">
                        {verdict.message}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                        {wrong ? (
                            <button
                                type="button"
                                data-testid="upload-guard-open-right-tool"
                                onClick={() => navigate(verdict.wrong_tool.route_web)}
                                className="inline-flex items-center gap-1.5 rounded-full bg-primary-k px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-k/90"
                            >
                                Open the {verdict.wrong_tool.name}
                                <ArrowRight className="h-4 w-4" />
                            </button>
                        ) : null}
                        {isConfirm && onContinue ? (
                            <button
                                type="button"
                                data-testid="upload-guard-continue"
                                onClick={onContinue}
                                disabled={busy}
                                className="inline-flex items-center rounded-full bg-primary-k px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-k/90 disabled:opacity-60"
                            >
                                {busy ? "Working…" : "Continue anyway"}
                            </button>
                        ) : null}
                        <button
                            type="button"
                            data-testid="upload-guard-choose-another"
                            onClick={onChooseAnother}
                            className="inline-flex items-center rounded-full border border-kindred px-4 py-2 text-sm font-medium text-ink-k transition-colors hover:bg-surface"
                        >
                            Choose a different file
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
