import React, { useRef, useState, useCallback } from "react";
import { Sparkles, Loader2, ShieldCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

/**
 * SD-3 v2 streaming decode panel.
 *
 * Opens an SSE stream to /api/sd3/statements/{sid}/decode-v2/stream and
 * renders each event live: phase, line (with confidence), alert, done.
 * Uses fetch + ReadableStream so cookies/JWT flow through the same axios
 * baseURL logic (we hit REACT_APP_BACKEND_URL directly with the token).
 */
export default function SD3V2StreamPanel({ statementId, statementCurrency = "AUD" }) {
    const [running, setRunning] = useState(false);
    const [events, setEvents] = useState([]);
    const [done, setDone] = useState(null);
    const [error, setError] = useState(null);
    const abortRef = useRef(null);

    const start = useCallback(async () => {
        setEvents([]);
        setDone(null);
        setError(null);
        setRunning(true);
        const backend = process.env.REACT_APP_BACKEND_URL || "";
        const token = localStorage.getItem("kindred_token") || "";
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        try {
            const resp = await fetch(`${backend}/api/sd3/statements/${statementId}/decode-v2/stream`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ force_fallback: false }),
                signal: ctrl.signal,
            });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buf = "";
            while (true) {
                const { value, done: streamDone } = await reader.read();
                if (streamDone) break;
                buf += decoder.decode(value, { stream: true });
                let idx;
                while ((idx = buf.indexOf("\n\n")) >= 0) {
                    const frame = buf.slice(0, idx);
                    buf = buf.slice(idx + 2);
                    for (const raw of frame.split("\n")) {
                        if (!raw.startsWith("data:")) continue;
                        try {
                            const payload = JSON.parse(raw.slice(5).trim());
                            if (payload.event === "done") {
                                setDone(payload);
                            } else {
                                setEvents((prev) => [...prev, payload]);
                            }
                        } catch { /* ignore malformed */ }
                    }
                }
            }
        } catch (e) {
            if (e?.name !== "AbortError") {
                setError(e?.message || "Streaming decode failed");
                toast.error("Deep decode ran into an issue. Please try again.");
            }
        } finally {
            setRunning(false);
        }
    }, [statementId]);

    const stop = useCallback(() => {
        if (abortRef.current) abortRef.current.abort();
        setRunning(false);
    }, []);

    const lines = events.filter((e) => e.event === "line");
    const alerts = events.filter((e) => e.event === "alert");
    const phases = events.filter((e) => e.event === "phase");

    return (
        <section
            data-testid="sd3v2-panel"
            className="rounded-2xl border border-primary-k/25 bg-white p-5 sm:p-6 shadow-sm mb-6"
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-primary-k inline-flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5" /> Deep decode (Opus 4.7)
                    </div>
                    <h3 className="mt-0.5 font-serif text-lg text-primary-k">Second opinion on every line</h3>
                    <p className="text-sm text-muted-k mt-1 max-w-2xl">
                        Streams a line-by-line review from Claude Opus 4.7 with a confidence score on each item. Useful when a total looks off or a category feels wrong.
                    </p>
                </div>
                {!running ? (
                    <button
                        type="button"
                        onClick={start}
                        data-testid="sd3v2-start"
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary-k px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-k/90"
                    >
                        <Sparkles className="h-4 w-4" /> Run deep decode
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={stop}
                        data-testid="sd3v2-stop"
                        className="inline-flex items-center gap-1.5 rounded-full border border-primary-k/25 bg-white px-4 py-2 text-sm font-medium text-primary-k hover:bg-primary-k/[0.05]"
                    >
                        <Loader2 className="h-4 w-4 animate-spin" /> Stop
                    </button>
                )}
            </div>

            {phases.length > 0 && (
                <div className="mt-4 text-xs text-muted-k">
                    {phases[phases.length - 1]?.note}
                </div>
            )}

            {lines.length > 0 && (
                <ul className="mt-4 divide-y divide-primary-k/10" data-testid="sd3v2-lines">
                    {lines.map((l, i) => (
                        <li key={l.line_id || i} className="py-2 flex items-start gap-3">
                            <ConfidencePill value={l.confidence} />
                            <div className="min-w-0 flex-1">
                                <div className="text-sm text-primary-k font-medium truncate">{l.description}</div>
                                {l.note && <div className="text-xs text-muted-k mt-0.5 leading-snug">{l.note}</div>}
                            </div>
                            <div className="tabular-nums text-sm text-primary-k whitespace-nowrap">
                                {statementCurrency === "AUD" ? "$" : ""}
                                {Number(l.amount || 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {alerts.length > 0 && (
                <ul className="mt-4 space-y-2" data-testid="sd3v2-alerts">
                    {alerts.map((a, i) => (
                        <li
                            key={i}
                            className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm border ${
                                a.level === "warning"
                                    ? "bg-gold-50 text-charcoal border-gold-200"
                                    : a.level === "success"
                                    ? "bg-sage-50 text-charcoal border-sage-200"
                                    : "bg-primary-k/[0.05] text-charcoal border-primary-k/15"
                            }`}
                        >
                            {a.level === "warning" ? (
                                <AlertTriangle className="h-4 w-4 text-gold-700 mt-0.5" />
                            ) : a.level === "success" ? (
                                <CheckCircle2 className="h-4 w-4 text-sage-700 mt-0.5" />
                            ) : (
                                <Sparkles className="h-4 w-4 text-primary-k mt-0.5" />
                            )}
                            <span className="leading-snug">{a.text}</span>
                        </li>
                    ))}
                </ul>
            )}

            {done && (
                <div className="mt-4 flex items-center justify-between rounded-lg bg-cream/50 px-3 py-2 text-xs text-primary-k" data-testid="sd3v2-done">
                    <span>Reviewed {done.line_count} lines with {Math.round((done.overall_confidence || 0) * 100)}% overall confidence.</span>
                    {done.model && <span className="text-muted-k">{done.model}</span>}
                </div>
            )}

            {error && (
                <div className="mt-3 rounded-lg bg-terracotta-50 border border-terracotta-200 px-3 py-2 text-sm text-charcoal" data-testid="sd3v2-error">
                    {error}
                </div>
            )}
        </section>
    );
}

function ConfidencePill({ value }) {
    const pct = Math.round((value || 0) * 100);
    const tone = pct >= 85 ? "sage" : pct >= 70 ? "gold" : "terracotta";
    const cls =
        tone === "sage"
            ? "bg-sage-100 text-sage-800 border-sage-200"
            : tone === "gold"
            ? "bg-gold-100 text-gold-800 border-gold-200"
            : "bg-terracotta-100 text-terracotta-800 border-terracotta-200";
    return (
        <span
            className={`inline-flex items-center justify-center rounded-full border ${cls} tabular-nums text-[10px] font-semibold w-11 h-6 flex-none`}
            title={`Confidence ${pct}%`}
        >
            {pct}%
        </span>
    );
}
