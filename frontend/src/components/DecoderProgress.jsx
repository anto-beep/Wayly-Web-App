import React, { useEffect, useState } from "react";
import { Check, Loader2, Circle } from "lucide-react";

/**
 * DecoderProgress — 6-step indicator that mirrors the backend chunked
 * extraction + audit pipeline. Because the actual call is a single POST
 * (no streaming), we drive the steps off a timing schedule that matches
 * observed wall-clock latency (~45s total: 5 parallel extract chunks
 * complete around ~10s, audit takes another ~30s).
 *
 * Steps go through three states: pending → active → complete.
 *
 * Props:
 *   - active: boolean — true while the decode request is in-flight
 */
const STEPS = [
    { key: "header", label: "Reading header", detail: "participant, pension status, budget", startAt: 0, doneAt: 18 },
    { key: "clinical", label: "Extracting Clinical", detail: "nursing, allied health", startAt: 0, doneAt: 22 },
    { key: "independence", label: "Extracting Independence", detail: "personal care, transport", startAt: 0, doneAt: 24 },
    { key: "everyday", label: "Extracting Everyday Living", detail: "domestic, AT-HM", startAt: 0, doneAt: 26 },
    { key: "adjustments", label: "Care management & adjustments", detail: "fees, prior-period credits", startAt: 0, doneAt: 28 },
    { key: "notes", label: "Reading provider notes", detail: "free-form disclosures", startAt: 0, doneAt: 30 },
    { key: "audit", label: "Running anomaly audit", detail: "13 pension-aware checks", startAt: 30, doneAt: 75 },
];

function stateAt(seconds, step, isActive) {
    if (!isActive) return "pending";
    if (seconds >= step.doneAt) return "complete";
    if (seconds >= step.startAt) return "active";
    return "pending";
}

export default function DecoderProgress({ active }) {
    const [seconds, setSeconds] = useState(0);

    useEffect(() => {
        if (!active) { setSeconds(0); return; }
        const start = Date.now();
        const id = setInterval(() => {
            setSeconds((Date.now() - start) / 1000);
        }, 250);
        return () => clearInterval(id);
    }, [active]);

    return (
        <div data-testid="decoder-progress" className="rounded-xl border border-kindred bg-surface-2 p-5 mt-4">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <div className="font-medium text-primary-k">Decoding your statement…</div>
                    <p className="text-xs text-muted-k mt-0.5">
                        {seconds < 30 ? "Running 6 extraction passes in parallel." : "Auditing extracted data with pension-aware contribution rules."}
                    </p>
                </div>
                <div className="text-xs tabular-nums text-muted-k" data-testid="decoder-progress-elapsed">
                    {Math.floor(seconds)}s
                </div>
            </div>

            <ol className="space-y-2.5">
                {STEPS.map((s) => {
                    const status = stateAt(seconds, s, active);
                    return (
                        <li
                            key={s.key}
                            data-testid={`decoder-step-${s.key}`}
                            data-status={status}
                            className="flex items-start gap-3"
                        >
                            <span className="mt-0.5 flex-shrink-0">
                                {status === "complete" && (
                                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sage text-white">
                                        <Check className="h-3 w-3" strokeWidth={3} />
                                    </span>
                                )}
                                {status === "active" && (
                                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gold/30 text-primary-k">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                    </span>
                                )}
                                {status === "pending" && (
                                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-k">
                                        <Circle className="h-3 w-3" />
                                    </span>
                                )}
                            </span>
                            <div className="flex-1 min-w-0">
                                <div className={`text-sm ${status === "pending" ? "text-muted-k" : "text-primary-k"} ${status === "active" ? "font-medium" : ""}`}>
                                    {s.label}
                                </div>
                                <div className="text-xs text-muted-k mt-0.5">{s.detail}</div>
                            </div>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
