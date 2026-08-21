import React from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, FileWarning, ArrowRight } from "lucide-react";

/**
 * UPLOAD-GUARD-1 (v1) — renders the server's block / wrong-tool / confirm
 * verdict identically to mobile. `onContinue` powers the confirm tier
 * (re-submit with override); `onChooseAnother` clears the current file.
 */
export default function UploadGuardNotice({ verdict, onContinue, onChooseAnother, busy }) {
    const navigate = useNavigate();
    if (!verdict) return null;
    const isConfirm = verdict.decision === "confirm";
    const wrong = verdict.reason === "wrong_tool" && verdict.wrong_tool;
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
