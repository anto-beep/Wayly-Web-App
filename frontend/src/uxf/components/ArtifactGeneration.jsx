/**
 * ArtifactGeneration (spec 3.20).
 *
 * Wraps any artifact-producing action (PDF, email, letter) with the
 * canonical "Generating → Ready → Delivered → Failed" state machine.
 * The caller passes a family key (e.g. "ce2", "lf1", "ppc", "carePlan",
 * "statement") and we pick the honest phase labels from COPY.artifact.
 *
 * If the artifact will be logged in a downstream correspondence log
 * (LF-1, CE-2), the component surfaces a StandingBanner-style
 * disclosure ("A copy has been kept in your correspondence log.") on
 * the READY state per spec 3.20.
 */
import React, { useEffect, useMemo } from "react";
import { CheckCircle2, Loader2, AlertCircle, Download } from "lucide-react";
import { announce } from "../primitives/LiveRegion";
import COPY from "../copy";

/**
 * @typedef {("idle"|"generating"|"ready"|"delivered"|"failed")} ArtifactPhase
 */

/**
 * @param {Object} props
 * @param {"ce2"|"lf1"|"ppc"|"carePlan"|"statement"} props.family
 * @param {ArtifactPhase} props.phase
 * @param {number} [props.currentStep=0]   0-based index into the family's steps.
 * @param {string} [props.readyLabel]      Button label when phase === "ready".
 * @param {() => void} [props.onDownload]  Handler for the ready CTA.
 * @param {string} [props.error]           Error message when phase === "failed".
 * @param {() => void} [props.onRetry]     Retry handler for the failed state.
 * @param {boolean} [props.hideDisclosure=false]
 *   Suppress the correspondence-log receipt (used when the caller writes
 *   its own bespoke banner).
 */
export function ArtifactGeneration({
    family,
    phase,
    currentStep = 0,
    readyLabel = "Download PDF",
    onDownload,
    error,
    onRetry,
    hideDisclosure = false,
    testId = "uxf-artifact-generation",
}) {
    const cfg = COPY.artifact[family];
    const steps = useMemo(() => (cfg ? cfg.steps : []), [cfg]);
    const disclosure = cfg && !hideDisclosure && cfg.correspondenceLogDisclosure;

    // Announce phase transitions politely. Hook must be called on every
    // render regardless of family / phase to satisfy rules-of-hooks.
    useEffect(() => {
        if (!cfg) return;
        if (phase === "ready") announce({ message: steps[steps.length - 1], priority: "polite" });
        else if (phase === "failed") announce({ message: error || "Generation failed.", priority: "assertive" });
    }, [phase, steps, error, cfg]);

    if (!cfg) return null;
    if (phase === "idle") return null;

    return (
        <div
            className="rounded-lg p-5 space-y-3"
            data-testid={testId}
            style={{
                backgroundColor: "var(--uxf-surface)",
                border: "1px solid var(--uxf-border)",
            }}
        >
            {phase === "generating" && (
                <>
                    <div className="flex items-center gap-3 text-sm">
                        <Loader2
                            className="w-4 h-4 animate-spin flex-shrink-0"
                            aria-hidden="true"
                            style={{ color: "var(--uxf-info)" }}
                        />
                        <span style={{ color: "var(--uxf-text)", fontWeight: 600 }}>
                            {steps[currentStep] || steps[0]}
                        </span>
                    </div>
                    <ol className="ml-7 space-y-1">
                        {steps.map((label, i) => (
                            <li
                                key={i}
                                className="text-xs"
                                style={{
                                    color: i <= currentStep
                                        ? "var(--uxf-text)"
                                        : "var(--uxf-muted)",
                                }}
                            >
                                {i < currentStep ? "✓ " : i === currentStep ? "· " : "  "}
                                {label}
                            </li>
                        ))}
                    </ol>
                </>
            )}

            {phase === "ready" && (
                <div className="flex items-start gap-3">
                    <CheckCircle2
                        className="w-5 h-5 flex-shrink-0 mt-0.5"
                        aria-hidden="true"
                        style={{ color: "var(--uxf-success)" }}
                    />
                    <div className="flex-1 space-y-2">
                        <div className="font-semibold" style={{ color: "var(--uxf-text)" }}>
                            {steps[steps.length - 1]}
                        </div>
                        {disclosure && (
                            <p className="text-xs" style={{ color: "var(--uxf-muted)" }}>
                                {disclosure}
                            </p>
                        )}
                        {onDownload && (
                            <button
                                type="button"
                                onClick={onDownload}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold"
                                data-testid={`${testId}-download`}
                                style={{
                                    backgroundColor: "var(--uxf-primary)",
                                    color: "var(--uxf-primary-fg)",
                                }}
                            >
                                <Download className="w-4 h-4" aria-hidden="true" />
                                {readyLabel}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {phase === "delivered" && (
                <div className="flex items-start gap-3">
                    <CheckCircle2
                        className="w-5 h-5 flex-shrink-0 mt-0.5"
                        aria-hidden="true"
                        style={{ color: "var(--uxf-success)" }}
                    />
                    <div className="flex-1">
                        <div className="font-semibold" style={{ color: "var(--uxf-text)" }}>
                            Delivered
                        </div>
                        {disclosure && (
                            <p className="text-xs mt-1" style={{ color: "var(--uxf-muted)" }}>
                                {disclosure}
                            </p>
                        )}
                    </div>
                </div>
            )}

            {phase === "failed" && (
                <div className="flex items-start gap-3">
                    <AlertCircle
                        className="w-5 h-5 flex-shrink-0 mt-0.5"
                        aria-hidden="true"
                        style={{ color: "var(--uxf-error)" }}
                    />
                    <div className="flex-1 space-y-2">
                        <div className="font-semibold" style={{ color: "var(--uxf-text)" }}>
                            Something went wrong
                        </div>
                        <p className="text-sm" style={{ color: "var(--uxf-muted)" }}>
                            {error || "The artifact could not be generated. Your inputs are still saved."}
                        </p>
                        {onRetry && (
                            <button
                                type="button"
                                onClick={onRetry}
                                className="text-sm font-semibold underline underline-offset-2 hover:no-underline"
                                data-testid={`${testId}-retry`}
                                style={{ color: "var(--uxf-primary)" }}
                            >
                                Try again
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default ArtifactGeneration;
