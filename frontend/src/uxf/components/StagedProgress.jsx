/**
 * StagedProgress (spec 3.2, 3.17).
 *
 * A staged loading indicator that shows a small ordered list of the
 * real backend phases and highlights the current one. Includes a
 * reassurance line (spec 3.2) and an elapsed-seconds counter for jobs
 * that exceed the "still going" psychological threshold (~10 s).
 *
 * Labels MUST correspond to real backend events (spec 3.17). Passing
 * fabricated pipeline steps is an editorial violation.
 */
import React, { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { announce } from "../primitives/LiveRegion";

/**
 * @param {Object} props
 * @param {string[]} props.steps            Ordered honest phase labels.
 * @param {number}   props.currentIndex     Zero-based, or -1 before start.
 * @param {string}   [props.reassurance]    One-line message under the list.
 * @param {number}   [props.startedAt]      Date.now() when the job began.
 * @param {string}   [props.testId]
 */
export function StagedProgress({
    steps,
    currentIndex = 0,
    reassurance,
    startedAt,
    testId = "uxf-staged-progress",
}) {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (!startedAt) return undefined;
        const iv = setInterval(() => setElapsed(Math.max(0, Math.floor((Date.now() - startedAt) / 1000))), 500);
        return () => clearInterval(iv);
    }, [startedAt]);

    // Announce phase transitions politely so screen readers stay updated
    // without spamming the reader (LiveRegion dedupes within 400 ms).
    useEffect(() => {
        const current = steps[currentIndex];
        if (current) announce({ message: current, priority: "polite" });
    }, [currentIndex, steps]);

    return (
        <div
            className="rounded-lg p-5"
            data-testid={testId}
            style={{
                backgroundColor: "var(--uxf-surface)",
                border: "1px solid var(--uxf-border)",
            }}
        >
            <ol className="space-y-2" aria-label="Progress">
                {steps.map((label, i) => {
                    const done = i < currentIndex;
                    const active = i === currentIndex;
                    return (
                        <li key={i} className="flex items-center gap-3 text-sm">
                            <span
                                className="flex-shrink-0 w-6 h-6 rounded-full inline-flex items-center justify-center"
                                style={{
                                    backgroundColor: done
                                        ? "var(--uxf-success-bg)"
                                        : active
                                            ? "var(--uxf-info-bg)"
                                            : "transparent",
                                    border: done || active
                                        ? "none"
                                        : "1px solid var(--uxf-border)",
                                }}
                            >
                                {done ? (
                                    <CheckCircle2 className="w-4 h-4" style={{ color: "var(--uxf-success)" }} aria-hidden="true" />
                                ) : active ? (
                                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--uxf-info)" }} aria-hidden="true" />
                                ) : null}
                            </span>
                            <span
                                style={{
                                    color: done
                                        ? "var(--uxf-muted)"
                                        : active
                                            ? "var(--uxf-text)"
                                            : "var(--uxf-muted)",
                                    fontWeight: active ? 600 : 400,
                                }}
                            >
                                {label}
                            </span>
                        </li>
                    );
                })}
            </ol>
            {reassurance && (
                <p
                    className="text-sm mt-4 leading-relaxed"
                    style={{ color: "var(--uxf-muted)" }}
                    data-testid={`${testId}-reassurance`}
                >
                    {reassurance}
                </p>
            )}
            {startedAt && elapsed >= 10 && (
                <p
                    className="text-xs mt-2 font-mono"
                    style={{
                        color: "var(--uxf-muted)",
                        fontFamily: "var(--uxf-mono-font)",
                    }}
                    data-testid={`${testId}-elapsed`}
                >
                    Elapsed: {elapsed}s
                </p>
            )}
        </div>
    );
}

export default StagedProgress;
